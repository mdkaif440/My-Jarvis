package com.jarvis.companion.bridge

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import com.jarvis.companion.automation.AndroidAppLauncher
import com.jarvis.companion.service.JarvisAccessibilityHelper
import com.jarvis.companion.service.JarvisNotificationListenerService
import com.jarvis.companion.service.JarvisVoiceForegroundService
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket

class JarvisBridgeServer(
    private val context: Context,
    private val pairingToken: String,
    private val port: Int = 8765
) {
    private var serverSocket: ServerSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val launcher = AndroidAppLauncher(context)

    fun start() {
        if (serverSocket != null) return
        scope.launch {
            serverSocket = ServerSocket(port, 16, InetAddress.getByName("127.0.0.1"))
            while (isActive && serverSocket?.isClosed == false) {
                val client = try { serverSocket?.accept() } catch (_: Exception) { break }
                if (client != null) launch { handleClient(client) }
            }
        }
    }

    fun stop() {
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        scope.coroutineContext.cancelChildren()
    }

    private fun handleClient(socket: Socket) {
        socket.use { s ->
            val reader = BufferedReader(InputStreamReader(s.getInputStream()))
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0]
            val path = parts[1]

            val headers = mutableMapOf<String, String>()
            var contentLength = 0
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
                val idx = line.indexOf(':')
                if (idx > 0) {
                    val key = line.substring(0, idx).trim().lowercase()
                    val value = line.substring(idx + 1).trim()
                    headers[key] = value
                    if (key == "content-length") contentLength = value.toIntOrNull() ?: 0
                }
            }

            if (method == "OPTIONS") {
                writeResponse(s, 204, "")
                return
            }

            val token = headers["x-jarvis-token"].orEmpty()
            if (token.isEmpty() || token != pairingToken) {
                writeResponse(s, 401, JSONObject().put("error", "Unauthorized pairing token").toString())
                return
            }

            val body = if (contentLength > 0 && contentLength < 32_768) {
                val buf = CharArray(contentLength)
                reader.read(buf, 0, contentLength)
                String(buf)
            } else ""

            when {
                method == "GET" && path == "/bridge/status" -> {
                    val status = JSONObject()
                        .put("version", "1.0.0")
                        .put("notificationAccessEnabled", JarvisNotificationListenerService.isConnected)
                        .put("foregroundVoiceActive", JarvisVoiceForegroundService.isRunning)
                        .put("accessibilityHelperEnabled", JarvisAccessibilityHelper.isEnabled)
                    writeResponse(s, 200, status.toString())
                }
                method == "POST" && path == "/bridge/command" -> {
                    val json = runCatching { JSONObject(body) }.getOrNull()
                    val command = json?.optString("command").orEmpty()
                    val params = json?.optJSONObject("params") ?: JSONObject()
                    val (code, resp) = dispatchAllowlistedCommand(command, params)
                    writeResponse(s, code, resp.toString())
                }
                else -> writeResponse(s, 404, JSONObject().put("error", "Not found").toString())
            }
        }
    }

    private fun dispatchAllowlistedCommand(command: String, params: JSONObject): Pair<Int, JSONObject> {
        return when (command) {
            "open_app" -> {
                val (ok, msg) = launcher.launchApp(params.optString("app_name"))
                Pair(200, JSONObject().put("launched", ok).put("message", msg))
            }
            "make_call" -> {
                val (ok, msg) = launcher.openDialer(params.optString("target"))
                Pair(200, JSONObject().put("launched", ok).put("message", msg))
            }
            "read_notifications" -> {
                val filter = params.optString("app_filter", "whatsapp")
                val limit = params.optInt("limit", 20)
                val list = JarvisNotificationListenerService.getAccessibleNotifications(filter, limit)
                val arr = JSONArray()
                list.forEach { n ->
                    arr.put(JSONObject()
                        .put("id", n.id).put("packageName", n.packageName).put("appName", n.appName)
                        .put("sender", n.sender).put("text", n.text).put("timestamp", n.timestamp))
                }
                Pair(200, JSONObject()
                    .put("notificationAccessEnabled", JarvisNotificationListenerService.isConnected)
                    .put("notifications", arr))
            }
            "whatsapp_handoff" -> {
                val (ok, msg) = launcher.openWhatsAppHandoff(
                    params.optString("phoneNumber").takeIf { it.isNotBlank() },
                    params.optString("message")
                )
                Pair(200, JSONObject().put("opened", ok).put("message", msg))
            }
            "device_status" -> {
                val bm = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                val level = bm?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scale = bm?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
                val status = bm?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
                val pct = if (level >= 0 && scale > 0) (level * 100) / scale else -1
                val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
                Pair(200, JSONObject()
                    .put("batteryPercent", pct)
                    .put("isCharging", charging)
                    .put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                    .put("androidVersion", "Android ${Build.VERSION.RELEASE}"))
            }
            else -> Pair(403, JSONObject().put("error", "Command '$command' is not in the companion allowlist."))
        }
    }

    private fun writeResponse(socket: Socket, status: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val header = buildString {
            append("HTTP/1.1 $status OK\r\n")
            append("Content-Type: application/json; charset=utf-8\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Access-Control-Allow-Headers: Content-Type, X-Jarvis-Token\r\n")
            append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
            append("Content-Length: ${bytes.size}\r\n")
            append("Connection: close\r\n\r\n")
        }
        socket.getOutputStream().apply {
            write(header.toByteArray(Charsets.UTF_8))
            write(bytes)
            flush()
        }
    }
}
