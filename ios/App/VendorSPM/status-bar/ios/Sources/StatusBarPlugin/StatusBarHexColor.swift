import UIKit

/// Local hex helpers so Status Bar does not depend on `PluginConfig.getString` / `UIColor.capacitor.color(fromHex:)`,
/// which are unavailable in some Capacitor 8 SwiftPM xcframework builds (Xcode 16).
enum StatusBarHexColor {
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
            // Same channel order as Capacitor's `UIColor.capacitor.color(fromHex:)` (RRGGBBAA).
            r = CGFloat((value & 0xFF00_0000) >> 24) / 255
            g = CGFloat((value & 0x00FF0000) >> 16) / 255
            b = CGFloat((value & 0x0000FF00) >> 8) / 255
            a = CGFloat(value & 0x000000FF) / 255
        default:
            return nil
        }

        return UIColor(red: r, green: g, blue: b, alpha: a)
    }

    static func hexString(from color: UIColor) -> String {
        let c = color.resolvedColor(with: .current)
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var unusedAlpha: CGFloat = 0
        guard c.getRed(&r, green: &g, blue: &b, alpha: &unusedAlpha) else {
            return "#000000"
        }
        return String(
            format: "#%02X%02X%02X",
            Int((r * 255).rounded()),
            Int((g * 255).rounded()),
            Int((b * 255).rounded())
        )
    }
}
