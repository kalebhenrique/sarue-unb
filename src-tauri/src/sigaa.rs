use crate::models::{
    AcademicHistoryPayload, Course, FeedItem, FeedItemType, PlatformType, StudentProfile,
};
use chrono::Datelike;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, REFERER, USER_AGENT};
use std::collections::HashMap;

const USER_AGENT_STR: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CAS_LOGIN_URL: &str = "https://autenticacao.unb.br/sso-server/login?service=https%3A%2F%2Fsig.unb.br%2Fsigaa%2Flogin%2Fcas";
const DISCENTE_URL: &str = "https://sigaa.unb.br/sigaa/portais/discente/discente.jsf";
const MAPA_FREQUENCIA_URL: &str = "https://sigaa.unb.br/sigaa/ava/FrequenciaAluno/mapa.jsf";
const SESSION_TTL_SECS: u64 = 90;

#[derive(Clone)]
struct CachedSigaaPortal {
    matricula: String,
    senha_hash: u64,
    client: reqwest::Client,
    portal_html: String,
    created_at: std::time::Instant,
}

static SIGAA_SESSION_CACHE: std::sync::OnceLock<tokio::sync::Mutex<Option<CachedSigaaPortal>>> =
    std::sync::OnceLock::new();

fn sigaa_session_cache() -> &'static tokio::sync::Mutex<Option<CachedSigaaPortal>> {
    SIGAA_SESSION_CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

pub struct SigaaClient {
    client: reqwest::Client,
}

impl Default for SigaaClient {
    fn default() -> Self {
        Self::new()
    }
}

impl SigaaClient {
    pub fn new() -> Self {
        let mut default_headers = HeaderMap::new();
        default_headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));

        let client = reqwest::Client::builder()
            .cookie_store(true)
            .default_headers(default_headers)
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .expect("Falha ao criar cliente HTTP reqwest para SIGAA");

        Self { client }
    }

    async fn get_authenticated_portal(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<(reqwest::Client, String, Option<FeedItem>), String> {
        let clean_matricula = matricula.trim();
        let clean_senha = senha.trim();
        let pwd_hash = fnv1a_hash(clean_senha);

        {
            let lock = sigaa_session_cache().lock().await;
            if let Some(cached) = lock.as_ref() {
                if cached.matricula == clean_matricula
                    && cached.senha_hash == pwd_hash
                    && cached.created_at.elapsed().as_secs() < SESSION_TTL_SECS
                {
                    log::info!(
                        "[SigaaClient] Reutilizando sessão CAS recente em cache para matrícula {}.",
                        clean_matricula
                    );
                    return Ok((cached.client.clone(), cached.portal_html.clone(), None));
                }
            }
        }

        let (page_html, aviso_item) = self
            .login_to_portal_with_client(&self.client, matricula, senha)
            .await?;

        {
            let mut lock = sigaa_session_cache().lock().await;
            *lock = Some(CachedSigaaPortal {
                matricula: clean_matricula.to_string(),
                senha_hash: pwd_hash,
                client: self.client.clone(),
                portal_html: page_html.clone(),
                created_at: std::time::Instant::now(),
            });
        }

        Ok((self.client.clone(), page_html, aviso_item))
    }

    /// Realiza a autenticação CAS SSO, contorna eventuais telas de aviso e garante que o portal discente esteja carregado
    pub async fn login_to_portal(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<(String, Option<FeedItem>), String> {
        let (_client, page_html, aviso_item) =
            self.get_authenticated_portal(matricula, senha).await?;
        Ok((page_html, aviso_item))
    }

    async fn login_to_portal_with_client(
        &self,
        active_client: &reqwest::Client,
        matricula: &str,
        senha: &str,
    ) -> Result<(String, Option<FeedItem>), String> {
        let clean_matricula = matricula.trim();
        let clean_senha = senha.trim();

        if clean_matricula.is_empty() || clean_senha.is_empty() {
            return Err("Matrícula ou senha do SIGAA não fornecidas.".into());
        }

        // 1. Obter página inicial do CAS SSO
        log::info!("[SigaaClient] Obtendo formulário de login CAS SSO...");
        let res_cas = active_client
            .get(CAS_LOGIN_URL)
            .send()
            .await
            .map_err(|e| format!("Falha de conexão com CAS SSO UnB: {}", e))?;

        let cas_url = res_cas.url().to_string();
        let cas_html = res_cas
            .text()
            .await
            .map_err(|e| format!("Falha ao ler resposta do CAS SSO: {}", e))?;

        if cas_html.contains("form_acessarTurmaVirtual")
            || cas_html.contains("Turmas do Semestre")
            || cas_html.contains("verPortalDiscente.do")
            || cas_url.contains("discente.jsf")
        {
            log::info!("[SigaaClient] Sessão já autenticada no SIGAA.");
            return Ok((cas_html, None));
        }

        // 2. Extrair campos de segurança do formulário CAS
        let (action_url, lt, execution, event_id) = Self::extract_cas_form_params(&cas_html)?;

        // 3. Submeter credenciais ao CAS SSO
        let clean_action_log = action_url.split('?').next().unwrap_or(&action_url);
        log::info!(
            "[SigaaClient] Submetendo credenciais para {}",
            clean_action_log
        );
        let mut form_data = HashMap::new();
        form_data.insert("username", clean_matricula);
        form_data.insert("password", clean_senha);
        form_data.insert("lt", &lt);
        form_data.insert("execution", &execution);
        form_data.insert("_eventId", &event_id);
        form_data.insert("submit", "Submit");

        let res_login = active_client
            .post(&action_url)
            .header(REFERER, CAS_LOGIN_URL)
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .form(&form_data)
            .send()
            .await
            .map_err(|e| format!("Erro ao submeter autenticação ao SIGAA: {}", e))?;

        let mut landing_url = res_login.url().to_string();
        let mut page_html = res_login
            .text()
            .await
            .map_err(|e| format!("Erro ao ler resposta pós-login do SIGAA: {}", e))?;

        if page_html.contains("Credenciais inválidas")
            || page_html.contains("name=\"lt\"")
            || landing_url.contains("autenticacao.unb.br/sso-server/login")
        {
            return Err("Credenciais inválidas ou falha de login no SIGAA. Verifique matrícula e senha (lembre-se de respeitar maiúsculas/minúsculas).".into());
        }

        let mut aviso_item = None;

        // 4. Verificar se caímos na tela de aviso institucional (telaAvisoLogon.jsf)
        if landing_url.contains("telaAvisoLogon.jsf")
            || page_html.contains("telaAvisoLogon.jsf")
            || page_html.contains("Continuar >>")
        {
            log::info!("[SigaaClient] Detectada tela intermediária de avisos institucionais (telaAvisoLogon.jsf).");
            aviso_item = Self::extract_aviso_logon(&page_html);

            if let Ok((action, params)) = Self::extract_aviso_form_submit(&page_html, &landing_url)
            {
                log::info!(
                    "[SigaaClient] Submetendo confirmação do aviso para {}",
                    action
                );
                let res_aviso = active_client
                    .post(&action)
                    .header(REFERER, &landing_url)
                    .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .form(&params)
                    .send()
                    .await
                    .map_err(|e| format!("Erro ao avançar tela de aviso do SIGAA: {}", e))?;

                landing_url = res_aviso.url().to_string();
                page_html = res_aviso
                    .text()
                    .await
                    .map_err(|e| format!("Erro ao ler resposta após tela de aviso: {}", e))?;
            }
        }

        // 5. Garantir que estamos no portal discente
        if !landing_url.contains("discente.jsf") {
            log::info!(
                "[SigaaClient] Navegando explicitamente para o portal discente: {}",
                DISCENTE_URL
            );
            let res_portal = active_client
                .get(DISCENTE_URL)
                .send()
                .await
                .map_err(|e| format!("Erro ao carregar portal discente do SIGAA: {}", e))?;

            page_html = res_portal
                .text()
                .await
                .map_err(|e| format!("Erro ao ler conteúdo do portal discente: {}", e))?;
        }

        if !page_html.contains("form_acessarTurmaVirtual")
            && !page_html.contains("Turmas do Semestre")
        {
            return Err("Login SIGAA não concluído — portal discente não foi carregado.".into());
        }

        Ok((page_html, aviso_item))
    }

    /// Sincroniza o SIGAA realizando o login CAS SSO, avançando por avisos e extraindo turmas e avisos
    /// Normaliza nome de disciplina para casar com a oferta (maiúsculas, sem acento)
    fn normalize_discipline_name(s: &str) -> String {
        let mut out = String::with_capacity(s.len());
        for ch in s.chars() {
            let mapped = match ch {
                'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
                'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
                'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
                'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
                'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
                'ç' | 'Ç' => 'C',
                c => c,
            };
            if mapped.is_ascii_alphanumeric() {
                for upper in mapped.to_uppercase() {
                    out.push(upper);
                }
            } else if mapped == ' ' && !out.ends_with(' ') {
                out.push(' ');
            }
        }
        out.trim().to_string()
    }

    /// Extrai o token de horário (ex.: "35T45", "235M34") do campo de horário do portal
    fn extract_schedule_token(schedule: &str) -> Option<String> {
        let re = Regex::new(r"([2-7]{1,6}[MTN][1-6]{1,6})").unwrap();
        re.captures(schedule)
            .map(|c| c.get(1).unwrap().as_str().to_string())
    }

    /// "02" -> "Turma 2"; códigos não numéricos passam como estão
    fn turma_label_from_class_code(class_code: &str) -> String {
        let digits: String = class_code.chars().filter(|c| c.is_ascii_digit()).collect();
        match digits.parse::<u32>() {
            Ok(n) => format!("Turma {}", n),
            Err(_) => format!("Turma {}", class_code.trim()),
        }
    }

    /// "Prof. Carla Rocha" -> "Carla Rocha" (o card da disciplina já prefixa)
    fn clean_teacher_name(name: &str) -> String {
        let s = name.trim();
        let lower = s.to_lowercase();
        for prefix in [
            "prof.ª",
            "profª",
            "profa.",
            "prof.",
            "prof ",
            "professora ",
            "professor ",
        ] {
            if lower.starts_with(prefix) {
                let prefix_chars = prefix.chars().count();
                let remaining: String = s.chars().skip(prefix_chars).collect();
                return remaining.trim_start().to_string();
            }
        }
        s.to_string()
    }

    /// Preenche código, turma e docente das turmas matriculadas casando com a
    /// oferta de turmas do SIGAA (dataset estático usado pela Monte sua Grade):
    /// nome normalizado + horário igual, desambiguado por sala. Evita abrir a
    /// aba Participantes de cada disciplina. Não encontrou, fica como está.
    fn apply_offer_link(courses: &mut [Course], offer: &[crate::grade_scraper::ScrapedDiscipline]) {
        for course in courses.iter_mut() {
            // Se já tem professor, turma e código oficial (diferente de name), nada a fazer
            if course.professor.is_some()
                && course.class_group.is_some()
                && course.code != course.name
            {
                continue;
            }

            // Sem horário legível não há como casar com a oferta com segurança
            let Some(token) = course
                .schedule
                .as_deref()
                .and_then(Self::extract_schedule_token)
            else {
                continue;
            };
            let norm_course = Self::normalize_discipline_name(&course.name);

            let mut candidates: Vec<&crate::grade_scraper::ScrapedClass> = Vec::new();
            let mut linked_code: Option<&str> = None;
            for discipline in offer.iter() {
                if Self::normalize_discipline_name(&discipline.name) != norm_course {
                    continue;
                }
                for class in discipline.classes.iter() {
                    if class.schedule_code == token {
                        candidates.push(class);
                        linked_code = Some(discipline.code.as_str());
                    }
                }
            }

            let linked = if candidates.len() == 1 {
                candidates.first().copied()
            } else if candidates.len() > 1 {
                let local_norm = course
                    .classroom
                    .as_deref()
                    .map(Self::normalize_discipline_name);
                candidates
                    .iter()
                    .find(|c| {
                        local_norm
                            .as_deref()
                            .map(|l| {
                                let c_room = Self::normalize_discipline_name(&c.classroom);
                                c_room == l
                                    || (!l.is_empty()
                                        && (c_room.contains(l) || l.contains(&c_room)))
                            })
                            .unwrap_or(false)
                    })
                    .copied()
                    .or_else(|| candidates.first().copied())
            } else {
                None
            };

            if let Some(code) = linked_code {
                course.code = code.to_string();
            }

            let Some(class) = linked else {
                continue;
            };

            if course.class_group.is_none() {
                course.class_group = Some(Self::turma_label_from_class_code(&class.class_code));
            }
            if course.professor.is_none() && !class.teachers.is_empty() {
                course.professor = Some(
                    class
                        .teachers
                        .iter()
                        .map(|t| Self::clean_teacher_name(t))
                        .collect::<Vec<_>>()
                        .join(", "),
                );
            }

            let slots = if !class.schedule_slots.is_empty() {
                class.schedule_slots.len() as u32
            } else {
                Self::estimate_slots_from_schedule(&class.schedule_code)
            };
            let credits = if slots > 0 { slots } else { 4 };
            course.max_absences = Some(credits * 2 - 1);
        }

        for course in courses.iter_mut() {
            if course.max_absences.is_none() {
                let credits = course
                    .schedule
                    .as_deref()
                    .map(Self::estimate_slots_from_schedule)
                    .unwrap_or(4);
                course.max_absences = Some(credits * 2 - 1);
            }
        }
    }

    /// Estima a quantidade de créditos/slots semanais a partir do código de horário SIGAA (ex: 24M34, 35T45).
    fn estimate_slots_from_schedule(code: &str) -> u32 {
        let Ok(re) = Regex::new(r"([2-7]+)[MTN]([1-6]+)") else {
            return 4;
        };
        let mut total = 0;
        for cap in re.captures_iter(code) {
            let days = cap.get(1).map(|m| m.as_str().len() as u32).unwrap_or(0);
            let periods = cap.get(2).map(|m| m.as_str().len() as u32).unwrap_or(0);
            total += days * periods;
        }
        if total > 0 {
            total
        } else {
            4
        }
    }

    /// Busca a oferta de turmas (dataset estático) e linka com as matriculadas.
    /// Falha silenciosamente para nunca derrubar o sync.
    async fn enrich_courses_with_offer(mut courses: Vec<Course>) -> Vec<Course> {
        let offer =
            match crate::grade_scraper::SigaaGradeScraper::scrape_department_classes("ALL", "", "")
                .await
            {
                Ok(list) => list,
                Err(e) => {
                    log::warn!(
                        "[SigaaClient] Oferta de turmas indisponível para linkar docente/turma: {}",
                        e
                    );
                    return courses;
                }
            };
        Self::apply_offer_link(&mut courses, &offer);
        courses
    }

    /// Extrai parâmetros passados para jsfcljs({...}) em atributos onclick do JSF.
    pub fn extract_jsf_params_from_onclick(onclick_str: &str) -> HashMap<String, String> {
        let mut map = HashMap::new();
        let decoded = decode_html_entities(onclick_str);
        let Ok(params_re) = Regex::new(r#"jsfcljs\([^,]+,\s*\{([^}]+)\}"#) else {
            return map;
        };
        let Some(cap) = params_re.captures(&decoded) else {
            return map;
        };
        let inner = cap.get(1).unwrap().as_str();
        let Ok(pair_re) = Regex::new(r#"['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]"#) else {
            return map;
        };
        for pair in pair_re.captures_iter(inner) {
            let k = pair.get(1).unwrap().as_str();
            let v = pair.get(2).unwrap().as_str();
            map.insert(k.to_string(), v.to_string());
        }
        map
    }

    /// Extrai os parâmetros necessários para submeter o formulário de acesso à Turma Virtual
    /// a partir do HTML do portal discente (discente.jsf), retornando (form_id, target_url, form_data).
    pub fn extract_course_access_form_params_full(
        portal_html: &str,
        turma_id: &str,
        course_name: &str,
    ) -> (String, String, HashMap<String, String>) {
        let mut form_data = HashMap::new();
        let default_form_name = "form_acessarTurmaVirtual".to_string();

        // Extrai ViewState
        let vs_re = Regex::new(r#"(?:id|name)="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .or_else(|_| {
                Regex::new(r#"value="([^"]+)"[^>]*(?:id|name)="javax\.faces\.ViewState""#)
            });
        let vs = vs_re
            .ok()
            .and_then(|re| re.captures(portal_html))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "j_id1".to_string());
        form_data.insert("javax.faces.ViewState".to_string(), vs);

        let access_map = Self::extract_courses_access_map(portal_html);
        let found = access_map.get(turma_id).or_else(|| {
            let norm = Self::normalize_discipline_name(course_name);
            if !norm.is_empty() {
                access_map.get(&norm)
            } else {
                None
            }
        });

        let form_id = if let Some((fid, params)) = found {
            for (k, v) in params {
                form_data.insert(k.clone(), v.clone());
            }
            form_data.insert(fid.clone(), fid.clone());
            fid.clone()
        } else {
            form_data.insert(default_form_name.clone(), default_form_name.clone());
            form_data.insert(
                "form_acessarTurmaVirtual:frontEndIdTurma".to_string(),
                turma_id.to_string(),
            );
            form_data.insert("frontEndIdTurma".to_string(), turma_id.to_string());
            default_form_name
        };

        // Identifica action URL do formulário
        let form_action_re = Regex::new(&format!(
            r#"(?is)<form\b[^>]*?id="{}"[^>]*?action="([^"]+)""#,
            regex::escape(&form_id)
        ))
        .ok();
        let form_action_rev_re = Regex::new(&format!(
            r#"(?is)<form\b[^>]*?action="([^"]+)"[^>]*?id="{}"#,
            regex::escape(&form_id)
        ))
        .ok();
        let action_url = form_action_re
            .as_ref()
            .and_then(|re| re.captures(portal_html))
            .or_else(|| {
                form_action_rev_re
                    .as_ref()
                    .and_then(|re| re.captures(portal_html))
            })
            .and_then(|c| c.get(1))
            .map(|m| {
                let act = m.as_str();
                if act.starts_with("http") {
                    act.to_string()
                } else if act.starts_with('/') {
                    format!("https://sigaa.unb.br{}", act)
                } else {
                    DISCENTE_URL.to_string()
                }
            })
            .unwrap_or_else(|| DISCENTE_URL.to_string());

        (form_id, action_url, form_data)
    }

    /// Extrai os parâmetros necessários para submeter o formulário de acesso à Turma Virtual
    /// a partir do HTML do portal discente (discente.jsf).
    pub fn extract_course_access_form_params(
        portal_html: &str,
        turma_id: &str,
        course_name: &str,
    ) -> HashMap<String, String> {
        let (_, _, form_data) =
            Self::extract_course_access_form_params_full(portal_html, turma_id, course_name);
        form_data
    }

    /// Mapeia todas as turmas presentes no portal discente para seus respectivos parâmetros JSF de acesso,
    /// associando cada link de turma com o seu respectivo id="linha_XYZ" e parâmetros frontEndIdTurma
    pub fn extract_courses_access_map(
        portal_html: &str,
    ) -> HashMap<String, (String, HashMap<String, String>)> {
        let mut map = HashMap::new();
        let clean_portal = decode_html_entities(portal_html);

        let vs_re = Regex::new(r#"(?:id|name)="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .or_else(|_| {
                Regex::new(r#"value="([^"]+)"[^>]*(?:id|name)="javax\.faces\.ViewState""#)
            });
        let vs = vs_re
            .ok()
            .and_then(|re| re.captures(&clean_portal))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "j_id1".to_string());

        // Extrai estritamente os links de entrada na Turma Virtual (contendo frontEndIdTurma ou form_acessarTurmaVirtual)
        // Isso evita a contaminação por links de avisos/notícias do rotator (#atualizacoes-turma com idTurma)
        let mut links: Vec<(usize, String, String, String)> = Vec::new();
        if let Ok(link_re) = Regex::new(
            r#"(?is)<a\s+[^>]*?onclick=(?:"([^"]*(?:frontEndIdTurma|form_acessarTurmaVirtual)[^"]*)"|'([^']*(?:frontEndIdTurma|form_acessarTurmaVirtual)[^']*)')[^>]*>(.*?)</a>"#,
        ) {
            let tag_strip_re = Regex::new(r#"<[^>]+>"#).unwrap();
            let form_id_re = Regex::new(r#"jsfcljs\((?:document\.getElementById\(['"]([^'"]+)['"]\)|document\.forms\['([^']+)']|'([^']+)'|([^,)]+)),"#).ok();

            for cap in link_re.captures_iter(&clean_portal) {
                let pos = cap.get(0).unwrap().start();
                let onclick = cap
                    .get(1)
                    .or_else(|| cap.get(2))
                    .map(|m| m.as_str())
                    .unwrap_or("")
                    .to_string();
                let raw_content = cap.get(3).map(|m| m.as_str()).unwrap_or("");
                let clean_name = tag_strip_re.replace_all(raw_content, "").trim().to_string();

                let form_id = form_id_re
                    .as_ref()
                    .and_then(|re| re.captures(&onclick))
                    .and_then(|c| {
                        c.get(1)
                            .or_else(|| c.get(2))
                            .or_else(|| c.get(3))
                            .or_else(|| c.get(4))
                    })
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_else(|| "form_acessarTurmaVirtual".to_string());

                links.push((pos, onclick, clean_name, form_id));
            }
        }

        // 1. Mapeamento direto de cada link baseado em seus próprios parâmetros e texto
        for (_, onclick, raw_name, form_id) in &links {
            let mut params = Self::extract_jsf_params_from_onclick(onclick);
            params.insert("javax.faces.ViewState".to_string(), vs.clone());
            params.insert(form_id.clone(), form_id.clone());

            // Indexa por frontEndIdTurma
            for id_key in &[
                "frontEndIdTurma",
                "form_acessarTurmaVirtual:frontEndIdTurma",
            ] {
                if let Some(fid) = params.get(*id_key) {
                    if !fid.is_empty() {
                        map.insert(fid.clone(), (form_id.clone(), params.clone()));
                    }
                }
            }

            let norm_name = Self::normalize_discipline_name(raw_name);
            if !norm_name.is_empty() {
                map.insert(norm_name, (form_id.clone(), params.clone()));
            }

            for sep in &['-', '–', '—'] {
                if let Some((code_part, name_part)) = raw_name.split_once(*sep) {
                    let norm_code = Self::normalize_discipline_name(code_part);
                    let norm_sub = Self::normalize_discipline_name(name_part);
                    if !norm_code.is_empty() {
                        map.insert(norm_code, (form_id.clone(), params.clone()));
                    }
                    if !norm_sub.is_empty() {
                        map.insert(norm_sub, (form_id.clone(), params.clone()));
                    }
                }
            }
        }

        // 2. Mapeamento correlacionado com id="linha_(\d+)"
        let mut linhas: Vec<(usize, String)> = Vec::new();
        if let Ok(linha_re) = Regex::new(r#"id="linha_(\d+)""#) {
            for cap in linha_re.captures_iter(&clean_portal) {
                let pos = cap.get(0).unwrap().start();
                let turma_id = cap
                    .get(1)
                    .map(|m| m.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                linhas.push((pos, turma_id));
            }
        }

        for (linha_pos, turma_id) in &linhas {
            if let Some((_, onclick, _, form_id)) = links
                .iter()
                .rfind(|(link_pos, _, _, _)| *link_pos < *linha_pos)
            {
                let mut params = Self::extract_jsf_params_from_onclick(onclick);
                params.insert("javax.faces.ViewState".to_string(), vs.clone());
                params.insert(form_id.clone(), form_id.clone());
                if !turma_id.is_empty() {
                    map.insert(turma_id.clone(), (form_id.clone(), params.clone()));
                }
            }
        }

        map
    }

    /// Extrai o total de faltas do HTML da Turma Virtual (https://sigaa.unb.br/sigaa/ava/index.jsf)
    /// ou de seu relatório/extrato de frequência.
    pub fn extract_absences_from_ava_html(html: &str) -> Option<u32> {
        let clean = decode_html_entities(html);
        let clean_lower = clean.to_lowercase();

        let has_presence_table =
            Regex::new(r#"(?i)<td[^>]*>(?:<[^>]+>)*\s*Presente\s*(?:<[^>]+>)*</td>"#)
                .ok()
                .map(|re| re.is_match(&clean))
                .unwrap_or(false)
                && (clean_lower.contains("situa")
                    || clean_lower.contains("data")
                    || clean_lower.contains("frequ"));

        let is_frequencia_page = clean_lower.contains("mapa de frequ")
            || clean_lower.contains("frequência do aluno")
            || clean_lower.contains("frequencia do aluno")
            || (clean_lower.contains("presenças registradas")
                && clean_lower.contains("registro de frequ"))
            || has_presence_table;

        // 1. Padrões expressos: "Total de Faltas: X" ou "Número de Faltas: X" ou "Total de Faltas (h): X"
        let total_re = Regex::new(
            r#"(?i)(?:Total|N[úu]mero|N[ºo]|Carga\s+Hor[áa]ria)\s+de\s+[Ff]altas(?:\s*\(h\))?\s*:?(?:[^<0-9]*<[^>]+>)*\s*(\d+)"#,
        )
        .ok()?;
        if let Some(cap) = total_re.captures(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(val) = m.as_str().parse::<u32>() {
                    return Some(val);
                }
            }
        }

        // 2. Rótulo direto "Faltas: X"
        let faltas_label_re =
            Regex::new(r#"(?i)\b[Ff]altas\s*:(?:[^<0-9]*<[^>]+>)*\s*(\d+)"#).ok()?;
        if let Some(cap) = faltas_label_re.captures(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(val) = m.as_str().parse::<u32>() {
                    return Some(val);
                }
            }
        }

        // 3. Coluna tabular em tabelas de diário ou resumo: <td>Faltas</td><td>X</td>
        let td_re =
            Regex::new(r#"(?i)<td[^>]*>[^<]*[Ff]altas?[^<]*</td>\s*<td[^>]*>\s*(\d+)\s*</td>"#)
                .ok()?;
        if let Some(cap) = td_re.captures(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(val) = m.as_str().parse::<u32>() {
                    return Some(val);
                }
            }
        }

        // 4. Tabela de frequência diária da turma (Data | Situação):
        // Padrão capturado do SIGAA: "13/08/2026: 2 Falta(s)", "21/10/2026: 4 Falta(s)", etc.
        let row_falta_numbered_re = Regex::new(r#"(?i)\b(\d+)\s+Falta(?:\(s\)|s)?"#).ok()?;
        let mut total_from_rows = 0;
        let mut found_any_falta = false;
        for cap in row_falta_numbered_re.captures_iter(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(num) = m.as_str().parse::<u32>() {
                    total_from_rows += num;
                    found_any_falta = true;
                }
            }
        }

        // Padrão: Falta(s): 2 ou Falta (2)
        let row_falta_colon_re =
            Regex::new(r#"(?i)\bFalta(?:\(s\)|s)?\s*[:(]\s*(\d+)\s*\)?"#).ok()?;
        for cap in row_falta_colon_re.captures_iter(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(num) = m.as_str().parse::<u32>() {
                    total_from_rows += num;
                    found_any_falta = true;
                }
            }
        }

        // Faltas não numeradas: <td>Falta(s)</td> ou <td>Falta</td> (suportando tags aninhadas como <span> ou <font>)
        let row_just_falta_re =
            Regex::new(r#"(?i)<td[^>]*>(?:<[^>]+>)*\s*Falta(?:\(s\)|s)?\s*(?:<[^>]+>)*</td>"#)
                .ok()?;
        for _ in row_just_falta_re.find_iter(&clean) {
            total_from_rows += 1;
            found_any_falta = true;
        }

        if found_any_falta {
            return Some(total_from_rows);
        }

        // 5. Classes CSS que empacotam o contador de faltas
        let class_re = Regex::new(
            r#"(?i)class="[^"]*(?:falta|frequencia)[^"]*"[^>]*>(?:[^0-9]*\b[Ff]altas?\b[^0-9]*)?\s*(\d+)"#,
        )
        .ok()?;
        if let Some(cap) = class_re.captures(&clean) {
            if let Some(m) = cap.get(1) {
                if let Ok(val) = m.as_str().parse::<u32>() {
                    return Some(val);
                }
            }
        }

        // 6. Resumo oficial do rodapé do Mapa de Frequências (conforme tela do SIGAA):
        // "Presenças Registradas: 28" e "Número de Aulas com Registro de Frequência: 32" -> 32 - 28 = 4 faltas
        let presencas_re = Regex::new(r#"(?i)Presen[çc]as\s+Registradas\s*:\s*(\d+)"#).ok()?;
        let total_aulas_re = Regex::new(
            r#"(?i)N[úu]mero\s+de\s+Aulas\s+com\s+Registro\s+de\s+Frequ[êe]ncia\s*:\s*(\d+)"#,
        )
        .ok()?;
        if let (Some(cap_p), Some(cap_a)) = (
            presencas_re.captures(&clean),
            total_aulas_re.captures(&clean),
        ) {
            if let (Ok(p), Ok(a)) = (cap_p[1].parse::<u32>(), cap_a[1].parse::<u32>()) {
                if a > p {
                    return Some(a - p);
                } else if a == p && is_frequencia_page {
                    return Some(0);
                }
            }
        }

        // 7. Se a página é comprovadamente o Mapa de Frequências e nenhuma falta foi encontrada:
        if is_frequencia_page {
            return Some(0);
        }

        None
    }

    /// Acessa a Turma Virtual (AVA) de uma disciplina no SIGAA (https://sigaa.unb.br/sigaa/ava/index.jsf)
    /// e captura as faltas registradas do aluno para o semestre.
    /// Realiza o parse da tabela do relatório oficial "Consultar Minhas Notas" (Boletim)
    /// extraindo o total de faltas consolidado por componente curricular / código.
    pub fn parse_minhas_notas_html(html: &str) -> HashMap<String, u32> {
        let clean = decode_html_entities(html);
        let mut results = HashMap::new();

        let table_re = Regex::new(r#"(?is)<table\b[^>]*>(.*?)</table>"#).unwrap();
        let tr_re = Regex::new(r#"(?is)<tr\b[^>]*>(.*?)</tr>"#).unwrap();
        let th_re = Regex::new(r#"(?is)<th\b[^>]*>(.*?)</th>"#).unwrap();
        let td_re = Regex::new(r#"(?is)<td\b[^>]*>(.*?)</td>"#).unwrap();
        let tag_strip_re = Regex::new(r#"<[^>]+>"#).unwrap();

        for table_cap in table_re.captures_iter(&clean) {
            let table_content = table_cap.get(1).unwrap().as_str();

            if !table_content.to_lowercase().contains("falta") {
                continue;
            }

            let mut header_falta_idx: Option<usize> = None;
            let mut header_name_idx: Option<usize> = None;
            let mut header_code_idx: Option<usize> = None;

            let mut rows = Vec::new();

            for tr_cap in tr_re.captures_iter(table_content) {
                let row_content = tr_cap.get(1).unwrap().as_str();

                let ths: Vec<String> = th_re
                    .captures_iter(row_content)
                    .map(|c| {
                        tag_strip_re
                            .replace_all(c.get(1).unwrap().as_str(), "")
                            .trim()
                            .to_string()
                    })
                    .collect();

                if !ths.is_empty() && header_falta_idx.is_none() {
                    for (idx, th) in ths.iter().enumerate() {
                        let lower = th.to_lowercase();
                        if lower.contains("falta") {
                            header_falta_idx = Some(idx);
                        } else if lower.contains("componente")
                            || lower.contains("disciplina")
                            || lower.contains("matéria")
                            || lower.contains("materia")
                        {
                            header_name_idx = Some(idx);
                        } else if lower.contains("código") || lower.contains("codigo") {
                            header_code_idx = Some(idx);
                        }
                    }
                    continue;
                }

                let tds: Vec<String> = td_re
                    .captures_iter(row_content)
                    .map(|c| {
                        tag_strip_re
                            .replace_all(c.get(1).unwrap().as_str(), "")
                            .trim()
                            .to_string()
                    })
                    .collect();

                if !tds.is_empty() {
                    if header_falta_idx.is_none()
                        && tds.iter().any(|t| t.to_lowercase().contains("falta"))
                    {
                        for (idx, td) in tds.iter().enumerate() {
                            let lower = td.to_lowercase();
                            if lower.contains("falta") {
                                header_falta_idx = Some(idx);
                            } else if lower.contains("componente")
                                || lower.contains("disciplina")
                                || lower.contains("matéria")
                                || lower.contains("materia")
                            {
                                header_name_idx = Some(idx);
                            } else if lower.contains("código") || lower.contains("codigo") {
                                header_code_idx = Some(idx);
                            }
                        }
                        continue;
                    }
                    rows.push(tds);
                }
            }

            if let Some(falta_idx) = header_falta_idx {
                for cells in &rows {
                    if falta_idx < cells.len() {
                        let falta_str = &cells[falta_idx];
                        let absences = falta_str
                            .chars()
                            .filter(|c| c.is_ascii_digit())
                            .collect::<String>()
                            .parse::<u32>()
                            .ok();

                        if let Some(abs) = absences {
                            if let Some(name_idx) = header_name_idx {
                                if name_idx < cells.len() {
                                    let raw_name = &cells[name_idx];
                                    let norm = Self::normalize_discipline_name(raw_name);
                                    if !norm.is_empty() {
                                        results.insert(norm, abs);
                                    }
                                    for sep in &['-', '–', '—'] {
                                        if let Some((code_part, name_part)) =
                                            raw_name.split_once(*sep)
                                        {
                                            let norm_code =
                                                Self::normalize_discipline_name(code_part);
                                            let norm_subname =
                                                Self::normalize_discipline_name(name_part);
                                            if !norm_code.is_empty() {
                                                results.insert(norm_code, abs);
                                            }
                                            if !norm_subname.is_empty() {
                                                results.insert(norm_subname, abs);
                                            }
                                        }
                                    }
                                }
                            }
                            if let Some(code_idx) = header_code_idx {
                                if code_idx < cells.len() {
                                    let norm_code =
                                        Self::normalize_discipline_name(&cells[code_idx]);
                                    if !norm_code.is_empty() {
                                        results.insert(norm_code, abs);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        results
    }

    /// Auxiliar para extrair o action URL de um formulário específico no HTML
    fn extract_form_action_url(html: &str, form_id: &str) -> String {
        let form_action_re = Regex::new(&format!(
            r#"(?is)<form\b[^>]*?id="{}"[^>]*?action="([^"]+)""#,
            regex::escape(form_id)
        ))
        .ok();
        let form_action_rev_re = Regex::new(&format!(
            r#"(?is)<form\b[^>]*?action="([^"]+)"[^>]*?id="{}"#,
            regex::escape(form_id)
        ))
        .ok();
        form_action_re
            .as_ref()
            .and_then(|re| re.captures(html))
            .or_else(|| form_action_rev_re.as_ref().and_then(|re| re.captures(html)))
            .and_then(|c| c.get(1))
            .map(|m| {
                let act = m.as_str();
                if act.starts_with("http") {
                    act.to_string()
                } else if act.starts_with('/') {
                    format!("https://sigaa.unb.br{}", act)
                } else {
                    "https://sigaa.unb.br/sigaa/ava/index.jsf".to_string()
                }
            })
            .unwrap_or_else(|| "https://sigaa.unb.br/sigaa/ava/index.jsf".to_string())
    }

    /// Consulta as notas e faltas consolidadas do semestre através do menu
    /// "Consultar Minhas Notas" (Boletim) do Portal Discente
    pub async fn fetch_absences_from_minhas_notas(
        client: &reqwest::Client,
        portal_html: &str,
    ) -> HashMap<String, u32> {
        let vs_re = Regex::new(r#"(?:id|name)="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .or_else(|_| {
                Regex::new(r#"value="([^"]+)"[^>]*(?:id|name)="javax\.faces\.ViewState""#)
            });
        let vs = vs_re
            .ok()
            .and_then(|re| re.captures(portal_html))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "j_id1".to_string());

        let id_re = Regex::new(
            r#"(?:name="id"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="id"|<input[^>]*id="id"[^>]*value="([^"]+)")"#,
        );
        let mut id_val = id_re
            .ok()
            .and_then(|re| re.captures(portal_html))
            .and_then(|c| c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3)))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        if id_val.is_empty() {
            if let Ok(discente_id_re) = Regex::new(r#"(?:id_discente|idDiscente)=(\d+)"#) {
                if let Some(c) = discente_id_re.captures(portal_html) {
                    if let Some(m) = c.get(1) {
                        id_val = m.as_str().to_string();
                    }
                }
            }
        }

        let jscook_re = Regex::new(
            r#"(menu_form_menu_discente_discente_menu:A\]#\{[^}]*(?:consultarNotas|relatorioNotasAluno[^}]*gerarRelatorio|gerarRelatorio)[^}]*\})"#,
        );
        let action = jscook_re
            .ok()
            .and_then(|re| re.captures(portal_html))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| {
                "menu_form_menu_discente_discente_menu:A]#{ relatorioNotasAluno.gerarRelatorio }"
                    .to_string()
            });

        let mut form_data = HashMap::new();
        form_data.insert(
            "menu:form_menu_discente",
            "menu:form_menu_discente".to_string(),
        );
        if !id_val.is_empty() {
            form_data.insert("id", id_val);
        }
        form_data.insert("jscook_action", action.clone());
        form_data.insert("javax.faces.ViewState", vs.clone());

        log::info!("[SigaaClient] Submetendo requisição para Consultar Minhas Notas...");
        let mut map = HashMap::new();

        if let Ok(res_notas) = client
            .post(DISCENTE_URL)
            .header(REFERER, DISCENTE_URL)
            .form(&form_data)
            .send()
            .await
        {
            if let Ok(notas_html) = res_notas.text().await {
                map = Self::parse_minhas_notas_html(&notas_html);
            }
        }

        // Se o primeiro formato de action não retornou matérias, tenta formato alternativo sem espaços
        if map.is_empty() {
            let alt_action = if action.contains(' ') {
                action.replace(' ', "")
            } else {
                "menu_form_menu_discente_discente_menu:A]#{ relatorioNotasAluno.gerarRelatorio }"
                    .to_string()
            };
            form_data.insert("jscook_action", alt_action);
            if let Ok(res_notas2) = client
                .post(DISCENTE_URL)
                .header(REFERER, DISCENTE_URL)
                .form(&form_data)
                .send()
                .await
            {
                if let Ok(notas_html) = res_notas2.text().await {
                    map = Self::parse_minhas_notas_html(&notas_html);
                }
            }
        }

        log::info!(
            "[SigaaClient] Minhas Notas retornou {} disciplinas com faltas mapeadas.",
            map.len()
        );
        map
    }

    /// Extrai o valor de um atributo HTML específico de uma string de atributos.
    pub fn extract_attribute_value(attrs: &str, attr_name: &str) -> Option<String> {
        let pattern = format!(
            r#"(?i)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))"#,
            regex::escape(attr_name)
        );
        let Ok(re) = Regex::new(&pattern) else {
            return None;
        };
        let cap = re.captures(attrs)?;
        cap.get(1)
            .or_else(|| cap.get(2))
            .or_else(|| cap.get(3))
            .map(|m| m.as_str().to_string())
    }

    /// Retorna ao Portal Discente a partir de qualquer submódulo (AVA, Minhas Notas, etc.),
    /// redefinindo o módulo ativo e obtendo um novo HTML com formulário e ViewState atualizados.
    pub async fn reload_portal_discente(client: &reqwest::Client) -> Result<String, String> {
        // 1. Tenta verPortalDiscente.do com diferentes referers (ação do Struts que faz o switch de módulo e redireciona para discente.jsf)
        for referer in &[
            "https://sigaa.unb.br/sigaa/ava/FrequenciaAluno/mapa.jsf",
            "https://sigaa.unb.br/sigaa/ava/index.jsf",
            DISCENTE_URL,
        ] {
            if let Ok(res_do) = client
                .get("https://sigaa.unb.br/sigaa/verPortalDiscente.do")
                .header(REFERER, *referer)
                .send()
                .await
            {
                if let Ok(html) = res_do.text().await {
                    let h_low = html.to_lowercase();
                    if h_low.contains("form_acessarturmavirtual")
                        || h_low.contains("portaldiscente")
                        || h_low.contains("turmas-portal")
                        || h_low.contains("linha_")
                    {
                        return Ok(html);
                    }
                }
            }
        }

        // 2. Fallback: requisição direta ao portal discente
        for url in &[
            DISCENTE_URL,
            "https://sigaa.unb.br/sigaa/portais/discente/discente.jsf",
            "https://sigaa.unb.br/sigaa/discente.jsf",
        ] {
            if let Ok(res_jsf) = client.get(*url).header(REFERER, DISCENTE_URL).send().await {
                if let Ok(html) = res_jsf.text().await {
                    let h_low = html.to_lowercase();
                    if h_low.contains("form_acessarturmavirtual")
                        || h_low.contains("portaldiscente")
                        || h_low.contains("turmas-portal")
                        || h_low.contains("linha_")
                    {
                        return Ok(html);
                    }
                }
            }
        }

        Err("Não foi possível recarregar o portal discente com formulário de turmas".to_string())
    }

    /// Extrai os parâmetros do item de menu "Frequência" da barra lateral do AVA
    pub fn extract_frequencia_menu_item(
        ava_html: &str,
    ) -> Option<(String, String, HashMap<String, String>)> {
        let clean = decode_html_entities(ava_html);

        let vs_re = Regex::new(r#"(?:id|name)="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .or_else(|_| {
                Regex::new(r#"value="([^"]+)"[^>]*(?:id|name)="javax\.faces\.ViewState""#)
            });
        let vs = vs_re
            .ok()
            .and_then(|re| re.captures(ava_html))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "j_id1".to_string());

        let onclick_re =
            Regex::new(r#"(?i)onclick=(?:"([^"]*jsfcljs[^"]*)"|'([^']*jsfcljs[^']*)')"#).ok()?;
        let form_id_re = Regex::new(r#"jsfcljs\((?:document\.getElementById\(['"]([^'"]+)['"]\)|document\.forms\['([^']+)']|'([^']+)'|([^,)]+)),"#).ok()?;

        // Estratégia 1: Procura pela palavra "frequência" / "frequencia" (ex: <div class="itemMenu">Frequência</div>)
        // e pega o onclick mais próximo imediatamente anterior no HTML
        let freq_re = Regex::new(r#"(?i)frequ[êe]ncia"#).ok()?;
        for m in freq_re.find_iter(&clean) {
            let idx = m.start();
            let start = idx.saturating_sub(400);
            let window = &clean[start..idx];

            if let Some(cap) = onclick_re.captures_iter(window).last() {
                let onclick = cap
                    .get(1)
                    .or_else(|| cap.get(2))
                    .map(|c| c.as_str())
                    .unwrap_or("");
                let params = Self::extract_jsf_params_from_onclick(onclick);
                if !params.is_empty() {
                    let form_id = form_id_re
                        .captures(onclick)
                        .and_then(|c| {
                            c.get(1)
                                .or_else(|| c.get(2))
                                .or_else(|| c.get(3))
                                .or_else(|| c.get(4))
                        })
                        .map(|c| c.as_str().trim().to_string())
                        .unwrap_or_else(|| "formMenu".to_string());

                    let action_url = Self::extract_form_action_url(ava_html, &form_id);

                    let mut form_data = HashMap::new();
                    form_data.insert(form_id.clone(), form_id.clone());
                    form_data.insert("javax.faces.ViewState".to_string(), vs.clone());
                    for (k, v) in params {
                        form_data.insert(k, v);
                    }

                    return Some((form_id, action_url, form_data));
                }
            }
        }

        // Estratégia 2: Procura por tag com atributo title="Frequência"
        let title_re =
            Regex::new(r#"(?is)<[^>]*?title=["'][^"']*frequ[êe]ncia[^"']*["'][^>]*>"#).ok()?;
        for m in title_re.find_iter(&clean) {
            let tag_snippet = m.as_str();
            if let Some(cap) = onclick_re.captures(tag_snippet) {
                let onclick = cap
                    .get(1)
                    .or_else(|| cap.get(2))
                    .map(|c| c.as_str())
                    .unwrap_or("");
                let params = Self::extract_jsf_params_from_onclick(onclick);
                if !params.is_empty() {
                    let form_id = form_id_re
                        .captures(onclick)
                        .and_then(|c| {
                            c.get(1)
                                .or_else(|| c.get(2))
                                .or_else(|| c.get(3))
                                .or_else(|| c.get(4))
                        })
                        .map(|c| c.as_str().trim().to_string())
                        .unwrap_or_else(|| "formMenu".to_string());

                    let action_url = Self::extract_form_action_url(ava_html, &form_id);

                    let mut form_data = HashMap::new();
                    form_data.insert(form_id.clone(), form_id.clone());
                    form_data.insert("javax.faces.ViewState".to_string(), vs.clone());
                    for (k, v) in params {
                        form_data.insert(k, v);
                    }

                    return Some((form_id, action_url, form_data));
                }
            }
        }

        // Estratégia 3: JSCookMenu no script
        let jscook_re = Regex::new(
            r#"(formMenu[^"']*A\]#\{[^}]*(?:frequencia|mapaFrequencia|Frequencia)[^}]*\})"#,
        )
        .ok()?;
        if let Some(cap) = jscook_re.captures(ava_html) {
            if let Some(action) = cap.get(1) {
                let mut form_data = HashMap::new();
                form_data.insert("formMenu".to_string(), "formMenu".to_string());
                form_data.insert("jscook_action".to_string(), action.as_str().to_string());
                form_data.insert("javax.faces.ViewState".to_string(), vs);
                return Some((
                    "formMenu".to_string(),
                    "https://sigaa.unb.br/sigaa/ava/index.jsf".to_string(),
                    form_data,
                ));
            }
        }

        None
    }

    /// Executa o fluxo oficial do SIGAA na Turma Virtual:
    /// na barra lateral (menu), clica em "Estudantes > Frequência" para inicializar o backing bean
    /// da disciplina e carregar o mapa de frequência oficial.
    pub async fn navigate_to_frequencia_from_ava(
        client: &reqwest::Client,
        ava_html: &str,
        current_ava_url: &str,
    ) -> Option<String> {
        // 1. Tenta acionar o item Estudantes > Frequência via POST
        if let Some((form_id, action_url, form_data)) = Self::extract_frequencia_menu_item(ava_html)
        {
            log::info!(
                "[SigaaClient] Clicando no item Estudantes > Frequência via form '{}'...",
                form_id
            );
            if let Ok(res) = client
                .post(&action_url)
                .header(REFERER, current_ava_url)
                .form(&form_data)
                .send()
                .await
            {
                if let Ok(html) = res.text().await {
                    let h_low = decode_html_entities(&html).to_lowercase();
                    if h_low.contains("mapa de frequ")
                        || h_low.contains("presenças registradas")
                        || h_low.contains("presencas registradas")
                    {
                        return Some(html);
                    }
                }
            }

            // Após post do menu, o backing bean da frequência é inicializado no servidor.
            // Acessa MAPA_FREQUENCIA_URL para obter a visualização completa
            log::info!("[SigaaClient] Acessando MAPA_FREQUENCIA_URL após acionamento do menu...");
            if let Ok(res_map) = client
                .get(MAPA_FREQUENCIA_URL)
                .header(REFERER, &action_url)
                .send()
                .await
            {
                if let Ok(html) = res_map.text().await {
                    let h_low = decode_html_entities(&html).to_lowercase();
                    if h_low.contains("mapa de frequ")
                        || h_low.contains("presenças registradas")
                        || h_low.contains("presencas registradas")
                    {
                        return Some(html);
                    }
                }
            }
        }

        // 2. Acesso direto ao MAPA_FREQUENCIA_URL (com a turma ativa na sessão)
        log::info!("[SigaaClient] Acessando MAPA_FREQUENCIA_URL diretamente...");
        if let Ok(res) = client
            .get(MAPA_FREQUENCIA_URL)
            .header(REFERER, current_ava_url)
            .send()
            .await
        {
            if let Ok(html) = res.text().await {
                let h_low = decode_html_entities(&html).to_lowercase();
                if h_low.contains("mapa de frequ")
                    || h_low.contains("presenças registradas")
                    || h_low.contains("presencas registradas")
                {
                    return Some(html);
                }
            }
        }

        None
    }

    /// Acessa a Turma Virtual e captura as faltas do aluno diretamente em
    /// https://sigaa.unb.br/sigaa/ava/FrequenciaAluno/mapa.jsf
    pub async fn fetch_course_absences_from_ava(
        client: &reqwest::Client,
        turma_id: &str,
        course_name: &str,
        portal_html: &str,
    ) -> Option<u32> {
        let (form_id, target_url, form_data) =
            Self::extract_course_access_form_params_full(portal_html, turma_id, course_name);

        log::info!(
            "[SigaaClient] [AVA] Acessando Turma Virtual: curso='{}', turma_id={}, form='{}', url='{}' ({} params)",
            course_name,
            turma_id,
            form_id,
            target_url,
            form_data.len()
        );

        let res_ava = client
            .post(&target_url)
            .header(REFERER, DISCENTE_URL)
            .form(&form_data)
            .send()
            .await;

        let ava_res = match res_ava {
            Ok(res) => res,
            Err(e) => {
                log::warn!(
                    "[SigaaClient] Falha ao submeter acesso da turma {} no AVA: {}",
                    turma_id,
                    e
                );
                return None;
            }
        };

        let current_ava_url = ava_res.url().to_string();
        let ava_html = ava_res.text().await.unwrap_or_default();

        // Se a página de entrada já for a de frequência ou contiver a tabela
        // (decodifica entidades: o SIGAA serve "Presen&ccedil;as", "Frequ&#234;ncia", etc.)
        let ava_low = decode_html_entities(&ava_html).to_lowercase();
        if current_ava_url.contains("mapa.jsf") || ava_low.contains("mapa de frequ") {
            if let Some(abs) = Self::extract_absences_from_ava_html(&ava_html) {
                log::info!(
                    "[SigaaClient] Faltas capturadas na entrada do AVA para turma {} ({}): {}",
                    turma_id,
                    course_name,
                    abs
                );
                return Some(abs);
            }
        }

        // Com a disciplina ativa na sessão, navega na sidebar para "Estudantes > Frequência"
        if let Some(mapa_html) =
            Self::navigate_to_frequencia_from_ava(client, &ava_html, &current_ava_url).await
        {
            // Decodifica entidades antes de normalizar: sem isso "C&Aacute;LCULO"
            // vira "CAACUTELCULO" e nunca casa com o nome da disciplina
            let norm_mapa = Self::normalize_discipline_name(&decode_html_entities(&mapa_html));
            let norm_course = Self::normalize_discipline_name(course_name);

            let matches_course = norm_mapa.contains(&norm_course)
                || mapa_html.contains(turma_id)
                || (!norm_course.is_empty()
                    && norm_course
                        .split_whitespace()
                        .filter(|w| w.len() > 3)
                        .any(|w| norm_mapa.contains(w)));

            if !matches_course {
                log::warn!(
                    "[SigaaClient] A página mapa.jsf carregada não parece corresponder à disciplina '{}'. Contexto pode não ter trocado.",
                    course_name
                );
                return None;
            }

            if let Some(abs) = Self::extract_absences_from_ava_html(&mapa_html) {
                log::info!(
                    "[SigaaClient] Faltas capturadas via mapa.jsf para turma {} ({}): {}",
                    turma_id,
                    course_name,
                    abs
                );
                return Some(abs);
            } else {
                log::warn!(
                    "[SigaaClient] extract_absences_from_ava_html retornou None para turma {} ({}) apesar do mapa.jsf ter sido carregado (tamanho: {} bytes)",
                    turma_id,
                    course_name,
                    mapa_html.len()
                );
            }
        } else {
            log::warn!(
                "[SigaaClient] navigate_to_frequencia_from_ava retornou None para turma {} ({})",
                turma_id,
                course_name
            );
        }

        None
    }

    pub async fn sync_sigaa(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        let sync_start = std::time::Instant::now();
        let (active_client, page_html, _aviso_item) =
            self.get_authenticated_portal(matricula, senha).await?;
        // O aviso institucional de logon ("Aviso Geral UnB") é intencionalmente ignorado no feed
        let (feed_items, courses) = Self::parse_discente_html(&page_html)?;

        // 1. Linka código/turma/docente com a oferta de turmas (dataset estático) ANTES de buscar as faltas,
        // garantindo que course.code (ex: "MAT0027"), professor e max_absences já estejam populados
        let mut courses = Self::enrich_courses_with_offer(courses).await;

        // 2. Consulta o Boletim Consolidado (Minhas Notas) para pré-popular as faltas.
        // Funciona como fallback: o Boletim pode estar desatualizado (professor ainda
        // não consolidou faltas lá), enquanto o Mapa de Frequências é o registro oficial.
        log::info!("[SigaaClient] Consultando Boletim Oficial (Minhas Notas) para capturar faltas consolidadas...");
        let consolidated_absences =
            Self::fetch_absences_from_minhas_notas(&active_client, &page_html).await;
        for course in courses.iter_mut() {
            let norm_name = Self::normalize_discipline_name(&course.name);
            let norm_code = Self::normalize_discipline_name(&course.code);

            // Match estrito: primeiro por código de disciplina, depois por nome exato normalizado.
            // Evita match parcial frouxo por substring que poderia cruzar faltas entre matérias afins (ex: Cálculo 1 vs Cálculo 2).
            if let Some(&abs) = consolidated_absences
                .get(&norm_code)
                .or_else(|| consolidated_absences.get(&norm_name))
            {
                course.absences = Some(abs);
                log::info!(
                    "[SigaaClient] Faltas vinculadas via Boletim para {}: {}",
                    course.name,
                    abs
                );
            }
        }

        // 3. Captura o Mapa de Frequências oficial (AVA) para TODAS as turmas — fonte canônica
        // da frequência registrada. Sobrescreve o valor do Boletim quando capturado com sucesso;
        // mantém o valor do Boletim se a captura do mapa falhar para a turma.
        let mut current_portal_html = match Self::reload_portal_discente(&active_client).await {
            Ok(refreshed) => refreshed,
            Err(_) => page_html.clone(),
        };

        for course in courses.iter_mut() {
            let turma_id = course.id.trim_start_matches("sigaa-");
            if turma_id.is_empty() {
                continue;
            }

            if let Some(abs) = Self::fetch_course_absences_from_ava(
                &active_client,
                turma_id,
                &course.name,
                &current_portal_html,
            )
            .await
            {
                log::info!(
                    "[SigaaClient] Faltas via Mapa de Frequências para {} (turma {}): {} (Boletim: {:?})",
                    course.name,
                    turma_id,
                    abs,
                    course.absences
                );
                course.absences = Some(abs);
            }

            // Recarrega o portal discente para garantir que o próximo acesso de turma tenha um ViewState atualizado
            // e que a sessão do SIGAA saia do módulo AVA de volta ao portal discente
            if let Ok(refreshed_html) = Self::reload_portal_discente(&active_client).await {
                current_portal_html = refreshed_html;
            }
        }

        // 4. Garante que todas as turmas tenham max_absences calculado pela regra da UnB: créditos * 2 - 1
        for course in courses.iter_mut() {
            if course.max_absences.is_none() {
                let credits = course
                    .schedule
                    .as_deref()
                    .map(Self::estimate_slots_from_schedule)
                    .unwrap_or(4);
                course.max_absences = Some(credits * 2 - 1);
            }
        }

        // Invalida o ViewState do cache após requisições POST para evitar conflito na próxima sincronização
        {
            let mut lock = sigaa_session_cache().lock().await;
            *lock = None;
        }

        log::info!(
            "[SigaaClient] Sincronização concluída com sucesso em {:?}: {} turmas e {} itens de feed.",
            sync_start.elapsed(),
            courses.len(),
            feed_items.len()
        );

        Ok((feed_items, courses))
    }

    /// Realiza o parse das informações cadastrais do aluno da caixa institucional (agenda-docente)
    pub fn parse_discente_profile(html: &str, default_matricula: &str) -> StudentProfile {
        let clean_html = decode_html_entities(html);

        let nome_re = Regex::new(r#"class="nome_usuario"[^>]*>([^<]+)</span>"#).unwrap();
        let nome_alt_re = Regex::new(r#"class="usuario"[^>]*>([^<]+)</span>"#).unwrap();
        let nome = nome_re
            .captures(&clean_html)
            .or_else(|| nome_alt_re.captures(&clean_html))
            .map(|c| c.get(1).unwrap().as_str().trim().to_string());

        let mat_re = Regex::new(r#"Matr[íi]cula:\s*</td>\s*<td>\s*(\d+)\s*</td>"#).unwrap();
        let matricula = mat_re
            .captures(&clean_html)
            .map(|c| c.get(1).unwrap().as_str().trim().to_string())
            .unwrap_or_else(|| default_matricula.to_string());

        let curso_re =
            Regex::new(r#"(?s)<td[^>]*valign="top"[^>]*>\s*Curso:\s*</td>\s*<td>\s*([^\n\r<]+)"#)
                .unwrap();
        let curso_alt_re = Regex::new(r#"Curso:\s*</td>\s*<td>\s*([^<]+)</td>"#).unwrap();
        let raw_curso = curso_re
            .captures(&clean_html)
            .or_else(|| curso_alt_re.captures(&clean_html))
            .map(|c| c.get(1).unwrap().as_str().trim().to_string())
            .unwrap_or_else(|| "Graduação UnB".to_string());

        // Limpa o nome do curso removendo sufixos após '/' ou '-'
        let curso = raw_curso
            .split('/')
            .next()
            .unwrap_or(&raw_curso)
            .trim()
            .to_string();

        // Turno informado pelo SIGAA (ex.: "- MT" ou "(NOTURNO)")
        let turno_re = Regex::new(
            r"(?i)\b((?:DIURNO|NOTURNO|INTEGRAL|MATUTINO|VESPERTINO)(?:\s+E\s+(?:DIURNO|NOTURNO|INTEGRAL|MATUTINO|VESPERTINO))?|[MVTNDI]{1,3})\b",
        )
        .ok();
        let turno = turno_re.and_then(|re| {
            let suffix = raw_curso.rsplit_once(" - ").map(|(_, s)| s.trim());
            suffix
                .and_then(|s| re.captures(s))
                .or_else(|| re.captures(&raw_curso))
                .map(|c| c[1].to_uppercase())
        });

        // Remove turno parentesado do nome
        let curso = Regex::new(r"(?i)\s*\((?:DIURNO|NOTURNO|INTEGRAL|MATUTINO|VESPERTINO)\)\s*$")
            .ok()
            .map(|re| re.replace(&curso, "").trim().to_string())
            .unwrap_or(curso);

        let nivel_re = Regex::new(r#"N[íi]vel:\s*</td>\s*<td>\s*([^<]+)</td>"#).unwrap();
        let nivel = nivel_re
            .captures(&clean_html)
            .map(|c| c.get(1).unwrap().as_str().trim().to_string())
            .unwrap_or_else(|| "GRADUAÇÃO".to_string());

        let status_re = Regex::new(r#"Status:\s*</td>\s*<td>\s*([^<]+)</td>"#).unwrap();
        let status = status_re
            .captures(&clean_html)
            .map(|c| c.get(1).unwrap().as_str().trim().to_string())
            .unwrap_or_else(|| "ATIVO".to_string());

        let entrada_re =
            Regex::new(r#"Entrada:\s*</td>\s*<td>\s*(\d{4}(?:\.[12])?)\s*</td>"#).unwrap();
        let entrada = entrada_re
            .captures(&clean_html)
            .map(|c| c.get(1).unwrap().as_str().trim().to_string())
            .unwrap_or_default();

        let email_re = Regex::new(r#"E-Mail:\s*</td>\s*<td>\s*([^<]+)</td>"#).unwrap();
        let email = email_re
            .captures(&clean_html)
            .map(|c| c.get(1).unwrap().as_str().trim().to_string());

        let ira_re =
            Regex::new(r#"IRA:\s*</acronym></td>\s*<td[^>]*><div[^>]*>([\d.,]+)"#).unwrap();
        let ira = ira_re.captures(&clean_html).and_then(|c| {
            let s = c.get(1).unwrap().as_str().replace(',', ".");
            s.parse::<f64>().ok()
        });

        let mp_re = Regex::new(r#"MP:\s*</acronym></td>\s*<td[^>]*><div[^>]*>([\d.,]+)"#).unwrap();
        let mp = mp_re.captures(&clean_html).and_then(|c| {
            let s = c.get(1).unwrap().as_str().replace(',', ".");
            s.parse::<f64>().ok()
        });

        let ch_obrig_re =
            Regex::new(r#"CH\.\s*Obrigat[óo]ria\s*Pendente\s*</td>\s*<td[^>]*>\s*(\d+)"#).unwrap();
        let ch_obrigatoria_pendente = ch_obrig_re
            .captures(&clean_html)
            .and_then(|c| c.get(1).unwrap().as_str().parse::<u32>().ok());

        let ch_opt_re =
            Regex::new(r#"CH\.\s*Optativa\s*Pendente\s*</td>\s*<td[^>]*>\s*(\d+)"#).unwrap();
        let ch_optativa_pendente = ch_opt_re
            .captures(&clean_html)
            .and_then(|c| c.get(1).unwrap().as_str().parse::<u32>().ok());

        let ch_tot_re =
            Regex::new(r#"CH\.\s*Total\s*Curr[íi]culo\s*</td>\s*<td[^>]*>\s*(\d+)"#).unwrap();
        let ch_total_curriculo = ch_tot_re
            .captures(&clean_html)
            .and_then(|c| c.get(1).unwrap().as_str().parse::<u32>().ok());

        let ch_comp_re =
            Regex::new(r#"CH\.\s*Complementar\s*Pendente\s*</td>\s*<td[^>]*>\s*(\d+)"#).unwrap();
        let ch_complementar_pendente = ch_comp_re
            .captures(&clean_html)
            .and_then(|c| c.get(1).unwrap().as_str().parse::<u32>().ok());

        let perc_re = Regex::new(r#"([\d.,]+)%\s*Integralizado"#).unwrap();
        let percentual_integralizado = perc_re.captures(&clean_html).and_then(|c| {
            let s = c.get(1).unwrap().as_str().replace(',', ".");
            s.parse::<f64>().ok()
        });

        StudentProfile {
            matricula,
            name: nome,
            course: curso,
            shift: turno,
            level: nivel,
            status,
            admission_semester: entrada,
            email,
            ira,
            mp,
            pending_mandatory_hours: ch_obrigatoria_pendente,
            pending_elective_hours: ch_optativa_pendente,
            total_curriculum_hours: ch_total_curriculo,
            pending_complementary_hours: ch_complementar_pendente,
            completed_percentage: percentual_integralizado,
        }
    }

    /// Emite o Histórico Escolar oficial do discente e extrai os dados cadastrais
    pub async fn fetch_discente_profile_and_historico(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<AcademicHistoryPayload, String> {
        let (active_client, page_html, _) = self.get_authenticated_portal(matricula, senha).await?;
        let profile = Self::parse_discente_profile(&page_html, matricula);

        let vs_re = Regex::new(r#"id="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .map_err(|e| e.to_string())?;
        let id_re = Regex::new(r#"<input type="hidden" name="id" value="([^"]+)""#)
            .map_err(|e| e.to_string())?;

        let vs = vs_re
            .captures(&page_html)
            .map(|c| c.get(1).unwrap().as_str().to_string())
            .unwrap_or_else(|| "j_id1".into());

        let id_val = id_re
            .captures(&page_html)
            .map(|c| c.get(1).unwrap().as_str().to_string())
            .unwrap_or_default();

        let mut form_data = HashMap::new();
        form_data.insert("menu:form_menu_discente", "menu:form_menu_discente");
        form_data.insert("id", &id_val);
        form_data.insert(
            "jscook_action",
            "menu_form_menu_discente_discente_menu:A]#{ portalDiscente.historico }",
        );
        form_data.insert("javax.faces.ViewState", &vs);

        log::info!(
            "[SigaaClient] Submetendo requisição de emissão do Histórico Escolar oficial..."
        );
        let res_hist = active_client
            .post(DISCENTE_URL)
            .header(REFERER, DISCENTE_URL)
            .form(&form_data)
            .send()
            .await
            .map_err(|e| format!("Falha ao conectar para emitir histórico escolar: {}", e))?;

        let bytes = res_hist
            .bytes()
            .await
            .map_err(|e| format!("Falha ao baixar PDF do histórico: {}", e))?;

        // Invalida o ViewState do cache após POST para evitar conflito em chamadas subsequentes
        {
            let mut lock = sigaa_session_cache().lock().await;
            *lock = None;
        }

        if !bytes.starts_with(b"%PDF") {
            log::warn!("[SigaaClient] Resposta do histórico não iniciou com %PDF.");
            return Ok(AcademicHistoryPayload {
                profile,
                pdf_base64: None,
                pdf_text: None,
            });
        }

        log::info!(
            "[SigaaClient] Histórico escolar obtido com sucesso em formato PDF ({} bytes).",
            bytes.len()
        );

        let bytes_for_b64 = bytes.clone();
        // Extrai o texto em thread bloqueante dedicada do Tokio para não travar o runtime async
        let pdf_text =
            tokio::task::spawn_blocking(move || pdf_extract::extract_text_from_mem(&bytes))
                .await
                .ok()
                .and_then(|res| {
                    res.map_err(|e| {
                        log::warn!("[SigaaClient] Falha ao extrair texto do PDF: {}", e);
                        e
                    })
                    .ok()
                });

        Ok(AcademicHistoryPayload {
            profile,
            // Base64 só como fallback quando a extração falhou: com texto
            // disponível, o payload IPC fica leve — vários MB de base64+texto
            // atravessando a fronteira estouravam o webview.
            pdf_base64: if pdf_text.is_some() {
                None
            } else {
                Some(base64_encode(&bytes_for_b64))
            },
            pdf_text,
        })
    }

    /// Extrai parâmetros do formulário de autenticação CAS SSO
    pub fn extract_cas_form_params(html: &str) -> Result<(String, String, String, String), String> {
        let lt_re = Regex::new(r#"name="lt"\s+value="([^"]+)""#).map_err(|e| e.to_string())?;
        let exec_re =
            Regex::new(r#"name="execution"\s+value="([^"]+)""#).map_err(|e| e.to_string())?;
        let event_re =
            Regex::new(r#"name="_eventId"\s+value="([^"]+)""#).map_err(|e| e.to_string())?;
        let action_re = Regex::new(r#"<form[^>]*action="([^"]+)""#).map_err(|e| e.to_string())?;

        let lt = lt_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| "Token 'lt' não encontrado no formulário CAS.".to_string())?;

        let execution = exec_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| "Campo 'execution' não encontrado no formulário CAS.".to_string())?;

        let event_id = event_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "submit".to_string());

        let raw_action = action_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "/sso-server/login".to_string());

        let action_url = if raw_action.starts_with("https://autenticacao.unb.br/") {
            raw_action
        } else if raw_action.starts_with('/') {
            format!("https://autenticacao.unb.br{}", raw_action)
        } else {
            return Err("Ação do formulário CAS com host inválido ou não seguro.".to_string());
        };

        Ok((action_url, lt, execution, event_id))
    }

    /// Extrai o aviso institucional de `telaAvisoLogon.jsf` como um item para o feed
    pub fn extract_aviso_logon(html: &str) -> Option<FeedItem> {
        let title_re = Regex::new(r"<h2>(.*?)</h2>").ok()?;
        let body_re = Regex::new(r"<p><span[^>]*>(.*?)</span></p>").ok()?;

        let title_match = title_re.captures(html).and_then(|c| c.get(1))?;
        let raw_title = decode_html_entities(title_match.as_str().trim());

        let raw_body = if let Some(cap) = body_re.captures(html).and_then(|c| c.get(1)) {
            let stripped = Regex::new(r"<[^>]+>")
                .unwrap()
                .replace_all(cap.as_str(), " ");
            let clean = Regex::new(r"\s+").unwrap().replace_all(&stripped, " ");
            decode_html_entities(clean.trim())
        } else {
            "Comunicado institucional exibido no acesso ao SIGAA.".to_string()
        };

        let now_iso = chrono::Utc::now().to_rfc3339();

        Some(FeedItem {
            id: format!("sigaa-aviso-{}", fnv1a_hash(&raw_title)),
            platform: PlatformType::Sigaa,
            title: raw_title,
            content: raw_body,
            course_name: "Aviso Geral UnB".into(),
            course_code: Some("SIGAA".into()),
            author: Some("STI / Reitoria UnB".into()),
            item_type: FeedItemType::Post,
            created_at: now_iso,
            due_date: None,
            is_completed: Some(false),
            external_url: Some(DISCENTE_URL.into()),
        })
    }

    /// Extrai dados do formulário de confirmação de `telaAvisoLogon.jsf` para avançar
    pub fn extract_aviso_form_submit(
        html: &str,
        base_url: &str,
    ) -> Result<(String, HashMap<String, String>), String> {
        let form_re = Regex::new(r#"<form[^>]*id="([^"]+)"[^>]*action="([^"]+)""#)
            .map_err(|e| e.to_string())?;
        let viewstate_re = Regex::new(r#"id="javax\.faces\.ViewState"[^>]*value="([^"]+)""#)
            .map_err(|e| e.to_string())?;
        let btn_re = Regex::new(r#"type="submit"[^>]*name="([^"]+)"[^>]*value="([^"]+)""#)
            .map_err(|e| e.to_string())?;

        let form_cap = form_re
            .captures(html)
            .ok_or_else(|| "Formulário não encontrado em telaAvisoLogon.jsf".to_string())?;

        let form_id = form_cap
            .get(1)
            .map(|m| m.as_str())
            .unwrap_or("")
            .to_string();
        let raw_action = form_cap
            .get(2)
            .map(|m| m.as_str())
            .unwrap_or("")
            .to_string();

        let viewstate = viewstate_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "j_id1".to_string());

        let (btn_name, btn_val) = if let Some(btn_cap) = btn_re.captures(html) {
            (
                btn_cap
                    .get(1)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default(),
                btn_cap
                    .get(2)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_else(|| "Continuar >>".to_string()),
            )
        } else {
            (
                format!("{}:j_id_jsp_continuar", form_id),
                "Continuar >>".to_string(),
            )
        };

        let action_url = if raw_action.starts_with("http") {
            raw_action
        } else if raw_action.starts_with('/') {
            format!("https://sigaa.unb.br{}", raw_action)
        } else {
            base_url.to_string()
        };

        let mut params = HashMap::new();
        params.insert(form_id.clone(), form_id);
        params.insert(btn_name, btn_val);
        params.insert("javax.faces.ViewState".into(), viewstate);

        Ok((action_url, params))
    }

    /// Realiza o parse das turmas do semestre atual, atividades e atualizações do portal discente
    pub fn parse_discente_html(html: &str) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        let mut courses = Vec::new();
        let mut items = Vec::new();

        // 1. Extração do semestre atual (ex.: "2026.2") com fallback dinâmico
        let semester_re = Regex::new(
            r#"<td colspan="5"[^>]*style="[^"]*background:[^>]*>\s*(\d{4}\.[12])\s*</td>"#,
        )
        .unwrap();
        let current_semester = semester_re
            .captures(html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| {
                let now = chrono::Utc::now();
                let period = if now.month() <= 6 { 1 } else { 2 };
                format!("{}.{}", now.year(), period)
            });

        // 2. Extração das turmas matriculadas
        // A célula de horário do SIGAA contém markup extra (img "ajuda.gif" com popup
        // dos dias/horários) e fecha </center> e </td> em linhas separadas — por isso
        // o grupo 3 captura até </center> de forma permissiva e é limpo logo abaixo.
        let course_row_re = Regex::new(
            r#"(?s)<form id="form_acessarTurmaVirtual[^"]*"[^>]*>.*?<a [^>]*onclick=(?:"[^"]*frontEndIdTurma[^"]*"|'[^']*frontEndIdTurma[^']*')>(.*?)</a>.*?<td class="info"[^>]*style="text-align:left">([^<]+)</td>\s*<td class="info"><center>(.*?)</center>\s*</td>(.*?)(?:<td colspan="5" id="linha_(\d+)")"#,
        )
        .unwrap();
        let schedule_prefix_re = Regex::new(
            r"([2-7]{1,6}[MTN][1-6]{1,6})(?:\s*(\(\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4}\)))?",
        )
        .unwrap();
        let tag_strip_re = Regex::new(r#"<[^>]+>"#).unwrap();
        let turma_explicit_re = Regex::new(r"(?i)TURMA\s*[-–]?\s*([0-9]{1,3})").unwrap();
        let turma_short_re = Regex::new(r"(?i)\bT[-\s]?([0-9]{1,2})\s*$").unwrap();

        for cap in course_row_re.captures_iter(html) {
            let matched_name = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let clean_name = tag_strip_re
                .replace_all(matched_name, "")
                .trim()
                .to_string();
            let raw_name = clean_name.as_str();
            let raw_local = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_horario = cap.get(3).map(|m| m.as_str()).unwrap_or("").trim();
            let _row_tail = cap.get(4).map(|m| m.as_str()).unwrap_or("");
            let turma_id = cap.get(5).map(|m| m.as_str()).unwrap_or("").trim();

            let course_name = decode_html_entities(raw_name);
            let classroom = decode_html_entities(raw_local);

            // Limpa o HTML do horário (tag_strip + decode) e mantém apenas o prefixo
            // "TOKEN (dd/mm/aaaa - dd/mm/aaaa)", descartando o texto do popup de ajuda
            let horario_clean = decode_html_entities(
                &tag_strip_re
                    .replace_all(raw_horario, "")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" "),
            );
            let schedule = schedule_prefix_re
                .captures(&horario_clean)
                .map(|c| match c.get(2) {
                    Some(dates) => format!("{} {}", c.get(1).unwrap().as_str(), dates.as_str()),
                    None => c.get(1).unwrap().as_str().to_string(),
                })
                .unwrap_or_else(|| horario_clean.trim().to_string());

            // As faltas devem ser obtidas estritamente do Mapa de Frequências (AVA) ou do Boletim (Minhas Notas)
            let absences: Option<u32> = None;

            // Número da turma SIGAA (ex.: "CÁLCULO 2 - TURMA 3" ou sufixo "T3")
            let turma_label = if let Some(c) = turma_explicit_re.captures(raw_name) {
                Some(format!("Turma {}", c.get(1).unwrap().as_str()))
            } else {
                turma_short_re
                    .captures(raw_name)
                    .map(|c| format!("Turma {}", c.get(1).unwrap().as_str()))
            };

            let course_code = course_name.clone();

            let slots = Self::estimate_slots_from_schedule(&schedule);
            let credits = if slots > 0 { slots } else { 4 };
            let max_absences = Some(credits * 2 - 1);

            courses.push(Course {
                id: format!("sigaa-{}", turma_id),
                code: course_code,
                name: course_name,
                semester: current_semester.clone(),
                platform: PlatformType::Sigaa,
                professor: None,
                classroom: Some(classroom),
                schedule: Some(schedule),
                class_group: turma_label,
                unread_count: Some(0),
                pending_assignments_count: Some(0),
                url: Some(DISCENTE_URL.into()),
                absences,
                max_absences,
            });
        }

        // 3. Extração das atividades do semestre ("Minhas atividades")
        let ativ_re = Regex::new(
            r#"(?s)(\d{2}/\d{2}/\d{4})\s*</font>\s*</td>\s*<td>\s*<small>\s*<font[^>]*>\s*([^<]+)<br>\s*<strong>([^<]+)</strong>\s*([^<]+)"#,
        )
        .unwrap();

        for cap in ativ_re.captures_iter(html) {
            let raw_date = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_course = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_type = cap.get(3).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_name = cap.get(4).map(|m| m.as_str()).unwrap_or("").trim();

            let course_name = decode_html_entities(raw_course);
            let ativ_type = decode_html_entities(raw_type);
            let ativ_name = decode_html_entities(raw_name);

            let title = format!("{} {}", ativ_type, ativ_name).trim().to_string();
            let content = format!("{} - {}: {}", course_name, ativ_type, ativ_name);

            let due_date_iso = parse_br_date_to_iso(raw_date, true);
            let created_at_iso = parse_br_date_to_iso(raw_date, false);

            items.push(FeedItem {
                id: format!(
                    "sigaa-ativ-{}",
                    fnv1a_hash(&format!("{}-{}-{}", course_name, title, raw_date))
                ),
                platform: PlatformType::Sigaa,
                title,
                content,
                course_name: course_name.clone(),
                course_code: Some(course_name),
                author: None,
                item_type: FeedItemType::Assignment,
                created_at: created_at_iso,
                due_date: Some(due_date_iso),
                is_completed: Some(false),
                external_url: Some(DISCENTE_URL.into()),
            });
        }

        // 4. Extração das atualizações de turmas ("atualizacoes-turma" rotator)
        let rotator_re = Regex::new(
            r#"(?s)(\d{2}/\d{2}/\d{4})\s*-\s*<a [^>]*onclick="[^"]*idTurma[^"]*">([^<]+)</a>\s*</td>\s*</tr>\s*<tr>\s*<td>([^<]+)</td>"#,
        )
        .unwrap();

        for cap in rotator_re.captures_iter(html) {
            let raw_date = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_course = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_content = cap.get(3).map(|m| m.as_str()).unwrap_or("").trim();

            let course_full = decode_html_entities(raw_course);
            let content = decode_html_entities(raw_content);

            // Extrai o nome da disciplina removendo o sufixo "(2026.2)"
            let course_name = if let Some(idx) = course_full.find('(') {
                course_full[..idx].trim().to_string()
            } else {
                course_full.clone()
            };

            // Título completo — a UI trunca visualmente quando falta espaço
            let title = content.clone();

            let created_at_iso = parse_br_date_to_iso(raw_date, false);

            let is_assignment = content.to_lowercase().contains("prova")
                || content.to_lowercase().contains("trabalho")
                || content.to_lowercase().contains("tarefa");

            items.push(FeedItem {
                id: format!(
                    "sigaa-update-{}",
                    fnv1a_hash(&format!("{}-{}-{}", course_name, content, raw_date))
                ),
                platform: PlatformType::Sigaa,
                title,
                content,
                course_name: course_name.clone(),
                course_code: Some(course_name),
                author: None,
                item_type: if is_assignment {
                    FeedItemType::Assignment
                } else {
                    FeedItemType::Post
                },
                created_at: created_at_iso,
                due_date: None,
                is_completed: Some(false),
                external_url: Some(DISCENTE_URL.into()),
            });
        }

        // 5. Notícias gerais da instituição ("Mural SIGAA") foram desativadas
        // para manter o feed focado exclusivamente nas turmas e atividades do discente.

        // Ordena itens do feed por data decrescente
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok((items, courses))
    }
}

/// Converte data brasileira "dd/mm/aaaa" para string ISO 8601 (RFC 3339) com validação de calendário
fn parse_br_date_to_iso(date_str: &str, end_of_day: bool) -> String {
    if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str.trim(), "%d/%m/%Y") {
        if end_of_day {
            format!("{}T23:59:59Z", date)
        } else {
            format!("{}T12:00:00Z", date)
        }
    } else {
        chrono::Utc::now().to_rfc3339()
    }
}

/// Função de hash FNV-1a simples e rápida para identificadores estáveis
fn fnv1a_hash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Decodifica entidades HTML comuns em páginas legadas do SIGAA
fn decode_html_entities(input: &str) -> String {
    input
        .replace("&ccedil;", "ç")
        .replace("&Ccedil;", "Ç")
        .replace("&atilde;", "ã")
        .replace("&Atilde;", "Ã")
        .replace("&otilde;", "õ")
        .replace("&Otilde;", "Õ")
        .replace("&aacute;", "á")
        .replace("&Aacute;", "Á")
        .replace("&eacute;", "é")
        .replace("&Eacute;", "É")
        .replace("&iacute;", "í")
        .replace("&Iacute;", "Í")
        .replace("&oacute;", "ó")
        .replace("&Oacute;", "Ó")
        .replace("&uacute;", "ú")
        .replace("&Uacute;", "Ú")
        .replace("&acirc;", "â")
        .replace("&Acirc;", "Â")
        .replace("&ecirc;", "ê")
        .replace("&Ecirc;", "Ê")
        .replace("&icirc;", "î")
        .replace("&Icirc;", "Î")
        .replace("&ocirc;", "ô")
        .replace("&Ocirc;", "Ô")
        .replace("&ucirc;", "û")
        .replace("&Ucirc;", "Û")
        .replace("&#231;", "ç")
        .replace("&#199;", "Ç")
        .replace("&#227;", "ã")
        .replace("&#195;", "Ã")
        .replace("&#245;", "õ")
        .replace("&#213;", "Õ")
        .replace("&#225;", "á")
        .replace("&#193;", "Á")
        .replace("&#233;", "é")
        .replace("&#201;", "É")
        .replace("&#237;", "í")
        .replace("&#205;", "Í")
        .replace("&#243;", "ó")
        .replace("&#211;", "Ó")
        .replace("&#250;", "ú")
        .replace("&#218;", "Ú")
        .replace("&#226;", "â")
        .replace("&#194;", "Â")
        .replace("&#234;", "ê")
        .replace("&#202;", "Ê")
        .replace("&#244;", "ô")
        .replace("&#212;", "Ô")
        .replace("&#170;", "ª")
        .replace("&#186;", "º")
        .replace("&ordm;", "º")
        .replace("&ordf;", "ª")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#150;", "–")
        .replace("&amp;", "&")
}

/// Codifica bytes em base64 padrão (RFC 4648)
pub fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_cas_form_params() {
        let html = r##"
            <form id="login-form" action="/sso-server/login;jsessionid=123?service=sigaa" method="post">
                <input type="hidden" name="lt" value="LT-999-abc"/>
                <input type="hidden" name="execution" value="e1s1"/>
                <input type="hidden" name="_eventId" value="submit"/>
            </form>
        "##;

        let (action, lt, execution, event_id) = SigaaClient::extract_cas_form_params(html).unwrap();
        assert_eq!(
            action,
            "https://autenticacao.unb.br/sso-server/login;jsessionid=123?service=sigaa"
        );
        assert_eq!(lt, "LT-999-abc");
        assert_eq!(execution, "e1s1");
        assert_eq!(event_id, "submit");
    }

    #[test]
    fn test_extract_aviso_form_submit() {
        let html = r##"
            <form id="j_id_aviso" name="j_id_aviso" action="/sigaa/telaAvisoLogon.jsf" method="post">
                <input type="hidden" name="j_id_aviso" value="j_id_aviso"/>
                <input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="j_id1"/>
                <input type="submit" name="j_id_aviso:btn" value="Continuar &gt;&gt;"/>
            </form>
        "##;

        let (action, params) = SigaaClient::extract_aviso_form_submit(
            html,
            "https://sigaa.unb.br/sigaa/telaAvisoLogon.jsf",
        )
        .unwrap();
        assert_eq!(action, "https://sigaa.unb.br/sigaa/telaAvisoLogon.jsf");
        assert_eq!(params.get("j_id_aviso").unwrap(), "j_id_aviso");
        assert_eq!(params.get("javax.faces.ViewState").unwrap(), "j_id1");
        assert_eq!(params.get("j_id_aviso:btn").unwrap(), "Continuar &gt;&gt;");
    }

    #[test]
    fn test_parse_discente_html() {
        let html = r##"
            <table>
                <tr>
                    <td colspan="5" style="background: #C8D5EC; font-weight: bold; padding: 2px 0 2px 5px;">
                        2026.2
                    </td>
                </tr>
                <tr class="odd">
                    <td class="descricao">
                        <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual" method="post" action="/sigaa/portais/discente/discente.jsf">
                            <a href="#" onclick="if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('form_acessarTurmaVirtual'),{'frontEndIdTurma':'ABC'},'');}return false">FISICA 2</a>
                        </form>
                    </td>
                    <td class="info" style="text-align:left">BSA S B1 34/10</td>
                    <td class="info"><center>35T45 (10/08/2026 - 14/12/2026)



                                                <img src="/shared/img/geral/ajuda.gif" onMouseOver="document.getElementById('ajuda297063').style.visibility = 'visible';" onMouseOut="document.getElementById('ajuda297063').style.visibility = 'hidden';" border="0" >
<span style="position: absolute;">
	<div class="popUp"style="width: 190px; " onMouseOut="document.getElementById('ajuda297063').style.visibility = 'hidden';"id="ajuda297063">


                                                Ter&#231;a-feira 10:00 &#224;s 11:50<br />Quinta-feira 10:00 &#224;s 11:50  <br />
                                                </div>
</span>


                                        </center>
                                    </td>
                </tr>
                <tr>
                    <td colspan="5" id="linha_1614531" style="display: none;"></td>
                </tr>
            </table>

            <table>
                <tr class="odd">
                    <td class="descricao">
                        <form id="form_acessarTurmaVirtualj_id_1" name="form_acessarTurmaVirtualj_id_1" method="post" action="/sigaa/portais/discente/discente.jsf">
                            <a href="#" onclick="if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('form_acessarTurmaVirtualj_id_1'),{'frontEndIdTurma':'DEF'},'');}return false">CALCULO 3</a>
                        </form>
                    </td>
                    <td class="info" style="text-align:left">ICC BT 027</td>
                    <td class="info"><center>235M34



                                                <img src="/shared/img/geral/ajuda.gif" border="0" >
<span style="position: absolute;">
	<div class="popUp"style="width: 190px; ">


                                                Segunda-feira 10:00 &#224;s 11:50<br />
                                                </div>
</span>

                                        </center>
                                    </td>
                </tr>
                <tr>
                    <td colspan="5" id="linha_1614132" style="display: none;"></td>
                </tr>
            </table>

            <div id="atualizacoes-turma">
                <table>
                    <tr>
                        <td>
                            10/09/2026 - 
                            <a href="#" onclick="jsfcljs(..., {'idTurma':'1614531'})">FISICA 2 (2026.2)</a>
                        </td>
                    </tr>
                    <tr>
                        <td>Novo Vídeo: Linhas de fluxo</td>
                    </tr>
                </table>
            </div>

            <table>
                <tbody>
                    <tr>
                        <td>22/09/2026</font></td>
                        <td><small><font color="gray">FISICA 2<br><strong>Avaliação:</strong> 1ª Avaliação</small></td>
                    </tr>
                </tbody>
            </table>
        "##;

        let (items, courses) = SigaaClient::parse_discente_html(html).unwrap();

        assert_eq!(courses.len(), 2);
        assert_eq!(courses[0].id, "sigaa-1614531");
        assert_eq!(courses[0].name, "FISICA 2");
        assert_eq!(courses[0].semester, "2026.2");
        assert_eq!(courses[0].classroom.as_deref(), Some("BSA S B1 34/10"));
        assert_eq!(
            courses[0].schedule.as_deref(),
            Some("35T45 (10/08/2026 - 14/12/2026)")
        );
        assert_eq!(courses[0].max_absences, Some(7));

        // Segunda turma com célula de horário sem intervalo de datas
        assert_eq!(courses[1].id, "sigaa-1614132");
        assert_eq!(courses[1].name, "CALCULO 3");
        assert_eq!(courses[1].schedule.as_deref(), Some("235M34"));
        assert_eq!(courses[1].max_absences, Some(11));

        assert_eq!(items.len(), 2);
        let ativ = items
            .iter()
            .find(|i| matches!(i.item_type, FeedItemType::Assignment))
            .unwrap();
        assert_eq!(ativ.course_name, "FISICA 2");
        assert_eq!(ativ.title, "Avaliação: 1ª Avaliação");
        assert_eq!(ativ.due_date.as_deref(), Some("2026-09-22T23:59:59Z"));
        // Garante que nenhum item de Mural SIGAA foi extraído
        assert!(!items.iter().any(|i| i.course_name == "Mural SIGAA"));
    }

    #[test]
    fn test_parse_discente_html_ignores_mural_sigaa() {
        let html_with_mural = r##"
            <script type="text/javascript">
                var fcontent = new Array();
                fcontent[0] = "<span class=\"noticia-destaque\"><a id=\"noticia_1\" href=\"#\">Comunicado Importante</a></span><br><span class=\"descricao\"><a id=\"noticia_desc_1\" href=\"#\">Texto da noticia geral da UnB</a></span>";
            </script>
        "##;
        let (items, courses) = SigaaClient::parse_discente_html(html_with_mural).unwrap();
        assert_eq!(courses.len(), 0);
        assert_eq!(items.len(), 0);
        assert!(!items.iter().any(|i| i.course_name == "Mural SIGAA"));
    }

    #[test]
    fn test_apply_offer_link_preenche_codigo_turma_docente() {
        use crate::grade_scraper::{ScrapedClass, ScrapedDiscipline};

        let offer = vec![ScrapedDiscipline {
            code: "IFD0175".into(),
            name: "FÍSICA 2".into(),
            department_id: "123".into(),
            acronym: None,
            acronyms: vec![],
            classes: vec![
                ScrapedClass {
                    id: "IFD0175-01".into(),
                    discipline_code: "IFD0175".into(),
                    discipline_name: "FÍSICA 2".into(),
                    class_code: "01".into(),
                    teachers: vec!["Prof. Maria Ida".into()],
                    classroom: "BSA S B1 34/09".into(),
                    schedule_code: "24T34".into(),
                    schedule_description: None,
                    date_range: None,
                    schedule_slots: vec![],
                    vacancies: None,
                    occupied: None,
                },
                ScrapedClass {
                    id: "IFD0175-02".into(),
                    discipline_code: "IFD0175".into(),
                    discipline_name: "FÍSICA 2".into(),
                    class_code: "02".into(),
                    teachers: vec!["Prof. Ricardo Jacobi".into()],
                    classroom: "BSA S B1 34/10".into(),
                    schedule_code: "35T45".into(),
                    schedule_description: None,
                    date_range: None,
                    schedule_slots: vec![],
                    vacancies: None,
                    occupied: None,
                },
            ],
        }];

        let mut courses = vec![Course {
            id: "sigaa-1614531".into(),
            code: "FISICA 2".into(),
            name: "FISICA 2".into(),
            semester: "2026.2".into(),
            platform: crate::models::PlatformType::Sigaa,
            professor: None,
            classroom: Some("BSA S B1 34/10".into()),
            schedule: Some("35T45 (10/08/2026 - 14/12/2026)".into()),
            class_group: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: None,
            absences: Some(0),
            max_absences: None,
        }];

        SigaaClient::apply_offer_link(&mut courses, &offer);

        // Nome sem acento casa com "FÍSICA 2"; mesma sala desambigua a turma
        assert_eq!(courses[0].code, "IFD0175");
        assert_eq!(courses[0].class_group.as_deref(), Some("Turma 2"));
        assert_eq!(courses[0].professor.as_deref(), Some("Ricardo Jacobi"));
        // 35T45 -> 4 créditos -> regra UnB: créditos * 2 - 1 = 7 faltas
        assert_eq!(courses[0].max_absences, Some(7));

        // Sem candidato na oferta: nada muda
        let mut other = vec![Course {
            id: "sigaa-9".into(),
            code: "X".into(),
            name: "DISCIPLINA INEXISTENTE".into(),
            semester: "2026.2".into(),
            platform: crate::models::PlatformType::Sigaa,
            professor: None,
            classroom: None,
            schedule: Some("35T45".into()),
            class_group: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: None,
            absences: Some(0),
            max_absences: None,
        }];
        SigaaClient::apply_offer_link(&mut other, &offer);
        assert!(other[0].professor.is_none());
        assert!(other[0].class_group.is_none());
        assert_eq!(other[0].code, "X");
    }

    #[test]
    fn test_decode_html_entities_order() {
        assert_eq!(decode_html_entities("&amp;lt;"), "&lt;");
        assert_eq!(decode_html_entities("&lt;b&gt;UnB&lt;/b&gt;"), "<b>UnB</b>");
        assert_eq!(decode_html_entities("Aten&ccedil;&atilde;o"), "Atenção");
    }

    #[test]
    fn test_parse_br_date_to_iso() {
        assert_eq!(
            parse_br_date_to_iso("22/09/2026", true),
            "2026-09-22T23:59:59Z"
        );
        assert_eq!(
            parse_br_date_to_iso("22/09/2026", false),
            "2026-09-22T12:00:00Z"
        );
        // Data inválida cai no fallback sem pânico
        let invalid = parse_br_date_to_iso("32/13/2026", true);
        assert!(!invalid.is_empty());
    }

    #[tokio::test]
    #[ignore]
    async fn test_live_sync_sigaa() {
        if let (Ok(mat), Ok(pwd)) = (
            std::env::var("SIGAA_MATRICULA"),
            std::env::var("SIGAA_SENHA"),
        ) {
            let client = SigaaClient::new();
            let (page_html, _) = client.login_to_portal(&mat, &pwd).await.unwrap();
            std::fs::write("/tmp/discente_portal.html", &page_html).ok();

            let payload = client
                .fetch_discente_profile_and_historico(&mat, &pwd)
                .await
                .unwrap();
            println!("Profile: {:?}", payload.profile);
            println!("Has PDF: {}", payload.pdf_base64.is_some());
        }
    }

    #[test]
    fn test_parse_discente_profile() {
        let html = r##"
            <div id="agenda-docente">
                <h4> Dados Institucionais </h4>
                <table>
                    <tr>
                        <td> Matrícula: </td>
                        <td> 202000000 </td>
                    </tr>
                    <tr>
                        <td valign="top"> Curso: </td>
                        <td> ENGENHARIA DE COMPUTAÇÃO/CIC - Bacharelado - MT </td>
                    </tr>
                    <tr>
                        <td> Nível: </td>
                        <td> GRADUAÇÃO </td>
                    </tr>
                    <tr>
                        <td> Status: </td>
                        <td> ATIVO </td>
                    </tr>
                    <tr>
                        <td> Entrada: </td>
                        <td> 2022.1</td>
                    </tr>
                </table>
                <table>
                    <tr>
                        <td><acronym title="IRA">IRA:</acronym></td>
                        <td><div>3.6238</div></td>
                        <td><acronym title="MP">MP:</acronym></td>
                        <td><div>3.5493</div></td>
                    </tr>
                    <tr>
                        <td> CH. Obrigatória Pendente </td>
                        <td align="right"> 990 </td>
                    </tr>
                    <tr>
                        <td> CH. Optativa Pendente </td>
                        <td align="right"> 240 </td>
                    </tr>
                    <tr>
                        <td> CH. Total Currículo </td>
                        <td align="right"> 3480 </td>
                    </tr>
                    <tr>
                        <td> CH. Complementar Pendente </td>
                        <td align="right"> 0 </td>
                    </tr>
                    <tr>
                        <td colspan="2"> 65% Integralizado </td>
                    </tr>
                </table>
            </div>
        "##;

        let profile = SigaaClient::parse_discente_profile(html, "202000000");
        assert_eq!(profile.matricula, "202000000");
        assert_eq!(profile.course, "ENGENHARIA DE COMPUTAÇÃO");
        // Turno anexado pelo SIGAA ao campo Curso (último segmento após " - ")
        assert_eq!(profile.shift.as_deref(), Some("MT"));
        assert_eq!(profile.level, "GRADUAÇÃO");
        assert_eq!(profile.status, "ATIVO");
        assert_eq!(profile.admission_semester, "2022.1");
        assert_eq!(profile.ira, Some(3.6238));
        assert_eq!(profile.mp, Some(3.5493));
        assert_eq!(profile.pending_mandatory_hours, Some(990));
        assert_eq!(profile.pending_elective_hours, Some(240));

        // Suporta vírgula decimal pt-BR (ex: "3,6238")
        let html_comma = html.replace("3.6238", "3,6238").replace("3.5493", "3,5493");
        let profile_comma = SigaaClient::parse_discente_profile(&html_comma, "202000000");
        assert_eq!(profile_comma.ira, Some(3.6238));
        assert_eq!(profile_comma.mp, Some(3.5493));
        assert_eq!(profile_comma.total_curriculum_hours, Some(3480));
        assert_eq!(profile_comma.pending_complementary_hours, Some(0));
        assert_eq!(profile_comma.completed_percentage, Some(65.0));
    }

    #[test]
    fn test_parse_discente_profile_shift() {
        // Turno explícito de curso ofertado em diurno e noturno: é o que
        // impede o casamento com o curso homônimo de outro turno no catálogo.
        let html_noturno = r##"
            <div id="agenda-docente">
                <table>
                    <tr>
                        <td valign="top"> Curso: </td>
                        <td> FARMÁCIA/CBC - Bacharelado - N </td>
                    </tr>
                </table>
            </div>
        "##;
        let profile = SigaaClient::parse_discente_profile(html_noturno, "202000000");
        assert_eq!(profile.course, "FARMÁCIA");
        assert_eq!(profile.shift.as_deref(), Some("N"));

        // Turno entre parênteses e curso sem turno nenhum
        let html_parenteses = r##"
            <div id="agenda-docente">
                <table>
                    <tr>
                        <td valign="top"> Curso: </td>
                        <td> ENFERMAGEM (DIURNO)/CBS - Bacharelado </td>
                    </tr>
                </table>
            </div>
        "##;
        let profile = SigaaClient::parse_discente_profile(html_parenteses, "202000000");
        assert_eq!(profile.course, "ENFERMAGEM");
        assert_eq!(profile.shift.as_deref(), Some("DIURNO"));

        let html_sem_turno = r##"
            <div id="agenda-docente">
                <table>
                    <tr>
                        <td valign="top"> Curso: </td>
                        <td> ADMINISTRAÇÃO/RAV </td>
                    </tr>
                </table>
            </div>
        "##;
        let profile = SigaaClient::parse_discente_profile(html_sem_turno, "202000000");
        assert_eq!(profile.course, "ADMINISTRAÇÃO");
        assert_eq!(profile.shift, None);
    }

    #[test]
    fn test_extract_absences_from_ava_html() {
        let html_label = r#"
            <div id="dados-turma">
                <table>
                    <tr><td>Docente:</td><td>Prof. Fulano</td></tr>
                    <tr><td>Total de Faltas (h):</td><td>4</td></tr>
                </table>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_label),
            Some(4)
        );

        let html_span = r#"
            <div class="info-frequencia">
                <span>Faltas:</span> <span>2</span>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_span),
            Some(2)
        );

        let html_numero = r#"
            <div>Número de Faltas: <strong>6</strong></div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_numero),
            Some(6)
        );

        let html_zero = r#"
            <tr><td>Total de Faltas:</td><td>0</td></tr>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_zero),
            Some(0)
        );

        let html_vazio = r#"<div>Nenhum dado encontrado</div>"#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_vazio),
            None
        );

        // Teste com a tabela real do extrato de frequência do SIGAA (conforme screenshot do usuário: 3 registros de 2 Falta(s) = 6 faltas)
        let html_tabela_usuario = r#"
            <table class="listagem">
                <thead>
                    <tr><th>Data</th><th>Situação</th></tr>
                </thead>
                <tbody>
                    <tr><td>10/08/2026</td><td>Presente</td></tr>
                    <tr><td>11/08/2026</td><td>Presente</td></tr>
                    <tr><td>13/08/2026</td><td>2 Falta(s)</td></tr>
                    <tr><td>17/08/2026</td><td>Presente</td></tr>
                    <tr><td>18/08/2026</td><td>Presente</td></tr>
                    <tr><td>20/08/2026</td><td>Presente</td></tr>
                    <tr><td>24/08/2026</td><td>Presente</td></tr>
                    <tr><td>25/08/2026</td><td>Presente</td></tr>
                    <tr><td>27/08/2026</td><td>Presente</td></tr>
                    <tr><td>31/08/2026</td><td>Presente</td></tr>
                    <tr><td>01/09/2026</td><td>Presente</td></tr>
                    <tr><td>03/09/2026</td><td>Presente</td></tr>
                    <tr><td>08/09/2026</td><td>Presente</td></tr>
                    <tr><td>10/09/2026</td><td>Presente</td></tr>
                    <tr><td>14/09/2026</td><td>Presente</td></tr>
                    <tr><td>15/09/2026</td><td>Presente</td></tr>
                    <tr><td>17/09/2026</td><td>Presente</td></tr>
                    <tr><td>28/09/2026</td><td>Presente</td></tr>
                    <tr><td>29/09/2026</td><td>Presente</td></tr>
                    <tr><td>01/10/2026</td><td>2 Falta(s)</td></tr>
                    <tr><td>05/10/2026</td><td>Presente</td></tr>
                    <tr><td>06/10/2026</td><td>Presente</td></tr>
                    <tr><td>08/10/2026</td><td>Presente</td></tr>
                    <tr><td>13/10/2026</td><td>Presente</td></tr>
                    <tr><td>15/10/2026</td><td>2 Falta(s)</td></tr>
                    <tr><td>19/10/2026</td><td>Presente</td></tr>
                    <tr><td>20/10/2026</td><td>Presente</td></tr>
                    <tr><td>22/10/2026</td><td>Presente</td></tr>
                    <tr><td>26/10/2026</td><td>Presente</td></tr>
                    <tr><td>27/10/2026</td><td>Presente</td></tr>
                    <tr><td>29/10/2026</td><td>Presente</td></tr>
                    <tr><td>03/11/2026</td><td>Presente</td></tr>
                    <tr><td>05/11/2026</td><td>Presente</td></tr>
                </tbody>
            </table>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_tabela_usuario),
            Some(6)
        );

        // Teste de tabela de frequência onde todas as aulas constam como Presente (0 faltas)
        let html_tabela_presente = r#"
            <table>
                <tr><th>Data</th><th>Situação</th></tr>
                <tr><td>10/08/2026</td><td>Presente</td></tr>
                <tr><td>13/08/2026</td><td>Presente</td></tr>
            </table>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_tabela_presente),
            Some(0)
        );

        // Teste com faltas não-numeradas contendo tags internas (ex: <font> ou <span>)
        let html_tabela_tags = r#"
            <table>
                <tr><th>Data</th><th>Situação</th></tr>
                <tr><td>10/08/2026</td><td><span class="destaque">Falta</span></td></tr>
                <tr><td>13/08/2026</td><td><font color="red">Falta(s)</font></td></tr>
            </table>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_tabela_tags),
            Some(2)
        );

        // Teste com padrão "Falta: 2" ou "Falta (2)"
        let html_parenteses = r#"
            <table>
                <tr><td>01/10/2026</td><td>Falta (2)</td></tr>
                <tr><td>15/10/2026</td><td>Falta: 2</td></tr>
            </table>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_parenteses),
            Some(4)
        );

        // Teste com a tela real do Mapa de Frequências (screenshot do usuário: EPR0068 - ORGANIZAÇÃO INDUSTRIAL)
        // Linha com "4 Falta(s)" e resumo com 28 presenças / 32 aulas
        let html_epr0068 = r#"
            <div id="conteudo">
                <h2>MAPA DE FREQUÊNCIAS</h2>
                <table class="listagem">
                    <thead>
                        <tr><th>Data</th><th>Situação</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>12/08/2026</td><td>Presente</td></tr>
                        <tr><td>19/08/2026</td><td>Presente</td></tr>
                        <tr><td>26/08/2026</td><td>Presente</td></tr>
                        <tr><td>02/09/2026</td><td>Presente</td></tr>
                        <tr><td>09/09/2026</td><td>Presente</td></tr>
                        <tr><td>16/09/2026</td><td>Presente</td></tr>
                        <tr><td>23/09/2026</td><td>Presente</td></tr>
                        <tr><td>30/09/2026</td><td>Presente</td></tr>
                        <tr><td>07/10/2026</td><td>Presente</td></tr>
                        <tr><td>14/10/2026</td><td>Presente</td></tr>
                        <tr><td>21/10/2026</td><td>4 Falta(s)</td></tr>
                        <tr><td>28/10/2026</td><td><span style="color:red">Não Registrada</span></td></tr>
                        <tr><td>04/11/2026</td><td><span style="color:red">Não Registrada</span></td></tr>
                    </tbody>
                </table>
                <p>Presenças Registradas: 28</p>
                <p>Número de Aulas com Registro de Frequência: 32</p>
                <p>Porcentagem de Frequência em relação as Aulas com Registro de Frequência: 87%</p>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_epr0068),
            Some(4)
        );

        // Teste apenas com o resumo de frequência (sem a tabela diária)
        let html_resumo_puro = r#"
            <div>
                <h3>MAPA DE FREQUÊNCIAS</h3>
                <p>Presenças Registradas: 28</p>
                <p>Número de Aulas com Registro de Frequência: 32</p>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_resumo_puro),
            Some(4)
        );

        // Teste com a tela real do Mapa de Frequências de MAT0027 - CÁLCULO 3 (screenshot do usuário)
        // 3 datas com "2 Falta(s)" (13/08, 01/10, 15/10) e "Presenças Registradas: 92" -> total 6 faltas
        let html_calculo_3 = r#"
            <div id="conteudo">
                <h2>MAPA DE FREQUÊNCIAS</h2>
                <table class="listagem">
                    <thead><tr><th>Data</th><th>Situação</th></tr></thead>
                    <tbody>
                        <tr><td>10/08/2026</td><td>Presente</td></tr>
                        <tr><td>11/08/2026</td><td>Presente</td></tr>
                        <tr><td>13/08/2026</td><td>2 Falta(s)</td></tr>
                        <tr><td>17/08/2026</td><td>Presente</td></tr>
                        <tr><td>18/08/2026</td><td>Presente</td></tr>
                        <tr><td>28/09/2026</td><td>Presente</td></tr>
                        <tr><td>29/09/2026</td><td>Presente</td></tr>
                        <tr><td>01/10/2026</td><td>2 Falta(s)</td></tr>
                        <tr><td>05/10/2026</td><td>Presente</td></tr>
                        <tr><td>13/10/2026</td><td>Presente</td></tr>
                        <tr><td>15/10/2026</td><td>2 Falta(s)</td></tr>
                        <tr><td>19/10/2026</td><td>Presente</td></tr>
                        <tr><td>05/11/2026</td><td>Presente</td></tr>
                    </tbody>
                </table>
                <p>Presenças Registradas: 92</p>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_calculo_3),
            Some(6)
        );
    }

    #[test]
    fn test_extract_jsf_params_from_onclick_whitespace() {
        // Testa jsfcljs com espaços após a vírgula (padrão de JSF em navegadores)
        let onclick_com_espacos = "if(typeof jsfcljs == 'function'){jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'form_acessarTurmaVirtual:j_id1': 'form_acessarTurmaVirtual:j_id1', 'frontEndIdTurma': 'ABC123'}, '');}return false";
        let params = SigaaClient::extract_jsf_params_from_onclick(onclick_com_espacos);
        assert_eq!(
            params.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("ABC123")
        );
        assert_eq!(
            params
                .get("form_acessarTurmaVirtual:j_id1")
                .map(|s| s.as_str()),
            Some("form_acessarTurmaVirtual:j_id1")
        );
    }

    #[test]
    fn test_extract_course_access_form_params_proximity() {
        let portal_html = r##"
            <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual" method="post" action="/sigaa/portais/discente/discente.jsf">
                <input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="vs_test_123"/>
                <table>
                    <tr class="odd">
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'form_link_0': 'form_link_0', 'frontEndIdTurma': 'PARAM_TURMA_A'}, '');">CALCULO 1</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_999888" style="display: none;"></td></tr>
                    <tr class="even">
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'form_link_1': 'form_link_1', 'frontEndIdTurma': 'PARAM_TURMA_B'}, '');">FISICA 1</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_111222" style="display: none;"></td></tr>
                </table>
            </form>
        "##;

        // Deve extrair PARAM_TURMA_A para linha 999888 mesmo que o onclick não contenha 999888
        let params_a =
            SigaaClient::extract_course_access_form_params(portal_html, "999888", "CALCULO 1");
        assert_eq!(
            params_a.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("PARAM_TURMA_A")
        );
        assert_eq!(
            params_a.get("form_link_0").map(|s| s.as_str()),
            Some("form_link_0")
        );
        assert_eq!(
            params_a.get("javax.faces.ViewState").map(|s| s.as_str()),
            Some("vs_test_123")
        );

        // Deve extrair PARAM_TURMA_B para linha 111222
        let params_b =
            SigaaClient::extract_course_access_form_params(portal_html, "111222", "FISICA 1");
        assert_eq!(
            params_b.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("PARAM_TURMA_B")
        );
        assert_eq!(
            params_b.get("form_link_1").map(|s| s.as_str()),
            Some("form_link_1")
        );
    }

    #[test]
    fn test_parse_minhas_notas_html_standard() {
        let html_boletim = r##"
            <table class="listagem">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Componente Curricular</th>
                        <th>Turma</th>
                        <th>CH</th>
                        <th>Faltas</th>
                        <th>Situação</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="linhaPar">
                        <td>MAT0027</td>
                        <td>CÁLCULO 3</td>
                        <td>01</td>
                        <td>60h</td>
                        <td>6</td>
                        <td>MATRICULADO</td>
                    </tr>
                    <tr class="linhaImpar">
                        <td>ENE0066</td>
                        <td>INTRODUÇÃO AOS CIRCUITOS ELÉTRICOS</td>
                        <td>01</td>
                        <td>60h</td>
                        <td>0</td>
                        <td>MATRICULADO</td>
                    </tr>
                    <tr class="linhaPar">
                        <td>EPR0068</td>
                        <td>ORGANIZAÇÃO INDUSTRIAL</td>
                        <td>01</td>
                        <td>60h</td>
                        <td>2</td>
                        <td>MATRICULADO</td>
                    </tr>
                </tbody>
            </table>
        "##;

        let map = SigaaClient::parse_minhas_notas_html(html_boletim);
        assert_eq!(map.get("CALCULO 3"), Some(&6));
        assert_eq!(map.get("MAT0027"), Some(&6));
        assert_eq!(map.get("INTRODUCAO AOS CIRCUITOS ELETRICOS"), Some(&0));
        assert_eq!(map.get("ENE0066"), Some(&0));
        assert_eq!(map.get("ORGANIZACAO INDUSTRIAL"), Some(&2));
        assert_eq!(map.get("EPR0068"), Some(&2));
    }

    #[test]
    fn test_parse_minhas_notas_html_nested_and_combined_code() {
        let html_boletim_nested = r##"
            <table class="tabelaRelatorio">
                <thead>
                    <tr class="header">
                        <th><b>Componente Curricular</b></th>
                        <th><b>Turma</b></th>
                        <th><b>Total de Faltas</b></th>
                        <th><b>Situação</b></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><a href="#">MAT0027 - CÁLCULO 3</a></td>
                        <td><center>01</center></td>
                        <td><center><font color="red">6</font></center></td>
                        <td>MATRICULADO</td>
                    </tr>
                    <tr>
                        <td><a href="#">ENE0066 – INTRODUÇÃO AOS CIRCUITOS ELÉTRICOS</a></td>
                        <td><center>01</center></td>
                        <td><center>0</center></td>
                        <td>MATRICULADO</td>
                    </tr>
                </tbody>
            </table>
        "##;

        let map = SigaaClient::parse_minhas_notas_html(html_boletim_nested);
        assert_eq!(map.get("CALCULO 3"), Some(&6));
        assert_eq!(map.get("MAT0027"), Some(&6));
        assert_eq!(map.get("INTRODUCAO AOS CIRCUITOS ELETRICOS"), Some(&0));
        assert_eq!(map.get("ENE0066"), Some(&0));
    }

    #[test]
    fn test_extract_courses_access_map_multi() {
        let portal_html = r##"
            <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual" method="post" action="/sigaa/portais/discente/discente.jsf">
                <input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="vs_global_456"/>
                <table>
                    <tr>
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'link_calc': 'link_calc', 'frontEndIdTurma': 'ID_CALC_3'}, '');">CÁLCULO 3</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_1001" style="display: none;"></td></tr>
                    <tr>
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'link_circ': 'link_circ', 'frontEndIdTurma': 'ID_CIRC'}, '');">ENE0066 - INTRODUÇÃO AOS CIRCUITOS ELÉTRICOS</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_1002" style="display: none;"></td></tr>
                    <tr>
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'link_org': 'link_org', 'frontEndIdTurma': 'ID_ORG'}, '');">EPR0068 - ORGANIZAÇÃO INDUSTRIAL</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_1003" style="display: none;"></td></tr>
                </table>
            </form>
        "##;

        let map = SigaaClient::extract_courses_access_map(portal_html);

        // Deve indexar por turma_id
        let params_1001 = map.get("1001").unwrap();
        assert_eq!(
            params_1001.1.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("ID_CALC_3")
        );
        assert_eq!(
            params_1001.1.get("link_calc").map(|s| s.as_str()),
            Some("link_calc")
        );
        assert_eq!(
            params_1001
                .1
                .get("javax.faces.ViewState")
                .map(|s| s.as_str()),
            Some("vs_global_456")
        );

        let params_1002 = map.get("1002").unwrap();
        assert_eq!(
            params_1002.1.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("ID_CIRC")
        );

        let params_1003 = map.get("1003").unwrap();
        assert_eq!(
            params_1003.1.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("ID_ORG")
        );

        // Deve indexar também por nome normalizado da disciplina
        assert!(map.contains_key("CALCULO 3"));
        assert!(map.contains_key("ID_ORG"));
        assert!(map.contains_key("EPR0068"));
        assert!(map.contains_key("ORGANIZACAO INDUSTRIAL"));
    }

    #[test]
    fn test_extract_attribute_value() {
        let attrs = r##"href="#" onclick="jsfcljs(document.getElementById('formMenu'),{'formMenu:j_id123':'formMenu:j_id123'},'');" title="Frequência""##;
        assert_eq!(
            SigaaClient::extract_attribute_value(attrs, "title").as_deref(),
            Some("Frequência")
        );
        assert!(SigaaClient::extract_attribute_value(attrs, "onclick")
            .unwrap()
            .contains("jsfcljs"));
        assert_eq!(
            SigaaClient::extract_attribute_value(attrs, "href").as_deref(),
            Some("#")
        );
    }

    #[test]
    fn test_extract_absences_from_ava_html_zero_faltas() {
        let html_zero = r#"
            <div id="mapa-frequencia">
                <h2>Mapa de Frequências</h2>
                <table class="listagem">
                    <tr><td>12/08/2026</td><td>Presente</td></tr>
                    <tr><td>19/08/2026</td><td>Presente</td></tr>
                </table>
                <p>Presenças Registradas: 30</p>
                <p>Número de Aulas com Registro de Frequência: 30</p>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_zero),
            Some(0)
        );

        let html_empty = r#"
            <h2>Mapa de Frequências</h2>
            <p>Nenhum registro de frequência lançado até o momento.</p>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_empty),
            Some(0)
        );

        let html_uppercase = r#"
            <div id="conteudo">
                <h2>MAPA DE FREQUÊNCIAS</h2>
                <p>Nenhum registro de frequência cadastrado para este discente.</p>
            </div>
        "#;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(html_uppercase),
            Some(0)
        );
    }

    #[test]
    fn test_extract_course_access_form_params_full() {
        let portal_html = r##"
            <form id="form_acessarTurmaVirtual" name="form_acessarTurmaVirtual" method="post" action="/sigaa/portais/discente/discente.jsf">
                <input type="hidden" name="javax.faces.ViewState" value="vs_calc3_test"/>
                <table>
                    <tr>
                        <td>
                            <a href="#" onclick="jsfcljs(document.getElementById('form_acessarTurmaVirtual'), {'form_acessarTurmaVirtual:j_id_1': 'form_acessarTurmaVirtual:j_id_1', 'frontEndIdTurma': '1614132'}, '');">CÁLCULO 3</a>
                        </td>
                    </tr>
                    <tr><td colspan="5" id="linha_1614132" style="display: none;"></td></tr>
                </table>
            </form>
        "##;

        let (form_id, target_url, params) = SigaaClient::extract_course_access_form_params_full(
            portal_html,
            "1614132",
            "CÁLCULO 3",
        );
        assert_eq!(form_id, "form_acessarTurmaVirtual");
        assert_eq!(
            target_url,
            "https://sigaa.unb.br/sigaa/portais/discente/discente.jsf"
        );
        assert_eq!(
            params
                .get("form_acessarTurmaVirtual:j_id_1")
                .map(|s| s.as_str()),
            Some("form_acessarTurmaVirtual:j_id_1")
        );
        assert_eq!(
            params.get("frontEndIdTurma").map(|s| s.as_str()),
            Some("1614132")
        );
        assert_eq!(
            params.get("javax.faces.ViewState").map(|s| s.as_str()),
            Some("vs_calc3_test")
        );
    }

    #[test]
    fn test_extract_frequencia_menu_item() {
        let ava_html = r##"
            <form id="formMenu" name="formMenu" method="post" action="/sigaa/ava/index.jsf">
                <input type="hidden" name="javax.faces.ViewState" value="vs_menu_test_789"/>
                <ul>
                    <li>
                        <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),{'formMenu:j_id_principal':'formMenu:j_id_principal'},'');">Principal</a>
                    </li>
                    <li>
                        <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),{'formMenu:j_id_avisos':'formMenu:j_id_avisos'},'');">Avisos</a>
                    </li>
                    <li>
                        <a href="#" onclick="jsfcljs(document.getElementById('formMenu'),{'formMenu:j_id_freq':'formMenu:j_id_freq'},'');"><span>Frequência</span></a>
                    </li>
                </ul>
            </form>
        "##;

        let (form_id, action_url, params) =
            SigaaClient::extract_frequencia_menu_item(ava_html).unwrap();
        assert_eq!(form_id, "formMenu");
        assert_eq!(action_url, "https://sigaa.unb.br/sigaa/ava/index.jsf");
        assert_eq!(
            params.get("formMenu:j_id_freq").map(|s| s.as_str()),
            Some("formMenu:j_id_freq")
        );
        // Não deve pegar o onclick do Principal ou Avisos
        assert!(!params.contains_key("formMenu:j_id_principal"));
        assert!(!params.contains_key("formMenu:j_id_avisos"));
        assert_eq!(
            params.get("javax.faces.ViewState").map(|s| s.as_str()),
            Some("vs_menu_test_789")
        );
    }

    #[test]
    fn test_extract_absences_from_ava_dashboard_returns_none() {
        // O dashboard do AVA contém avisos, menu com "Frequência" e textos como "o presente semestre", "Data de postagem", etc.
        // NUNCA deve retornar Some(0) para o dashboard do AVA!
        let ava_dashboard_html = r##"
            <html>
                <head><title>Turma Virtual - CÁLCULO 3</title></head>
                <body>
                    <div id="menu">
                        <a href="#">Frequência</a>
                    </div>
                    <div id="conteudo">
                        <h2>Avisos do Docente</h2>
                        <p>No presente semestre as aulas serão presenciais. Data de início: 10/08/2026.</p>
                        <p>A situação dos matriculados foi atualizada.</p>
                    </div>
                </body>
            </html>
        "##;
        assert_eq!(
            SigaaClient::extract_absences_from_ava_html(ava_dashboard_html),
            None
        );
    }

    #[test]
    fn test_apply_offer_link_calculo_3_with_3_days_schedule() {
        use crate::grade_scraper::{ScrapedClass, ScrapedDiscipline};

        let offer = vec![ScrapedDiscipline {
            code: "MAT0027".into(),
            name: "CÁLCULO 3".into(),
            department_id: "MAT".into(),
            acronym: None,
            acronyms: vec![],
            classes: vec![
                ScrapedClass {
                    id: "MAT0027-01".into(),
                    discipline_code: "MAT0027".into(),
                    discipline_name: "CÁLCULO 3".into(),
                    class_code: "01".into(),
                    teachers: vec!["LUIZ CLAUDIO PEREIRA".into()],
                    classroom: "FUP UEP AT-79/11".into(),
                    schedule_code: "2M1234 4M12".into(),
                    schedule_description: None,
                    date_range: None,
                    schedule_slots: vec![],
                    vacancies: None,
                    occupied: None,
                },
                ScrapedClass {
                    id: "MAT0027-02".into(),
                    discipline_code: "MAT0027".into(),
                    discipline_name: "CÁLCULO 3".into(),
                    class_code: "02".into(),
                    teachers: vec!["LINEU DA COSTA ARAUJO NETO".into()],
                    classroom: "ICC BT 027".into(),
                    schedule_code: "235M34".into(),
                    schedule_description: None,
                    date_range: None,
                    schedule_slots: vec![],
                    vacancies: None,
                    occupied: None,
                },
            ],
        }];

        let mut courses = vec![Course {
            id: "sigaa-1614132".into(),
            code: "CÁLCULO 3".into(),
            name: "CÁLCULO 3".into(),
            semester: "2026.2".into(),
            platform: crate::models::PlatformType::Sigaa,
            professor: None,
            classroom: Some("ICC BT 027".into()),
            schedule: Some("235M34 (10/08/2026 - 14/12/2026)".into()),
            class_group: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: None,
            absences: None,
            max_absences: None,
        }];

        SigaaClient::apply_offer_link(&mut courses, &offer);

        assert_eq!(courses[0].code, "MAT0027");
        assert_eq!(courses[0].class_group.as_deref(), Some("Turma 2"));
        assert_eq!(
            courses[0].professor.as_deref(),
            Some("LINEU DA COSTA ARAUJO NETO")
        );
        // 235M34 -> 3 dias * 2 horários = 6 créditos -> regra UnB: 6 * 2 - 1 = 11 faltas
        assert_eq!(courses[0].max_absences, Some(11));
    }
}
