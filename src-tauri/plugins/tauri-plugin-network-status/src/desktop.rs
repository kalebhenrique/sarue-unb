use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::{ConnectionType, NetworkStatus};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NetworkStatusClient<R>> {
    Ok(NetworkStatusClient(app.clone()))
}

/// Acesso às APIs de status de rede em builds desktop.
pub struct NetworkStatusClient<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> NetworkStatusClient<R> {
    /// No desktop, retorna fallback padrão `{ connectionType: "wifi", isMetered: false }`
    /// para não bloquear o sync automático.
    pub fn get_network_status(&self) -> crate::Result<NetworkStatus> {
        Ok(NetworkStatus {
            connection_type: ConnectionType::Wifi,
            is_metered: false,
        })
    }
}
