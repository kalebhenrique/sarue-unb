use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tokio::sync::RwLock;

const CDN_BASE_URL: &str = "https://raw.githubusercontent.com/kalebhenrique/sarue-unb/gh-pages/data";
const GITHUB_PAGES_BASE_URL: &str = "https://kalebhenrique.github.io/sarue-unb/data";
const USER_AGENT: &str = "Sarue-UnB/0.1.0 (Desktop App; Tauri)";

// Cache em memória para evitar múltiplos downloads de classes.json durante a sessão
static CLASSES_CACHE: OnceLock<RwLock<Option<Vec<ScrapedDiscipline>>>> = OnceLock::new();
static DEPARTMENTS_CACHE: OnceLock<RwLock<Option<Vec<Department>>>> = OnceLock::new();
static COURSES_CACHE: OnceLock<RwLock<Option<Vec<CourseCatalogItem>>>> = OnceLock::new();
static CURRICULA_CACHE: OnceLock<RwLock<Option<Vec<CurriculumStructure>>>> = OnceLock::new();
static PROFESSORS_CACHE: OnceLock<RwLock<Option<Vec<ScrapedProfessor>>>> = OnceLock::new();

fn get_classes_lock() -> &'static RwLock<Option<Vec<ScrapedDiscipline>>> {
    CLASSES_CACHE.get_or_init(|| RwLock::new(None))
}

fn get_depts_lock() -> &'static RwLock<Option<Vec<Department>>> {
    DEPARTMENTS_CACHE.get_or_init(|| RwLock::new(None))
}

fn get_courses_lock() -> &'static RwLock<Option<Vec<CourseCatalogItem>>> {
    COURSES_CACHE.get_or_init(|| RwLock::new(None))
}

fn get_curricula_lock() -> &'static RwLock<Option<Vec<CurriculumStructure>>> {
    CURRICULA_CACHE.get_or_init(|| RwLock::new(None))
}

fn get_professors_lock() -> &'static RwLock<Option<Vec<ScrapedProfessor>>> {
    PROFESSORS_CACHE.get_or_init(|| RwLock::new(None))
}

static COURSE_CURRICULA_CACHE: OnceLock<RwLock<Option<(String, Vec<CurriculumStructure>)>>> = OnceLock::new();

fn get_course_curricula_lock() -> &'static RwLock<Option<(String, Vec<CurriculumStructure>)>> {
    COURSE_CURRICULA_CACHE.get_or_init(|| RwLock::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Department {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct ScheduleSlot {
    pub day: u8,
    pub day_name: String,
    pub shift: char,
    pub period: u8,
    pub time_range: String,
    pub global_slot_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ScrapedClass {
    pub id: String,
    pub discipline_code: String,
    pub discipline_name: String,
    pub class_code: String,
    #[serde(default)]
    pub teachers: Vec<String>,
    #[serde(default)]
    pub classroom: String,
    pub schedule_code: String,
    #[serde(default)]
    pub schedule_description: Option<String>,
    #[serde(default)]
    pub date_range: Option<String>,
    #[serde(default)]
    pub schedule_slots: Vec<ScheduleSlot>,
    #[serde(default)]
    pub vacancies: Option<u32>,
    #[serde(default)]
    pub occupied: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ScrapedDiscipline {
    pub code: String,
    pub name: String,
    pub department_id: String,
    pub classes: Vec<ScrapedClass>,
    #[serde(default)]
    pub acronym: Option<String>,
    #[serde(default)]
    pub acronyms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ScrapedProfessor {
    pub id: String,
    #[serde(default)]
    pub siape: Option<String>,
    pub name: String,
    pub department_id: String,
    pub department_name: String,
    #[serde(default)]
    pub department_ids: Vec<String>,
    #[serde(default)]
    pub discipline_codes: Vec<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub public_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CourseCatalogItem {
    pub id: String,
    pub name: String,
    pub degree: String,
    pub shift: String,
    pub campus: String,
    pub modality: String,
    #[serde(default)]
    pub coordinator: Option<String>,
    #[serde(default)]
    pub curricula_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CurriculumDiscipline {
    pub code: String,
    pub name: String,
    pub workload_hours: u32,
    #[serde(default)]
    pub level: Option<u32>,
    pub nature: String,
    #[serde(default)]
    pub prerequisites_raw: Option<String>,
    #[serde(default)]
    pub prerequisites: Vec<String>,
    #[serde(default)]
    pub equivalences_raw: Option<String>,
    #[serde(default)]
    pub equivalences: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct CurriculumStructure {
    pub id: String,
    pub course_id: String,
    pub course_name: String,
    pub code: String,
    #[serde(default)]
    pub created_year: Option<String>,
    pub status: String,
    #[serde(default)]
    pub shift: Option<String>,
    #[serde(default)]
    pub total_hours: Option<u32>,
    #[serde(default)]
    pub mandatory_disciplines: Vec<CurriculumDiscipline>,
    #[serde(default)]
    pub elective_disciplines: Vec<CurriculumDiscipline>,
    #[serde(default)]
    pub complementary_disciplines: Vec<CurriculumDiscipline>,
}

pub struct SigaaGradeScraper;

impl SigaaGradeScraper {
    /// Cliente HTTP para requests com timeout adequado
    fn http_client() -> reqwest::Client {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .user_agent(USER_AGENT)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    }

    /// Busca um arquivo JSON a partir do disco local (dev/build), CDN GitHub Pages ou raw.githubusercontent.com
    async fn fetch_static_json<T: for<'de> Deserialize<'de>>(file_name: &str) -> Result<T, String> {
        // 1. Tenta carregar do disco local se disponível (desenvolvimento ou build local)
        let mut candidates = vec![
            std::path::PathBuf::from(format!("public/data/{}", file_name)),
            std::path::PathBuf::from(format!("../public/data/{}", file_name)),
            std::path::PathBuf::from(format!("data/{}", file_name)),
            std::path::PathBuf::from(format!("../data/{}", file_name)),
        ];

        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("public").join("data").join(file_name));
            candidates.push(cwd.join("data").join(file_name));
            if let Some(parent) = cwd.parent() {
                candidates.push(parent.join("public").join("data").join(file_name));
                candidates.push(parent.join("data").join(file_name));
            }
        }

        for path in &candidates {
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Ok(data) = serde_json::from_str::<T>(&content) {
                        return Ok(data);
                    }
                }
            }
        }

        // 2. Tenta GitHub Pages
        let client = Self::http_client();
        let url_pages = format!("{}/{}", GITHUB_PAGES_BASE_URL, file_name);
        if let Ok(res) = client.get(&url_pages).send().await {
            if res.status().is_success() {
                if let Ok(data) = res.json::<T>().await {
                    return Ok(data);
                }
            }
        }

        // 3. Tenta raw.githubusercontent.com
        let url_raw = format!("{}/{}", CDN_BASE_URL, file_name);
        match client.get(&url_raw).send().await {
            Ok(res) if res.status().is_success() => {
                res.json::<T>()
                    .await
                    .map_err(|e| format!("Falha ao deserializar JSON de {}: {}", url_raw, e))
            }
            Ok(res) => Err(format!("CDN retornou status HTTP {} para {}", res.status(), url_raw)),
            Err(e) => Err(format!("Falha ao conectar ao CDN para {}: {}", url_raw, e)),
        }
    }

    /// Obtém a lista de departamentos da UnB consumindo o JSON estático com fallback
    pub async fn fetch_departments() -> Result<Vec<Department>, String> {
        // Verifica cache de memória
        {
            let lock = get_depts_lock().read().await;
            if let Some(cached) = &*lock {
                return Ok(cached.clone());
            }
        }

        match Self::fetch_static_json::<Vec<Department>>("departments.json").await {
            Ok(departments) if !departments.is_empty() => {
                let mut lock = get_depts_lock().write().await;
                *lock = Some(departments.clone());
                Ok(departments)
            }
            Ok(_) | Err(_) => {
                // Fallback offline resiliente
                log::warn!("[SigaaData] Usando departamentos de fallback offline");
                Ok(Self::fallback_departments())
            }
        }
    }

    /// Obtém as turmas ofertadas filtrando pelo ID do departamento (ou todas se department_id for "ALL" ou vazio)
    pub async fn scrape_department_classes(
        department_id: &str,
        _year: &str,
        _period: &str,
    ) -> Result<Vec<ScrapedDiscipline>, String> {
        let is_all = department_id.is_empty()
            || department_id.eq_ignore_ascii_case("all")
            || department_id == "*";

        // 1. Tenta cache em memória primeiro
        {
            let lock = get_classes_lock().read().await;
            if let Some(cached) = &*lock {
                if is_all {
                    return Ok(cached.clone());
                }
                let filtered: Vec<ScrapedDiscipline> = cached
                    .iter()
                    .filter(|d| d.department_id == department_id)
                    .cloned()
                    .collect();
                if !filtered.is_empty() {
                    return Ok(filtered);
                } else {
                    return Ok(Self::fallback_disciplines_for_dept(department_id));
                }
            }
        }

        // 2. Faz fetch do classes.json estático do disco local ou CDN
        let fetch_result = Self::fetch_static_json::<Vec<ScrapedDiscipline>>("classes.json").await;

        match fetch_result {
            Ok(all_disciplines) => {
                let filtered: Vec<ScrapedDiscipline> = if is_all {
                    all_disciplines.clone()
                } else {
                    all_disciplines
                        .iter()
                        .filter(|d| d.department_id == department_id)
                        .cloned()
                        .collect()
                };

                // Armazena no cache
                let mut lock = get_classes_lock().write().await;
                *lock = Some(all_disciplines);

                if filtered.is_empty() && !is_all {
                    Ok(Self::fallback_disciplines_for_dept(department_id))
                } else {
                    Ok(filtered)
                }
            }
            Err(e) => {
                log::warn!(
                    "[SigaaData] Erro ao buscar turmas estáticas ({}), usando fallback local para depto {}",
                    e,
                    department_id
                );
                Ok(Self::fallback_disciplines_for_dept(department_id))
            }
        }
    }

    /// Obtém o catálogo de cursos de graduação da UnB
    pub async fn fetch_courses_catalog() -> Result<Vec<CourseCatalogItem>, String> {
        {
            let lock = get_courses_lock().read().await;
            if let Some(cached) = &*lock {
                return Ok(cached.clone());
            }
        }

        match Self::fetch_static_json::<Vec<CourseCatalogItem>>("courses.json").await {
            Ok(courses) if !courses.is_empty() => {
                let mut lock = get_courses_lock().write().await;
                *lock = Some(courses.clone());
                Ok(courses)
            }
            Ok(_) | Err(_) => {
                log::warn!("[SigaaData] Usando catálogo de cursos de fallback offline");
                Ok(Self::fallback_courses())
            }
        }
    }

    /// Obtém as estruturas curriculares de um curso
    pub async fn fetch_course_curriculum(course_id: &str) -> Result<Vec<CurriculumStructure>, String> {
        // course_id do catálogo é numérico; a checagem barra path traversal no nome de arquivo
        let safe_id =
            !course_id.is_empty() && course_id.chars().all(|c| c.is_ascii_alphanumeric());

        // 1. Arquivo por curso no CDN (~centenas de KB) — evita baixar curricula.json
        //    inteiro (~40 MB) quando só as matrizes de um curso importam.
        if safe_id {
            {
                let lock = get_course_curricula_lock().read().await;
                if let Some((cached_id, cached)) = &*lock {
                    if cached_id == course_id {
                        return Ok(cached.clone());
                    }
                }
            }

            let file_name = format!("curricula/{}.json", course_id);
            if let Ok(per_course) =
                Self::fetch_static_json::<Vec<CurriculumStructure>>(&file_name).await
            {
                if !per_course.is_empty() {
                    let mut lock = get_course_curricula_lock().write().await;
                    *lock = Some((course_id.to_string(), per_course.clone()));
                    return Ok(per_course);
                }
            }
        }

        {
            let lock = get_curricula_lock().read().await;
            if let Some(cached) = &*lock {
                let filtered: Vec<CurriculumStructure> = cached
                    .iter()
                    .filter(|c| c.course_id == course_id)
                    .cloned()
                    .collect();
                if !filtered.is_empty() {
                    return Ok(filtered);
                } else {
                    return Ok(Self::fallback_curricula_for_course(course_id));
                }
            }
        }

        match Self::fetch_static_json::<Vec<CurriculumStructure>>("curricula.json").await {
            Ok(all_curricula) => {
                let filtered: Vec<CurriculumStructure> = all_curricula
                    .iter()
                    .filter(|c| c.course_id == course_id)
                    .cloned()
                    .collect();

                let mut lock = get_curricula_lock().write().await;
                *lock = Some(all_curricula);

                if filtered.is_empty() {
                    Ok(Self::fallback_curricula_for_course(course_id))
                } else {
                    Ok(filtered)
                }
            }
            Err(e) => {
                log::warn!(
                    "[SigaaData] Erro ao buscar currículos estáticos ({}), usando fallback local para curso {}",
                    e,
                    course_id
                );
                Ok(Self::fallback_curricula_for_course(course_id))
            }
        }
    }

    /// Obtém todas as estruturas curriculares catalogadas da UnB
    pub async fn fetch_all_curricula() -> Result<Vec<CurriculumStructure>, String> {
        {
            let lock = get_curricula_lock().read().await;
            if let Some(cached) = &*lock {
                return Ok(cached.clone());
            }
        }

        match Self::fetch_static_json::<Vec<CurriculumStructure>>("curricula.json").await {
            Ok(all_curricula) => {
                let mut lock = get_curricula_lock().write().await;
                *lock = Some(all_curricula.clone());
                Ok(all_curricula)
            }
            Err(e) => {
                log::warn!("[SigaaData] Erro ao carregar todos os currículos: {}", e);
                Ok(vec![])
            }
        }
    }

    /// Obtém o catálogo de docentes do SIGAA (a partir de professors.json ou sintetizado de classes.json)
    pub async fn fetch_professors() -> Result<Vec<ScrapedProfessor>, String> {
        {
            let lock = get_professors_lock().read().await;
            if let Some(cached) = &*lock {
                return Ok(cached.clone());
            }
        }

        if let Ok(professors) = Self::fetch_static_json::<Vec<ScrapedProfessor>>("professors.json").await {
            if !professors.is_empty() {
                let mut lock = get_professors_lock().write().await;
                *lock = Some(professors.clone());
                return Ok(professors);
            }
        }

        // Fallback: sintetiza a lista oficial de docentes a partir das turmas de classes.json
        let all_disciplines = Self::scrape_department_classes("ALL", "2026", "2").await.unwrap_or_default();
        let all_depts = Self::fetch_departments().await.unwrap_or_default();
        let dept_map: std::collections::HashMap<String, String> =
            all_depts.into_iter().map(|d| (d.id, d.name)).collect();

        let mut by_name: std::collections::BTreeMap<String, ScrapedProfessor> = std::collections::BTreeMap::new();

        for disc in all_disciplines {
            let dept_name = dept_map.get(&disc.department_id).cloned().unwrap_or_else(|| "UnB".to_string());
            for cls in disc.classes {
                for t in cls.teachers {
                    let clean = t.trim().to_string();
                    if clean.is_empty() || clean.eq_ignore_ascii_case("A definir") {
                        continue;
                    }
                    let key = clean.to_uppercase();
                    let entry = by_name.entry(key.clone()).or_insert_with(|| ScrapedProfessor {
                        id: format!("prof-{}-{}", disc.department_id, key.replace(' ', "-")),
                        siape: None,
                        name: clean.clone(),
                        department_id: disc.department_id.clone(),
                        department_name: dept_name.clone(),
                        department_ids: vec![disc.department_id.clone()],
                        discipline_codes: vec![],
                        photo_url: None,
                        public_url: None,
                    });
                    if !entry.discipline_codes.contains(&disc.code) {
                        entry.discipline_codes.push(disc.code.clone());
                    }
                    if !entry.department_ids.contains(&disc.department_id) {
                        entry.department_ids.push(disc.department_id.clone());
                    }
                }
            }
        }

        let synthesized: Vec<ScrapedProfessor> = by_name.into_values().collect();
        if !synthesized.is_empty() {
            let mut lock = get_professors_lock().write().await;
            *lock = Some(synthesized.clone());
        }
        Ok(synthesized)
    }

    /// Lista padrão de departamentos UnB para contingência offline
    pub fn fallback_departments() -> Vec<Department> {
        vec![
            Department { id: "508".into(), name: "DEPTO CIÊNCIAS DA COMPUTAÇÃO - CIC".into() },
            Department { id: "518".into(), name: "DEPARTAMENTO DE MATEMÁTICA - MAT".into() },
            Department { id: "514".into(), name: "DEPTO ESTATÍSTICA - EST".into() },
            Department { id: "443".into(), name: "DEPTO ENGENHARIA ELÉTRICA - ENE".into() },
            Department { id: "449".into(), name: "DEPARTAMENTO DE ENGENHARIA MECÂNICA - ENM".into() },
            Department { id: "440".into(), name: "DEPARTAMENTO DE ENGENHARIA CIVIL E AMBIENTAL - ENC".into() },
            Department { id: "524".into(), name: "INSTITUTO DE FÍSICA - IF".into() },
            Department { id: "610".into(), name: "INSTITUTO DE QUÍMICA - IQ".into() },
            Department { id: "327".into(), name: "DEPTO ADMINISTRAÇÃO - ADM".into() },
            Department { id: "333".into(), name: "DEPTO CIÊNCIAS CONTÁBEIS ATUARIAIS - CCA".into() },
            Department { id: "335".into(), name: "DEPTO ECONOMIA - ECO".into() },
            Department { id: "673".into(), name: "CAMPUS UNB GAMA - FGA".into() },
            Department { id: "672".into(), name: "CAMPUS UNB CEILÂNDIA - FCE".into() },
            Department { id: "675".into(), name: "CAMPUS UNB PLANALTINA - FUP".into() },
            Department { id: "401".into(), name: "FACULDADE DE DIREITO - FD".into() },
            Department { id: "379".into(), name: "FACULDADE DE MEDICINA - FM".into() },
        ]
    }

    /// Catálogo semente de disciplinas para contingência offline
    pub fn fallback_disciplines_for_dept(dept_id: &str) -> Vec<ScrapedDiscipline> {
        match dept_id {
            "508" => vec![
                ScrapedDiscipline {
                    code: "CIC0004".into(),
                    name: "ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES".into(),
                    department_id: "508".into(),
                    acronym: Some("APC".into()),
                    acronyms: vec!["APC".into()],
                    classes: vec![
                        ScrapedClass {
                            id: "CIC0004-01".into(),
                            discipline_code: "CIC0004".into(),
                            discipline_name: "ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES".into(),
                            class_code: "01".into(),
                            teachers: vec!["Prof. Carla Rocha".into()],
                            classroom: "PJC BT 110".into(),
                            schedule_code: "24M34".into(),
                            schedule_description: Some("Segunda e Quarta 10:00 às 11:50".into()),
                            date_range: None,
                            schedule_slots: vec![
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'M', period: 3, time_range: "10:00 - 10:55".into(), global_slot_index: 2 },
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'M', period: 4, time_range: "10:55 - 11:50".into(), global_slot_index: 3 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'M', period: 3, time_range: "10:00 - 10:55".into(), global_slot_index: 2 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'M', period: 4, time_range: "10:55 - 11:50".into(), global_slot_index: 3 },
                            ],
                            vacancies: Some(40),
                            occupied: Some(38),
                        },
                    ],
                },
                ScrapedDiscipline {
                    code: "CIC0090".into(),
                    name: "ESTRUTURAS DE DADOS".into(),
                    department_id: "508".into(),
                    acronym: Some("ED".into()),
                    acronyms: vec!["ED".into()],
                    classes: vec![
                        ScrapedClass {
                            id: "CIC0090-01".into(),
                            discipline_code: "CIC0090".into(),
                            discipline_name: "ESTRUTURAS DE DADOS".into(),
                            class_code: "01".into(),
                            teachers: vec!["Prof. Carlos Eduardo".into()],
                            classroom: "PJC BT 112".into(),
                            schedule_code: "24T23".into(),
                            schedule_description: Some("Segunda e Quarta 14:00 às 15:50".into()),
                            date_range: None,
                            schedule_slots: vec![
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'T', period: 2, time_range: "14:00 - 14:55".into(), global_slot_index: 6 },
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'T', period: 3, time_range: "14:55 - 15:50".into(), global_slot_index: 7 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'T', period: 2, time_range: "14:00 - 14:55".into(), global_slot_index: 6 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'T', period: 3, time_range: "14:55 - 15:50".into(), global_slot_index: 7 },
                            ],
                            vacancies: Some(40),
                            occupied: Some(39),
                        },
                    ],
                },
            ],
            "518" => vec![
                ScrapedDiscipline {
                    code: "MAT0025".into(),
                    name: "CÁLCULO 1".into(),
                    department_id: "518".into(),
                    acronym: Some("C1".into()),
                    acronyms: vec!["C1".into(), "CI".into()],
                    classes: vec![
                        ScrapedClass {
                            id: "MAT0025-01".into(),
                            discipline_code: "MAT0025".into(),
                            discipline_name: "CÁLCULO 1".into(),
                            class_code: "01".into(),
                            teachers: vec!["Prof. Luciana Maria".into()],
                            classroom: "ICC CENTRO AT 10".into(),
                            schedule_code: "246M12".into(),
                            schedule_description: Some("Segunda, Quarta e Sexta 08:00 às 09:50".into()),
                            date_range: None,
                            schedule_slots: vec![
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'M', period: 1, time_range: "08:00 - 08:55".into(), global_slot_index: 0 },
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'M', period: 2, time_range: "08:55 - 09:50".into(), global_slot_index: 1 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'M', period: 1, time_range: "08:00 - 08:55".into(), global_slot_index: 0 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'M', period: 2, time_range: "08:55 - 09:50".into(), global_slot_index: 1 },
                                ScheduleSlot { day: 6, day_name: "Sex".into(), shift: 'M', period: 1, time_range: "08:00 - 08:55".into(), global_slot_index: 0 },
                                ScheduleSlot { day: 6, day_name: "Sex".into(), shift: 'M', period: 2, time_range: "08:55 - 09:50".into(), global_slot_index: 1 },
                            ],
                            vacancies: Some(60),
                            occupied: Some(58),
                        },
                    ],
                },
            ],
            _ => vec![
                ScrapedDiscipline {
                    code: "EST0023".into(),
                    name: "PROBABILIDADE E ESTATÍSTICA".into(),
                    department_id: dept_id.to_string(),
                    acronym: Some("PE".into()),
                    acronyms: vec!["PE".into()],
                    classes: vec![
                        ScrapedClass {
                            id: "EST0023-01".into(),
                            discipline_code: "EST0023".into(),
                            discipline_name: "PROBABILIDADE E ESTATÍSTICA".into(),
                            class_code: "01".into(),
                            teachers: vec!["Prof. Maria Antonia".into()],
                            classroom: "ICC ALA SUL AT 30".into(),
                            schedule_code: "24T45".into(),
                            schedule_description: Some("Segunda e Quarta 16:00 às 17:50".into()),
                            date_range: None,
                            schedule_slots: vec![
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'T', period: 4, time_range: "16:00 - 16:55".into(), global_slot_index: 8 },
                                ScheduleSlot { day: 2, day_name: "Seg".into(), shift: 'T', period: 5, time_range: "16:55 - 17:50".into(), global_slot_index: 9 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'T', period: 4, time_range: "16:00 - 16:55".into(), global_slot_index: 8 },
                                ScheduleSlot { day: 4, day_name: "Qua".into(), shift: 'T', period: 5, time_range: "16:55 - 17:50".into(), global_slot_index: 9 },
                            ],
                            vacancies: Some(45),
                            occupied: Some(40),
                        },
                    ],
                },
            ],
        }
    }

    /// Catálogo de cursos para contingência offline
    pub fn fallback_courses() -> Vec<CourseCatalogItem> {
        vec![
            CourseCatalogItem {
                id: "414112".into(),
                name: "ADMINISTRAÇÃO".into(),
                degree: "Bacharelado".into(),
                shift: "DIURNO".into(),
                campus: "BRASÍLIA".into(),
                modality: "Presencial".into(),
                coordinator: Some("CARLA PEIXOTO BORGES".into()),
                curricula_ids: vec!["456".into()],
            },
            CourseCatalogItem {
                id: "414002".into(),
                name: "CIÊNCIA DA COMPUTAÇÃO".into(),
                degree: "Bacharelado".into(),
                shift: "DIURNO".into(),
                campus: "BRASÍLIA".into(),
                modality: "Presencial".into(),
                coordinator: Some("Prof. Coordenador CIC".into()),
                curricula_ids: vec!["508".into()],
            },
            CourseCatalogItem {
                id: "414003".into(),
                name: "ENGENHARIA DE SOFTWARE".into(),
                degree: "Bacharelado".into(),
                shift: "DIURNO".into(),
                campus: "GAMA".into(),
                modality: "Presencial".into(),
                coordinator: Some("Prof. Coordenador FGA".into()),
                curricula_ids: vec!["673".into()],
            },
        ]
    }

    /// Estruturas curriculares de fallback
    pub fn fallback_curricula_for_course(course_id: &str) -> Vec<CurriculumStructure> {
        vec![
            CurriculumStructure {
                id: format!("{}-default", course_id),
                course_id: course_id.to_string(),
                course_name: "Curso UnB".to_string(),
                code: "1/2026".to_string(),
                created_year: Some("2026".to_string()),
                status: "Ativa".to_string(),
                shift: Some("Diurno".to_string()),
                total_hours: Some(3000),
                mandatory_disciplines: vec![
                    CurriculumDiscipline {
                        code: "CIC0004".to_string(),
                        name: "ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES".to_string(),
                        workload_hours: 60,
                        level: Some(1),
                        nature: "Obrigatória".to_string(),
                        prerequisites_raw: None,
                        prerequisites: vec![],
                        equivalences_raw: None,
                        equivalences: vec![],
                    },
                    CurriculumDiscipline {
                        code: "MAT0025".to_string(),
                        name: "CÁLCULO 1".to_string(),
                        workload_hours: 90,
                        level: Some(1),
                        nature: "Obrigatória".to_string(),
                        prerequisites_raw: None,
                        prerequisites: vec![],
                        equivalences_raw: None,
                        equivalences: vec![],
                    },
                ],
                elective_disciplines: vec![],
                complementary_disciplines: vec![],
            }
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_departments() {
        let depts = SigaaGradeScraper::fallback_departments();
        assert!(!depts.is_empty());
        assert!(depts.iter().any(|d| d.id == "508"));
    }

    #[test]
    fn test_fallback_disciplines_cic() {
        let disc = SigaaGradeScraper::fallback_disciplines_for_dept("508");
        assert!(!disc.is_empty());
        assert_eq!(disc[0].code, "CIC0004");
    }

    #[tokio::test]
    async fn test_fetch_departments_fallback() {
        let depts = SigaaGradeScraper::fetch_departments().await.unwrap();
        assert!(!depts.is_empty());
        println!("Loaded departments count: {}", depts.len());
        // Com o arquivo departments.json presente no disco, temos 211 departamentos
        assert_eq!(depts.len(), 211);
    }

    #[tokio::test]
    async fn test_scrape_department_classes_fallback() {
        let disc = SigaaGradeScraper::scrape_department_classes("508", "2026", "2").await.unwrap();
        assert!(!disc.is_empty());
        println!("Loaded CIC disciplines count: {}", disc.len());
        // Com o arquivo classes.json presente no disco, CIC possui 57 disciplinas
        assert_eq!(disc.len(), 57);
    }

    #[tokio::test]
    async fn test_scrape_department_classes_all() {
        let disc = SigaaGradeScraper::scrape_department_classes("ALL", "2026", "2").await.unwrap();
        assert!(!disc.is_empty());
        println!("Loaded ALL disciplines count: {}", disc.len());
        assert!(disc.len() >= 4400);
    }
}
