// swift-tools-version: 5.9
import PackageDescription

// Capacitor may rewrite plugin `path:` entries to `node_modules` on `npx cap sync`.
// This repo uses committed `../VendorSPM/…` so Xcode works without npm — run
// `node scripts/vendor-ios-spm-plugins.mjs` after sync if paths revert, or use `npm run cap:sync`.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.1"),
        .package(name: "CapacitorSplashScreen", path: "../VendorSPM/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../VendorSPM/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
