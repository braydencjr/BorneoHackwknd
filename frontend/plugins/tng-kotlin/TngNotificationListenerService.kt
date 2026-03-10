package com.borneohackwknd.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Android NotificationListenerService that captures TNG eWallet notifications
 * and forwards them to the React Native JS layer via TngNotificationModule.
 */
class TngNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "TngNotifListener"
        private const val TARGET_PACKAGE = "my.com.tngdigital.ewallet"
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "Notification listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "Notification listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        Log.d(TAG, "onNotificationPosted: pkg=${sbn.packageName}")

        if (sbn.packageName != TARGET_PACKAGE) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        val subText = extras.getCharSequence("android.subText")?.toString() ?: ""

        Log.i(TAG, "TNG notif — title=\"$title\" text=\"$text\" bigText=\"$bigText\"")

        val content = bigText.ifBlank { text }
        if (content.isBlank()) {
            Log.d(TAG, "Empty TNG notification - skipping")
            return
        }

        TngNotificationModule.emitNotification(
            mapOf(
                "title" to title,
                "text" to content,
                "subText" to subText,
                "timestamp" to sbn.postTime.toString(),
                "packageName" to sbn.packageName,
            )
        )
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No action needed
    }
}
