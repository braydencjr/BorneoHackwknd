package com.borneohackwknd.app

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * React Native native module that:
 *   1. Checks / opens Notification Access settings
 *   2. Receives TNG notification data from TngNotificationListenerService
 *   3. Emits events to the JS layer via DeviceEventEmitter
 */
class TngNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "TngNotifModule"
        private const val EVENT_NAME = "onTngNotification"

        // Singleton reference so the NotificationListenerService can emit
        private var moduleInstance: TngNotificationModule? = null

        fun emitNotification(data: Map<String, String>) {
            val instance = moduleInstance ?: run {
                Log.w(TAG, "Module not initialised – dropping notification")
                return
            }
            val params = Arguments.createMap().apply {
                data.forEach { (k, v) -> putString(k, v) }
            }
            instance.sendEvent(EVENT_NAME, params)
        }
    }

    override fun getName(): String = "TngNotificationModule"

    override fun initialize() {
        super.initialize()
        moduleInstance = this
    }

    override fun invalidate() {
        moduleInstance = null
        super.invalidate()
    }

    // ─── JS-callable methods ───────────────────────────────────────────

    /**
     * Check whether Notification Access is granted for this app.
     */
    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) {
        try {
            val enabled = isListenerEnabled()
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_ACCESS", e.message, e)
        }
    }

    /**
     * Open the system Notification Access settings screen so the user
     * can grant permission to this app.
     */
    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_SETTINGS", e.message, e)
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private fun isListenerEnabled(): Boolean {
        val context = reactApplicationContext
        val cn = ComponentName(context, TngNotificationListenerService::class.java)
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        return flat.split(":").any { TextUtils.equals(it, cn.flattenToString()) }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
