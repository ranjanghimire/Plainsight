/**
 * Fails fast if CapApp-SPM's local path dependencies are missing.
 * Xcode often surfaces this as "Missing package product 'CapApp-SPM'" when the real
 * problem is an unresolved Package.swift graph (e.g. no node_modules on a fresh VM).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  join(root, "node_modules/@capacitor/splash-screen/Package.swift"),
  join(root, "node_modules/@capacitor/status-bar/Package.swift"),
  join(root, "ios/App/CapApp-SPM/Package.swift"),
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length) {
  console.error("\n[ios-spm-preflight] CapApp-SPM cannot resolve: required paths are missing:\n");
  for (const p of missing) {
    console.error("  -", p);
  }
  console.error(
    "\nFix (repo root):\n  npm install\n  npm run cap:sync\n\nThen in Xcode: File → Packages → Reset Package Caches, then Resolve Package Versions.\n",
  );
  process.exit(1);
}

console.log("[ios-spm-preflight] OK — plugin SPM folders and CapApp-SPM manifest are present.");
