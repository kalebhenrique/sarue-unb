use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum PlatformType {
    Sigaa,
    Aprender3,
    Teams,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum FeedItemType {
    Post,
    Assignment,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    pub id: String,
    pub platform: PlatformType,
    pub title: String,
    pub content: String,
    pub course_name: String,
    pub course_code: Option<String>,
    pub author: Option<String>,
    pub item_type: FeedItemType,
    pub created_at: String,
    pub due_date: Option<String>,
    pub is_completed: Option<bool>,
    pub external_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub code: String,
    pub name: String,
    pub semester: String,
    pub platform: PlatformType,
    pub professor: Option<String>,
    pub classroom: Option<String>,
    pub schedule: Option<String>,
    #[serde(default)]
    pub class_group: Option<String>,
    pub unread_count: Option<u32>,
    pub pending_assignments_count: Option<u32>,
    pub url: Option<String>,
    #[serde(default)]
    pub absences: Option<u32>,
    #[serde(default)]
    pub max_absences: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub items: Vec<FeedItem>,
    pub courses: Vec<Course>,
    pub synced_at: String,
    pub errors: Option<HashMap<PlatformType, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SigaaCreds {
    pub matricula: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Aprender3Creds {
    pub cpf: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamsCreds {
    pub is_connected: Option<bool>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TeamsConnectResult {
    pub is_connected: Option<bool>,
    pub email: Option<String>,
    pub items: Vec<FeedItem>,
    pub courses: Vec<Course>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub status: String,
    pub encryption: String,
    pub zero_telemetry: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StudentProfile {
    pub matricula: String,
    pub name: Option<String>,
    pub course: String,
    #[serde(default)]
    pub shift: Option<String>,
    pub level: String,
    pub status: String,
    pub admission_semester: String,
    pub email: Option<String>,
    pub ira: Option<f64>,
    pub mp: Option<f64>,
    pub pending_mandatory_hours: Option<u32>,
    pub pending_elective_hours: Option<u32>,
    pub total_curriculum_hours: Option<u32>,
    pub pending_complementary_hours: Option<u32>,
    pub completed_percentage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcademicHistoryPayload {
    pub profile: StudentProfile,
    pub pdf_base64: Option<String>,
    pub pdf_text: Option<String>,
}
