use crate::models::{
    Course, DiscenteAcademicHistoryPayload, DiscenteProfile, FeedItem, FeedItemType, PlatformType,
};
use chrono::Datelike;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, REFERER, USER_AGENT};
use std::collections::HashMap;

const USER_AGENT_STR: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CAS_LOGIN_URL: &str = "https://autenticacao.unb.br/sso-server/login?service=https%3A%2F%2Fsig.unb.br%2Fsigaa%2Flogin%2Fcas";
const DISCENTE_URL: &str = "https://sigaa.unb.br/sigaa/portais/discente/discente.jsf";

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

    /// Sincroniza o SIGAA realizando o login CAS SSO, avançando por telas de aviso (telaAvisoLogon.jsf)
    /// e extraindo as disciplinas matriculadas, atividades e avisos do portal discente.
    /// Realiza a autenticação CAS SSO, contorna eventuais telas de aviso e garante que o portal discente esteja carregado
    pub async fn login_to_portal(
        &self,
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
        let res_cas = self
            .client
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

        let res_login = self
            .client
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
                let res_aviso = self
                    .client
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
            let res_portal = self
                .client
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

    /// Extrai o token de horário (ex.: "35T45") do campo de horário do portal
    fn extract_schedule_token(schedule: &str) -> Option<String> {
        let re = Regex::new(r"(\d{1,2}[MTN]\d{2,4})").unwrap();
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
        let mut s = name.trim();
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
                s = s[prefix.len()..].trim_start();
                break;
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
            // Já linkado em sync anterior: nada a fazer
            if course.professor.is_some() && course.turma.is_some() {
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
                            .map(|l| Self::normalize_discipline_name(&c.classroom) == l)
                            .unwrap_or(false)
                    })
                    .copied()
            } else {
                None
            };

            let (Some(class), Some(code)) = (linked, linked_code) else {
                continue;
            };

            course.code = code.to_string();
            if course.turma.is_none() {
                course.turma = Some(Self::turma_label_from_class_code(&class.class_code));
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

    pub async fn sync_sigaa(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<(Vec<FeedItem>, Vec<Course>), String> {
        let (page_html, _aviso_item) = self.login_to_portal(matricula, senha).await?;
        // O aviso institucional de logon ("Aviso Geral UnB") é intencionalmente ignorado no feed
        let (feed_items, courses) = Self::parse_discente_html(&page_html)?;
        // Linka código/turma/docente com a oferta de turmas (dataset estático),
        // sem precisar abrir a aba Participantes de cada disciplina
        let courses = Self::enrich_courses_with_offer(courses).await;

        log::info!(
            "[SigaaClient] Sincronização concluída com sucesso: {} turmas e {} itens de feed.",
            courses.len(),
            feed_items.len()
        );

        Ok((feed_items, courses))
    }

    /// Realiza o parse das informações cadastrais do aluno da caixa institucional (agenda-docente)
    pub fn parse_discente_profile(html: &str, default_matricula: &str) -> DiscenteProfile {
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

        DiscenteProfile {
            matricula,
            nome,
            curso,
            turno,
            nivel,
            status,
            entrada,
            email,
            ira,
            mp,
            ch_obrigatoria_pendente,
            ch_optativa_pendente,
            ch_total_curriculo,
            ch_complementar_pendente,
            percentual_integralizado,
        }
    }

    /// Emite o Histórico Escolar oficial do discente e extrai os dados cadastrais
    pub async fn fetch_discente_profile_and_historico(
        &self,
        matricula: &str,
        senha: &str,
    ) -> Result<DiscenteAcademicHistoryPayload, String> {
        let (page_html, _) = self.login_to_portal(matricula, senha).await?;
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
        let res_hist = self
            .client
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

        if !bytes.starts_with(b"%PDF") {
            log::warn!("[SigaaClient] Resposta do histórico não iniciou com %PDF.");
            return Ok(DiscenteAcademicHistoryPayload {
                profile,
                pdf_base64: None,
                pdf_text: None,
            });
        }

        log::info!(
            "[SigaaClient] Histórico escolar obtido com sucesso em formato PDF ({} bytes).",
            bytes.len()
        );

        // Extrai o texto aqui no Rust: o parse no webview derrubava o WebProcess.
        let pdf_text = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| {
                log::warn!("[SigaaClient] Falha ao extrair texto do PDF: {}", e);
                e
            })
            .ok();

        Ok(DiscenteAcademicHistoryPayload {
            profile,
            // Base64 só como fallback quando a extração falhou: com texto
            // disponível, o payload IPC fica leve — vários MB de base64+texto
            // atravessando a fronteira estouravam o webview.
            pdf_base64: if pdf_text.is_some() {
                None
            } else {
                Some(base64_encode(&bytes))
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
        let course_row_re = Regex::new(
            r#"(?s)<form id="form_acessarTurmaVirtual[^"]*"[^>]*>.*?<a [^>]*onclick="[^"]*frontEndIdTurma[^"]*">([^<]+)</a>.*?<td class="info"[^>]*style="text-align:left">([^<]+)</td>\s*<td class="info"><center>([^<]+).*?<td colspan="5" id="linha_(\d+)""#,
        )
        .unwrap();
        let turma_explicit_re = Regex::new(r"(?i)TURMA\s*[-–]?\s*([0-9]{1,3})").unwrap();
        let turma_short_re = Regex::new(r"(?i)\bT[-\s]?([0-9]{1,2})\s*$").unwrap();

        for cap in course_row_re.captures_iter(html) {
            let raw_name = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_local = cap.get(2).map(|m| m.as_str()).unwrap_or("").trim();
            let raw_horario = cap.get(3).map(|m| m.as_str()).unwrap_or("").trim();
            let turma_id = cap.get(4).map(|m| m.as_str()).unwrap_or("").trim();

            let course_name = decode_html_entities(raw_name);
            let classroom = decode_html_entities(raw_local);
            let schedule = decode_html_entities(raw_horario);

            // Número da turma SIGAA (ex.: "CÁLCULO 2 - TURMA 3" ou sufixo "T3")
            let turma_label = if let Some(c) = turma_explicit_re.captures(raw_name) {
                Some(format!("Turma {}", c.get(1).unwrap().as_str()))
            } else {
                turma_short_re
                    .captures(raw_name)
                    .map(|c| format!("Turma {}", c.get(1).unwrap().as_str()))
            };

            let course_code = course_name.clone();

            courses.push(Course {
                id: format!("sigaa-{}", turma_id),
                code: course_code,
                name: course_name,
                semester: current_semester.clone(),
                platform: PlatformType::Sigaa,
                professor: None,
                classroom: Some(classroom),
                schedule: Some(schedule),
                turma: turma_label,
                unread_count: Some(0),
                pending_assignments_count: Some(0),
                url: Some(DISCENTE_URL.into()),
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
                    <td class="info"><center>35T45 (10/08/2026 - 14/12/2026)</center></td>
                </tr>
                <tr>
                    <td colspan="5" id="linha_1614531" style="display: none;"></td>
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

        assert_eq!(courses.len(), 1);
        assert_eq!(courses[0].id, "sigaa-1614531");
        assert_eq!(courses[0].name, "FISICA 2");
        assert_eq!(courses[0].semester, "2026.2");
        assert_eq!(courses[0].classroom.as_deref(), Some("BSA S B1 34/10"));
        assert_eq!(
            courses[0].schedule.as_deref(),
            Some("35T45 (10/08/2026 - 14/12/2026)")
        );

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
            turma: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: None,
        }];

        SigaaClient::apply_offer_link(&mut courses, &offer);

        // Nome sem acento casa com "FÍSICA 2"; mesma sala desambigua a turma
        assert_eq!(courses[0].code, "IFD0175");
        assert_eq!(courses[0].turma.as_deref(), Some("Turma 2"));
        assert_eq!(courses[0].professor.as_deref(), Some("Ricardo Jacobi"));

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
            turma: None,
            unread_count: Some(0),
            pending_assignments_count: Some(0),
            url: None,
        }];
        SigaaClient::apply_offer_link(&mut other, &offer);
        assert!(other[0].professor.is_none());
        assert!(other[0].turma.is_none());
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
        assert_eq!(profile.curso, "ENGENHARIA DE COMPUTAÇÃO");
        // Turno anexado pelo SIGAA ao campo Curso (último segmento após " - ")
        assert_eq!(profile.turno.as_deref(), Some("MT"));
        assert_eq!(profile.nivel, "GRADUAÇÃO");
        assert_eq!(profile.status, "ATIVO");
        assert_eq!(profile.entrada, "2022.1");
        assert_eq!(profile.ira, Some(3.6238));
        assert_eq!(profile.mp, Some(3.5493));
        assert_eq!(profile.ch_obrigatoria_pendente, Some(990));
        assert_eq!(profile.ch_optativa_pendente, Some(240));

        // Suporta vírgula decimal pt-BR (ex: "3,6238")
        let html_comma = html.replace("3.6238", "3,6238").replace("3.5493", "3,5493");
        let profile_comma = SigaaClient::parse_discente_profile(&html_comma, "202000000");
        assert_eq!(profile_comma.ira, Some(3.6238));
        assert_eq!(profile_comma.mp, Some(3.5493));
        assert_eq!(profile_comma.ch_total_curriculo, Some(3480));
        assert_eq!(profile_comma.ch_complementar_pendente, Some(0));
        assert_eq!(profile_comma.percentual_integralizado, Some(65.0));
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
        assert_eq!(profile.curso, "FARMÁCIA");
        assert_eq!(profile.turno.as_deref(), Some("N"));

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
        assert_eq!(profile.curso, "ENFERMAGEM");
        assert_eq!(profile.turno.as_deref(), Some("DIURNO"));

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
        assert_eq!(profile.curso, "ADMINISTRAÇÃO");
        assert_eq!(profile.turno, None);
    }
}
