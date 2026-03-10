package com.borneohackwknd.app

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
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

    /**
     * Open app details page. Useful when users need to allow restricted settings
     * or adjust OEM-specific background behavior.
     */
    @ReactMethod
    fun openAppDetailsSettings(promise: Promise) {
        try {
            val pkg = reactApplicationContext.packageName
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$pkg")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_APP_DETAILS", e.message, e)
        }
    }

    /**
     * Open battery optimization settings page.
     */
    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_BATTERY_SETTINGS", e.message, e)
        }
    }

    /**
     * Best-effort attempt to open OEM background/autostart settings.
     * Returns the screen that was opened.
     */
    @ReactMethod
    fun openBackgroundProtectionSettings(promise: Promise) {
        try {
            val intents = listOf(
                // Xiaomi / MIUI autostart settings
                Intent().setComponent(
                    ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"
                    )
                ),
                // OPPO / Realme startup manager
                Intent().setComponent(
                    ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                    )
                ),
                Intent().setComponent(
                    ComponentName(
                        "com.oppo.safe",
                        "com.oppo.safe.permission.startup.StartupAppListActivity"
                    )
                ),
                // Vivo iManager
                Intent().setComponent(
                    ComponentName(
                        "com.iqoo.secure",
                        "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
                    )
                ),
                // Huawei protected apps
                Intent().setComponent(
                    ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                    )
                ),
            )

            for (intent in intents) {
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                if (startActivitySafely(intent)) {
                    promise.resolve("oem_background")
                    return
                }
            }

            val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            if (startActivitySafely(fallback)) {
                promise.resolve("battery_optimization")
                return
            }

            val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            if (startActivitySafely(appDetails)) {
                promise.resolve("app_details")
                return
            }

            promise.resolve("none")
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_BACKGROUND_PROTECTION", e.message, e)
        }
    }

    /**
     * Request the system to rebind the NotificationListenerService.
     * Useful when MIUI or other OEMs have cached a rejection even after the user
     * has enabled Autostart and battery settings — forces a fresh bind attempt.
     */
    @ReactMethod
    fun requestNotificationListenerRebind(promise: Promise) {
        try {
            val cn = ComponentName(reactApplicationContext, TngNotificationListenerService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                android.service.notification.NotificationListenerService.requestRebind(cn)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_REBIND", e.message, e)
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

    private fun startActivitySafely(intent: Intent): Boolean {
        return try {
            reactApplicationContext.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }
}
