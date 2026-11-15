use tauri::{command, AppHandle, Runtime};

use crate::{models::NetworkStatus, NetworkStatusExt, Result};

#[command]
pub(crate) async fn get_network_status<R: Runtime>(app: AppHandle<R>) -> Result<NetworkStatus> {
    tauri::async_runtime::spawn_blocking(move || app.network_status().get_network_status())
        .await
        .expect("Falha ao aguardar consulta de status de rede")
}
