package br.unb.sarue

import android.content.ComponentCallbacks2
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    try {
      initPlatformVerifier(this)
    } catch (e: Throwable) {
      Logger.error("Falha ao inicializar platform verifier: $e")
    }

    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }

    SarueSyncWorker.syncSchedule(this)
  }

  override fun onStop() {
    super.onStop()
    // Re-sincroniza constraints do WorkManager ao sair (caso o aluno tenha alterado Wi-Fi / Background Run)
    SarueSyncWorker.syncSchedule(this)
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    val isRealMemoryPressure =
      level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND ||
        (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW &&
          level < ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN)
    if (isRealMemoryPressure) {
      try {
        onAndroidTrimMemory(level)
      } catch (e: Throwable) {
        Logger.error("Falha ao liberar caches nativos em onTrimMemory: $e")
      }
    }
  }

  private external fun initPlatformVerifier(context: Any)
  private external fun onAndroidTrimMemory(level: Int)
}
