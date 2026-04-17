/**
 * Fails fast if CapApp-SPM cannot resolve its local plugin packages.
 * Xcode often surfaces this as "Missing package product 'CapApp-SPM'" when the real
 * problem is an unresolved Package.swift graph.
 *
 * This project vendors official plugins under `ios/App/VendorSPM/` so Xcode works
 * without repo-root `node_modules` (e.g. rented VMs with no npm).
 *
 * Also checks iOS target resources normally produced by `npx cap copy ios`
 * (`public/`, `capacitor.config.json`, `config.xml`) so Xcode does not fail with
 * lstat "No such file or directory" when those paths are not committed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageSwift = join(root, "ios/App/CapApp-SPM/Package.swift");
const vendorSplash = join(root, "ios/App/VendorSPM/splash-screen/Package.swift");
const vendorStatus = join(root, "ios/App/VendorSPM/status-bar/Package.swift");
const capConfig = join(root, "ios/App/App/capacitor.config.json");
const cordovaConfig = join(root, "ios/App/App/config.xml");
const publicIndex = join(root, "ios/App/App/public/index.html");

const missing = [];
if (!existsSync(packageSwift)) missing.push(packageSwift);
if (!existsSync(vendorSplash)) missing.push(vendorSplash);
if (!existsSync(vendorStatus)) missing.push(vendorStatus);
if (!existsSync(capConfig)) missing.push(capConfig);
if (!existsSync(cordovaConfig)) missing.push(cordovaConfig);
if (!existsSync(publicIndex)) missing.push(publicIndex);

if (missing.length) {
  console.error("\n[ios-spm-preflight] iOS project is incomplete — missing:\n");
  for (const p of missing) {
    console.error("  -", p);
  }
  console.error(
    "\nVendor / SPM:\n" +
      "  On a machine with Node: `npm install` then `node scripts/vendor-ios-spm-plugins.mjs`\n" +
      "  Commit `ios/App/VendorSPM/` and `ios/App/CapApp-SPM/Package.swift`.\n" +
      "\nWeb bundle (Xcode copies these into the app target):\n" +
      "  On a machine with Node: `npm run ios:assets` (or `npm run cap:sync`)\n" +
      "  Commit `ios/App/App/public/`, `ios/App/App/capacitor.config.json`, and `ios/App/App/config.xml`.\n",
  );
  process.exit(1);
}

const pkgText = readFileSync(packageSwift, "utf8");
if (!pkgText.includes("../VendorSPM/splash-screen") || !pkgText.includes("../VendorSPM/status-bar")) {
  console.error(
    "\n[ios-spm-preflight] CapApp-SPM/Package.swift does not reference VendorSPM plugin paths.\n" +
      "Run: node scripts/vendor-ios-spm-plugins.mjs\n",
  );
  process.exit(1);
}

console.log("[ios-spm-preflight] OK — VendorSPM, CapApp-SPM manifest, and iOS web bundle files are present.");
