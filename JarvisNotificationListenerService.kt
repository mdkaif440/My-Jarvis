package com.jarvis.companion.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import java.security.MessageDigest
import java.util.concurrent.CopyOnWriteArrayList

data class CapturedNotification(
    val id: String,
    val packageName: String,
    val appName: String,
    val sender: String,
    val text: String,
    val timestamp: Long,
    val conversationTitle: String?
)

class JarvisNotificationListenerService : NotificationListenerService() {

    companion object {
        @Volatile var isConnected: Boolean = false
        @Volatile var isCaptureEnabled: Boolean = true
        private const val MAX_ITEMS = 60
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
        private val items = CopyOnWriteArrayList<CapturedNotification>()
        private val seenHashes = LinkedHashSet<String>()

        fun getAccessibleNotifications(appFilter: String = "whatsapp", limit: Int = 20): List<CapturedNotification> {
            if (!isCaptureEnabled) return emptyList()
            return items
                .filter { appFilter == "all" || WHATSAPP_PACKAGES.contains(it.packageName) }
                .take(limit.coerceIn(1, 50))
        }

        fun clearAll() {
            items.clear()
            synchronized(seenHashes) { seenHashes.clear() }
        }
    }

    override fun onListenerConnected() {
        isConnected = true
        activeNotifications?.forEach { ingest(it) }
    }

    override fun onListenerDisconnected() {
        isConnected = false
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (!isCaptureEnabled || sbn == null) return
        ingest(sbn)
    }

    private fun ingest(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        val notif = sbn.notification ?: return
        if ((notif.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

        val appName = if (WHATSAPP_PACKAGES.contains(pkg)) "WhatsApp" else pkg
        val messagingStyle = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notif)

        if (messagingStyle != null && messagingStyle.messages.isNotEmpty()) {
            val convTitle = messagingStyle.conversationTitle?.toString()
            for (msg in messagingStyle.messages) {
                val sender = msg.person?.name?.toString()?.takeIf { it.isNotBlank() }
                    ?: convTitle ?: "Unknown"
                val text = msg.text?.toString()?.trim().orEmpty()
                if (text.isNotEmpty()) {
                    recordUnique(pkg, appName, sender, text, msg.timestamp, convTitle)
                }
            }
            return
        }

        val extras = notif.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
            ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()

        if (title.isNotEmpty() && text.isNotEmpty()) {
            recordUnique(pkg, appName, title, text, sbn.postTime, null)
        }
    }

    private fun recordUnique(
        pkg: String, appName: String, sender: String, text: String, ts: Long, convTitle: String?
    ) {
        val rawKey = "$pkg|$sender|$text|${ts / 5000}"
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(rawKey.toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16)

        synchronized(seenHashes) {
            if (!seenHashes.add(digest)) return
            if (seenHashes.size > 300) seenHashes.remove(seenHashes.first())
        }

        items.add(0, CapturedNotification(digest, pkg, appName, sender, text, ts, convTitle))
        while (items.size > MAX_ITEMS) items.removeAt(items.lastIndex)
    }
}
