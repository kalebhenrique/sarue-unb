use crate::models::{Course, FeedItem, FeedItemType, PlatformType};
use chrono::TimeZone;
use regex::Regex;
use reqwest::Client;
use scraper::{Html, Selector};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

pub struct MoodleClient {
    _client: Client,
}

impl Default for MoodleClient {
    fn default() -> Self {
        Self::new()
    }
}

impl MoodleClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { _client: client }
    }

    /// Autentica no Aprender 3 e obtém a lista de disciplinas matriculadas (rápido, ideal para validação de credenciais)
    pub async fn validate_credentials(
        &self,
        cpf: &str,
        senha: &str,
    ) -> Result<Vec<Course>, String> {
        let (_sesskey, _courses_url, courses) = self.login_and_fetch_courses(cpf, senha).await?;
        Ok(courses)
    }

    async fn login_and_fetch_courses(
        &self,
        cpf: &str,
        senha: &str,
    ) -> Result<(String, String, Vec<Course>), String> {
        let clean_username = clean_cpf(cpf);
        if clean_username.is_empty() || senha.is_empty() {
            return Err("Informe seu CPF e senha do Aprender 3 para continuar.".to_string());
        }

        let base_url = "https://aprender3.unb.br";
        let login_url = format!("{}/login/index.php", base_url);

        // 1. GET página de login para capturar o logintoken CSRF
        let login_page_res = self
            ._client
            .get(&login_url)
            .header("Referer", base_url)
            .send()
            .await
            .map_err(|e| format!("Falha ao conectar no Aprender 3: {}", e))?;

        let login_html = login_page_res
            .text()
            .await
            .map_err(|e| format!("Falha ao ler página de login do Aprender 3: {}", e))?;

        let logintoken = extract_logintoken(&login_html).ok_or_else(|| {
            "Não foi possível extrair o logintoken de segurança do Aprender 3.".to_string()
        })?;

        // 2. POST de autenticação com cookies preservados
        let mut params = HashMap::new();
        params.insert("logintoken", logintoken.as_str());
        params.insert("username", clean_username.as_str());
        params.insert("password", senha);
        params.insert("anchor", "");

        let post_res = self
            ._client
            .post(&login_url)
            .form(&params)
            .header("Referer", &login_url)
            .header("Origin", base_url)
            .send()
            .await
            .map_err(|e| format!("Falha ao enviar credenciais para o Aprender 3: {}", e))?;

        let final_url = post_res.url().to_string();
        let post_text = post_res
            .text()
            .await
            .map_err(|e| format!("Falha ao processar resposta de login do Aprender 3: {}", e))?;

        // Validação de erro de login
        if final_url.contains("login/index.php") {
            if post_text.contains("alert-danger")
                || post_text.contains("Nome de usuário ou senha errados")
                || post_text.contains("loginerrormsg")
                || post_text.contains("Credenciais inválidas")
            {
                return Err(
                    "CPF ou senha incorretos no Aprender 3. Verifique seus dados.".to_string(),
                );
            }
            if post_text.contains("id=\"loginbtn\"") {
                return Err(
                    "Falha na autenticação do Aprender 3. Verifique seu CPF e senha.".to_string(),
                );
            }
        }

        // 3. GET /my/courses.php para extrair dados da sessão autenticada (sesskey e userId)
        let courses_url = format!("{}/my/courses.php", base_url);
        let courses_res = self
            ._client
            .get(&courses_url)
            .header("Referer", base_url)
            .send()
            .await
            .map_err(|e| format!("Falha ao acessar Meus Cursos no Aprender 3: {}", e))?;

        let courses_html = courses_res
            .text()
            .await
            .map_err(|e| format!("Falha ao carregar conteúdo de Meus Cursos: {}", e))?;

        let (sesskey, user_id) = extract_session_info(&courses_html)
            .ok_or_else(|| "Sessão expirada ou não autenticada no Aprender 3.".to_string())?;

        if user_id == 0 && sesskey.is_empty() {
            return Err("Usuário não identificado na sessão do Aprender 3.".to_string());
        }

        // 4. Chamada ao WebService AJAX do Moodle para obter turmas do usuário
        let service_url = format!(
            "{}/lib/ajax/service.php?sesskey={}&info=core_course_get_enrolled_courses_by_timeline_classification",
            base_url, sesskey
        );

        let ws_body = serde_json::json!([
            {
                "index": 0,
                "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
                "args": {
                    "offset": 0,
                    "limit": 0,
                    "classification": "all",
                    "sort": "fullname"
                }
            }
        ]);

        let ws_res = self
            ._client
            .post(&service_url)
            .json(&ws_body)
            .header("Referer", &courses_url)
            .send()
            .await;

        let mut courses = Vec::new();
        let mut ws_success = false;

        if let Ok(res) = ws_res {
            if let Ok(json_val) = res.json::<Value>().await {
                if let Ok(parsed) = parse_moodle_courses_ws(&json_val) {
                    if !parsed.is_empty() {
                        courses = parsed;
                        ws_success = true;
                    }
                }
            }
        }

        // Se o WebService não retornou turmas ou falhou, aciona o fallback de raspagem HTML
        if !ws_success || courses.is_empty() {
            let scraped = scrape_courses_html(&courses_html);
            if !scraped.is_empty() {
                courses = scraped;
            }
        }

        Ok((sesskey, courses_url, courses))
    }

    /// Sincronização direta via requisição HTTP para a API e scraping do Aprender 3 (Moodle UnB)
    pub async fn sync_aprender3(
        &self,
        cpf: &str,
        senha: &str,
    ) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        let base_url = "https://aprender3.unb.br";
        let (sesskey, courses_url, mut courses) = self.login_and_fetch_courses(cpf, senha).await?;

        // 5. Coleta de eventos de ação do calendário Moodle (limite estrito de 50 pelo Moodle 4.5)
        let mut calendar_feed_items = Vec::new();
        let now_epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let cal_methods = vec![
            serde_json::json!({
                "index": 0,
                "methodname": "core_calendar_get_action_events_by_timesort",
                "args": {
                    "timesortfrom": 1,
                    "timesortto": now_epoch,
                    "limitnum": 50,
                    "limittononsuspendedevents": true
                }
            }),
            serde_json::json!({
                "index": 1,
                "methodname": "core_calendar_get_action_events_by_timesort",
                "args": {
                    "timesortfrom": now_epoch,
                    "timesortto": now_epoch + (180 * 86400),
                    "limitnum": 50,
                    "limittononsuspendedevents": true
                }
            }),
        ];

        let calendar_url = format!(
            "{}/lib/ajax/service.php?sesskey={}&info=core_calendar_get_action_events_by_timesort",
            base_url, sesskey
        );

        if let Ok(cal_res) = self
            ._client
            .post(&calendar_url)
            .json(&cal_methods)
            .header("Referer", &courses_url)
            .send()
            .await
        {
            if let Ok(body_text) = cal_res.text().await {
                if let Ok(json_val) = serde_json::from_str::<Value>(&body_text) {
                    calendar_feed_items =
                        parse_moodle_calendar_events_with_now(&json_val, now_epoch);
                }
            }
        }

        // Se o WebService de calendário falhou ou retornou vazio, tenta o fallback HTML do calendário
        if calendar_feed_items.is_empty() {
            let upcoming_url = format!("{}/calendar/view.php?view=upcoming", base_url);
            if let Ok(up_res) = self
                ._client
                .get(&upcoming_url)
                .header("Referer", &courses_url)
                .send()
                .await
            {
                if let Ok(up_html) = up_res.text().await {
                    let scraped_events = scrape_calendar_html(&up_html, now_epoch);
                    if !scraped_events.is_empty() {
                        calendar_feed_items = scraped_events;
                    }
                }
            }
        }

        // 6. Raspagem concorrente (até 4 conexões simultâneas) de todas as atividades das turmas (course/view.php)
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(4));
        let mut course_tasks = tokio::task::JoinSet::new();
        for course in courses.iter().cloned() {
            let Some(cid) = course.id.strip_prefix("aprender-").map(|s| s.to_string()) else {
                continue;
            };
            let client = self._client.clone();
            let sem = semaphore.clone();
            let referer = courses_url.clone();
            let c_url = format!("{}/course/view.php?id={}", base_url, cid);
            course_tasks.spawn(async move {
                let _permit = sem.acquire().await.ok()?;
                let c_res = client
                    .get(&c_url)
                    .header("Referer", &referer)
                    .send()
                    .await
                    .ok()?;
                let c_html = c_res.text().await.ok()?;
                Some(scrape_course_modules_html(&c_html, &course, now_epoch))
            });
        }

        let mut course_module_items = Vec::new();
        while let Some(res) = course_tasks.join_next().await {
            if let Ok(Some(mut items)) = res {
                course_module_items.append(&mut items);
            }
        }

        // 7. Para atividades com prazo futuro pendentes, verifica concorrentemente se já foram enviadas pelo aluno
        let mut submission_tasks = tokio::task::JoinSet::new();
        for (idx, item) in course_module_items.iter().enumerate() {
            if item.is_completed == Some(false) {
                if let Some(url) = item.external_url.clone() {
                    let client = self._client.clone();
                    let sem = semaphore.clone();
                    submission_tasks.spawn(async move {
                        let _permit = sem.acquire().await.ok()?;
                        let res = client.get(&url).send().await.ok()?;
                        let html = res.text().await.ok()?;
                        Some((idx, is_activity_page_submitted(&html)))
                    });
                }
            }
        }

        while let Some(res) = submission_tasks.join_next().await {
            if let Ok(Some((idx, true))) = res {
                if let Some(item) = course_module_items.get_mut(idx) {
                    item.is_completed = Some(true);
                }
            }
        }

        // 8. Mescla os itens das turmas com os eventos de calendário, evitando duplicatas por URL ou ID de módulo
        let mut seen_mod_urls = HashSet::new();
        let cmid_re = Regex::new(r"[?&]id=(\d+)").unwrap();
        let mut seen_cmids = HashSet::new();

        for item in &course_module_items {
            if let Some(ref u) = item.external_url {
                seen_mod_urls.insert(u.clone());
                if let Some(cap) = cmid_re.captures(u) {
                    seen_cmids.insert(cap[1].to_string());
                }
            }
        }

        let mut feed_items = course_module_items;

        for cal_item in calendar_feed_items {
            let is_duplicate = if let Some(ref u) = cal_item.external_url {
                seen_mod_urls.contains(u)
                    || cmid_re
                        .captures(u)
                        .map(|c| seen_cmids.contains(&c[1]))
                        .unwrap_or(false)
            } else {
                false
            };

            if !is_duplicate {
                feed_items.push(cal_item);
            }
        }

        // Ordena por data de entrega (ou criação), mais recentes/próximas primeiro
        feed_items.sort_by(|a, b| {
            let key_a = a.due_date.as_deref().unwrap_or(&a.created_at);
            let key_b = b.due_date.as_deref().unwrap_or(&b.created_at);
            key_b.cmp(key_a)
        });

        // Atualiza a contagem de tarefas pendentes em cada turma (apenas não concluídas)
        for course in &mut courses {
            let count = feed_items
                .iter()
                .filter(|item| {
                    let matches_course = if let Some(code) = &item.course_code {
                        let c_code = code.to_lowercase();
                        let target_code = course.code.to_lowercase();
                        !c_code.is_empty()
                            && (target_code.contains(&c_code) || c_code.contains(&target_code))
                    } else {
                        let c_name = item.course_name.to_lowercase();
                        let target_name = course.name.to_lowercase();
                        target_name.contains(&c_name) || c_name.contains(&target_name)
                    };
                    matches_course && item.is_completed != Some(true)
                })
                .count() as u32;

            course.pending_assignments_count = Some(count);
        }

        log::info!(
            "Aprender 3 sincronizado: {} turmas, {} itens de feed.",
            courses.len(),
            feed_items.len()
        );

        Ok((feed_items, courses))
    }
}

// =========================================================================
// Funções Utilitárias e Parsers Isolados (Testáveis Unitariamente)
// =========================================================================

pub fn clean_cpf(cpf: &str) -> String {
    let digits: String = cpf.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        cpf.trim().to_string()
    } else {
        digits
    }
}

pub fn extract_logintoken(html: &str) -> Option<String> {
    // 1. Selector CSS
    if let Ok(selector) = Selector::parse("input[name='logintoken']") {
        let document = Html::parse_document(html);
        if let Some(el) = document.select(&selector).next() {
            if let Some(val) = el.value().attr("value") {
                if !val.trim().is_empty() {
                    return Some(val.trim().to_string());
                }
            }
        }
    }
    // 2. Regex fallback
    let re = Regex::new(r#"name=["']logintoken["']\s+value=["']([^"']+)["']"#).ok()?;
    if let Some(cap) = re.captures(html) {
        return Some(cap[1].to_string());
    }
    let re2 = Regex::new(r#"value=["']([^"']+)["']\s+name=["']logintoken["']"#).ok()?;
    if let Some(cap) = re2.captures(html) {
        return Some(cap[1].to_string());
    }
    None
}

pub fn extract_session_info(html: &str) -> Option<(String, u64)> {
    let sesskey_re = Regex::new(r#""sesskey"\s*:\s*"([^"]+)""#).ok()?;
    let userid_re = Regex::new(r#""userId"\s*:\s*([0-9]+)"#).ok()?;

    let sesskey = sesskey_re.captures(html).map(|c| c[1].to_string())?;
    let userid = userid_re
        .captures(html)
        .and_then(|c| c[1].parse::<u64>().ok())
        .unwrap_or(0);

    Some((sesskey, userid))
}

pub fn parse_course_code_and_name(fullname: &str, shortname: &str) -> (String, String, String) {
    let code_re = Regex::new(r"\b([A-Z]{3}\d{4})\b").unwrap();
    let semester_re = Regex::new(r"(20\d{2}[./]\d)").unwrap();

    let code = if let Some(cap) = code_re.captures(fullname) {
        cap[1].to_string()
    } else if let Some(cap) = code_re.captures(shortname) {
        cap[1].to_string()
    } else if !shortname.trim().is_empty() {
        shortname.trim().to_string()
    } else {
        "UNB0000".to_string()
    };

    let semester = if let Some(cap) = semester_re.captures(fullname) {
        cap[1].replace('/', ".")
    } else if let Some(cap) = semester_re.captures(shortname) {
        cap[1].replace('/', ".")
    } else {
        "2026.2".to_string()
    };

    let clean_name = fullname.trim().to_string();

    (code, clean_name, semester)
}

pub fn is_ignored_moodle_course(fullname: &str, shortname: &str) -> bool {
    let lower_full = fullname.to_lowercase();
    let lower_short = shortname.to_lowercase();
    lower_full.contains("espaço do aluno")
        || lower_full.contains("espaco do aluno")
        || lower_short.contains("espaço do aluno")
        || lower_short.contains("espaco do aluno")
}

pub fn parse_moodle_courses_ws(json_val: &Value) -> Result<Vec<Course>, String> {
    let mut courses = Vec::new();
    let courses_arr = json_val
        .get(0)
        .and_then(|root| root.get("data"))
        .and_then(|data| data.get("courses"))
        .and_then(|c| c.as_array())
        .ok_or_else(|| "Campo data.courses não encontrado na resposta do WebService".to_string())?;

    for item in courses_arr {
        let id_val = item.get("id");
        let id_str = match id_val {
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };

        let fullname = item
            .get("fullname")
            .and_then(|s| s.as_str())
            .unwrap_or("Disciplina");
        let shortname = item.get("shortname").and_then(|s| s.as_str()).unwrap_or("");

        if is_ignored_moodle_course(fullname, shortname) {
            continue;
        }
        let viewurl = item
            .get("viewurl")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("https://aprender3.unb.br/course/view.php?id={}", id_str));

        let (code, name, semester) = parse_course_code_and_name(fullname, shortname);

        courses.push(Course {
            id: format!("aprender-{}", id_str),
            code,
            name,
            semester,
            platform: PlatformType::Aprender3,
            professor: None,
            classroom: None,
            schedule: None,
            class_group: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: Some(viewurl),
            absences: None,
            max_absences: None,
        });
    }

    Ok(courses)
}

pub fn scrape_courses_html(html: &str) -> Vec<Course> {
    let mut courses = Vec::new();
    let mut seen_ids = HashSet::new();

    let id_re = Regex::new(r"[?&]id=(\d+)").unwrap();
    let document = Html::parse_document(html);
    let selector = match Selector::parse("a[href*='/course/view.php']") {
        Ok(s) => s,
        Err(_) => return courses,
    };

    for element in document.select(&selector) {
        let href = match element.value().attr("href") {
            Some(h) => h,
            None => continue,
        };

        let id_str = match id_re.captures(href) {
            Some(cap) => cap[1].to_string(),
            None => continue,
        };

        if id_str == "1" || seen_ids.contains(&id_str) {
            continue;
        }

        let inner_text: String = element.text().collect::<Vec<_>>().join(" ");
        let clean_text = inner_text.split_whitespace().collect::<Vec<_>>().join(" ");

        if clean_text.is_empty() || clean_text.to_lowercase().contains("pular") {
            continue;
        }

        seen_ids.insert(id_str.clone());
        let (code, name, semester) = parse_course_code_and_name(&clean_text, "");
        if is_ignored_moodle_course(&clean_text, &code) {
            continue;
        }
        let viewurl = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://aprender3.unb.br/course/view.php?id={}", id_str)
        };

        courses.push(Course {
            id: format!("aprender-{}", id_str),
            code,
            name,
            semester,
            platform: PlatformType::Aprender3,
            professor: None,
            classroom: None,
            schedule: None,
            class_group: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: Some(viewurl),
            absences: None,
            max_absences: None,
        });
    }

    courses
}

pub fn parse_moodle_calendar_events(json_val: &Value) -> Vec<FeedItem> {
    let now_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    parse_moodle_calendar_events_with_now(json_val, now_epoch)
}

pub fn parse_moodle_calendar_events_with_now(json_val: &Value, now_epoch: i64) -> Vec<FeedItem> {
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_urls = HashSet::new();

    let tag_strip = Regex::new(r"<[^>]+>").unwrap();
    let code_regex = Regex::new(r"\b([A-Z]{3}\d{4})\b").unwrap();

    // Normaliza json_val para um slice de respostas a processar
    let raw_slices: Vec<&Value> = if let Some(arr) = json_val.as_array() {
        arr.iter().collect()
    } else {
        vec![json_val]
    };

    for root in raw_slices {
        // Se este item retornou erro da API, loga e pula para os outros
        if let Some(err) = root.get("error").and_then(|e| e.as_bool()) {
            if err {
                let msg = root
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Erro retornado pelo WebService do Aprender 3");
                log::warn!("Aprender 3 WebService error: {}", msg);
                continue;
            }
        }

        // 1. Processa eventos de calendário (core_calendar_get_action_events_by_timesort)
        let events_opt = root
            .get("data")
            .and_then(|d| d.get("events"))
            .and_then(|e| e.as_array())
            .or_else(|| root.get("events").and_then(|e| e.as_array()));

        if let Some(events_arr) = events_opt {
            for ev in events_arr {
                let id = match ev.get("id") {
                    Some(Value::Number(n)) => n.to_string(),
                    Some(Value::String(s)) => s.clone(),
                    _ => continue,
                };

                let item_id = format!("aprender-event-{}", id);
                if seen_ids.contains(&item_id) {
                    continue;
                }

                let title = ev
                    .get("name")
                    .and_then(|s| s.as_str())
                    .unwrap_or("Atividade")
                    .to_string();

                let raw_desc = ev.get("description").and_then(|s| s.as_str()).unwrap_or("");
                let content = tag_strip.replace_all(raw_desc, " ").trim().to_string();
                let final_content = if content.is_empty() {
                    title.clone()
                } else {
                    content
                };

                let course_name = ev
                    .get("course")
                    .and_then(|c| c.get("fullname"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("Aprender 3")
                    .to_string();

                let course_code = ev
                    .get("course")
                    .and_then(|c| c.get("shortname"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        code_regex
                            .captures(&course_name)
                            .map(|cap| cap[1].to_string())
                    })
                    .or_else(|| Some("A3".to_string()));

                if is_ignored_moodle_course(&course_name, course_code.as_deref().unwrap_or("")) {
                    continue;
                }

                let raw_url = ev
                    .get("action")
                    .and_then(|a| a.get("url"))
                    .and_then(|s| s.as_str())
                    .or_else(|| ev.get("url").and_then(|s| s.as_str()));

                let url = raw_url.map(|u| {
                    if u.starts_with("http") {
                        u.to_string()
                    } else {
                        format!("https://aprender3.unb.br{}", u)
                    }
                });

                let timesort = ev
                    .get("timesort")
                    .and_then(|t| t.as_i64())
                    .or_else(|| ev.get("timestart").and_then(|t| t.as_i64()))
                    .unwrap_or(0);

                let due_date_iso = if timesort > 0 {
                    Some(format_epoch_iso(timesort))
                } else {
                    None
                };

                let created_at_iso = format_epoch_iso(
                    ev.get("timecreated")
                        .and_then(|t| t.as_i64())
                        .unwrap_or_else(|| timesort.saturating_sub(86400)),
                );

                // 1. Prazo já expirado no passado (atividades antigas) -> concluída
                let is_past_due = timesort > 0 && timesort < now_epoch;

                // 2. Ação já enviada ou não requer mais envio pelo aluno
                let is_submitted = if let Some(action) = ev.get("action") {
                    let actionable = action
                        .get("actionable")
                        .and_then(|a| a.as_bool())
                        .unwrap_or(true);
                    let name = action.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let itemcount = action
                        .get("itemcount")
                        .and_then(|c| c.as_i64())
                        .unwrap_or(1);

                    !actionable
                        || itemcount == 0
                        || name.contains("Editar envio")
                        || name.contains("Ver envio")
                        || name.contains("Remover envio")
                        || name.contains("Enviado")
                        || name.contains("Visualizar")
                        || name.contains("Revisão")
                        || name.contains("Terminado")
                        || name.contains("Concluído")
                        || name.contains("Avaliado")
                } else {
                    false
                };

                let is_completed = is_past_due || is_submitted;

                if let Some(ref u) = url {
                    seen_urls.insert(u.clone());
                }
                seen_ids.insert(item_id.clone());

                items.push(FeedItem {
                    id: item_id,
                    platform: PlatformType::Aprender3,
                    title,
                    content: final_content,
                    course_name,
                    course_code,
                    author: None,
                    item_type: FeedItemType::Assignment,
                    created_at: created_at_iso,
                    due_date: due_date_iso,
                    is_completed: Some(is_completed),
                    external_url: url,
                });
            }
        }

        // 2. Processa tarefas de turmas (mod_assign_get_assignments)
        let courses_arr_opt = root
            .get("data")
            .and_then(|d| d.get("courses"))
            .and_then(|c| c.as_array())
            .or_else(|| root.get("courses").and_then(|c| c.as_array()));

        if let Some(courses_arr) = courses_arr_opt {
            for c_obj in courses_arr {
                let c_fullname = c_obj
                    .get("fullname")
                    .and_then(|s| s.as_str())
                    .unwrap_or("Aprender 3")
                    .to_string();

                let c_code = c_obj
                    .get("shortname")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        code_regex
                            .captures(&c_fullname)
                            .map(|cap| cap[1].to_string())
                    })
                    .or_else(|| Some("A3".to_string()));

                if is_ignored_moodle_course(&c_fullname, c_code.as_deref().unwrap_or("")) {
                    continue;
                }

                if let Some(assignments) = c_obj.get("assignments").and_then(|a| a.as_array()) {
                    for assign in assignments {
                        let assign_id = match assign.get("id") {
                            Some(Value::Number(n)) => n.to_string(),
                            Some(Value::String(s)) => s.clone(),
                            _ => continue,
                        };

                        let cmid = assign.get("cmid").and_then(|v| v.as_i64()).unwrap_or(0);
                        let item_id = format!("aprender-assign-{}", assign_id);

                        let assign_url = if cmid > 0 {
                            format!("https://aprender3.unb.br/mod/assign/view.php?id={}", cmid)
                        } else {
                            format!(
                                "https://aprender3.unb.br/mod/assign/view.php?id={}",
                                assign_id
                            )
                        };

                        // Evita duplicatas se o evento já veio via calendário
                        if seen_ids.contains(&item_id) || seen_urls.contains(&assign_url) {
                            continue;
                        }

                        let assign_name = assign
                            .get("name")
                            .and_then(|s| s.as_str())
                            .unwrap_or("Tarefa")
                            .to_string();

                        let raw_intro = assign.get("intro").and_then(|s| s.as_str()).unwrap_or("");
                        let intro_clean = tag_strip.replace_all(raw_intro, " ").trim().to_string();
                        let content = if intro_clean.is_empty() {
                            assign_name.clone()
                        } else {
                            intro_clean
                        };

                        let duedate = assign.get("duedate").and_then(|d| d.as_i64()).unwrap_or(0);
                        let cutoffdate = assign
                            .get("cutoffdate")
                            .and_then(|d| d.as_i64())
                            .unwrap_or(0);
                        let timemodified = assign
                            .get("timemodified")
                            .and_then(|d| d.as_i64())
                            .unwrap_or(0);

                        let due_date_iso = if duedate > 0 {
                            Some(format_epoch_iso(duedate))
                        } else {
                            None
                        };

                        let created_at_iso = if timemodified > 0 {
                            format_epoch_iso(timemodified)
                        } else if duedate > 0 {
                            format_epoch_iso(duedate.saturating_sub(86400 * 7))
                        } else {
                            format_epoch_iso(now_epoch)
                        };

                        // Se a data de entrega ou data de corte já passou, está concluída
                        let is_past_due = (duedate > 0 && duedate < now_epoch)
                            || (cutoffdate > 0 && cutoffdate < now_epoch);

                        seen_ids.insert(item_id.clone());
                        seen_urls.insert(assign_url.clone());

                        items.push(FeedItem {
                            id: item_id,
                            platform: PlatformType::Aprender3,
                            title: assign_name,
                            content,
                            course_name: c_fullname.clone(),
                            course_code: c_code.clone(),
                            author: None,
                            item_type: FeedItemType::Assignment,
                            created_at: created_at_iso,
                            due_date: due_date_iso,
                            is_completed: Some(is_past_due),
                            external_url: Some(assign_url),
                        });
                    }
                }
            }
        }
    }

    items
}

pub fn scrape_calendar_html(html: &str, now_epoch: i64) -> Vec<FeedItem> {
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();

    let document = Html::parse_document(html);
    let event_sel = match Selector::parse(
        "div.event[data-event-id], div[data-type='event'], .calendar-event-box",
    ) {
        Ok(s) => s,
        Err(_) => return items,
    };
    let name_sel = Selector::parse("h3.name a, .name a, h3.name, .card-title a, .card-title").ok();
    let course_sel =
        Selector::parse(".course a, .card-header, .description a[href*='course/view.php']").ok();
    let desc_sel = Selector::parse(".description, .card-body").ok();
    let date_sel = Selector::parse(".date, .date a").ok();
    let code_re = Regex::new(r"\b([A-Z]{3}\d{4})\b").unwrap();

    for element in document.select(&event_sel) {
        let event_id = element
            .value()
            .attr("data-event-id")
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                element
                    .value()
                    .attr("id")
                    .map(|s| s.replace("event_", ""))
                    .unwrap_or_else(|| format!("{}", items.len() + 1))
            });

        let item_id = format!("aprender-html-event-{}", event_id);
        if seen_ids.contains(&item_id) {
            continue;
        }

        let (title, raw_url) = if let Some(ref sel) = name_sel {
            if let Some(el) = element.select(sel).next() {
                let t = el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                let u = el.value().attr("href").map(|h| h.to_string());
                (t, u)
            } else {
                ("Atividade".to_string(), None)
            }
        } else {
            ("Atividade".to_string(), None)
        };

        if title.is_empty() {
            continue;
        }

        let course_name = if let Some(ref sel) = course_sel {
            element
                .select(sel)
                .next()
                .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_else(|| "Aprender 3".to_string())
        } else {
            "Aprender 3".to_string()
        };

        let course_code = code_re
            .captures(&course_name)
            .map(|c| c[1].to_string())
            .or_else(|| Some("A3".to_string()));

        if is_ignored_moodle_course(&course_name, course_code.as_deref().unwrap_or("")) {
            continue;
        }

        let desc = if let Some(ref sel) = desc_sel {
            element
                .select(sel)
                .next()
                .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_else(|| title.clone())
        } else {
            title.clone()
        };

        let date_text = if let Some(ref sel) = date_sel {
            element
                .select(sel)
                .next()
                .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

        let url = raw_url.map(|u| {
            if u.starts_with("http") {
                u
            } else {
                format!("https://aprender3.unb.br{}", u)
            }
        });

        let parsed_due_epoch = parse_moodle_date_to_epoch(&date_text, 2026);
        let due_date_iso = parsed_due_epoch.map(format_epoch_iso);
        let is_completed = parsed_due_epoch.map(|ep| ep < now_epoch).unwrap_or(false);

        seen_ids.insert(item_id.clone());

        items.push(FeedItem {
            id: item_id,
            platform: PlatformType::Aprender3,
            title,
            content: if desc.is_empty() { date_text } else { desc },
            course_name,
            course_code,
            author: None,
            item_type: FeedItemType::Assignment,
            created_at: format_epoch_iso(now_epoch),
            due_date: due_date_iso,
            is_completed: Some(is_completed),
            external_url: url,
        });
    }

    items
}

pub fn parse_moodle_date_to_epoch(text: &str, fallback_year: i32) -> Option<i64> {
    let month_num = |m: &str| -> Option<u32> {
        let clean = m.trim().trim_end_matches('.').to_lowercase();
        match clean.as_str() {
            "jan" | "janeiro" => Some(1),
            "fev" | "fevereiro" => Some(2),
            "mar" | "março" | "marco" => Some(3),
            "abr" | "abril" => Some(4),
            "mai" | "maio" => Some(5),
            "jun" | "junho" => Some(6),
            "jul" | "julho" => Some(7),
            "ago" | "agosto" => Some(8),
            "set" | "setembro" => Some(9),
            "out" | "outubro" => Some(10),
            "nov" | "novembro" => Some(11),
            "dez" | "dezembro" => Some(12),
            _ => None,
        }
    };

    // Formato 1: "1 out. 2026, 23:50" ou "quinta-feira, 1 out. 2026, 23:50" ou "18 out. 2026, 23:59"
    let re_with_year =
        Regex::new(r"(\d{1,2})\s+([a-zA-ZçÇáéíóúâêôãõ]+)\.?\s+(\d{4}),?\s*(\d{1,2}):(\d{2})")
            .ok()?;
    if let Some(cap) = re_with_year.captures(text) {
        let day: u32 = cap[1].parse().ok()?;
        let month = month_num(&cap[2])?;
        let year: i32 = cap[3].parse().ok()?;
        let hour: u32 = cap[4].parse().ok()?;
        let min: u32 = cap[5].parse().ok()?;

        let naive_date = chrono::NaiveDate::from_ymd_opt(year, month, day)?;
        let naive_time = chrono::NaiveTime::from_hms_opt(hour, min, 0)?;
        let naive_dt = chrono::NaiveDateTime::new(naive_date, naive_time);
        let offset = chrono::FixedOffset::west_opt(3 * 3600)?;
        let dt = offset.from_local_datetime(&naive_dt).single()?;
        return Some(dt.timestamp());
    }

    // Formato 2: "20 outubro, 23:59" (sem ano explícito)
    let re_no_year =
        Regex::new(r"(\d{1,2})\s+([a-zA-ZçÇáéíóúâêôãõ]+)\.?,?\s*(\d{1,2}):(\d{2})").ok()?;
    if let Some(cap) = re_no_year.captures(text) {
        let day: u32 = cap[1].parse().ok()?;
        let month = month_num(&cap[2])?;
        let year = fallback_year;
        let hour: u32 = cap[3].parse().ok()?;
        let min: u32 = cap[4].parse().ok()?;

        let naive_date = chrono::NaiveDate::from_ymd_opt(year, month, day)?;
        let naive_time = chrono::NaiveTime::from_hms_opt(hour, min, 0)?;
        let naive_dt = chrono::NaiveDateTime::new(naive_date, naive_time);
        let offset = chrono::FixedOffset::west_opt(3 * 3600)?;
        let dt = offset.from_local_datetime(&naive_dt).single()?;
        return Some(dt.timestamp());
    }

    // Formato 3: "18/10/2026, 23:59" ou "18/10/2026 23:59"
    let re_slash = Regex::new(r"(\d{1,2})/(\d{1,2})/(\d{4})[,\s]+(\d{1,2}):(\d{2})").ok()?;
    if let Some(cap) = re_slash.captures(text) {
        let day: u32 = cap[1].parse().ok()?;
        let month: u32 = cap[2].parse().ok()?;
        let year: i32 = cap[3].parse().ok()?;
        let hour: u32 = cap[4].parse().ok()?;
        let min: u32 = cap[5].parse().ok()?;

        let naive_date = chrono::NaiveDate::from_ymd_opt(year, month, day)?;
        let naive_time = chrono::NaiveTime::from_hms_opt(hour, min, 0)?;
        let naive_dt = chrono::NaiveDateTime::new(naive_date, naive_time);
        let offset = chrono::FixedOffset::west_opt(3 * 3600)?;
        let dt = offset.from_local_datetime(&naive_dt).single()?;
        return Some(dt.timestamp());
    }

    None
}

pub fn is_activity_page_submitted(html: &str) -> bool {
    let lower = html.to_lowercase();
    lower.contains("enviado para avaliação")
        || lower.contains("enviado para avaliacao")
        || lower.contains("envios de arquivo")
        || lower.contains("tarefa enviada")
        || lower.contains("situação finalizada")
        || lower.contains("situacao finalizada")
        || lower.contains("tentativa finalizada")
        || lower.contains("status: finalizada")
        || (lower.contains("resumo da tentativa") && lower.contains("finalizada"))
}

pub fn scrape_course_modules_html(html: &str, course: &Course, now_epoch: i64) -> Vec<FeedItem> {
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();

    let document = Html::parse_document(html);
    let activity_sel = match Selector::parse("li.activity") {
        Ok(s) => s,
        Err(_) => return items,
    };
    let activity_item_sel = Selector::parse(".activity-item").ok();
    let instance_sel = Selector::parse(".instancename").ok();
    let link_sel = Selector::parse("a.stretched-link, a[href*='/mod/']").ok();
    let dates_sel = Selector::parse("[data-region='activity-dates']").ok();
    let completion_sel = Selector::parse("[data-region='completion-info']").ok();

    let fallback_year = course
        .semester
        .split('.')
        .next()
        .and_then(|y| y.parse::<i32>().ok())
        .unwrap_or(2026);

    for element in document.select(&activity_sel) {
        let class_attr = element.value().attr("class").unwrap_or("");

        let modtype = if class_attr.contains("modtype_assign") {
            "assign"
        } else if class_attr.contains("modtype_quiz") {
            "quiz"
        } else if class_attr.contains("modtype_workshop") {
            "workshop"
        } else if class_attr.contains("modtype_choice") {
            "choice"
        } else {
            continue;
        };

        let cmid = element
            .value()
            .attr("data-id")
            .map(|s| s.to_string())
            .or_else(|| {
                element
                    .value()
                    .attr("id")
                    .and_then(|id| id.strip_prefix("module-").map(|s| s.to_string()))
            });

        let cmid = match cmid {
            Some(id) if !id.is_empty() => id,
            _ => continue,
        };

        let item_id = format!("aprender-cm-{}", cmid);
        if seen_ids.contains(&item_id) {
            continue;
        }

        let title = activity_item_sel
            .as_ref()
            .and_then(|sel| element.select(sel).next())
            .and_then(|el| el.value().attr("data-activityname"))
            .map(|s| s.trim().to_string())
            .or_else(|| {
                instance_sel.as_ref().and_then(|sel| {
                    element
                        .select(sel)
                        .next()
                        .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                })
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| match modtype {
                "assign" => "Tarefa".to_string(),
                "quiz" => "Questionário".to_string(),
                "workshop" => "Laboratório de Avaliação".to_string(),
                "choice" => "Escolha".to_string(),
                _ => "Atividade".to_string(),
            });

        let clean_title = title
            .trim_end_matches(" Tarefa")
            .trim_end_matches(" Questionário")
            .trim_end_matches(" Questionario")
            .trim_end_matches(" Escolha")
            .trim()
            .to_string();

        let url = link_sel
            .as_ref()
            .and_then(|sel| element.select(sel).next())
            .and_then(|el| el.value().attr("href"))
            .map(|h| {
                if h.starts_with("http") {
                    h.to_string()
                } else {
                    format!("https://aprender3.unb.br{}", h)
                }
            })
            .unwrap_or_else(|| {
                format!(
                    "https://aprender3.unb.br/mod/{}/view.php?id={}",
                    modtype, cmid
                )
            });

        let mut due_epoch: Option<i64> = None;
        let mut raw_due_text = String::new();

        if let Some(ref sel) = dates_sel {
            if let Some(dates_el) = element.select(sel).next() {
                let inner_html = dates_el.inner_html();
                for line in inner_html.split("<div>") {
                    let clean_line = line.replace("</div>", "");
                    let lower = clean_line.to_lowercase();
                    if lower.contains("vencimento")
                        || lower.contains("fechado")
                        || lower.contains("fecha")
                        || lower.contains("encerramento")
                        || lower.contains("término")
                        || lower.contains("termino")
                        || lower.contains("limite")
                        || lower.contains("prazo")
                        || lower.contains("due")
                        || lower.contains("closed")
                    {
                        let text: String = Html::parse_fragment(&clean_line)
                            .root_element()
                            .text()
                            .collect::<Vec<_>>()
                            .join(" ");
                        if let Some(colon_pos) = text.find(':') {
                            let candidate = text[colon_pos + 1..].trim();
                            if let Some(ep) = parse_moodle_date_to_epoch(candidate, fallback_year) {
                                due_epoch = Some(ep);
                                raw_due_text = candidate.to_string();
                                break;
                            }
                        }
                    }
                }
            }
        }

        let due_date_iso = due_epoch.map(format_epoch_iso);

        let is_past_due = due_epoch.map(|ep| ep < now_epoch).unwrap_or(false);

        let has_completion_indicator = if let Some(ref sel) = completion_sel {
            if let Some(comp_el) = element.select(sel).next() {
                let comp_text = comp_el.text().collect::<Vec<_>>().join(" ").to_lowercase();
                let comp_html = comp_el.html().to_lowercase();
                comp_text.contains("concluído")
                    || comp_text.contains("concluido")
                    || comp_text.contains("feito")
                    || comp_html.contains("data-togglegroup=\"done\"")
                    || comp_html.contains("badge-success")
            } else {
                false
            }
        } else {
            false
        };

        let li_text = element.text().collect::<Vec<_>>().join(" ").to_lowercase();
        let text_concluded = li_text.contains("concluído:") || li_text.contains("concluido:");

        let is_completed = is_past_due || has_completion_indicator || text_concluded;

        let content_desc = if !raw_due_text.is_empty() {
            format!("Prazo: {}", raw_due_text)
        } else {
            match modtype {
                "assign" => "Tarefa".to_string(),
                "quiz" => "Questionário".to_string(),
                "workshop" => "Laboratório de Avaliação".to_string(),
                "choice" => "Escolha".to_string(),
                _ => "Atividade".to_string(),
            }
        };

        let created_at_iso = due_epoch
            .map(|ep| format_epoch_iso(ep.saturating_sub(7 * 86400)))
            .unwrap_or_else(|| format_epoch_iso(now_epoch));

        seen_ids.insert(item_id.clone());

        items.push(FeedItem {
            id: item_id,
            platform: PlatformType::Aprender3,
            title: clean_title,
            content: content_desc,
            course_name: course.name.clone(),
            course_code: Some(course.code.clone()),
            author: None,
            item_type: FeedItemType::Assignment,
            created_at: created_at_iso,
            due_date: due_date_iso,
            is_completed: Some(is_completed),
            external_url: Some(url),
        });
    }

    items
}

fn format_epoch_iso(seconds: i64) -> String {
    let days_since_epoch = seconds / 86400;
    let time_of_day = seconds.rem_euclid(86400);
    let hour = time_of_day / 3600;
    let minute = (time_of_day % 3600) / 60;
    let second = time_of_day % 60;

    let (year, month, day) = days_to_ymd(days_since_epoch);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, minute, second
    )
}

fn days_to_ymd(days: i64) -> (i64, u8, u8) {
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u8;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u8;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// =========================================================================
// Testes Unitários
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_cpf() {
        assert_eq!(clean_cpf("123.456.789-00"), "12345678900");
        assert_eq!(clean_cpf("12345678900"), "12345678900");
        assert_eq!(clean_cpf("  123 456  "), "123456");
    }

    #[test]
    fn test_extract_logintoken() {
        let html = r#"
            <form id="login">
                <input type="hidden" name="logintoken" value="AbCdEf123456Token">
                <input type="text" name="username">
            </form>
        "#;
        assert_eq!(
            extract_logintoken(html),
            Some("AbCdEf123456Token".to_string())
        );
    }

    #[test]
    fn test_extract_session_info() {
        let html = r#"
            <script>
                M.cfg = {"wwwroot":"https:\/\/aprender3.unb.br","sesskey":"ayHavRJcSG","userId":97318};
            </script>
        "#;
        let info = extract_session_info(html);
        assert_eq!(info, Some(("ayHavRJcSG".to_string(), 97318)));
    }

    #[test]
    fn test_parse_course_code_and_name() {
        let (code, name, sem) = parse_course_code_and_name(
            "CIC0099 - ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES - Turma 02 - 2026/2",
            "OAC_T2_26.2",
        );
        assert_eq!(code, "CIC0099");
        assert_eq!(
            name,
            "CIC0099 - ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES - Turma 02 - 2026/2"
        );
        assert_eq!(sem, "2026.2");

        let (code2, _, sem2) = parse_course_code_and_name(
            "IFD0177 - FISICA 2 EXPERIMENTAL - Turma 03 - 2026/2",
            "FISICA 2 EXP 03_2026.2",
        );
        assert_eq!(code2, "IFD0177");
        assert_eq!(sem2, "2026.2");
    }

    #[test]
    fn test_parse_moodle_courses_ws() {
        let sample_json = serde_json::json!([
            {
                "error": false,
                "data": {
                    "courses": [
                        {
                            "id": 31429,
                            "fullname": "CIC0099 - ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES - Turma 02 - 2026/2",
                            "shortname": "OAC_T2_26.2",
                            "viewurl": "https://aprender3.unb.br/course/view.php?id=31429"
                        },
                        {
                            "id": 30937,
                            "fullname": "IFD0177 - FISICA 2 EXPERIMENTAL - Turma 03 - 2026/2",
                            "shortname": "FISICA 2 EXP 03_2026.2",
                            "viewurl": "https://aprender3.unb.br/course/view.php?id=30937"
                        },
                        {
                            "id": 99999,
                            "fullname": "Espaço do Aluno - Comunidade Geral UnB",
                            "shortname": "ESP_ALUNO",
                            "viewurl": "https://aprender3.unb.br/course/view.php?id=99999"
                        }
                    ]
                }
            }
        ]);

        let courses = parse_moodle_courses_ws(&sample_json).unwrap();
        assert_eq!(courses.len(), 2);
        assert_eq!(courses[0].id, "aprender-31429");
        assert_eq!(courses[0].code, "CIC0099");
        assert_eq!(
            courses[0].url,
            Some("https://aprender3.unb.br/course/view.php?id=31429".to_string())
        );
        assert_eq!(courses[1].id, "aprender-30937");
        assert_eq!(courses[1].code, "IFD0177");
    }

    #[test]
    fn test_scrape_courses_html() {
        let html = r#"
            <div>
                <a href="https://aprender3.unb.br/course/view.php?id=1">Página inicial</a>
                <a href="https://aprender3.unb.br/course/view.php?id=31429">
                    <span>CIC0099 - ORGANIZAÇÃO E ARQUITETURA DE COMPUTADORES</span>
                </a>
            </div>
        "#;
        let courses = scrape_courses_html(html);
        assert_eq!(courses.len(), 1);
        assert_eq!(courses[0].id, "aprender-31429");
        assert_eq!(courses[0].code, "CIC0099");
    }

    #[test]
    fn test_parse_moodle_calendar_events_status() {
        let reference_now: i64 = 1700000000; // Timestamp de referência

        let events_json = serde_json::json!([
            {
                "data": {
                    "events": [
                        {
                            "id": 101,
                            "name": "Trabalho 1: Compiladores",
                            "description": "Entrega do analisador léxico",
                            "course": {
                                "fullname": "CIC0099 - Compiladores",
                                "shortname": "CIC0099"
                            },
                            "timesort": reference_now - 3600, // Prazo expirado (1h atrás)
                            "action": {
                                "name": "Adicionar envio",
                                "actionable": true,
                                "itemcount": 1,
                                "url": "/mod/assign/view.php?id=101"
                            }
                        },
                        {
                            "id": 102,
                            "name": "Lista 2: Grafos",
                            "description": "Resolução de exercícios",
                            "course": {
                                "fullname": "CIC0090 - Estruturas de Dados",
                                "shortname": "CIC0090"
                            },
                            "timesort": reference_now + 86400, // Prazo futuro (amanhã)
                            "action": {
                                "name": "Editar envio", // Já enviado pelo aluno
                                "actionable": false,
                                "itemcount": 0,
                                "url": "/mod/assign/view.php?id=102"
                            }
                        },
                        {
                            "id": 103,
                            "name": "Projeto Final: Arquitetura",
                            "description": "Entrega do relatório final",
                            "course": {
                                "fullname": "CIC0105 - Arquitetura de Computadores",
                                "shortname": "CIC0105"
                            },
                            "timesort": reference_now + 172800, // Prazo futuro (em 2 dias)
                            "action": {
                                "name": "Adicionar envio",
                                "actionable": true,
                                "itemcount": 1,
                                "url": "/mod/assign/view.php?id=103"
                            }
                        }
                    ]
                }
            }
        ]);

        let items = parse_moodle_calendar_events_with_now(&events_json, reference_now);
        assert_eq!(items.len(), 3);

        // 1. Trabalho 1 (prazo vencido) -> Concluído
        let t1 = items.iter().find(|i| i.id == "aprender-event-101").unwrap();
        assert_eq!(t1.is_completed, Some(true));

        // 2. Lista 2 (já enviado / actionable == false) -> Concluído
        let t2 = items.iter().find(|i| i.id == "aprender-event-102").unwrap();
        assert_eq!(t2.is_completed, Some(true));

        // 3. Projeto Final (prazo futuro e pendente) -> NÃO concluído
        let t3 = items.iter().find(|i| i.id == "aprender-event-103").unwrap();
        assert_eq!(t3.is_completed, Some(false));
    }

    #[test]
    fn test_parse_moodle_multi_batch_and_assignments() {
        let reference_now = 1770000000;

        let batch_json = serde_json::json!([
            // Index 0: Eventos passados do calendário
            {
                "index": 0,
                "error": false,
                "data": {
                    "events": [
                        {
                            "id": 201,
                            "name": "Entrega Lista 1 (Passada)",
                            "description": "Lista passada",
                            "course": {
                                "fullname": "CIC0004 - Algoritmos",
                                "shortname": "CIC0004"
                            },
                            "timesort": reference_now - 86400 * 10, // 10 dias atrás
                            "action": {
                                "name": "Visualizar envio",
                                "actionable": false,
                                "itemcount": 0,
                                "url": "/mod/assign/view.php?id=301"
                            }
                        }
                    ]
                }
            },
            // Index 1: Eventos futuros do calendário
            {
                "index": 1,
                "error": false,
                "data": {
                    "events": [
                        {
                            "id": 202,
                            "name": "Prova 1 (Futura)",
                            "description": "Avaliação teórica",
                            "course": {
                                "fullname": "CIC0004 - Algoritmos",
                                "shortname": "CIC0004"
                            },
                            "timesort": reference_now + 86400 * 5, // em 5 dias
                            "action": {
                                "name": "Adicionar envio",
                                "actionable": true,
                                "itemcount": 1,
                                "url": "/mod/assign/view.php?id=302"
                            }
                        }
                    ]
                }
            },
            // Index 2: Tarefas das turmas via mod_assign_get_assignments
            {
                "index": 2,
                "error": false,
                "data": {
                    "courses": [
                        {
                            "id": 999,
                            "fullname": "CIC0004 - Algoritmos",
                            "shortname": "CIC0004",
                            "assignments": [
                                // Tarefa que já veio no calendário (id 301) -> não deve duplicar
                                {
                                    "id": 501,
                                    "cmid": 301,
                                    "name": "Entrega Lista 1 (Passada)",
                                    "intro": "Lista passada",
                                    "duedate": reference_now - 86400 * 10,
                                    "cutoffdate": reference_now - 86400 * 9
                                },
                                // Tarefa antiga de trabalho prático fora do calendário
                                {
                                    "id": 502,
                                    "cmid": 303,
                                    "name": "Trabalho Prático 1 (Semestre Antigo)",
                                    "intro": "Trabalho passado",
                                    "duedate": reference_now - 86400 * 30, // 30 dias atrás
                                    "cutoffdate": 0
                                }
                            ]
                        }
                    ]
                }
            }
        ]);

        let items = parse_moodle_calendar_events_with_now(&batch_json, reference_now);

        // Deve conter 3 itens no total (201, 202, 502) sem duplicar 301
        assert_eq!(items.len(), 3);

        let pass_ev = items.iter().find(|i| i.id == "aprender-event-201").unwrap();
        assert_eq!(
            pass_ev.is_completed,
            Some(true),
            "Evento passado deve ser concluído"
        );

        let fut_ev = items.iter().find(|i| i.id == "aprender-event-202").unwrap();
        assert_eq!(
            fut_ev.is_completed,
            Some(false),
            "Evento futuro pendente não deve ser concluído"
        );

        let pass_assign = items
            .iter()
            .find(|i| i.id == "aprender-assign-502")
            .unwrap();
        assert_eq!(
            pass_assign.is_completed,
            Some(true),
            "Tarefa antiga fora do calendário deve ser concluída"
        );
    }

    #[test]
    fn test_scrape_calendar_html_fallback() {
        let reference_now = 1770000000;
        let html = r#"
            <div class="calendar-wrapper">
                <div class="event" data-event-id="991">
                    <h3 class="name"><a href="https://aprender3.unb.br/mod/assign/view.php?id=881">Entrega Exercício 1</a></h3>
                    <div class="course"><a href="/course/view.php?id=12">CIC0001 - Programação Concorrente</a></div>
                    <div class="description card-body">Implementação com threads</div>
                    <div class="date">quinta-feira, 20 outubro, 23:59</div>
                </div>
            </div>
        "#;

        let items = scrape_calendar_html(html, reference_now);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "aprender-html-event-991");
        assert_eq!(items[0].title, "Entrega Exercício 1");
        assert_eq!(items[0].course_code, Some("CIC0001".to_string()));
    }

    #[test]
    fn test_parse_moodle_date_to_epoch() {
        // "quinta-feira, 1 out. 2026, 23:50"
        let epoch1 = parse_moodle_date_to_epoch("quinta-feira, 1 out. 2026, 23:50", 2026).unwrap();
        // Em UTC, 1 out 23:50 UTC-3 é 2 out 02:50 UTC
        let iso1 = format_epoch_iso(epoch1);
        assert_eq!(iso1, "2026-10-02T02:50:00Z");

        // "domingo, 18 out. 2026, 23:59"
        let epoch2 = parse_moodle_date_to_epoch("domingo, 18 out. 2026, 23:59", 2026).unwrap();
        let iso2 = format_epoch_iso(epoch2);
        assert_eq!(iso2, "2026-10-19T02:59:00Z");

        // "20 outubro, 23:59" (sem ano)
        let epoch3 = parse_moodle_date_to_epoch("20 outubro, 23:59", 2026).unwrap();
        let iso3 = format_epoch_iso(epoch3);
        assert_eq!(iso3, "2026-10-21T02:59:00Z");

        // "18/10/2026 23:59"
        let epoch4 = parse_moodle_date_to_epoch("18/10/2026 23:59", 2026).unwrap();
        assert_eq!(epoch4, epoch2);
    }

    #[test]
    fn test_scrape_course_modules_html() {
        let reference_now = 1791946514; // Outubro de 2026
        let html = r#"
            <ul class="topics">
                <li class="activity activity-wrapper assign modtype_assign hasinfo" id="module-1656160" data-for="cmitem" data-id="1656160">
                    <div class="activity-item" data-activityname="Planejamento_Mov de Precessão">
                        <div class="activityname">
                            <a href="https://aprender3.unb.br/mod/assign/view.php?id=1656160" class="stretched-link">
                                <span class="instancename">Planejamento_Mov de Precessão <span class="accesshide"> Tarefa</span></span>
                            </a>
                        </div>
                        <div data-region="activity-dates" class="activity-dates">
                            <div><strong>Aberto:</strong> segunda-feira, 28 set. 2026, 00:00</div>
                            <div><strong>Vencimento:</strong> quinta-feira, 1 out. 2026, 23:50</div>
                        </div>
                    </div>
                </li>
                <li class="activity activity-wrapper quiz modtype_quiz hasinfo" id="module-1655629" data-for="cmitem" data-id="1655629">
                    <div class="activity-item" data-activityname="Teste 5 - T2">
                        <div class="activityname">
                            <a href="https://aprender3.unb.br/mod/quiz/view.php?id=1655629" class="stretched-link">
                                <span class="instancename">Teste 5 - T2 <span class="accesshide"> Questionário</span></span>
                            </a>
                        </div>
                        <div data-region="activity-dates" class="activity-dates">
                            <div><strong>Aberto:</strong> sexta-feira, 9 out. 2026, 20:00</div>
                            <div><strong>Fechado:</strong> domingo, 11 out. 2026, 23:59</div>
                        </div>
                    </div>
                </li>
                <li class="activity activity-wrapper assign modtype_assign hasinfo" id="module-1628465" data-for="cmitem" data-id="1628465">
                    <div class="activity-item" data-activityname="Entrega Gerador de Imediatos">
                        <div class="activityname">
                            <a href="https://aprender3.unb.br/mod/assign/view.php?id=1628465" class="stretched-link">
                                <span class="instancename">Entrega Gerador de Imediatos <span class="accesshide"> Tarefa</span></span>
                            </a>
                        </div>
                        <div data-region="activity-dates" class="activity-dates">
                            <div><strong>Aberto:</strong> quarta-feira, 7 out. 2026, 00:00</div>
                            <div><strong>Vencimento:</strong> domingo, 18 out. 2026, 23:59</div>
                        </div>
                    </div>
                </li>
            </ul>
        "#;

        let course = Course {
            id: "aprender-31429".to_string(),
            code: "CIC0099".to_string(),
            name: "CIC0099 - OAC".to_string(),
            semester: "2026.2".to_string(),
            platform: PlatformType::Aprender3,
            professor: None,
            classroom: None,
            schedule: None,
            class_group: None,
            unread_count: None,
            pending_assignments_count: None,
            url: None,
            absences: None,
            max_absences: None,
        };

        let items = scrape_course_modules_html(html, &course, reference_now);
        assert_eq!(items.len(), 3);

        // 1656160: Venceu em 01/10/2026 (passado relativo a reference_now) -> concluído
        let it1 = items
            .iter()
            .find(|i| i.id == "aprender-cm-1656160")
            .unwrap();
        assert_eq!(it1.title, "Planejamento_Mov de Precessão");
        assert_eq!(it1.is_completed, Some(true));
        assert_eq!(
            it1.external_url,
            Some("https://aprender3.unb.br/mod/assign/view.php?id=1656160".to_string())
        );

        // 1655629: Fechou em 11/10/2026 (passado relativo a reference_now) -> concluído
        let it2 = items
            .iter()
            .find(|i| i.id == "aprender-cm-1655629")
            .unwrap();
        assert_eq!(it2.title, "Teste 5 - T2");
        assert_eq!(it2.is_completed, Some(true));

        // 1628465: Vence em 18/10/2026 (futuro relativo a reference_now) -> não concluído
        let it3 = items
            .iter()
            .find(|i| i.id == "aprender-cm-1628465")
            .unwrap();
        assert_eq!(it3.title, "Entrega Gerador de Imediatos");
        assert_eq!(it3.is_completed, Some(false));
    }

    #[tokio::test]
    #[ignore]
    async fn test_live_sync_aprender3() {
        let cpf = std::env::var("APRENDER3_CPF").unwrap_or_default();
        let senha = std::env::var("APRENDER3_SENHA").unwrap_or_default();
        if cpf.is_empty() || senha.is_empty() {
            println!(
                "APRENDER3_CPF ou APRENDER3_SENHA não definidas no ambiente, pulando teste live."
            );
            return;
        }

        let client = MoodleClient::new();
        let (items, courses) = client
            .sync_aprender3(&cpf, &senha)
            .await
            .expect("Live sync failed");

        println!("=== COURSES ({}): ===", courses.len());
        for c in &courses {
            println!(
                "Course: id={}, code={}, name={}, pending={:?}",
                c.id, c.code, c.name, c.pending_assignments_count
            );
        }

        println!("=== ITEMS ({}): ===", items.len());
        for it in &items {
            println!(
                "Item: id={}, title={}, due={:?}, completed={:?}, url={:?}",
                it.id, it.title, it.due_date, it.is_completed, it.external_url
            );
        }

        // Verifica que as 3 atividades alvo foram encontradas
        let item_1656160 = items.iter().find(|i| {
            i.id == "aprender-cm-1656160"
                || i.external_url
                    .as_deref()
                    .unwrap_or("")
                    .contains("id=1656160")
        });
        assert!(
            item_1656160.is_some(),
            "Atividade 1656160 deve estar presente nos itens"
        );
        let it_1656160 = item_1656160.unwrap();
        assert_eq!(
            it_1656160.is_completed,
            Some(true),
            "1656160 já venceu e foi entregue, deve chegar concluída"
        );

        let item_1628465 = items.iter().find(|i| {
            i.id == "aprender-cm-1628465"
                || i.external_url
                    .as_deref()
                    .unwrap_or("")
                    .contains("id=1628465")
        });
        assert!(
            item_1628465.is_some(),
            "Atividade 1628465 deve estar presente nos itens"
        );

        let item_1655629 = items.iter().find(|i| {
            i.id == "aprender-cm-1655629"
                || i.external_url
                    .as_deref()
                    .unwrap_or("")
                    .contains("id=1655629")
        });
        assert!(
            item_1655629.is_some(),
            "Quiz 1655629 deve estar presente nos itens"
        );
        let it_1655629 = item_1655629.unwrap();
        assert_eq!(
            it_1655629.is_completed,
            Some(true),
            "1655629 já encerrou, deve chegar concluído"
        );
    }
}
