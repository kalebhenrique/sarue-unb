use serde::{Deserialize, Serialize, Serializer};
use tauri::{plugin::TauriPlugin, Manager, Runtime};

mod commands;

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "br.unb.sarue.share";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_share);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedStudentCard {
    pub cropped_data_url: String,
    pub full_page_data_url: String,
}

#[cfg(target_os = "android")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayStoreCheckResponse {
    is_play_store: bool,
}

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderStudentCardArgs {
    pdf_base64: String,
}

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
#[serde(rename_all = "camelCase")]
struct ShareImageArgs {
    base64_png: String,
    filename: String,
    title: Option<String>,
}

/// Acesso às APIs nativas de compartilhamento de imagem.
pub struct Share<R: Runtime> {
    #[cfg(desktop)]
    _marker: std::marker::PhantomData<fn() -> R>,
    #[cfg(mobile)]
    mobile_plugin_handle: PluginHandle<R>,
}

impl<R: Runtime> Share<R> {
    /// Abre a folha nativa de compartilhamento no mobile para uma imagem PNG em base64.
    /// Retorna `Ok(true)` quando compartilhado nativamente, ou `Ok(false)` em desktop (fallback).
    #[cfg(desktop)]
    pub fn share_image(
        &self,
        base64_png: String,
        filename: String,
        title: Option<String>,
    ) -> Result<bool> {
        let _ = (base64_png, filename, title);
        Ok(false)
    }

    #[cfg(mobile)]
    pub fn share_image(
        &self,
        base64_png: String,
        filename: String,
        title: Option<String>,
    ) -> Result<bool> {
        self.mobile_plugin_handle
            .run_mobile_plugin::<()>(
                "shareImage",
                ShareImageArgs {
                    base64_png,
                    filename,
                    title,
                },
            )
            .map(|_| true)
            .map_err(Into::into)
    }

    /// Renderiza e recorta a 1ª página do PDF da Carteirinha Estudantil usando `PdfRenderer` nativo no Android.
    /// Em Desktop/iOS retorna `Ok(None)` para acionar o fallback JS.
    #[cfg(not(target_os = "android"))]
    pub fn render_student_card_pdf(&self, pdf_base64: String) -> Result<Option<RenderedStudentCard>> {
        let _ = pdf_base64;
        Ok(None)
    }

    #[cfg(target_os = "android")]
    pub fn render_student_card_pdf(&self, pdf_base64: String) -> Result<Option<RenderedStudentCard>> {
        self.mobile_plugin_handle
            .run_mobile_plugin::<RenderedStudentCard>(
                "renderStudentCardPdf",
                RenderStudentCardArgs { pdf_base64 },
            )
            .map(Some)
            .map_err(Into::into)
    }

    /// Verifica se o app no Android foi instalado via Google Play Store (`com.android.vending`, ou seja, bundle `.aab`).
    /// Retorna `Ok(false)` quando instalado via `.apk` (sideload) ou fora do Android.
    #[cfg(not(target_os = "android"))]
    pub fn is_play_store_install(&self) -> Result<bool> {
        Ok(false)
    }

    #[cfg(target_os = "android")]
    pub fn is_play_store_install(&self) -> Result<bool> {
        self.mobile_plugin_handle
            .run_mobile_plugin::<PlayStoreCheckResponse>("isPlayStoreInstall", ())
            .map(|r| r.is_play_store)
            .or(Ok(false))
    }
}

/// Extensão para acessar [`Share`] via [`tauri::AppHandle`] / [`tauri::Manager`].
pub trait ShareExt<R: Runtime> {
    fn share(&self) -> &Share<R>;
}

impl<R: Runtime, T: Manager<R>> ShareExt<R> for T {
    fn share(&self) -> &Share<R> {
        self.state::<Share<R>>().inner()
    }
}

/// Inicializa o plugin local de compartilhamento nativo.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("share")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "SharePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_share)?;

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            let _ = api;

            app.manage(Share {
                #[cfg(desktop)]
                _marker: std::marker::PhantomData::<fn() -> R>,
                #[cfg(mobile)]
                mobile_plugin_handle: handle,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::share_image])
        .build()
}
