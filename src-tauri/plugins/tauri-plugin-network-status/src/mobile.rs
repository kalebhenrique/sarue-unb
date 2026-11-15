use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::NetworkStatus;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "br.unb.sarue.networkstatus";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_network_status);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NetworkStatusClient<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "NetworkStatusPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_network_status)?;
    Ok(NetworkStatusClient(handle))
}

/// Acesso às APIs nativas de status de rede em builds mobile (Android / iOS).
pub struct NetworkStatusClient<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NetworkStatusClient<R> {
    pub fn get_network_status(&self) -> crate::Result<NetworkStatus> {
        self.0
            .run_mobile_plugin::<NetworkStatus>("getNetworkStatus", ())
            .map_err(Into::into)
    }
}
