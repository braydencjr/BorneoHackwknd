package com.borneohackwknd.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Android NotificationListenerService that captures notifications from
 * Touch 'n Go eWallet (my.com.tngdigital.ewallet).
 *
 * This service requires the user to explicitly grant Notification Access
 * in Android Settings. It runs in the background and forwards matching
 * notification content to the React Native layer via TngNotificationModule.
 */
class TngNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "TngNotifListener"
        private const val TNG_PACKAGE = "my.com.tngdigital.ewallet"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        // Only process TNG eWallet notifications
        if (sbn.packageName != TNG_PACKAGE) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        val subText = extras.getCharSequence("android.subText")?.toString() ?: ""

        // Use bigText if available (usually contains full notification content),
        // otherwise fall back to the standard text field
        val content = bigText.ifBlank { text }

        if (content.isBlank()) {
            Log.d(TAG, "Empty TNG notification – skipping")
            return
        }

        val notificationData = mapOf(
            "title" to title,
            "text" to content,
            "subText" to subText,
            "timestamp" to sbn.postTime.toString(),
            "packageName" to sbn.packageName,
        )

        Log.d(TAG, "TNG notification captured: $title | $content")

        // Forward to the React Native module
        TngNotificationModule.emitNotification(notificationData)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No action needed when notifications are dismissed
    }
}
