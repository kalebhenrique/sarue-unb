use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_network_status::{ConnectionType, NetworkStatus};

pub const SYNC_ONLY_ON_WIFI_KEY: &str = "sync_only_on_wifi";

pub struct SyncOnlyOnWifiState(pub AtomicBool);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppPreferencesFile {
    #[serde(default = "default_sync_only_on_wifi")]
    sync_only_on_wifi: bool,
    #[serde(default = "default_background_run_enabled")]
    background_run_enabled: bool,
}

impl Default for AppPreferencesFile {
    fn default() -> Self {
        Self {
            sync_only_on_wifi: default_sync_only_on_wifi(),
            background_run_enabled: default_background_run_enabled(),
        }
    }
}

pub fn default_background_run_enabled() -> bool {
    true
}

/// No mobile, sincroniza apenas no Wi-Fi por padrão para economizar dados móveis.
/// No desktop, o padrão é false.
pub fn default_sync_only_on_wifi() -> bool {
    cfg!(mobile)
}

fn preferences_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Falha ao resolver diretório local de dados: {}", e))?;
    let filename = if cfg!(debug_assertions) {
        "preferences_dev.json"
    } else {
        "preferences.json"
    };
    Ok(data_dir.join(filename))
}

fn read_preferences_from_path(path: &std::path::Path) -> AppPreferencesFile {
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppPreferencesFile::default(),
    }
}

fn write_preferences_to_path(
    path: &std::path::Path,
    prefs: &AppPreferencesFile,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Falha ao criar diretório de preferências: {}", e))?;
    }
    let json = serde_json::to_string_pretty(prefs)
        .map_err(|e| format!("Falha ao serializar preferências: {}", e))?;
    std::fs::write(path, json)
        .map_err(|e| format!("Falha ao gravar preferências no disco: {}", e))?;
    Ok(())
}

/// Carrega a preferência `sync_only_on_wifi` do store local em disco, usando o
/// padrão da plataforma caso o arquivo ainda não exista.
pub fn load_sync_only_on_wifi(app: &AppHandle) -> bool {
    match preferences_file_path(app) {
        Ok(path) => read_preferences_from_path(&path).sync_only_on_wifi,
        Err(_) => default_sync_only_on_wifi(),
    }
}

/// Atualiza o estado em memória e persiste `sync_only_on_wifi` no store local.
pub fn save_sync_only_on_wifi(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let path = preferences_file_path(app)?;
    let mut prefs = read_preferences_from_path(&path);
    prefs.sync_only_on_wifi = enabled;
    write_preferences_to_path(&path, &prefs)?;

    if let Some(state) = app.try_state::<SyncOnlyOnWifiState>() {
        state.0.store(enabled, Ordering::Relaxed);
    }
    Ok(())
}

/// Lê o estado atual em memória (sincronizado com o store em disco na inicialização).
pub fn is_sync_only_on_wifi(app: &AppHandle) -> bool {
    app.try_state::<SyncOnlyOnWifiState>()
        .map(|s| s.0.load(Ordering::Relaxed))
        .unwrap_or_else(|| load_sync_only_on_wifi(app))
}

/// Carrega a preferência `background_run_enabled` do store local em disco.
pub fn load_background_run_enabled(app: &AppHandle) -> bool {
    match preferences_file_path(app) {
        Ok(path) => read_preferences_from_path(&path).background_run_enabled,
        Err(_) => default_background_run_enabled(),
    }
}

/// Persiste `background_run_enabled` no store local (`preferences.json`) preservando as demais chaves.
pub fn save_background_run_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let path = preferences_file_path(app)?;
    let mut prefs = read_preferences_from_path(&path);
    prefs.background_run_enabled = enabled;
    write_preferences_to_path(&path, &prefs)
}

/// Lê `(background_run_enabled, sync_only_on_wifi)` diretamente de um diretório de dados (uso via JNI / WorkManager).
pub fn read_preferences_from_dir(data_dir: &std::path::Path) -> (bool, bool) {
    let filename = if cfg!(debug_assertions) {
        "preferences_dev.json"
    } else {
        "preferences.json"
    };
    let prefs = read_preferences_from_path(&data_dir.join(filename));
    (prefs.background_run_enabled, prefs.sync_only_on_wifi)
}

/// Regra pura para decidir se o sync automático em segundo plano pode rodar.
pub fn should_allow_auto_sync(
    is_mobile: bool,
    sync_only_on_wifi: bool,
    status: &NetworkStatus,
) -> bool {
    if !is_mobile || !sync_only_on_wifi {
        return true;
    }
    status.connection_type == ConnectionType::Wifi && !status.is_metered
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_allow_auto_sync_desktop_never_blocked() {
        let cellular = NetworkStatus {
            connection_type: ConnectionType::Cellular,
            is_metered: true,
        };
        assert!(should_allow_auto_sync(false, true, &cellular));
        assert!(should_allow_auto_sync(false, false, &cellular));
    }

    #[test]
    fn test_should_allow_auto_sync_mobile_when_preference_disabled() {
        let cellular = NetworkStatus {
            connection_type: ConnectionType::Cellular,
            is_metered: true,
        };
        let hotspot = NetworkStatus {
            connection_type: ConnectionType::Wifi,
            is_metered: true,
        };
        assert!(should_allow_auto_sync(true, false, &cellular));
        assert!(should_allow_auto_sync(true, false, &hotspot));
    }

    #[test]
    fn test_should_allow_auto_sync_mobile_when_wifi_only_enabled() {
        let unmetered_wifi = NetworkStatus {
            connection_type: ConnectionType::Wifi,
            is_metered: false,
        };
        let metered_wifi_hotspot = NetworkStatus {
            connection_type: ConnectionType::Wifi,
            is_metered: true,
        };
        let cellular = NetworkStatus {
            connection_type: ConnectionType::Cellular,
            is_metered: true,
        };
        let ethernet = NetworkStatus {
            connection_type: ConnectionType::Ethernet,
            is_metered: false,
        };
        let offline = NetworkStatus {
            connection_type: ConnectionType::Offline,
            is_metered: false,
        };
        let other = NetworkStatus {
            connection_type: ConnectionType::Other,
            is_metered: false,
        };

        assert!(should_allow_auto_sync(true, true, &unmetered_wifi));
        assert!(!should_allow_auto_sync(true, true, &metered_wifi_hotspot));
        assert!(!should_allow_auto_sync(true, true, &cellular));
        assert!(!should_allow_auto_sync(true, true, &ethernet));
        assert!(!should_allow_auto_sync(true, true, &offline));
        assert!(!should_allow_auto_sync(true, true, &other));
    }

    #[test]
    fn test_preferences_file_roundtrip() {
        let temp_dir =
            std::env::temp_dir().join(format!("sarue_prefs_test_{}", rand::random::<u32>()));
        let prefs_path = temp_dir.join("preferences.json");

        assert_eq!(
            read_preferences_from_path(&prefs_path).sync_only_on_wifi,
            default_sync_only_on_wifi()
        );

        write_preferences_to_path(
            &prefs_path,
            &AppPreferencesFile {
                sync_only_on_wifi: true,
                background_run_enabled: true,
            },
        )
        .expect("Falha ao gravar preferências");
        assert!(read_preferences_from_path(&prefs_path).sync_only_on_wifi);

        write_preferences_to_path(
            &prefs_path,
            &AppPreferencesFile {
                sync_only_on_wifi: false,
                background_run_enabled: false,
            },
        )
        .expect("Falha ao atualizar preferências");
        assert!(!read_preferences_from_path(&prefs_path).sync_only_on_wifi);
        assert!(!read_preferences_from_path(&prefs_path).background_run_enabled);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
