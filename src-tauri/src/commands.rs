use crate::models::{
    Aprender3Creds, Course, FeedItem, PlatformType, SigaaCreds, SyncResult, TeamsCreds,
};
use crate::moodle::MoodleClient;
use crate::sigaa::SigaaClient;
use std::collections::HashMap;

use tauri::{command, AppHandle, Manager};

fn is_valid_vault_filename(filename: &str) -> bool {
    matches!(
        filename,
        "unb_vault.hold" | "unb_vault_dev.hold" | "unb_vault.hold.bak" | "unb_vault_dev.hold.bak"
    )
}

fn is_valid_hex_key(key: &str) -> bool {
    key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit())
}

#[command]
#[specta::specta]
pub fn get_or_create_vault_key(app: AppHandle) -> Result<String, String> {
    const SERVICE: &str = "org.unb.sarue";
    const USER: &str = "vault_master_key";

    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let _ = std::fs::create_dir_all(&data_dir);
    let key_file = data_dir.join("vault.key");

    // 1. Verifica se já existe chave persistida no arquivo local seguro
    if key_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim().to_string();
            if is_valid_hex_key(&trimmed) {
                // Tenta sincronizar com o chaveiro do SO caso este esteja vazio
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
                    if entry
                        .get_password()
                        .map(|p| !is_valid_hex_key(&p))
                        .unwrap_or(true)
                    {
                        let _ = entry.set_password(&trimmed);
                    }
                }
                return Ok(trimmed);
            }
        }
    }

    // 2. Tenta recuperar do Chaveiro do Sistema Operacional (Keychain / Credential Manager)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
            if let Ok(password) = entry.get_password() {
                let trimmed = password.trim().to_string();
                if is_valid_hex_key(&trimmed) {
                    // Garante espelhamento no arquivo de segurança local com permissão 0600
                    let _ = std::fs::write(&key_file, &trimmed);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(
                            &key_file,
                            std::fs::Permissions::from_mode(0o600),
                        );
                    }
                    return Ok(trimmed);
                }
            }
        }
    }

    // 3. Se nenhuma chave válida existia, gera uma chave criptográfica forte (256-bit / 64 hex chars)
    let mut key_bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut key_bytes);
    let generated_key = key_bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    // Salva no Chaveiro do SO
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Ok(entry) = keyring::Entry::new(SERVICE, USER) {
        let _ = entry.set_password(&generated_key);
    }

    // Salva no arquivo local com 0600
    std::fs::write(&key_file, &generated_key)
        .map_err(|e| format!("Falha ao persistir chave do cofre no disco: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&key_file, std::fs::Permissions::from_mode(0o600));
    }

    Ok(generated_key)
}

#[command]
#[specta::specta]
pub fn delete_vault_file(app: AppHandle, filename: String) -> Result<(), String> {
    if !is_valid_vault_filename(&filename) {
        return Err("Nome de arquivo de cofre inválido".into());
    }
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let path = data_dir.join(&filename);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    Ok(())
}

#[command]
#[specta::specta]
pub fn backup_vault_file(app: AppHandle, filename: String) -> Result<String, String> {
    if !is_valid_vault_filename(&filename) {
        return Err("Nome de arquivo de cofre inválido".into());
    }
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let src = data_dir.join(&filename);
    let bak_filename = format!("{}.bak", filename);
    let dst = data_dir.join(&bak_filename);
    if src.exists() {
        std::fs::rename(&src, &dst)
            .map_err(|e| format!("Falha ao criar backup do cofre: {}", e))?;
    }
    Ok(bak_filename)
}

#[command]
#[specta::specta]
pub fn restore_vault_file(app: AppHandle, filename: String) -> Result<(), String> {
    if !is_valid_vault_filename(&filename) {
        return Err("Nome de arquivo de cofre inválido".into());
    }
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let bak_path = data_dir.join(format!("{}.bak", filename));
    let target_path = data_dir.join(&filename);
    if bak_path.exists() {
        std::fs::rename(&bak_path, &target_path)
            .map_err(|e| format!("Falha ao restaurar backup do cofre: {}", e))?;
    }
    Ok(())
}

#[command]
#[specta::specta]
pub async fn sync_platforms(
    app: AppHandle,
    platforms: Vec<PlatformType>,
    sigaa: Option<SigaaCreds>,
    aprender3: Option<Aprender3Creds>,
    teams: Option<TeamsCreds>,
) -> Result<SyncResult, String> {
    let mut all_items: Vec<FeedItem> = Vec::new();
    let mut all_courses: Vec<Course> = Vec::new();
    let mut errors: HashMap<PlatformType, String> = HashMap::new();

    let moodle = MoodleClient::new();

    for platform in platforms {
        match platform {
            PlatformType::Aprender3 => {
                let (cpf, senha) = match &aprender3 {
                    Some(c) => (c.cpf.trim(), c.senha.as_str()),
                    None => ("", ""),
                };
                if !cpf.is_empty() && !senha.is_empty() {
                    match moodle.sync_aprender3(cpf, senha).await {
                        Ok((items, courses)) => {
                            all_items.extend(items);
                            all_courses.extend(courses);
                        }
                        Err(e) => {
                            errors.insert(PlatformType::Aprender3, e);
                        }
                    }
                }
            }
            PlatformType::Sigaa => {
                let (matricula, senha) = match &sigaa {
                    Some(c) => (c.matricula.trim(), c.senha.as_str()),
                    None => ("", ""),
                };
                if !matricula.is_empty() && !senha.is_empty() {
                    let client = SigaaClient::new();
                    match client.sync_sigaa(matricula, senha).await {
                        Ok((items, courses)) => {
                            all_items.extend(items);
                            all_courses.extend(courses);
                        }
                        Err(e) => {
                            errors.insert(PlatformType::Sigaa, e);
                        }
                    }
                }
            }
            PlatformType::Teams => {
                #[cfg(target_os = "linux")]
                {
                    // A sync via webview oculto (até 35s carregando o app inteiro
                    // do Teams) derrubava o WebProcess no Linux: a página principal
                    // recarregava sozinha e, às vezes, o app inteiro morria.
                    // Desligado no Linux até existir um caminho mais leve; a autenticação
                    // interativa (janela teams-auth) continua funcionando.
                    let _ = (&app, &teams);
                }
                #[cfg(not(target_os = "linux"))]
                {
                    let is_connected = teams.as_ref().and_then(|t| t.is_connected).unwrap_or(false);
                    let email = teams
                        .as_ref()
                        .and_then(|t| t.email.as_deref())
                        .unwrap_or("");
                    if is_connected {
                        match crate::scraper::HiddenWebviewScraper::sync_teams(&app, email, "")
                            .await
                        {
                            Ok((items, courses)) => {
                                all_items.extend(items);
                                all_courses.extend(courses);
                            }
                            Err(e) => {
                                errors.insert(PlatformType::Teams, e);
                            }
                        }
                    }
                }
            }
        }
    }

    // Ordenação estrita por data decrescente
    all_items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(SyncResult {
        items: all_items,
        courses: all_courses,
        synced_at: chrono_like_timestamp(),
        errors: if errors.is_empty() {
            None
        } else {
            Some(errors)
        },
    })
}

#[command]
#[specta::specta]
pub fn check_vault_status() -> crate::models::VaultStatus {
    crate::models::VaultStatus {
        status: "ready".into(),
        encryption: "Argon2id (32 bytes)".into(),
        zero_telemetry: true,
    }
}

#[command]
#[specta::specta]
pub async fn get_sigaa_departments() -> Result<Vec<crate::grade_scraper::Department>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_departments().await
}

#[command]
#[specta::specta]
pub async fn get_sigaa_professors() -> Result<Vec<crate::grade_scraper::ScrapedProfessor>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_professors().await
}

#[command]
#[specta::specta]
pub async fn scrape_sigaa_classes(
    department_id: String,
    year: String,
    period: String,
) -> Result<Vec<crate::grade_scraper::ScrapedDiscipline>, String> {
    crate::grade_scraper::SigaaGradeScraper::scrape_department_classes(
        &department_id,
        &year,
        &period,
    )
    .await
}

#[command]
#[specta::specta]
pub async fn get_courses_catalog() -> Result<Vec<crate::grade_scraper::CourseCatalogItem>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_courses_catalog().await
}

#[command]
#[specta::specta]
pub async fn get_course_curriculum(
    course_id: String,
) -> Result<Vec<crate::grade_scraper::CurriculumStructure>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_course_curriculum(&course_id).await
}

#[command]
#[specta::specta]
pub async fn get_all_curricula() -> Result<Vec<crate::grade_scraper::CurriculumStructure>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_all_curricula().await
}

#[command]
#[specta::specta]
pub async fn fetch_sigaa_academic_history(
    matricula: String,
    senha: String,
) -> Result<crate::models::DiscenteAcademicHistoryPayload, String> {
    let client = crate::sigaa::SigaaClient::new();
    client
        .fetch_discente_profile_and_historico(&matricula, &senha)
        .await
}

#[command]
#[specta::specta]
pub fn solve_schedules(
    candidate_classes: Vec<crate::grade_scraper::ScrapedClass>,
    preference_shift: Option<char>,
) -> Result<Vec<crate::schedule_solver::ScheduleOption>, String> {
    Ok(crate::schedule_solver::ScheduleSolver::solve(
        candidate_classes,
        preference_shift,
    ))
}

#[command]
#[specta::specta]
pub fn check_schedule_conflicts(
    classes: Vec<crate::grade_scraper::ScrapedClass>,
) -> Result<Vec<String>, String> {
    Ok(crate::schedule_solver::ScheduleSolver::find_conflicts(
        &classes,
    ))
}

#[command]
#[specta::specta]
pub fn open_external_url(url: String) -> Result<(), String> {
    log::info!("Abrindo URL externa no navegador padrão: {}", url);
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Falha ao abrir URL no macOS: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Falha ao abrir URL no Windows: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Falha ao abrir URL no Linux: {}", e))?;
    }
    Ok(())
}

fn chrono_like_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[command]
#[specta::specta]
pub async fn validate_sigaa_credentials(
    matricula: String,
    senha: String,
) -> Result<String, String> {
    let clean_matricula = matricula.trim();
    if clean_matricula.is_empty() || senha.is_empty() {
        return Err("Informe a matrícula e senha do SIGAA.".into());
    }
    let client = SigaaClient::new();
    let (html, _) = client.login_to_portal(clean_matricula, &senha).await?;
    let profile = SigaaClient::parse_discente_profile(&html, clean_matricula);
    let discente_name = profile.nome.unwrap_or_else(|| "Discente".into());
    Ok(format!(
        "Conectado como {} ({})",
        discente_name, profile.curso
    ))
}

#[command]
#[specta::specta]
pub async fn validate_aprender3_credentials(cpf: String, senha: String) -> Result<String, String> {
    let clean_cpf = crate::moodle::clean_cpf(&cpf);
    if clean_cpf.is_empty() || senha.is_empty() {
        return Err("Informe o CPF e senha do Aprender 3.".into());
    }
    let client = MoodleClient::new();
    let (_items, courses) = client.sync_aprender3(&clean_cpf, &senha).await?;
    Ok(format!(
        "Conectado ao Aprender 3 ({} turmas encontradas)",
        courses.len()
    ))
}

#[command]
#[specta::specta]
pub async fn connect_teams(
    app: AppHandle,
    email: Option<String>,
) -> Result<crate::models::TeamsConnectResult, String> {
    use std::sync::{Arc, Mutex};
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    // Fecha qualquer janela residual anterior de login
    if let Some(existing) = app.get_webview_window("teams-auth") {
        let _ = existing.destroy();
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    let raw_email = email.unwrap_or_default().trim().to_string();
    let mut target_url =
        tauri::Url::parse("https://teams.microsoft.com").map_err(|e| e.to_string())?;
    if !raw_email.is_empty() {
        target_url
            .query_pairs_mut()
            .append_pair("login_hint", &raw_email);
    }

    let (tx, rx) =
        tokio::sync::oneshot::channel::<Result<(String, Vec<FeedItem>, Vec<Course>), String>>();
    let tx_cell = Arc::new(Mutex::new(Some(tx)));

    let tx_clone_nav = tx_cell.clone();
    let tx_clone_win = tx_cell.clone();
    let _app_nav = app.clone();

    let chunks_map = Arc::new(Mutex::new(
        std::collections::BTreeMap::<usize, String>::new(),
    ));
    let chunks_clone = chunks_map.clone();
    let detected_email_cell = Arc::new(Mutex::new(String::new()));
    let detected_email_clone = detected_email_cell.clone();

    // User agent moderno para prevenir tela de navegador não suportado
    let modern_ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

    // Script injetado para exibir barra de controle permanente com botão de conclusão explícita
    let banner_script = r##"
    (function() {
        if (window !== window.top) return;

        function injectControlBanner() {
            if (document.getElementById('__unb_aggregator_banner__')) return;

            const banner = document.createElement('div');
            banner.id = '__unb_aggregator_banner__';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;height:48px;background:#ffffff;border-bottom:2px solid #000000;box-shadow:0 4px 6px rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:space-between;padding:0 16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#000000;user-select:none;box-sizing:border-box;';

            const leftCol = document.createElement('div');
            leftCol.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;overflow:hidden;white-space:nowrap;';

            const badge = document.createElement('span');
            badge.style.cssText = 'background:#60a5fa;color:#000;padding:2px 8px;border:1.5px solid #000;border-radius:9999px;font-size:11px;font-weight:800;letter-spacing:0.02em;';
            badge.textContent = 'UnB Aggregator';

            const info = document.createElement('span');
            info.id = '__unb_banner_info__';
            info.textContent = 'Faça login com sua conta da UnB e confirme o 2FA. Quando suas turmas carregarem, clique em:';

            leftCol.appendChild(badge);
            leftCol.appendChild(info);

            const rightCol = document.createElement('div');
            rightCol.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

            const confirmBtn = document.createElement('button');
            confirmBtn.id = '__unb_confirm_btn__';
            confirmBtn.style.cssText = 'background:#22c55e;color:#000;border:2px solid #000;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:2px 2px 0 #000;';
            confirmBtn.textContent = '✓ Concluir Login & Conectar';

            const cancelBtn = document.createElement('button');
            cancelBtn.id = '__unb_cancel_btn__';
            cancelBtn.style.cssText = 'background:#f43f5e;color:#fff;border:2px solid #000;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:2px 2px 0 #000;';
            cancelBtn.textContent = '✕ Cancelar';

            window.__unb_set_status = function(msg) {
                try {
                    if (info) info.textContent = msg;
                    if (confirmBtn) confirmBtn.textContent = '⏳ ' + msg;
                } catch(e) {}
            };

            confirmBtn.onclick = function() {
                confirmBtn.disabled = true;
                cancelBtn.style.display = 'none';
                confirmBtn.style.background = '#22c55e';
                confirmBtn.textContent = '⏳ Conectando...';
                info.textContent = 'Login confirmado! Conectando conta e fechando janela...';

                try {
                    let email = '';
                    let courses = [];
                    if (typeof window.__unb_fast_connect === 'function') {
                        const quick = window.__unb_fast_connect();
                        email = quick.email || '';
                        courses = quick.courses || [];
                    }

                    const payloadStr = JSON.stringify({ courses: courses, items: [] });
                    const qs = 'action=login_confirmed&email=' + encodeURIComponent(email) + '&payload=' + encodeURIComponent(payloadStr);
                    window.location.href = window.location.origin + '/__aggregator_bridge__?' + qs;
                } catch(err) {
                    console.error('[UnB Aggregator] Erro ao confirmar login rápido:', err);
                    window.location.href = window.location.origin + '/__aggregator_bridge__?action=login_confirmed&payload=%7B%22courses%22%3A%5B%5D%2C%22items%22%3A%5B%5D%7D';
                }
            };

            cancelBtn.onclick = function() {
                window.location.href = window.location.origin + '/__aggregator_bridge__?action=login_cancelled';
            };

            rightCol.appendChild(confirmBtn);
            rightCol.appendChild(cancelBtn);

            banner.appendChild(leftCol);
            banner.appendChild(rightCol);

            if (document.body) {
                document.body.appendChild(banner);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectControlBanner);
        } else {
            injectControlBanner();
        }

        setInterval(injectControlBanner, 1500);
    })();
    "##;

    let combined_script = format!(
        "{}\n\n{}",
        banner_script,
        crate::scraper::TEAMS_CRAWLER_SCRIPT
    );

    let window_builder = WebviewWindowBuilder::new(
        &app,
        "teams-auth",
        WebviewUrl::External(target_url),
    )
    .title("Login Institucional - Microsoft Teams (UnB)")
    .inner_size(1024.0, 740.0)
    .center()
    .user_agent(modern_ua)
    .initialization_script(&combined_script)
    .visible(true)
    .on_navigation(move |url| {
        let is_bridge = url.scheme() == "unb-bridge"
            || url.path().starts_with("/__aggregator_bridge__")
            || url.host_str() == Some("__aggregator_bridge__");

        if is_bridge {
            let mut action = String::new();
            if url.scheme() == "unb-bridge" {
                if let Some(host) = url.host_str() {
                    action = host.to_string();
                }
            }

            let mut detected_email = String::new();
            let mut payload_str = String::new();
            let mut chunk_str = String::new();
            let mut seq: usize = 0;
            let mut total: usize = 1;

            for (k, v) in url.query_pairs() {
                if k == "action" {
                    action = v.to_string();
                } else if k == "email" && !v.is_empty() {
                    detected_email = v.to_string();
                } else if k == "payload" && !v.is_empty() {
                    payload_str = v.to_string();
                } else if k == "chunk" && !v.is_empty() {
                    chunk_str = v.to_string();
                } else if k == "seq" {
                    seq = v.parse().unwrap_or(0);
                } else if k == "total" {
                    total = v.parse().unwrap_or(1);
                }
            }

            if !detected_email.is_empty() {
                if let Ok(mut email_lock) = detected_email_clone.lock() {
                    *email_lock = detected_email.clone();
                }
            }

            if action == "login_cancelled" {
                log::info!("[Teams Bridge] Login cancelado pelo usuário.");
                if let Ok(mut lock) = tx_clone_nav.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(Err("Login no Microsoft Teams cancelado pelo usuário.".into()));
                    }
                }
                if let Some(w) = _app_nav.get_webview_window("teams-auth") {
                    let _ = w.hide();
                    let _ = w.destroy();
                }
            } else if action == "sync_chunk" {
                log::info!("[Teams Bridge] Recebido chunk {} de {}", seq + 1, total);
                if let Ok(mut chunks) = chunks_clone.lock() {
                    chunks.insert(seq, chunk_str);
                    if chunks.len() >= total && total > 0 {
                        let mut full_payload = String::new();
                        for i in 0..total {
                            if let Some(piece) = chunks.get(&i) {
                                full_payload.push_str(piece);
                            }
                        }
                        let (items, courses) = crate::scraper::parse_teams_bridge_payload(&full_payload);
                        let final_email = detected_email_clone.lock().map(|l| l.clone()).unwrap_or_default();
                        log::info!("[Teams Bridge] Sincronização concluída via chunks: {} cursos, {} avisos", courses.len(), items.len());
                        if let Ok(mut lock) = tx_clone_nav.lock() {
                            if let Some(sender) = lock.take() {
                                let _ = sender.send(Ok((final_email, items, courses)));
                            }
                        }
                        if let Some(w) = _app_nav.get_webview_window("teams-auth") {
                            let _ = w.hide();
                            let _ = w.destroy();
                        }
                    }
                }
            } else if action == "login_confirmed" || action == "login_and_sync_done" || action == "sync_done" {
                let (items, courses) = crate::scraper::parse_teams_bridge_payload(&payload_str);
                let final_email = if !detected_email.is_empty() {
                    detected_email
                } else {
                    detected_email_clone.lock().map(|l| l.clone()).unwrap_or_default()
                };
                log::info!("[Teams Bridge] Login confirmado/concluído: email='{}', {} cursos, {} avisos", final_email, courses.len(), items.len());
                if let Ok(mut lock) = tx_clone_nav.lock() {
                    if let Some(sender) = lock.take() {
                        let _ = sender.send(Ok((final_email, items, courses)));
                    }
                }
                if let Some(w) = _app_nav.get_webview_window("teams-auth") {
                    let _ = w.hide();
                    let _ = w.destroy();
                }
            }
            return false;
        }
        true
    });

    let window = window_builder
        .build()
        .map_err(|e| format!("Falha ao abrir janela de login do Teams: {}", e))?;

    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut lock) = tx_clone_win.lock() {
                if let Some(sender) = lock.take() {
                    let _ = sender.send(Err(
                        "Janela de autenticação fechada antes da confirmação.".into(),
                    ));
                }
            }
        }
    });

    // Aguarda conclusão do login e extração em segundo plano (tempo limite de 10 minutos para 2FA)
    let auth_result = match tokio::time::timeout(tokio::time::Duration::from_secs(600), rx).await {
        Ok(res) => match res {
            Ok(inner) => inner,
            Err(_) => Err("Comunicação com a janela do Teams interrompida.".into()),
        },
        Err(_) => Err("Tempo limite esgotado para o login no Microsoft Teams.".into()),
    };

    // Fecha janela em segundo plano com segurança após a conclusão
    if let Some(win) = app.get_webview_window("teams-auth") {
        let _ = win.destroy();
    }

    match auth_result {
        Ok((detected_email, items, courses)) => {
            let final_email = if !detected_email.trim().is_empty() {
                detected_email.trim().to_string()
            } else if !raw_email.is_empty() {
                raw_email
            } else {
                "aluno@aluno.unb.br".to_string()
            };
            log::info!(
                "Teams conectado com sucesso para: {} ({} equipes, {} avisos extraídos)",
                final_email,
                courses.len(),
                items.len()
            );
            Ok(crate::models::TeamsConnectResult {
                is_connected: Some(true),
                email: Some(final_email),
                items,
                courses,
            })
        }
        Err(err) => Err(err),
    }
}

#[command]
#[specta::specta]
pub async fn disconnect_teams(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    for (label, win) in app.webview_windows() {
        if label == "teams-auth" || label.starts_with("scraper-teams-") {
            let _ = win.hide();
            let _ = win.destroy();
        }
    }
    log::info!("Microsoft Teams desconectado e janelas auxiliares encerradas.");
    Ok(())
}
// Mantenha em sincronia com PROFESSOR_EVALUATIONS_CSV_URL em
// src/core/domain/entities/professor-evaluation.ts — URL duplicada na
// fronteira Tauri (o Rust não importa as constantes do domínio TS).
const PROFESSOR_EVALUATIONS_CSV_URL: &str = "https://docs.google.com/spreadsheets/d/1RK3N-2DtuKShO_2fpd5Cag_GsHYNIARD8WHLpCLTdCk/export?format=csv&gid=1411813915";
static EVALUATIONS_CSV_CACHE: std::sync::OnceLock<tokio::sync::RwLock<Option<String>>> =
    std::sync::OnceLock::new();

fn get_evaluations_csv_lock() -> &'static tokio::sync::RwLock<Option<String>> {
    EVALUATIONS_CSV_CACHE.get_or_init(|| tokio::sync::RwLock::new(None))
}

#[command]
#[specta::specta]
pub async fn fetch_professor_evaluations_csv(force_refresh: bool) -> Result<String, String> {
    if !force_refresh {
        let lock = get_evaluations_csv_lock().read().await;
        if let Some(cached) = &*lock {
            return Ok(cached.clone());
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Sarue-UnB/0.3.1 (Desktop App; Tauri)")
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente HTTP: {}", e))?;

    let response = client
        .get(PROFESSOR_EVALUATIONS_CSV_URL)
        .send()
        .await
        .map_err(|e| format!("Falha ao conectar à planilha de avaliações: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Planilha retornou status HTTP {}",
            response.status()
        ));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Falha ao ler conteúdo CSV da planilha: {}", e))?;

    if text.trim().is_empty() {
        return Err("Planilha de avaliações retornou conteúdo vazio.".into());
    }

    let mut lock = get_evaluations_csv_lock().write().await;
    *lock = Some(text.clone());

    Ok(text)
}

#[command]
#[specta::specta]
pub async fn set_background_run(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;
    let state = app.state::<crate::BackgroundRunState>();
    state.0.store(enabled, std::sync::atomic::Ordering::Relaxed);
    log::info!("Execução em segundo plano definida para: {}", enabled);
    Ok(())
}

#[command]
#[specta::specta]
pub async fn is_background_run_enabled(app: AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    let state = app.state::<crate::BackgroundRunState>();
    Ok(state.0.load(std::sync::atomic::Ordering::Relaxed))
}

#[command]
#[specta::specta]
pub async fn set_tray_sync_state(app: AppHandle, syncing: bool) -> Result<(), String> {
    crate::tray::update_tray_sync_state(&app, syncing)
}

#[command]
#[specta::specta]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}
