/**
 * Fails fast if CapApp-SPM cannot resolve its local plugin packages.
 * Xcode often surfaces this as "Missing package product 'CapApp-SPM'" when the real
 * problem is an unresolved Package.swift graph.
 *
 * This project vendors official plugins under `ios/App/VendorSPM/` so Xcode works
 * without repo-root `node_modules` (e.g. rented VMs with no npm).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageSwift = join(root, "ios/App/CapApp-SPM/Package.swift");
const vendorSplash = join(root, "ios/App/VendorSPM/splash-screen/Package.swift");
const vendorStatus = join(root, "ios/App/VendorSPM/status-bar/Package.swift");

const missing = [];
if (!existsSync(packageSwift)) missing.push(packageSwift);
if (!existsSync(vendorSplash)) missing.push(vendorSplash);
if (!existsSync(vendorStatus)) missing.push(vendorStatus);

if (missing.length) {
  console.error("\n[ios-spm-preflight] CapApp-SPM cannot resolve — missing:\n");
  for (const p of missing) {
    console.error("  -", p);
  }
  console.error(
    "\nFix (on a machine with Node): from repo root run\n" +
      "  npm install\n" +
      "  node scripts/vendor-ios-spm-plugins.mjs\n" +
      "then commit `ios/App/VendorSPM/` and `ios/App/CapApp-SPM/Package.swift`.\n",
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

console.log("[ios-spm-preflight] OK — VendorSPM plugins and CapApp-SPM manifest are aligned.");
