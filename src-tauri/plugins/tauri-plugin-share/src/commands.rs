use tauri::{AppHandle, Runtime};

use crate::{Result, ShareExt};

#[tauri::command]
pub async fn share_image<R: Runtime>(
    app: AppHandle<R>,
    base64_png: String,
    filename: String,
    title: Option<String>,
) -> Result<bool> {
    app.share().share_image(base64_png, filename, title)
}
