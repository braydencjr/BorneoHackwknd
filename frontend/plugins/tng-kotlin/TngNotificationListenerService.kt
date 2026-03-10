package com.borneohackwknd.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Android NotificationListenerService that captures TNG eWallet notifications,
 * calls the backend API to classify & record them, and shows a native
 * Android notification with the result. Works even when the app is closed.
 */
class TngNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "TngNotifListener"
        private const val TARGET_PACKAGE = "my.com.tngdigital.ewallet"
        private const val CHANNEL_ID = "tng_transactions"
        private var notifId = 1000
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        ensureNotificationChannel()
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

        // Emit to JS layer (works only if app is in foreground)
        TngNotificationModule.emitNotification(
            mapOf(
                "title" to title,
                "text" to content,
                "subText" to subText,
                "timestamp" to sbn.postTime.toString(),
                "packageName" to sbn.packageName,
            )
        )

        // Call backend API directly (works even when app is closed)
        classifyAndRecord(title, content)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No action needed
    }

    /**
     * Call the backend /notifications/classify endpoint to classify and
     * auto-record the transaction. Runs on a background thread.
     */
    private fun classifyAndRecord(title: String, text: String) {
        val prefs = applicationContext.getSharedPreferences(
            TngNotificationModule.PREFS_NAME, MODE_PRIVATE
        )
        val token = prefs.getString(TngNotificationModule.KEY_ACCESS_TOKEN, null)
        val apiUrl = prefs.getString(TngNotificationModule.KEY_API_URL, null)

        if (token.isNullOrBlank() || apiUrl.isNullOrBlank()) {
            Log.w(TAG, "No credentials synced — cannot call API")
            return
        }

        thread {
            try {
                val url = URL("$apiUrl/api/v1/notifications/classify")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.doOutput = true
                conn.connectTimeout = 15000
                conn.readTimeout = 15000

                val body = JSONObject().apply {
                    put("title", title)
                    put("text", text)
                }

                OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
                    writer.write(body.toString())
                    writer.flush()
                }

                val responseCode = conn.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = BufferedReader(
                        InputStreamReader(conn.inputStream, "UTF-8")
                    ).use { it.readText() }

                    val json = JSONObject(response)
                    val classification = json.optString("classification", "general")
                    val recorded = json.optBoolean("recorded", false)

                    if (recorded && classification != "general") {
                        val amount = json.optDouble("amount", 0.0)
                        val merchant = json.optString("merchant_name", "Unknown")
                        val typeLabel = if (classification == "outgoing_payment") "Payment" else "Income"
                        showNotification(
                            "$typeLabel Recorded — RM${"%.2f".format(amount)}",
                            "Transaction at $merchant has been automatically recorded."
                        )
                    } else {
                        Log.d(TAG, "Not recorded (classification=$classification)")
                    }
                } else {
                    val errorStream = conn.errorStream
                    val errorBody = errorStream?.bufferedReader()?.use { it.readText() } ?: "no body"
                    Log.w(TAG, "API returned $responseCode: $errorBody")
                }

                conn.disconnect()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to classify/record notification", e)
            }
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return

            val channel = NotificationChannel(
                CHANNEL_ID,
                "TNG Transactions",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for automatically recorded TNG transactions"
            }
            manager.createNotificationChannel(channel)
            Log.i(TAG, "Notification channel created")
        }
    }

    private fun showNotification(title: String, body: String) {
        // Ensure channel exists (onListenerConnected may not re-fire after rebuilds)
        ensureNotificationChannel()

        // On Android 13+ check runtime permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                Log.w(TAG, "POST_NOTIFICATIONS permission not granted — cannot show notification")
                return
            }
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        NotificationManagerCompat.from(this).notify(notifId++, notification)
        Log.i(TAG, "Notification posted: $title")
    }
}
