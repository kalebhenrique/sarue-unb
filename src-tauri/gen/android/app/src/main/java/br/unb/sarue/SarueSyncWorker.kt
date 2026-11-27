package br.unb.sarue

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File

class SarueSyncWorker : JobService() {

  override fun onStartJob(params: JobParameters?): Boolean {
    Thread {
      try {
        ensureNativeLoaded()
        val dataDir = resolveTauriDataDir(applicationContext)
        nativeRunBackgroundSync(dataDir.absolutePath)
      } catch (e: Throwable) {
        Logger.error("[SarueSyncWorker] Falha ao executar sync em segundo plano: $e")
      } finally {
        jobFinished(params, false)
      }
    }.start()
    return true
  }

  override fun onStopJob(params: JobParameters?): Boolean {
    return true
  }

  private external fun nativeRunBackgroundSync(dataDirPath: String): Boolean

  companion object {
    private const val JOB_ID = 414106
    private const val PERIODIC_INTERVAL_MS = 6L * 60L * 60L * 1000L

    @Volatile
    private var nativeLibraryLoaded = false

    private fun ensureNativeLoaded() {
      if (nativeLibraryLoaded) return
      synchronized(this) {
        if (!nativeLibraryLoaded) {
          try {
            System.loadLibrary("sarue_unb_lib")
            nativeLibraryLoaded = true
          } catch (_: Throwable) {
            nativeLibraryLoaded = true
          }
        }
      }
    }

    fun resolveTauriDataDir(context: Context): File {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        context.dataDir
      } else {
        File(context.applicationInfo.dataDir)
      }
    }

    private fun readPreferences(context: Context): Pair<Boolean, Boolean> {
      val dir = resolveTauriDataDir(context)
      val candidates = listOf(
        File(dir, "preferences.json"),
        File(dir, "preferences_dev.json"),
        File(context.filesDir, "preferences.json"),
        File(context.filesDir, "preferences_dev.json")
      )

      for (file in candidates) {
        if (file.exists()) {
          try {
            val json = JSONObject(file.readText())
            val bgEnabled = json.optBoolean("background_run_enabled", true)
            val wifiOnly = json.optBoolean("sync_only_on_wifi", true)
            return Pair(bgEnabled, wifiOnly)
          } catch (_: Throwable) {}
        }
      }
      return Pair(true, true)
    }

    fun syncSchedule(context: Context) {
      try {
        val scheduler = context.applicationContext
          .getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler
          ?: return

        val (bgEnabled, wifiOnly) = readPreferences(context)
        if (!bgEnabled) {
          scheduler.cancel(JOB_ID)
          return
        }

        val networkType = if (wifiOnly) {
          JobInfo.NETWORK_TYPE_UNMETERED
        } else {
          JobInfo.NETWORK_TYPE_ANY
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val existing = scheduler.getPendingJob(JOB_ID)
          if (existing != null) {
            @Suppress("DEPRECATION")
            val sameNetwork = existing.networkType == networkType
            val sameBattery = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
              existing.isRequireBatteryNotLow
            } else {
              true
            }
            val sameInterval = existing.intervalMillis == PERIODIC_INTERVAL_MS
            if (sameNetwork && sameBattery && sameInterval) {
              return
            }
          }
        }

        val component = ComponentName(context.applicationContext, SarueSyncWorker::class.java)
        val builder = JobInfo.Builder(JOB_ID, component)
          .setRequiredNetworkType(networkType)
          .setPeriodic(PERIODIC_INTERVAL_MS)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          builder.setRequiresBatteryNotLow(true)
        }

        scheduler.schedule(builder.build())
      } catch (e: Throwable) {
        Logger.error("[SarueSyncWorker] Falha ao sincronizar JobScheduler: $e")
      }
    }
  }
}
