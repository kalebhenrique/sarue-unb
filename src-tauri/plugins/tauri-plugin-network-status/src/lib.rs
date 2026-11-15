use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::{ConnectionType, NetworkStatus};

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::NetworkStatusClient;
#[cfg(mobile)]
use mobile::NetworkStatusClient;

/// Extensão para acessar o status de rede a partir do `AppHandle`, `App`, `Window` ou `WebviewWindow`.
pub trait NetworkStatusExt<R: Runtime> {
    fn network_status(&self) -> &NetworkStatusClient<R>;
}

impl<R: Runtime, T: Manager<R>> NetworkStatusExt<R> for T {
    fn network_status(&self) -> &NetworkStatusClient<R> {
        self.state::<NetworkStatusClient<R>>().inner()
    }
}

/// Inicializa o plugin local `tauri-plugin-network-status`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("network-status")
        .invoke_handler(tauri::generate_handler![commands::get_network_status])
        .setup(|app, api| {
            #[cfg(mobile)]
            let client = mobile::init(app, api)?;
            #[cfg(desktop)]
            let client = desktop::init(app, api)?;
            app.manage(client);
            Ok(())
        })
        .build()
}
