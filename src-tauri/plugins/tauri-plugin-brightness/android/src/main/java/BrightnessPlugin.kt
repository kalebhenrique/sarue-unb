package br.unb.sarue.brightness

import android.app.Activity
import android.view.WindowManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class SetMaxBrightnessArgs {
  var enable: Boolean = false
}

@TauriPlugin
class BrightnessPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setMaxBrightness(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(SetMaxBrightnessArgs::class.java)
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Invalid arguments for setMaxBrightness")
      return
    }

    activity.runOnUiThread {
      try {
        val window = activity.window
        val layoutParams = window.attributes
        if (args.enable) {
          layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
          window.attributes = layoutParams
          window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
          layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
          window.attributes = layoutParams
          window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        invoke.resolve()
      } catch (ex: Exception) {
        invoke.reject(ex.message ?: "Failed to update screen brightness")
      }
    }
  }
}
