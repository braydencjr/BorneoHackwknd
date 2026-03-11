/**
 * plugins/withTngNotificationListener.js
 *
 * Expo config plugin that injects the TNG eWallet NotificationListenerService
 * into the Android build. This survives `expo prebuild` / `expo run:android`.
 *
 * It performs 4 modifications:
 *   1. Adds the <service> declaration for TngNotificationListenerService
 *      with android:permission=BIND_NOTIFICATION_LISTENER_SERVICE
 *   3. Adds `add(TngNotificationPackage())` to MainApplication's getPackages()
 *   4. Copies the 3 Kotlin source files into the android project
 */

const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ─── 1: AndroidManifest.xml ────────────────────────────────────────────────

function addManifestMods(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // Add <service> inside <application> (if not already present)
    const app = manifest.manifest.application?.[0];
    if (app) {
      if (!app.service) app.service = [];
      const svcExists = app.service.some(
        (s) => s.$?.["android:name"] === ".TngNotificationListenerService",
      );
      if (!svcExists) {
        app.service.push({
          $: {
            "android:name": ".TngNotificationListenerService",
            "android:exported": "true",
            "android:permission":
              "android.permission.BIND_NOTIFICATION_LISTENER_SERVICE",
          },
          "intent-filter": [
            {
              action: [
                {
                  $: {
                    "android:name":
                      "android.service.notification.NotificationListenerService",
                  },
                },
              ],
            },
          ],
        });
      }
    }

    return cfg;
  });
}

// ─── 3: MainApplication — inject TngNotificationPackage ─────────────────────

function addPackageRegistration(config) {
  return withMainApplication(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Add import if missing
    if (!contents.includes("TngNotificationPackage")) {
      // Inject add(TngNotificationPackage()) into getPackages()
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        `PackageList(this).packages.apply {\n              add(TngNotificationPackage())`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

// ─── 4: Copy Kotlin source files ────────────────────────────────────────────

function copyKotlinSources(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidPkg = "app/src/main/java/com/brayden/borneohackwknd";
      const destDir = path.join(projectRoot, "android", androidPkg);

      // Source files live next to this plugin file
      const srcDir = path.join(__dirname, "tng-kotlin");

      const files = [
        "TngNotificationListenerService.kt",
        "TngNotificationModule.kt",
        "TngNotificationPackage.kt",
      ];

      fs.mkdirSync(destDir, { recursive: true });

      for (const file of files) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      return cfg;
    },
  ]);
}

// ─── Plugin entry point ─────────────────────────────────────────────────────

function withTngNotificationListener(config) {
  config = addManifestMods(config);
  config = addPackageRegistration(config);
  config = copyKotlinSources(config);
  return config;
}

module.exports = withTngNotificationListener;
