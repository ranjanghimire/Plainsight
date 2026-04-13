import SwiftUI
import UIKit

#if !targetEnvironment(macCatalyst)
import VisionKit
#endif

// MARK: - Availability

enum LiveTextScannerSupport {
    /// Hides the in-app camera affordance on Mac Catalyst and on hardware without VisionKit live scanning.
    static var isHardwareSupported: Bool {
        #if targetEnvironment(macCatalyst)
        return false
        #else
        if #available(iOS 16.0, *) {
            return DataScannerViewController.isSupported
        }
        return false
        #endif
    }
}

// MARK: - Outcomes (shared with Capacitor plugin)

enum LiveTextScannerOutcome {
    case recognized(String)
    case cancelled
    case failed(LiveTextScannerPluginError)
}

enum LiveTextScannerPluginError: String {
    case unsupported
    case denied
}

// MARK: - VisionKit (not built for Mac Catalyst)

#if !targetEnvironment(macCatalyst)

/// Embeds `DataScannerViewController` for SwiftUI / `UIHostingController` presentation.
/// Text-only recognition via `recognizedDataTypes: [.text()]`; OCR runs on-device after `startScanning()`.
/// (Public VisionKit API does not expose a separate `liveCapture` flag — live preview is active while scanning.)
@available(iOS 16.0, *)
struct LiveTextScannerRepresentable: UIViewControllerRepresentable {
    let onTextRecognized: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTextRecognized: onTextRecognized)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.text()],
            qualityLevel: .balanced,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        context.coordinator.scanner = scanner
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if !scanner.isScanning, DataScannerViewController.isAvailable {
            do {
                try scanner.startScanning()
            } catch {
                // Availability checks run before presentation; failure here is rare.
            }
        }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        if scanner.isScanning {
            scanner.stopScanning()
        }
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onTextRecognized: (String) -> Void
        weak var scanner: DataScannerViewController?

        init(onTextRecognized: @escaping (String) -> Void) {
            self.onTextRecognized = onTextRecognized
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            switch item {
            case .text(let recognized):
                let text = recognized.transcript
                if !text.isEmpty {
                    onTextRecognized(text)
                }
            default:
                break
            }
        }
    }
}

struct LiveTextScannerHostView: View {
    @Environment(\.dismiss) private var dismiss
    let onComplete: (LiveTextScannerOutcome) -> Void

    @State private var didFinish = false

    var body: some View {
        Group {
            if #available(iOS 16.0, *) {
                LiveTextScannerRepresentable(onTextRecognized: { text in
                    guard !didFinish else { return }
                    didFinish = true
                    onComplete(.recognized(text))
                    dismiss()
                })
                .ignoresSafeArea()
            } else {
                Color(.systemBackground)
                    .ignoresSafeArea()
                    .onAppear {
                        guard !didFinish else { return }
                        didFinish = true
                        onComplete(.failed(.unsupported))
                        dismiss()
                    }
            }
        }
        .onDisappear {
            if !didFinish {
                didFinish = true
                onComplete(.cancelled)
            }
        }
    }
}

#else

struct LiveTextScannerHostView: View {
    let onComplete: (LiveTextScannerOutcome) -> Void

    var body: some View {
        Color.clear
            .onAppear {
                onComplete(.failed(.unsupported))
            }
    }
}

#endif
