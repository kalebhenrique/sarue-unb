package br.unb.sarue.share

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Base64
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@InvokeArg
class ShareImageArgs {
  lateinit var base64Png: String
  var filename: String = "grade-unb.png"
  var title: String? = null
}

@InvokeArg
class RenderStudentCardArgs {
  lateinit var pdfBase64: String
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun renderStudentCardPdf(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(RenderStudentCardArgs::class.java)
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Argumentos inválidos para renderStudentCardPdf")
      return
    }

    Thread {
      var tempPdf: File? = null
      var pfd: ParcelFileDescriptor? = null
      var renderer: PdfRenderer? = null
      var page: PdfRenderer.Page? = null
      var fullBitmap: Bitmap? = null
      var croppedBitmap: Bitmap? = null

      try {
        if (args.pdfBase64.length > 10_000_000) {
          invoke.reject("PDF excede o limite máximo de 10 MB")
          return@Thread
        }
        val cleanBase64 = args.pdfBase64
          .substringAfter("base64,", args.pdfBase64)
          .trim()
        val pdfBytes = Base64.decode(cleanBase64, Base64.DEFAULT)

        val cacheDir = File(activity.cacheDir, "pdf_render").apply { mkdirs() }
        tempPdf = File.createTempFile("student_card_", ".pdf", cacheDir)
        tempPdf.writeBytes(pdfBytes)

        pfd = ParcelFileDescriptor.open(tempPdf, ParcelFileDescriptor.MODE_READ_ONLY)
        renderer = PdfRenderer(pfd)
        if (renderer.pageCount <= 0) {
          invoke.reject("PDF da carteirinha não possui páginas")
          return@Thread
        }

        page = renderer.openPage(0)
        val scale = 2.5f
        val width = min(2400, max(1, (page.width * scale).roundToInt()))
        val height = min(2400, max(1, (page.height * scale).roundToInt()))

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        fullBitmap = bitmap
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

        val fullPageDataUrl = bitmapToDataUrl(bitmap)
        croppedBitmap = cropNonWhiteRegion(bitmap)
        val croppedDataUrl = if (croppedBitmap != null && croppedBitmap !== bitmap) {
          bitmapToDataUrl(croppedBitmap!!)
        } else {
          fullPageDataUrl
        }

        val ret = JSObject()
        ret.put("croppedDataUrl", croppedDataUrl)
        ret.put("fullPageDataUrl", fullPageDataUrl)
        invoke.resolve(ret)
      } catch (ex: Exception) {
        invoke.reject(ex.message ?: "Falha ao renderizar PDF da carteirinha nativamente")
      } finally {
        try { page?.close() } catch (_: Exception) {}
        try { renderer?.close() } catch (_: Exception) {}
        try { pfd?.close() } catch (_: Exception) {}
        try {
          if (croppedBitmap != null && croppedBitmap !== fullBitmap) {
            croppedBitmap?.recycle()
          }
          fullBitmap?.recycle()
        } catch (_: Exception) {}
        try { tempPdf?.delete() } catch (_: Exception) {}
      }
    }.start()
  }

  private fun bitmapToDataUrl(bitmap: Bitmap): String {
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    return "data:image/png;base64,$b64"
  }

  private fun cropNonWhiteRegion(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    if (w <= 0 || h <= 0) return src

    val pixels = IntArray(w * h)
    src.getPixels(pixels, 0, w, 0, 0, w, h)

    var minX = w
    var minY = h
    var maxX = 0
    var maxY = 0
    var found = false

    for (y in 0 until h) {
      val rowOffset = y * w
      for (x in 0 until w) {
        val c = pixels[rowOffset + x]
        val a = (c ushr 24) and 0xFF
        val r = (c ushr 16) and 0xFF
        val g = (c ushr 8) and 0xFF
        val b = c and 0xFF
        if (a > 16 && (r < 245 || g < 245 || b < 245)) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
          found = true
        }
      }
    }

    if (!found) return src

    val pad = (min(w, h) * 0.035f).roundToInt()
    val cropX = max(0, minX - pad)
    val cropY = max(0, minY - pad)
    val cropW = min(w - cropX, maxX - minX + pad * 2)
    val cropH = min(h - cropY, maxY - minY + pad * 2)

    if (cropW < 50 || cropH < 50) return src
    return Bitmap.createBitmap(src, cropX, cropY, cropW, cropH)
  }
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
