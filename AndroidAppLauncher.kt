package com.jarvis.companion.automation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.provider.Settings

class AndroidAppLauncher(private val context: Context) {

    private val packageAllowlist = mapOf(
        "whatsapp" to "com.whatsapp",
        "instagram" to "com.instagram.android",
        "youtube" to "com.google.android.youtube",
        "chrome" to "com.android.chrome",
        "maps" to "com.google.android.apps.maps",
        "calendar" to "com.google.android.calendar",
        "gmail" to "com.google.android.gm",
        "spotify" to "com.spotify.music"
    )

    fun launchApp(appName: String): Pair<Boolean, String> {
        val key = appName.lowercase().trim()
        return try {
            when (key) {
                "settings" -> startIntent(Intent(Settings.ACTION_SETTINGS), "Android Settings")
                "camera" -> startIntent(Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA), "Camera")
                "phone" -> startIntent(Intent(Intent.ACTION_DIAL), "Phone Dialer")
                else -> {
                    val pkg = packageAllowlist[key]
                        ?: return Pair(false, "App '$key' is not in the JARVIS allowlist.")
                    val intent = context.packageManager.getLaunchIntentForPackage(pkg)
                        ?: return Pair(false, "$key is not installed on this Android device.")
                    startIntent(intent, key)
                }
            }
        } catch (e: Exception) {
            Pair(false, "Could not launch $key: ${e.localizedMessage}")
        }
    }

    fun openDialer(target: String): Pair<Boolean, String> {
        val digits = target.replace(Regex("[^0-9+]"), "")
        val intent = if (digits.length >= 3) {
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(digits)}"))
        } else {
            Intent(Intent.ACTION_DIAL)
        }
        return startIntent(intent, "Android Dialer")
    }

    fun openWhatsAppHandoff(phoneNumber: String?, message: String): Pair<Boolean, String> {
        return try {
            val cleanedPhone = phoneNumber?.replace(Regex("[^0-9]"), "").orEmpty()
            val intent = if (cleanedPhone.length >= 7) {
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://wa.me/$cleanedPhone?text=${Uri.encode(message)}")
                ).setPackage("com.whatsapp")
            } else {
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    setPackage("com.whatsapp")
                    putExtra(Intent.EXTRA_TEXT, message)
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            Pair(true, "Opened WhatsApp with your pre-filled message. Tap Send inside WhatsApp to complete delivery.")
        } catch (_: Exception) {
            Pair(false, "WhatsApp is not installed or could not handle the share intent.")
        }
    }

    private fun startIntent(intent: Intent, label: String): Pair<Boolean, String> {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return Pair(true, "Opened $label.")
    }
}
