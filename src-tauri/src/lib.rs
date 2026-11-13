pub mod commands;
pub mod grade_scraper;
pub mod models;
pub mod moodle;
pub mod schedule_solver;
pub mod scraper;
pub mod sigaa;
#[cfg(desktop)]
pub mod tray;

use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

pub struct BackgroundRunState(pub std::sync::atomic::AtomicBool);
pub struct IsQuitting(pub std::sync::atomic::AtomicBool);

/// Fonte única da superfície IPC: os commands registrados aqui geram os
/// bindings TypeScript em `src/lib/bindings.ts` (via `cargo test export_bindings`).
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::sync_platforms,
        commands::check_vault_status,
        commands::get_sigaa_departments,
        commands::get_sigaa_professors,
        commands::scrape_sigaa_classes,
        commands::get_courses_catalog,
        commands::get_course_curriculum,
        commands::get_all_curricula,
        commands::fetch_sigaa_academic_history,
        commands::solve_schedules,
        commands::check_schedule_conflicts,
        commands::open_external_url,
        commands::validate_sigaa_credentials,
        commands::validate_aprender3_credentials,
        commands::connect_teams,
        commands::disconnect_teams,
        commands::get_or_create_vault_key,
        commands::delete_vault_file,
        commands::backup_vault_file,
        commands::restore_vault_file,
        commands::fetch_professor_evaluations_csv,
        commands::set_background_run,
        commands::is_background_run_enabled,
        commands::set_tray_sync_state,
        commands::show_main_window,
        commands::prepare_for_update,
        commands::cancel_prepare_for_update,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = builder();

    #[cfg(all(debug_assertions, desktop))]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/core/infrastructure/bindings.ts",
        )
        .expect("Falha ao exportar bindings TypeScript");

    #[allow(unused_mut)]
    let mut app_builder = tauri::Builder::default()
        .manage(BackgroundRunState(std::sync::atomic::AtomicBool::new(true)))
        .manage(IsQuitting(std::sync::atomic::AtomicBool::new(false)));

    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_filter(|label| label == "main")
                .build(),
        );
    }

    #[cfg(desktop)]
    {
        app_builder = app_builder.on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    if let Some(quitting) = app.try_state::<IsQuitting>() {
                        if quitting.0.load(std::sync::atomic::Ordering::Relaxed) {
                            // Encerramento/atualização em andamento: permite o fechamento padrão da janela (não previne)
                            return;
                        }
                    }
                    if let Some(state) = app.try_state::<BackgroundRunState>() {
                        if state.0.load(std::sync::atomic::Ordering::Relaxed) {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        });
    }

    app_builder
        .setup(|app| {
            // Inicialização do cofre criptográfico com derivação Argon2 do Tauri Stronghold
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            let _ = std::fs::create_dir_all(&app_data_dir);

            let salt_filename = if cfg!(debug_assertions) {
                "vault_dev.salt"
            } else {
                "vault.salt"
            };
            let salt_path = app_data_dir.join(salt_filename);

            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            fn get_migrations() -> Vec<tauri_plugin_sql::Migration> {
                vec![
                    tauri_plugin_sql::Migration {
                        version: 1,
                        description: "create_initial_schema",
                        sql: include_str!("../migrations/01_initial_schema.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                    tauri_plugin_sql::Migration {
                        version: 2,
                        description: "create_app_settings",
                        sql: include_str!("../migrations/02_app_settings.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    },
                ]
            }
            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations("sqlite:sarue_unb.db", get_migrations())
                    .add_migrations("sqlite:sarue_unb_dev.db", get_migrations())
                    .build(),
            )?;

            app.handle().plugin(tauri_plugin_opener::init())?;
            app.handle().plugin(tauri_plugin_notification::init())?;

            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ))?;

                // Inicializa o System Tray
                if let Err(e) = tray::setup_tray(app.handle()) {
                    log::warn!("Não foi possível inicializar o System Tray: {}", e);
                }

                // Tarefa em segundo plano: timer de 6 horas para sincronização automática
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri::Emitter;
                    let mut interval =
                        tokio::time::interval(std::time::Duration::from_secs(6 * 3600));
                    interval.tick().await; // Pula o primeiro tick imediato no startup
                    loop {
                        interval.tick().await;
                        if let Some(state) = app_handle.try_state::<BackgroundRunState>() {
                            if state.0.load(std::sync::atomic::Ordering::Relaxed) {
                                log::info!(
                                    "Temporizador de 6h: disparando sincronização em segundo plano"
                                );
                                let _ = app_handle.emit("request-sync", ());
                            }
                        }
                    }
                });
            }

            log::info!("Plugins Tauri Stronghold e SQL (SQLite) inicializados com sucesso.");

            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .build(tauri::generate_context!())
        .expect("erro durante a compilação do aplicativo Saruê UnB")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                if let Some(window) = _app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_br_unb_sarue_MainActivity_initPlatformVerifier<'local>(
    mut env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    context: jni::objects::JObject<'local>,
) {
    env.with_env(|inner_env| -> jni::errors::Result<()> {
        if let Err(e) = rustls_platform_verifier::android::init_with_env(inner_env, context) {
            log::error!(
                "Falha ao inicializar rustls-platform-verifier no Android: {:?}",
                e
            );
            return Err(e);
        }
        log::info!("rustls-platform-verifier inicializado com sucesso no Android.");
        Ok(())
    })
    .resolve::<jni::errors::ThrowRuntimeExAndDefault>();
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_bindings() {
        crate::builder()
            .export(
                specta_typescript::Typescript::default(),
                "../src/core/infrastructure/bindings.ts",
            )
            .expect("Falha ao exportar bindings TypeScript");
    }

    #[test]
    #[ignore = "requer keychain local do SO (não hermético em CI)"]
    fn test_vault_keyring_generation() {
        let mut key_bytes = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut key_bytes);
        let generated_key = key_bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();
        assert_eq!(generated_key.len(), 64);

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            let entry = keyring::Entry::new("org.unb.sarue.test", "test_key");
            if let Ok(entry) = entry {
                let _ = entry.set_password(&generated_key);
                if let Ok(retrieved) = entry.get_password() {
                    assert_eq!(retrieved, generated_key);
                }
                let _ = entry.delete_credential();
            }
        }
    }
}
