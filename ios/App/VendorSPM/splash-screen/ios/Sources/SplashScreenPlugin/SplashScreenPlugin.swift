import Foundation
import UIKit
import WebKit
import Capacitor

@objc(SplashScreenPlugin)
public class SplashScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SplashScreenPlugin"
    public let jsName = "SplashScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
    ]
    private var splashScreen: SplashScreen?

    override public func load() {
        if let view = pluginBridgeHostView() {
            splashScreen = SplashScreen(parentView: view, config: splashScreenConfig())
            splashScreen?.showOnLaunch()
        }
    }

    /// Root layout view when `bridge.viewController` / `bridge.webView` are not visible on `any CAPBridgeProtocol` (Capacitor 8 SwiftPM + Xcode 16).
    private func pluginBridgeHostView() -> UIView? {
        guard let b = bridge as? NSObject else { return nil }
        if let v = (b.value(forKey: "viewController") as? UIViewController)?.view {
            return v
        }
        if let wv = b.value(forKey: "webView") as? WKWebView {
            return wv.window?.rootViewController?.view ?? wv.superview
        }
        return nil
    }

    /// SwiftPM xcframework builds can hide `reject` / `CAPPluginCallError` from Swift; call the ObjC `reject:code:error:data:` IMP instead.
    private func splashReject(_ call: CAPPluginCall, _ message: String) {
        let target = call as NSObject
        let sel = NSSelectorFromString("reject:code:error:data:")
        guard target.responds(to: sel) else {
            if target.responds(to: NSSelectorFromString("reject:")) {
                target.perform(NSSelectorFromString("reject:"), with: message)
            }
            return
        }
        let imp = target.method(for: sel)
        typealias RejectFn = @convention(c) (AnyObject, Selector, NSString, NSString?, NSError?, NSDictionary?) -> Void
        let fn = unsafeBitCast(imp, to: RejectFn.self)
        fn(target, sel, message as NSString, "SPLASH_SCREEN_ERROR" as NSString, nil, nil)
    }

    // Show the splash screen
    @objc public func show(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.show(settings: settings,
                        completion: {
                            call.resolve()
                        })
        } else {
            splashReject(call, "Unable to show Splash Screen")
        }
    }

    // Hide the splash screen
    @objc public func hide(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.hide(settings: settings)
            call.resolve()
        } else {
            splashReject(call, "Unable to hide Splash Screen")
        }
    }

    private func splashScreenSettings(from call: CAPPluginCall) -> SplashScreenSettings {
        var settings = SplashScreenSettings()
        guard let raw = call.options else { return settings }
        let opts = raw as NSDictionary

        if let v = intFromJs(opts["showDuration"]) {
            settings.showDuration = v
        }
        if let v = intFromJs(opts["fadeInDuration"]) {
            settings.fadeInDuration = v
        }
        if let v = intFromJs(opts["fadeOutDuration"]) {
            settings.fadeOutDuration = v
        }
        if let v = opts["autoHide"] as? Bool {
            settings.autoHide = v
        } else if let n = opts["autoHide"] as? NSNumber {
            settings.autoHide = n.boolValue
        }
        return settings
    }

    private func intFromJs(_ value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let n = value as? NSNumber { return n.intValue }
        if let d = value as? Double { return Int(d) }
        return nil
    }

    private func splashScreenConfig() -> SplashScreenConfig {
        var config = SplashScreenConfig()
        let json = getConfig().getConfigJSON()

        if let s = json["backgroundColor"] as? String, let c = SplashScreenHexColor.uiColor(fromHex: s) {
            config.backgroundColor = c
        }
        if let spinnerStyle = json["iosSpinnerStyle"] as? String {
            switch spinnerStyle.lowercased() {
            case "small":
                config.spinnerStyle = .medium
            default:
                config.spinnerStyle = .large
            }
        }
        if let s = json["spinnerColor"] as? String, let c = SplashScreenHexColor.uiColor(fromHex: s) {
            config.spinnerColor = c
        }
        if let b = json["showSpinner"] as? Bool {
            config.showSpinner = b
        } else if let n = json["showSpinner"] as? NSNumber {
            config.showSpinner = n.boolValue
        }

        if let d = intFromJs(json["launchShowDuration"]) {
            config.launchShowDuration = d
        }
        if let b = json["launchAutoHide"] as? Bool {
            config.launchAutoHide = b
        } else if let n = json["launchAutoHide"] as? NSNumber {
            config.launchAutoHide = n.boolValue
        }
        return config
    }
}

// MARK: - Hex colors (in-module; avoids second file + `UIColor.capacitor.color(fromHex:)` in stripped SwiftPM builds)
private enum SplashScreenHexColor {
    static func uiColor(fromHex hex: String) -> UIColor? {
        let cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        guard !cleaned.isEmpty else { return nil }

        var value: UInt64 = 0
        let scanner = Scanner(string: cleaned)
        guard scanner.scanHexInt64(&value), scanner.isAtEnd else { return nil }

        let r: CGFloat
        let g: CGFloat
        let b: CGFloat
        let a: CGFloat

        switch cleaned.count {
        case 6:
            r = CGFloat((value & 0xFF0000) >> 16) / 255
            g = CGFloat((value & 0x00FF00) >> 8) / 255
            b = CGFloat(value & 0x0000FF) / 255
            a = 1
        case 8:
            r = CGFloat((value & 0xFF00_0000) >> 24) / 255
            g = CGFloat((value & 0x00FF0000) >> 16) / 255
            b = CGFloat((value & 0x0000FF00) >> 8) / 255
            a = CGFloat(value & 0x000000FF) / 255
        default:
            return nil
        }

        return UIColor(red: r, green: g, blue: b, alpha: a)
    }
}
