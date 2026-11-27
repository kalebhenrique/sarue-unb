pub mod commands;
pub mod grade_scraper;
pub mod models;
pub mod moodle;
pub mod schedule_solver;
pub mod scraper;
pub mod settings;
pub mod sigaa;
#[cfg(desktop)]
pub mod tray;

use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

pub struct BackgroundRunState(pub std::sync::atomic::AtomicBool);
pub struct IsQuitting(pub std::sync::atomic::AtomicBool);

static GLOBAL_APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Verifica se a sincronização automática em segundo plano pode rodar de acordo
/// com a preferência `sync_only_on_wifi` e o status atual da rede.
/// No desktop, sempre retorna `true` para não bloquear o sync automático.
/// A sincronização manual ignora esta trava e roda normalmente.
pub fn can_run_auto_sync(app: &tauri::AppHandle) -> bool {
    if !cfg!(mobile) {
        return true;
    }

    let sync_only_on_wifi = settings::is_sync_only_on_wifi(app);
    if !sync_only_on_wifi {
        return true;
    }

    use tauri_plugin_network_status::NetworkStatusExt;
    match app.network_status().get_network_status() {
        Ok(status) => settings::should_allow_auto_sync(true, sync_only_on_wifi, &status),
        Err(err) => {
            log::warn!(
                "[can_run_auto_sync] Falha ao consultar status da rede no mobile: {}",
                err
            );
            false
        }
    }
}

/// Fonte única da superfície IPC: os commands registrados aqui geram os
/// bindings TypeScript em `src/lib/bindings.ts` (via `cargo test export_bindings`).
pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::sync_platforms,
        commands::check_vault_status,
        commands::get_sigaa_departments,
        commands::get_sigaa_semesters,
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
        commands::get_sync_only_on_wifi,
        commands::set_sync_only_on_wifi,
        commands::get_network_status,
        commands::is_auto_sync_allowed,
        commands::set_tray_sync_state,
        commands::show_main_window,
        commands::prepare_for_update,
        commands::cancel_prepare_for_update,
        commands::fetch_ru_menus_cdn,
        commands::fetch_student_wallet,
        commands::set_max_brightness,
        commands::share_image,
        commands::render_student_card_pdf,
        commands::is_play_store_install,
        commands::check_apk_release_update,
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
            tauri_plugin_sql::Migration {
                version: 3,
                description: "create_user_calendar_events",
                sql: include_str!("../migrations/03_user_calendar_events.sql"),
                kind: tauri_plugin_sql::MigrationKind::Up,
            },
            tauri_plugin_sql::Migration {
                version: 4,
                description: "create_ru_and_wallet",
                sql: include_str!("../migrations/04_ru_and_wallet.sql"),
                kind: tauri_plugin_sql::MigrationKind::Up,
            },
            tauri_plugin_sql::Migration {
                version: 5,
                description: "fix_ru_and_wallet_schema",
                sql: include_str!("../migrations/05_fix_ru_and_wallet_schema.sql"),
                kind: tauri_plugin_sql::MigrationKind::Up,
            },
        ]
    }

    #[allow(unused_mut)]
    let mut app_builder = tauri::Builder::default()
        .manage(BackgroundRunState(std::sync::atomic::AtomicBool::new(true)))
        .manage(IsQuitting(std::sync::atomic::AtomicBool::new(false)))
        .manage(settings::SyncOnlyOnWifiState(
            std::sync::atomic::AtomicBool::new(settings::default_sync_only_on_wifi()),
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sarue_unb.db", get_migrations())
                .add_migrations("sqlite:sarue_unb_dev.db", get_migrations())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_brightness::init())
        .plugin(tauri_plugin_share::init())
        .plugin(tauri_plugin_network_status::init());

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

            let initial_sync_only_on_wifi = settings::load_sync_only_on_wifi(app.handle());
            app.state::<settings::SyncOnlyOnWifiState>()
                .0
                .store(initial_sync_only_on_wifi, std::sync::atomic::Ordering::Relaxed);

            let initial_bg_run = settings::load_background_run_enabled(app.handle());
            app.state::<BackgroundRunState>()
                .0
                .store(initial_bg_run, std::sync::atomic::Ordering::Relaxed);

            let _ = GLOBAL_APP_HANDLE.set(app.handle().clone());

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

                // Tarefa em segundo plano: pulso de 60s em Rust para alertas do RU no desktop
                // (não sofre throttling de App Nap / WebView2 / WebKitGTK quando minimizado na bandeja)
                let ru_app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri::Emitter;
                    let mut interval =
                        tokio::time::interval(std::time::Duration::from_secs(60));
                    interval.tick().await;
                    loop {
                        interval.tick().await;
                        let _ = ru_app_handle.emit("check-ru-notifications", ());
                    }
                });

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
                                let handle_for_check = app_handle.clone();
                                let allowed = tokio::task::spawn_blocking(move || {
                                    crate::can_run_auto_sync(&handle_for_check)
                                })
                                .await
                                .unwrap_or(false);

                                if allowed {
                                    log::info!(
                                        "Temporizador de 6h: disparando sincronização em segundo plano"
                                    );
                                    let _ = app_handle.emit("request-auto-sync", ());
                                } else {
                                    log::info!(
                                        "Temporizador de 6h: sincronização automática adiada por restrição de rede (somente Wi-Fi)."
                                    );
                                }
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

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_br_unb_sarue_MainActivity_onAndroidTrimMemory(
    _env: jni::EnvUnowned<'_>,
    _class: jni::objects::JClass<'_>,
    level: jni::sys::jint,
) {
    crate::commands::clear_all_memory_caches();
    log::info!(
        "[Android Memory] Caches estáticos em RAM liberados (onTrimMemory level={})",
        level
    );
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_br_unb_sarue_SarueSyncWorker_nativeRunBackgroundSync<'local>(
    mut env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    data_dir_jstr: jni::objects::JString<'local>,
) -> jni::sys::jboolean {
    let data_dir_str: String = env
        .with_env(|inner_env| -> jni::errors::Result<String> {
            Ok(data_dir_jstr.try_to_string(inner_env).unwrap_or_default())
        })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>();

    let data_path = std::path::PathBuf::from(&data_dir_str);
    let (bg_enabled, _wifi_only) = crate::settings::read_preferences_from_dir(&data_path);
    if !bg_enabled {
        log::info!("[SarueSyncWorker] Execução em segundo plano desativada; pulando tick.");
        return jni::sys::JNI_FALSE;
    }

    // Se a instância Tauri / WebView estiver ativa na memória, emite request-auto-sync
    if let Some(app_handle) = GLOBAL_APP_HANDLE.get() {
        use tauri::Emitter;
        if crate::can_run_auto_sync(app_handle) {
            log::info!("[SarueSyncWorker] AppHandle ativo: emitindo request-auto-sync.");
            let _ = app_handle.emit("request-auto-sync", ());
            return jni::sys::JNI_TRUE;
        }
    }

    jni::sys::JNI_FALSE
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
