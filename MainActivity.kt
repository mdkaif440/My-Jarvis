package com.jarvis.companion.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import com.jarvis.companion.bridge.JarvisBridgeServer
import com.jarvis.companion.service.JarvisNotificationListenerService
import com.jarvis.companion.service.JarvisVoiceForegroundService
import java.security.SecureRandom

class MainActivity : AppCompatActivity() {

    private var bridgeServer: JarvisBridgeServer? = null
    private lateinit var pairingToken: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("jarvis_companion_prefs", MODE_PRIVATE)
        pairingToken = prefs.getString("pairing_token", null) ?: generateToken().also {
            prefs.edit().putString("pairing_token", it).apply()
        }

        bridgeServer = JarvisBridgeServer(applicationContext, pairingToken).also { it.start() }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 80, 48, 48)
            setBackgroundColor(0xFF020617.toInt())
        }

        fun title(text: String) = TextView(this).apply {
            this.text = text; textSize = 20f; setTextColor(0xFF00E5FF.toInt()); setPadding(0, 16, 0, 16)
        }
        fun body(text: String) = TextView(this).apply {
            this.text = text; textSize = 14f; setTextColor(0xFFE2E8F0.toInt()); setPadding(0, 8, 0, 16)
        }

        root.addView(title("JARVIS ANDROID COMPANION"))
        root.addView(body("Local Bridge Active: http://127.0.0.1:8765\nPairing Token: $pairingToken"))

        root.addView(Button(this).apply {
            text = "Copy Pairing Token for PWA Settings"
            setOnClickListener {
                getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("JARVIS Token", pairingToken))
                Toast.makeText(context, "Pairing token copied", Toast.LENGTH_SHORT).show()
            }
        })

        root.addView(Button(this).apply {
            text = "1. Grant Notification Access (WhatsApp Reading)"
            setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        })

        root.addView(Switch(this).apply {
            text = "Capture Accessible Notifications"
            setTextColor(0xFFE2E8F0.toInt())
            isChecked = JarvisNotificationListenerService.isCaptureEnabled
            setOnCheckedChangeListener { _, checked -> JarvisNotificationListenerService.isCaptureEnabled = checked }
        })

        root.addView(Button(this).apply {
            text = "2. Start Foreground Wake-Word Mic Service"
            setOnClickListener {
                ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.RECORD_AUDIO), 10)
                startForegroundService(Intent(context, JarvisVoiceForegroundService::class.java))
            }
        })

        root.addView(Button(this).apply {
            text = "Stop Foreground Voice Service"
            setOnClickListener {
                startService(Intent(context, JarvisVoiceForegroundService::class.java).setAction(JarvisVoiceForegroundService.ACTION_STOP))
            }
        })

        setContentView(root)
    }

    override fun onDestroy() {
        bridgeServer?.stop()
        super.onDestroy()
    }

    private fun generateToken(): String {
        val bytes = ByteArray(18)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
