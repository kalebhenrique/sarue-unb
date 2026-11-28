use crate::models::{
    Aprender3Creds, Course, FeedItem, PlatformType, SigaaCreds, SyncResult, TeamsCreds,
};
use crate::moodle::MoodleClient;
use crate::sigaa::SigaaClient;
use std::collections::HashMap;

use tauri::{command, AppHandle, Manager};

fn is_valid_vault_filename(filename: &str) -> bool {
    // Defesa em profundidade contra path traversal via argumentos do frontend
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return false;
    }

    matches!(
        filename,
        "unb_vault.hold"
            | "unb_vault_dev.hold"
            | "unb_vault.hold.bak"
            | "unb_vault_dev.hold.bak"
            | "unb_vault.hold.corrupted.bak"
            | "unb_vault_dev.hold.corrupted.bak"
    ) || ((filename.starts_with("unb_vault.hold.") || filename.starts_with("unb_vault_dev.hold."))
        && filename.ends_with(".bak"))
}

fn is_valid_hex_key(key: &str) -> bool {
    key.len() == 64 && key.chars().all(|c| c.is_ascii_hexdigit())
}

fn write_vault_key_file(path: &std::path::Path, key: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| {
                format!(
                    "Falha ao abrir arquivo de chave do cofre com modo 0600: {}",
                    e
                )
            })?;
        file.write_all(key.as_bytes())
            .map_err(|e| format!("Falha ao persistir chave do cofre no disco: {}", e))?;
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, key)
            .map_err(|e| format!("Falha ao persistir chave do cofre no disco: {}", e))?;
    }
    Ok(())
}

#[command]
#[specta::specta]
pub fn get_or_create_vault_key(app: AppHandle) -> Result<String, String> {
    // Tupla única de perfil de ambiente para eliminar duplicação e alocações
    let (_service, _user, key_file_name) = if cfg!(debug_assertions) {
        ("br.unb.sarue.dev", "vault_master_key_dev", "vault_dev.key")
    } else {
        ("br.unb.sarue", "vault_master_key", "vault.key")
    };

    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let _ = std::fs::create_dir_all(&data_dir);
    let key_file = data_dir.join(key_file_name);

    // 1. Prioridade Máxima: Arquivo local seguro de chave (vault.key / vault_dev.key)
    // No macOS, atualizações de apps ad-hoc mudam o cdhash do binário, fazendo o Keychain
    // bloquear o acesso com erro de ACL. O arquivo local (0600) é a âncora de persistência
    // imune a trocas de binário e NUNCA deve ser apagado.
    if key_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&key_file) {
            let trimmed = content.trim().to_string();
            if is_valid_hex_key(&trimmed) {
                // Tenta espelhar no Chaveiro do SO em segundo plano (best-effort)
                #[cfg(not(any(target_os = "android", target_os = "ios")))]
                if let Ok(entry) = keyring::Entry::new(_service, _user) {
                    let _ = entry.set_password(&trimmed);
                }
                return Ok(trimmed);
            }
        }
    }

    // 1.5 Fallback para compilações de desenvolvimento antigas (migração de vault.key legado)
    if cfg!(debug_assertions) {
        let legacy_dev_key = data_dir.join("vault.key");
        if legacy_dev_key.exists() {
            if let Ok(content) = std::fs::read_to_string(&legacy_dev_key) {
                let trimmed = content.trim().to_string();
                if is_valid_hex_key(&trimmed) {
                    let _ = write_vault_key_file(&key_file, &trimmed);
                    return Ok(trimmed);
                }
            }
        }
    }

    // 2. Se o arquivo local ainda não existe, tenta recuperar do Chaveiro do SO
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let (recovered_key, keyring_error) = {
        let mut key = None;
        let mut err = None;

        if let Ok(entry) = keyring::Entry::new(_service, _user) {
            match entry.get_password() {
                Ok(pwd) => {
                    let trimmed = pwd.trim().to_string();
                    if is_valid_hex_key(&trimmed) {
                        key = Some(trimmed);
                    }
                }
                Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    log::warn!("[get_or_create_vault_key] Falha transitória ao acessar chaveiro do SO: {:?}", e);
                    err = Some(e);
                }
            }
        }

        // Tenta também chaveiros legados caso ainda não tenha no serviço atual
        if key.is_none() {
            let legacy_services = if cfg!(debug_assertions) {
                vec!["br.unb.sarue", "org.unb.sarue"]
            } else {
                vec!["org.unb.sarue"]
            };

            for leg_svc in legacy_services {
                if let Ok(legacy_entry) = keyring::Entry::new(leg_svc, "vault_master_key") {
                    if let Ok(password) = legacy_entry.get_password() {
                        let trimmed = password.trim().to_string();
                        if is_valid_hex_key(&trimmed) {
                            key = Some(trimmed);
                            break;
                        }
                    }
                }
            }
        }

        (key, err)
    };

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Some(key) = recovered_key {
        // Salva imediatamente no arquivo local com 0600 para que futuras atualizações não dependam do Keychain
        if let Err(e) = write_vault_key_file(&key_file, &key) {
            log::warn!(
                "[get_or_create_vault_key] Falha ao gravar chave recuperada no disco: {}",
                e
            );
        }
        // Espelha no novo serviço se veio de legado
        if let Ok(entry) = keyring::Entry::new(_service, _user) {
            let _ = entry.set_password(&key);
        }
        return Ok(key);
    }

    // 2.5 Guarda contra rotação acidental: se já existe um cofre ativo no disco e o chaveiro falhou
    // com erro transitório (bloqueado/permissão, que NÃO seja NoEntry), não gere uma chave nova silenciosamente!
    let vault_filename = if cfg!(debug_assertions) {
        "unb_vault_dev.hold"
    } else {
        "unb_vault.hold"
    };
    if data_dir.join(vault_filename).exists() {
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        if let Some(err) = keyring_error {
            return Err(format!(
                "Falha ao acessar o chaveiro do sistema ({:?}). Desbloqueie o chaveiro e tente novamente para não perder o acesso ao cofre.",
                err
            ));
        }
    }

    // 3. Se nenhuma chave válida existia (primeira execução), gera uma chave criptográfica forte (256-bit / 64 hex chars)
    let mut key_bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut key_bytes);
    let generated_key = key_bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    // Grava no arquivo local com modo 0600 atômico (âncora confiável)
    write_vault_key_file(&key_file, &generated_key)?;

    // Tenta salvar também no Chaveiro do SO (best-effort)
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    if let Ok(entry) = keyring::Entry::new(_service, _user) {
        let _ = entry.set_password(&generated_key);
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
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let bak_filename = format!("{}.{}.bak", filename, timestamp);
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
                    Some(c) => (c.cpf.trim(), c.password.as_str()),
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
                    Some(c) => (c.matricula.trim(), c.password.as_str()),
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
                #[cfg(not(desktop))]
                {
                    let _ = (&app, &teams);
                }
                #[cfg(desktop)]
                {
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
                        let is_connected =
                            teams.as_ref().and_then(|t| t.is_connected).unwrap_or(false);
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
pub async fn get_sigaa_semesters() -> Result<Vec<crate::grade_scraper::SemesterOption>, String> {
    crate::grade_scraper::SigaaGradeScraper::fetch_semesters().await
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
) -> Result<crate::models::AcademicHistoryPayload, String> {
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
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    log::info!("Abrindo URL externa no navegador padrão: {}", url);
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Falha ao abrir URL externa: {}", e))
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
    let discente_name = profile.name.unwrap_or_else(|| "Discente".into());
    Ok(format!(
        "Conectado como {} ({})",
        discente_name, profile.course
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
    let courses = client.validate_credentials(&clean_cpf, &senha).await?;
    Ok(format!(
        "Conectado ao Aprender 3 ({} turmas encontradas)",
        courses.len()
    ))
}

const RU_MENUS_CDN_URLS: &[&str] = &[
    "https://kalebhenrique.github.io/sarue-unb/data/ru-menus.json",
    "https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data/ru-menus.json",
];

#[command]
#[specta::specta]
pub async fn fetch_ru_menus_cdn() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Sarue-UnB/0.5.0 (Tauri)")
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente HTTP: {}", e))?;

    let mut last_err = String::new();
    for url in RU_MENUS_CDN_URLS {
        match client.get(*url).send().await {
            Ok(resp) if resp.status().is_success() => match resp.text().await {
                Ok(text) if !text.trim().is_empty() => return Ok(text),
                Ok(_) => last_err = "CDN retornou JSON vazio.".to_string(),
                Err(e) => last_err = format!("Falha ao ler resposta do CDN: {}", e),
            },
            Ok(resp) => {
                last_err = format!("CDN retornou status HTTP {}", resp.status());
            }
            Err(e) => {
                last_err = format!("Falha de rede ao acessar CDN: {}", e);
            }
        }
    }

    Err(if last_err.is_empty() {
        "Não foi possível baixar o cardápio do RU pelo CDN.".to_string()
    } else {
        last_err
    })
}

#[command]
#[specta::specta]
pub async fn fetch_student_wallet(
    matricula: String,
    senha: String,
) -> Result<crate::models::StudentWalletSyncPayload, String> {
    let client = SigaaClient::new();
    client.fetch_student_wallet(matricula.trim(), &senha).await
}

#[command]
#[specta::specta]
pub async fn connect_teams(
    app: AppHandle,
    email: Option<String>,
) -> Result<crate::models::TeamsConnectResult, String> {
    #[cfg(not(desktop))]
    {
        let _ = (&app, &email);
        return Err(
            "A integração com o Microsoft Teams é exclusiva da versão Desktop do Saruê UnB.".into(),
        );
    }
    #[cfg(desktop)]
    {
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

        let (tx, rx) = tokio::sync::oneshot::channel::<
            Result<(String, String, Vec<FeedItem>, Vec<Course>), String>,
        >();
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
                badge.textContent = 'Sarue UnB';

                const info = document.createElement('span');
                info.id = '__unb_banner_info__';
                info.textContent = 'Entre com "Usar minha senha" e 2FA. Quando as turmas carregarem, clique em:';

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
                    confirmBtn.textContent = '⏳ Sincronizando...';
                    info.textContent = 'Login confirmado! Sincronizando turmas, avisos e atividades...';

                    try {
                        if (typeof window.__unb_start_crawl === 'function') {
                            window.__unb_start_crawl();
                            return;
                        }
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
                        console.error('[Sarue UnB] Erro ao confirmar login:', err);
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
                                    let _ = sender.send(Ok((final_email, full_payload, items, courses)));
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
                            let _ = sender.send(Ok((final_email, payload_str, items, courses)));
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
        let auth_result =
            match tokio::time::timeout(tokio::time::Duration::from_secs(600), rx).await {
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
            Ok((detected_email, raw_payload, items, courses)) => {
                let (items, courses) =
                    crate::scraper::enrich_teams_via_reqwest(&raw_payload, items, courses).await;
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
}

#[command]
#[specta::specta]
pub async fn disconnect_teams(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        for (label, win) in app.webview_windows() {
            if label == "teams-auth" || label.starts_with("scraper-teams-") {
                let _ = win.hide();
                let _ = win.destroy();
            }
        }
        log::info!("Microsoft Teams desconectado e janelas auxiliares encerradas.");
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
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

/// Libera todos os caches estáticos em memória RAM do backend Rust (catálogos SIGAA + CSV de avaliações).
pub fn clear_all_memory_caches() {
    crate::grade_scraper::SigaaGradeScraper::clear_memory_caches();
    if let Ok(mut lock) = get_evaluations_csv_lock().try_write() {
        *lock = None;
    }
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
        .user_agent("Sarue-UnB/0.4.0 (Desktop App; Tauri)")
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
    let _ = crate::settings::save_background_run_enabled(&app, enabled);
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
pub async fn get_sync_only_on_wifi(app: AppHandle) -> Result<bool, String> {
    Ok(crate::settings::is_sync_only_on_wifi(&app))
}

#[command]
#[specta::specta]
pub async fn set_sync_only_on_wifi(app: AppHandle, enabled: bool) -> Result<(), String> {
    crate::settings::save_sync_only_on_wifi(&app, enabled)?;
    log::info!("Preferência sync_only_on_wifi atualizada para: {}", enabled);
    Ok(())
}

#[command]
#[specta::specta]
pub async fn get_network_status(
    app: AppHandle,
) -> Result<tauri_plugin_network_status::NetworkStatus, String> {
    tokio::task::spawn_blocking(move || {
        use tauri_plugin_network_status::NetworkStatusExt;
        app.network_status()
            .get_network_status()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Falha ao consultar status da rede: {}", e))?
}

#[command]
#[specta::specta]
pub async fn is_auto_sync_allowed(app: AppHandle) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || crate::can_run_auto_sync(&app))
        .await
        .map_err(|e| format!("Falha ao verificar permissão de sync automático: {}", e))
}

#[command]
#[specta::specta]
pub async fn set_tray_sync_state(app: AppHandle, syncing: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::tray::update_tray_sync_state(&app, syncing)
    }
    #[cfg(not(desktop))]
    {
        let _ = (&app, syncing);
        Ok(())
    }
}

#[command]
#[specta::specta]
pub async fn show_main_window(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
    }
    Ok(())
}

#[command]
#[specta::specta]
pub async fn prepare_for_update(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(quitting) = app.try_state::<crate::IsQuitting>() {
        quitting.0.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    log::info!("Aplicativo preparado para atualização: fechamento de janela liberado.");
    Ok(())
}

#[command]
#[specta::specta]
pub async fn cancel_prepare_for_update(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(quitting) = app.try_state::<crate::IsQuitting>() {
        quitting
            .0
            .store(false, std::sync::atomic::Ordering::Relaxed);
    }
    log::info!("Atualização cancelada ou com erro: fechamento de janela restaurado.");
    Ok(())
}

#[command]
#[specta::specta]
pub async fn set_max_brightness(app: AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_brightness::BrightnessExt;
    app.brightness()
        .set_max_brightness(enable)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum FileExportOutcome {
    Saved,
    Shared,
    Cancelled,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FileExportResult {
    /// `"saved"` (desktop), `"shared"` (mobile) ou `"cancelled"` (usuário fechou o diálogo).
    pub outcome: FileExportOutcome,
    pub path: Option<String>,
}

#[cfg(desktop)]
async fn pick_desktop_save_path(
    app: &AppHandle,
    filename: &str,
    title: Option<&str>,
    filter_name: &str,
    filter_extensions: &[&str],
) -> Result<Option<std::path::PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut builder = app
        .dialog()
        .file()
        .set_file_name(filename)
        .add_filter(filter_name, filter_extensions);
    if let Some(t) = title {
        builder = builder.set_title(t);
    }

    builder.save_file(move |file_path| {
        let _ = tx.send(file_path);
    });

    let picked = rx
        .await
        .map_err(|_| "Diálogo de salvamento interrompido".to_string())?;

    match picked {
        Some(fp) => fp
            .into_path()
            .map(Some)
            .map_err(|e| format!("Caminho inválido selecionado: {e}")),
        None => Ok(None),
    }
}

#[command]
#[specta::specta]
pub async fn share_image(
    app: AppHandle,
    base64_png: String,
    filename: String,
    title: Option<String>,
) -> Result<FileExportResult, String> {
    #[cfg(desktop)]
    {
        use base64::Engine as _;

        let Some(path) = pick_desktop_save_path(
            &app,
            &filename,
            title.as_deref().or(Some("Salvar imagem")),
            "Imagem PNG",
            &["png"],
        )
        .await?
        else {
            return Ok(FileExportResult {
                outcome: FileExportOutcome::Cancelled,
                path: None,
            });
        };

        let clean_b64 = base64_png
            .split_once("base64,")
            .map(|(_, rest)| rest)
            .unwrap_or(&base64_png)
            .trim();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(clean_b64)
            .map_err(|e| format!("Imagem PNG inválida: {e}"))?;

        tokio::fs::write(&path, bytes)
            .await
            .map_err(|e| format!("Falha ao salvar arquivo: {e}"))?;

        Ok(FileExportResult {
            outcome: FileExportOutcome::Saved,
            path: Some(path.to_string_lossy().into_owned()),
        })
    }

    #[cfg(not(desktop))]
    {
        use tauri_plugin_share::ShareExt;
        app.share()
            .share_image(base64_png, filename, title)
            .map_err(|e| e.to_string())?;
        Ok(FileExportResult {
            outcome: FileExportOutcome::Shared,
            path: None,
        })
    }
}

#[command]
#[specta::specta]
pub async fn share_text_file(
    app: AppHandle,
    content: String,
    filename: String,
    mime_type: String,
    title: Option<String>,
) -> Result<FileExportResult, String> {
    #[cfg(desktop)]
    {
        let _ = mime_type;
        let Some(path) = pick_desktop_save_path(
            &app,
            &filename,
            title.as_deref().or(Some("Salvar backup")),
            "Backup JSON",
            &["json"],
        )
        .await?
        else {
            return Ok(FileExportResult {
                outcome: FileExportOutcome::Cancelled,
                path: None,
            });
        };

        tokio::fs::write(&path, content.as_bytes())
            .await
            .map_err(|e| format!("Falha ao salvar arquivo: {e}"))?;

        Ok(FileExportResult {
            outcome: FileExportOutcome::Saved,
            path: Some(path.to_string_lossy().into_owned()),
        })
    }

    #[cfg(not(desktop))]
    {
        use tauri_plugin_share::ShareExt;
        app.share()
            .share_text_file(content, filename, mime_type, title)
            .map_err(|e| e.to_string())?;
        Ok(FileExportResult {
            outcome: FileExportOutcome::Shared,
            path: None,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderedStudentCardDto {
    pub cropped_data_url: String,
    pub full_page_data_url: String,
}

#[command]
#[specta::specta]
pub async fn render_student_card_pdf(
    app: AppHandle,
    pdf_base64: String,
) -> Result<Option<RenderedStudentCardDto>, String> {
    use tauri_plugin_share::ShareExt;
    let res = app
        .share()
        .render_student_card_pdf(pdf_base64)
        .map_err(|e| e.to_string())?;
    Ok(res.map(|r| RenderedStudentCardDto {
        cropped_data_url: r.cropped_data_url,
        full_page_data_url: r.full_page_data_url,
    }))
}

#[command]
#[specta::specta]
pub async fn is_play_store_install(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_share::ShareExt;
    app.share()
        .is_play_store_install()
        .map_err(|e| e.to_string())
}

fn decode_base64_bytes(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity((input.len() * 3) / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for b in input.bytes() {
        let val = match b {
            b'A'..=b'Z' => (b - b'A') as u32,
            b'a'..=b'z' => (b - b'a' + 26) as u32,
            b'0'..=b'9' => (b - b'0' + 52) as u32,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => return Err("Base64 inválido no PDF.".to_string()),
        };
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

const MAX_PDF_BYTES: u64 = 25 * 1024 * 1024;
const MAX_PDF_BASE64_LEN: usize = 35 * 1024 * 1024;

#[command]
#[specta::specta]
pub async fn extract_pdf_text(pdf_base64: String) -> Result<String, String> {
    if pdf_base64.len() > MAX_PDF_BASE64_LEN {
        return Err("O arquivo PDF é muito grande (limite de 25 MB).".to_string());
    }
    let bytes = decode_base64_bytes(&pdf_base64)?;
    if bytes.is_empty() {
        return Err("O arquivo PDF selecionado está vazio.".to_string());
    }
    if bytes.len() as u64 > MAX_PDF_BYTES {
        return Err("O arquivo PDF é muito grande (limite de 25 MB).".to_string());
    }
    let text = tokio::task::spawn_blocking(move || pdf_extract::extract_text_from_mem(&bytes))
        .await
        .map_err(|e| format!("Falha interna ao ler o PDF: {e}"))?
        .map_err(|e| format!("Não foi possível extrair texto do PDF: {e}"))?;
    if text.trim().is_empty() {
        return Err("O PDF não contém texto legível.".to_string());
    }
    Ok(text)
}

#[command]
#[specta::specta]
pub async fn extract_pdf_text_from_path(path: String) -> Result<String, String> {
    let trimmed = path.trim().to_string();
    if !trimmed.to_lowercase().ends_with(".pdf") {
        return Err("Envie um arquivo no formato PDF (.pdf) emitido pelo SIGAA.".to_string());
    }
    let text = tokio::task::spawn_blocking(move || -> Result<String, String> {
        use std::io::Read;
        let file = std::fs::File::open(&trimmed)
            .map_err(|_| "Não foi possível acessar o arquivo PDF selecionado.".to_string())?;
        let meta = file
            .metadata()
            .map_err(|_| "Não foi possível acessar o arquivo PDF selecionado.".to_string())?;
        if !meta.is_file() {
            return Err("O item arrastado não é um arquivo PDF válido.".to_string());
        }
        let mut bytes = Vec::new();
        file.take(MAX_PDF_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| format!("Falha ao ler o arquivo PDF: {e}"))?;
        if bytes.is_empty() {
            return Err("O arquivo PDF selecionado está vazio.".to_string());
        }
        if bytes.len() as u64 > MAX_PDF_BYTES {
            return Err("O arquivo PDF é muito grande (limite de 25 MB).".to_string());
        }
        pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("Não foi possível extrair texto do PDF: {e}"))
    })
    .await
    .map_err(|e| format!("Falha interna ao ler o PDF: {e}"))??;
    if text.trim().is_empty() {
        return Err("O PDF não contém texto legível.".to_string());
    }
    Ok(text)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApkReleaseUpdateDto {
    pub version: String,
    pub current_version: String,
    pub date: Option<String>,
    pub body: Option<String>,
    pub apk_download_url: String,
    pub release_page_url: String,
}

pub fn parse_semver_tuple(ver: &str) -> Option<(u32, u32, u32)> {
    let clean = ver.trim().trim_start_matches('v').trim_start_matches('V');
    let core = clean.split(['-', '+']).next().unwrap_or(clean);
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u32>().ok()?;
    Some((major, minor, patch))
}

/// Lê `android.apk_url` do manifesto `latest.json` (gerado por consolidate-latest-json.mjs).
pub fn apk_url_from_manifest(manifest: &serde_json::Value) -> Option<String> {
    manifest
        .get("android")
        .and_then(|a| a.get("apk_url"))
        .and_then(|v| v.as_str())
        .filter(|u| u.starts_with("https://") && u.ends_with(".apk"))
        .map(|u| u.to_string())
}

pub fn is_newer_semver(current: &str, candidate: &str) -> bool {
    match (parse_semver_tuple(current), parse_semver_tuple(candidate)) {
        (Some(curr), Some(cand)) => cand > curr,
        _ => false,
    }
}

#[command]
#[specta::specta]
pub async fn check_apk_release_update(
    app: AppHandle,
) -> Result<Option<ApkReleaseUpdateDto>, String> {
    let current_version = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Sarue-UnB-Updater/1.0 (Tauri)")
        .build()
        .map_err(|e| format!("Falha ao inicializar cliente HTTP: {}", e))?;

    let release_page_default =
        "https://github.com/kalebhenrique/sarue-unb/releases/latest".to_string();

    // 0. Fonte primária: latest.json da release (sem rate limit), com bloco `android.apk_url`
    if let Ok(resp) = client
        .get("https://github.com/kalebhenrique/sarue-unb/releases/latest/download/latest.json")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let remote_version = json
                    .get("version")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .trim_start_matches('v')
                    .to_string();
                if !remote_version.is_empty() {
                    if !is_newer_semver(&current_version, &remote_version) {
                        return Ok(None);
                    }
                    if let Some(apk_download_url) = apk_url_from_manifest(&json) {
                        return Ok(Some(ApkReleaseUpdateDto {
                            version: remote_version,
                            current_version,
                            date: json
                                .get("pub_date")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            body: json
                                .get("notes")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            apk_download_url,
                            release_page_url: release_page_default,
                        }));
                    }
                }
            }
        }
    }

    // 1. Fallback: API oficial do GitHub Releases para obter o asset .apk exato
    if let Ok(resp) = client
        .get("https://api.github.com/repos/kalebhenrique/sarue-unb/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let tag_name = json
                    .get("tag_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default();
                let clean_version = tag_name.trim_start_matches('v').to_string();
                if !clean_version.is_empty() && is_newer_semver(&current_version, &clean_version) {
                    let body = json
                        .get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let date = json
                        .get("published_at")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let html_url = json
                        .get("html_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| release_page_default.clone());

                    let mut apk_url: Option<String> = None;
                    if let Some(assets) = json.get("assets").and_then(|v| v.as_array()) {
                        for asset in assets {
                            let name = asset
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();
                            let url = asset
                                .get("browser_download_url")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();
                            if name.ends_with(".apk") && !url.is_empty() {
                                apk_url = Some(url.to_string());
                                if name.contains("arm64") || name.contains("aarch64") {
                                    break;
                                }
                            }
                        }
                    }

                    let final_apk_url = apk_url.unwrap_or_else(|| {
                        format!(
                            "https://github.com/kalebhenrique/sarue-unb/releases/download/v{}/Sarue.UnB_{}_android_arm64.apk",
                            clean_version, clean_version
                        )
                    });

                    return Ok(Some(ApkReleaseUpdateDto {
                        version: clean_version,
                        current_version,
                        date,
                        body,
                        apk_download_url: final_apk_url,
                        release_page_url: html_url,
                    }));
                } else if !clean_version.is_empty() {
                    return Ok(None);
                }
            }
        }
    }

    // 2. Fallback: consulta latest.json da release (não sofre rate-limit da API do GitHub)
    let latest_json_url =
        "https://github.com/kalebhenrique/sarue-unb/releases/latest/download/latest.json";
    let resp = client
        .get(latest_json_url)
        .send()
        .await
        .map_err(|e| format!("Falha ao consultar latest.json: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Servidor de atualizações retornou status HTTP {}",
            resp.status()
        ));
    }

    let json = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Falha ao ler manifesto latest.json: {}", e))?;

    let remote_version = json
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();

    if remote_version.is_empty() || !is_newer_semver(&current_version, &remote_version) {
        return Ok(None);
    }

    let body = json
        .get("notes")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let date = json
        .get("pub_date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let apk_download_url = format!(
        "https://github.com/kalebhenrique/sarue-unb/releases/download/v{}/Sarue.UnB_{}_android_arm64.apk",
        remote_version, remote_version
    );

    Ok(Some(ApkReleaseUpdateDto {
        version: remote_version,
        current_version,
        date,
        body,
        apk_download_url,
        release_page_url: release_page_default,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_vault_filename() {
        assert!(is_valid_vault_filename("unb_vault.hold"));
        assert!(is_valid_vault_filename("unb_vault_dev.hold"));
        assert!(is_valid_vault_filename("unb_vault.hold.bak"));
        assert!(is_valid_vault_filename("unb_vault_dev.hold.bak"));
        assert!(is_valid_vault_filename("unb_vault.hold.corrupted.bak"));
        assert!(is_valid_vault_filename("unb_vault_dev.hold.corrupted.bak"));
        assert!(is_valid_vault_filename("unb_vault.hold.1730987654.bak"));
        assert!(is_valid_vault_filename("unb_vault_dev.hold.1730987654.bak"));

        // Bloqueio de path traversal
        assert!(!is_valid_vault_filename(
            "unb_vault.hold.foo/../../etc/passwd.bak"
        ));
        assert!(!is_valid_vault_filename("unb_vault.hold.\\..\\test.bak"));
        assert!(!is_valid_vault_filename("unb_vault.hold/bad.bak"));
        assert!(!is_valid_vault_filename("../unb_vault.hold"));
        assert!(!is_valid_vault_filename("random.hold"));
        assert!(!is_valid_vault_filename("unb_vault.key"));
    }

    #[test]
    fn test_apk_url_from_manifest_and_semver() {
        let m = serde_json::json!({
            "version": "0.5.2",
            "android": { "apk_url": "https://github.com/x/y/releases/download/v0.5.2/Sarue.UnB_0.5.2_android_arm64.apk" }
        });
        assert!(apk_url_from_manifest(&m).unwrap().ends_with(".apk"));
        assert!(apk_url_from_manifest(&serde_json::json!({"version": "1"})).is_none());
        assert!(apk_url_from_manifest(
            &serde_json::json!({"android": {"apk_url": "http://evil/x.exe"}})
        )
        .is_none());
        assert!(is_newer_semver("0.5.1", "0.5.2"));
        assert!(!is_newer_semver("0.5.2", "0.5.2"));
    }

    #[test]
    fn test_is_valid_hex_key() {
        let valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(is_valid_hex_key(valid));

        // Tamanho incorreto
        assert!(!is_valid_hex_key("0123456789abcdef"));
        // Caractere não-hexadecimal
        let invalid = "g123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert!(!is_valid_hex_key(invalid));
    }

    #[test]
    fn test_write_and_read_vault_key_file() {
        let temp_dir = std::env::temp_dir().join(format!("sarue_test_{}", rand::random::<u32>()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let key_path = temp_dir.join("vault.key");

        let test_key = "a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123";
        write_vault_key_file(&key_path, test_key).expect("Falha ao escrever chave");

        let read_back = std::fs::read_to_string(&key_path).unwrap();
        assert_eq!(read_back, test_key);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::metadata(&key_path).unwrap();
            let mode = meta.permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "Permissões devem ser restritas 0600");
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_decode_base64_roundtrip_and_invalid() {
        let sample = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n";
        let encoded = crate::sigaa::base64_encode(sample);
        let decoded = decode_base64_bytes(&encoded).expect("decode válido deve passar");
        assert_eq!(decoded, sample);

        assert!(decode_base64_bytes("%%%invalid%%%").is_err());
    }
}
