package br.unb.sarue.networkstatus

import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class NetworkStatusPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun getNetworkStatus(invoke: Invoke) {
        try {
            val cm = activity.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE)
                as? ConnectivityManager

            if (cm == null) {
                val ret = JSObject()
                ret.put("connectionType", "offline")
                ret.put("isMetered", false)
                invoke.resolve(ret)
                return
            }

            val activeNetwork = cm.activeNetwork
            val capabilities = activeNetwork?.let { cm.getNetworkCapabilities(it) }

            val connectionType = when {
                capabilities == null ||
                    !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "offline"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                else -> "other"
            }

            // cm.isActiveNetworkMetered identifica também Wi-Fi roteado/hotspot de celular.
            val isMetered = if (connectionType == "offline") {
                false
            } else {
                cm.isActiveNetworkMetered
            }

            val ret = JSObject()
            ret.put("connectionType", connectionType)
            ret.put("isMetered", isMetered)
            invoke.resolve(ret)
        } catch (ex: Exception) {
            invoke.reject(ex.message ?: "Falha ao consultar status da rede")
        }
    }
}
