/**
 * Capacitor's `cap sync` writes CapApp-SPM/Package.swift with paths into repo-root
 * `node_modules/…`, which does not exist on machines that only clone + open Xcode.
 *
 * This script:
 * 1. When `node_modules` is present (dev/CI with npm): copies the two official plugins
 *    into `ios/App/VendorSPM/{splash-screen,status-bar}` (includes patch-package fixes).
 * 2. Rewrites `ios/App/CapApp-SPM/Package.swift` so those dependencies use `../VendorSPM/…`
 *    (paths are relative to the CapApp-SPM manifest directory).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iosApp = join(root, "ios/App");
const vendorRoot = join(iosApp, "VendorSPM");
const packageSwift = join(iosApp, "CapApp-SPM", "Package.swift");

if (!existsSync(packageSwift)) {
  console.log("[vendor-ios-spm] No ios/App/CapApp-SPM; skipping.");
  process.exit(0);
}

const plugins = [
  { id: "@capacitor/app", folder: "app", spmName: "CapacitorApp" },
  { id: "@capacitor/splash-screen", folder: "splash-screen", spmName: "CapacitorSplashScreen" },
  { id: "@capacitor/status-bar", folder: "status-bar", spmName: "CapacitorStatusBar" },
  { id: "@capacitor/local-notifications", folder: "local-notifications", spmName: "CapacitorLocalNotifications" },
];

function copyVendoredPlugins() {
  mkdirSync(vendorRoot, { recursive: true });
  for (const p of plugins) {
    const src = join(root, "node_modules", p.id);
    const dest = join(vendorRoot, p.folder);
    if (!existsSync(join(src, "Package.swift"))) {
      continue;
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    console.log(`[vendor-ios-spm] synced ${p.id} → ios/App/VendorSPM/${p.folder}`);
  }
}

function rewritePackageSwift() {
  if (!existsSync(packageSwift)) {
    console.warn("[vendor-ios-spm] CapApp-SPM/Package.swift not found; skip rewrite.");
    return;
  }
  let text = readFileSync(packageSwift, "utf8");
  for (const p of plugins) {
    const re = new RegExp(
      `\\.package\\(name:\\s*"${p.spmName}",\\s*path:\\s*"[^"]*"\\)`,
      "g",
    );
    const next = `.package(name: "${p.spmName}", path: "../VendorSPM/${p.folder}")`;
    text = text.replace(re, next);
  }
  writeFileSync(packageSwift, text, "utf8");
  console.log("[vendor-ios-spm] CapApp-SPM/Package.swift → VendorSPM paths");
}

function assertVendorForPreflight() {
  const missing = [];
  for (const p of plugins) {
    if (!existsSync(join(vendorRoot, p.folder, "Package.swift"))) {
      missing.push(`ios/App/VendorSPM/${p.folder}/Package.swift`);
    }
  }
  return missing;
}

copyVendoredPlugins();
rewritePackageSwift();

const missingVendor = assertVendorForPreflight();
if (missingVendor.length) {
  console.error("\n[vendor-ios-spm] Missing vendored plugin packages (needed for Xcode without npm):\n");
  for (const m of missingVendor) console.error("  -", m);
  console.error(
    "\nOn a dev machine with Node: run `npm install` then `node scripts/vendor-ios-spm-plugins.mjs`,\n" +
      "then commit `ios/App/VendorSPM/` and `ios/App/CapApp-SPM/Package.swift`.\n",
  );
  process.exit(1);
}
