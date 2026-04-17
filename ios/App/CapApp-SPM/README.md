# CapApp-SPM

This package is used to host SPM dependencies for your Capacitor project

Do not modify the contents of it or there may be unintended consequences.

## If Xcode says “Missing package product ‘CapApp-SPM’”

That message usually means **SwiftPM never finished loading** this package’s graph (Xcode does not always show the underlying dependency error).

### This repo: vendored plugins (no `node_modules` required for iOS)

Capacitor normally points SPM at `../../../node_modules/@capacitor/…`, which **does not exist** if you only `git pull` on a machine without npm.

Here, **`ios/App/VendorSPM/`** holds copies of the official splash + status-bar Swift packages, and `Package.swift` is rewritten to use `../VendorSPM/…`. Those folders are **committed to git** so Xcode on a VM can resolve packages after a pull.

On a dev machine (after changing plugin versions or patches), refresh the copy:

```bash
npm install
node scripts/vendor-ios-spm-plugins.mjs
```

That runs automatically after **`npm install`** (`postinstall`) and after **`npm run cap:sync`**.

### Still stuck?

1. In Xcode: **File → Packages → Reset Package Caches**, then **Resolve Package Versions**.
2. Confirm the Mac can reach **GitHub** (this package depends on `https://github.com/ionic-team/capacitor-swift-pm.git`). A VM without outbound HTTPS will break resolution.
3. Open **`ios/App/App.xcodeproj`** so the local package reference `CapApp-SPM` resolves next to the project (sibling folder `ios/App/CapApp-SPM/`).

`npm run cap:ios` runs `scripts/ios-spm-preflight.mjs` before opening Xcode.
