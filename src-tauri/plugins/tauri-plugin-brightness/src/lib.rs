use serde::{Serialize, Serializer};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

mod commands;

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "br.unb.sarue.brightness";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_brightness);

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[cfg(mobile)]
    #[error(transparent)]
    PluginInvoke(#[from] tauri::plugin::mobile::PluginInvokeError),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[cfg(mobile)]
#[derive(Serialize)]
struct SetMaxBrightnessArgs {
    enable: bool,
}

/// Acesso às APIs de brilho máximo e prevenção de bloqueio de tela.
pub struct Brightness<R: Runtime> {
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
    #[cfg(mobile)]
    mobile_plugin_handle: PluginHandle<R>,
}

impl<R: Runtime> Brightness<R> {
    /// Ativa ou restaura o brilho máximo da tela e o Keep Screen On no dispositivo móvel.
    /// Em builds desktop é um no-op que retorna sucesso.
    #[cfg(desktop)]
    pub fn set_max_brightness(&self, enable: bool) -> Result<()> {
        let _ = enable;
        Ok(())
    }

    #[cfg(mobile)]
    pub fn set_max_brightness(&self, enable: bool) -> Result<()> {
        self.mobile_plugin_handle
            .run_mobile_plugin("setMaxBrightness", SetMaxBrightnessArgs { enable })
            .map_err(Into::into)
    }
}

/// Extensão para acessar [`Brightness`] via [`tauri::AppHandle`] / [`tauri::Manager`].
pub trait BrightnessExt<R: Runtime> {
    fn brightness(&self) -> &Brightness<R>;
}

impl<R: Runtime, T: Manager<R>> BrightnessExt<R> for T {
    fn brightness(&self) -> &Brightness<R> {
        self.state::<Brightness<R>>().inner()
    }
}

/// Inicializa o plugin local de brilho máximo da tela.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("brightness")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "BrightnessPlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_brightness)?;

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            let _ = api;

            app.manage(Brightness {
                #[cfg(desktop)]
                _marker: std::marker::PhantomData::<fn() -> R>,
                #[cfg(mobile)]
                mobile_plugin_handle: handle,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::set_max_brightness])
        .build()
}
