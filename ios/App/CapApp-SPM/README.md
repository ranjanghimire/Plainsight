# CapApp-SPM

This package is used to host SPM dependencies for your Capacitor project

Do not modify the contents of it or there may be unintended consequences.

## If Xcode says “Missing package product ‘CapApp-SPM’”

That message usually means **SwiftPM never finished loading** this package’s graph (Xcode does not always show the underlying dependency error).

1. **Install JS dependencies at the repo root** (not only inside `ios/`). `Package.swift` uses local paths under `../../../node_modules/…`; if `node_modules` is missing, resolution fails.
2. From the repo root run **`npm run cap:sync`** (or at least `npm install` then open Xcode again).
3. In Xcode: **File → Packages → Reset Package Caches**, then **Resolve Package Versions**.
4. Confirm the Mac can reach **GitHub** (this package depends on `https://github.com/ionic-team/capacitor-swift-pm.git`). A VM without outbound HTTPS will break resolution.
5. Open **`ios/App/App.xcodeproj`** so the local package reference `CapApp-SPM` resolves next to the project (sibling folder `ios/App/CapApp-SPM/`).

`npm run cap:ios` runs `scripts/ios-spm-preflight.mjs` before opening Xcode to catch the missing-`node_modules` case early.
