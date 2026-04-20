# CapApp-SPM

This package is used to host SPM dependencies for your Capacitor project

Do not modify the contents of it or there may be unintended consequences.

## If Xcode says “Missing package product ‘CapApp-SPM’”

That message usually means **SwiftPM never finished loading** this package’s graph (Xcode does not show the underlying error clearly).

### This repo: vendored plugins (no `node_modules` on the Xcode VM)

Capacitor’s default `npx cap sync ios` writes `CapApp-SPM/Package.swift` with paths into repo-root **`node_modules`**, which **does not exist** on a machine that only pulls git and opens Xcode.

**Fix in this repo:** `patch-package` patches **`@capacitor/cli`** so sync always emits **`../VendorSPM/splash-screen`** and **`../VendorSPM/status-bar`** (see `patches/@capacitor+cli+8.3.1.patch`). After **`npm install`**, run **`npx cap sync ios`** (or **`npm run cap:sync`**) and **commit** the updated `ios/App/CapApp-SPM/Package.swift` — it should list `../VendorSPM/…`, never `node_modules`.

**`ios/App/VendorSPM/`** holds the Swift packages; keep it committed. Refresh from npm when you bump plugin versions:

```bash
npm install
node scripts/vendor-ios-spm-plugins.mjs
```

That vendor step also runs in **`postinstall`** and after **`npm run cap:sync`**. If you use plain **`npx cap sync ios`**, run **`npm run cap:sync:ios`** instead (sync + vendor), or rely on the CLI patch after **`npm install`**.

### Still stuck?

1. In Xcode: **File → Packages → Reset Package Caches**, then **Resolve Package Versions**.
2. Confirm the Mac can reach **GitHub** (this package depends on `https://github.com/ionic-team/capacitor-swift-pm.git`). A VM without outbound HTTPS will break resolution.
3. Open **`ios/App/App.xcodeproj`** so the local package reference `CapApp-SPM` resolves next to the project (sibling folder `ios/App/CapApp-SPM/`).

`npm run cap:ios` runs `scripts/ios-spm-preflight.mjs` before opening Xcode.

### Xcode “lstat … capacitor.config.json / config.xml / public”

The App target expects **`ios/App/App/capacitor.config.json`**, **`config.xml`**, and **`ios/App/App/public/`** (built web assets). Those are produced by **`npx cap copy ios`** (included in **`npm run cap:sync`**).

For machines that only pull git and open Xcode, **commit those paths** after a local build:

```bash
npm run ios:assets
# then git add ios/App/App/public ios/App/App/capacitor.config.json ios/App/App/config.xml
```
