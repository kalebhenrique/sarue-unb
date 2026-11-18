package br.unb.sarue.share

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ShareImageArgs {
  lateinit var base64Png: String
  var filename: String = "grade-unb.png"
  var title: String? = null
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun shareImage(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ShareImageArgs::class.java)
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Argumentos inválidos para shareImage")
      return
    }

    try {
      val cleanBase64 = args.base64Png.substringAfter("base64,", args.base64Png)
      val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)

      val sanitizedName = args.filename
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .replace(Regex("[^a-zA-Z0-9._-]"), "_")
        .ifBlank { "grade-unb.png" }

      val shareDir = File(activity.cacheDir, "shared_images").apply { mkdirs() }
      val imageFile = File(shareDir, sanitizedName)
      imageFile.writeBytes(imageBytes)

      val uri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.fileprovider",
        imageFile
      )

      val shareTitle = args.title ?: "Compartilhar imagem"
      val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, shareTitle)
        clipData = ClipData.newRawUri("", uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }

      val chooserIntent = Intent.createChooser(sendIntent, shareTitle)
      activity.runOnUiThread {
        try {
          activity.startActivity(chooserIntent)
          invoke.resolve()
        } catch (ex: Exception) {
          invoke.reject(ex.message ?: "Não foi possível abrir o seletor de compartilhamento")
        }
      }
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Falha ao preparar imagem para compartilhamento")
    }
  }
}
