use tauri::{AppHandle, Runtime};

use crate::{BrightnessExt, Result};

#[tauri::command]
pub async fn set_max_brightness<R: Runtime>(app: AppHandle<R>, enable: bool) -> Result<()> {
    app.brightness().set_max_brightness(enable)
}
