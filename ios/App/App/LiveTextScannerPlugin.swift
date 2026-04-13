import AVFoundation
import Capacitor
import SwiftUI
import UIKit

#if !targetEnvironment(macCatalyst)
import VisionKit
#endif

@objc(LiveTextScannerPlugin)
public class LiveTextScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveTextScannerPlugin"
    public let jsName = "LiveTextScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getHardwareSupport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanText", returnType: CAPPluginReturnPromise),
    ]

    private var activeCall: CAPPluginCall?
    private weak var presentedScanner: UIViewController?

    @objc func getHardwareSupport(_ call: CAPPluginCall) {
        call.resolve(["hardware": LiveTextScannerSupport.isHardwareSupported])
    }

    @objc func scanText(_ call: CAPPluginCall) {
        #if targetEnvironment(macCatalyst)
        call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
        return
        #else
        scanTextImpl(call)
        #endif
    }

    #if !targetEnvironment(macCatalyst)
    private func scanTextImpl(_ call: CAPPluginCall) {
        guard LiveTextScannerSupport.isHardwareSupported else {
            call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
            return
        }

        guard #available(iOS 16.0, *) else {
            call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
            return
        }

        guard DataScannerViewController.isSupported else {
            call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
            return
        }

        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .denied, .restricted:
            call.resolve(["error": LiveTextScannerPluginError.denied.rawValue])
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.presentLiveScanner(afterPermissionCheck: call)
                    } else {
                        call.resolve(["error": LiveTextScannerPluginError.denied.rawValue])
                    }
                }
            }
        default:
            presentLiveScanner(afterPermissionCheck: call)
        }
    }

    private func presentLiveScanner(afterPermissionCheck call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
            return
        }

        guard DataScannerViewController.isAvailable else {
            call.resolve(["error": LiveTextScannerPluginError.denied.rawValue])
            return
        }

        guard let bridge = bridge, let root = bridge.viewController else {
            call.resolve(["error": LiveTextScannerPluginError.unsupported.rawValue])
            return
        }

        guard activeCall == nil else {
            call.resolve(["error": "busy"])
            return
        }

        activeCall = call

        let host = UIHostingController(rootView: LiveTextScannerHostView { [weak self] outcome in
            self?.finishScanCall(outcome: outcome)
        })
        host.modalPresentationStyle = .pageSheet
        host.view.backgroundColor = .black
        if let sheet = host.sheetPresentationController {
            sheet.detents = [.large()]
            sheet.prefersGrabberVisible = false
            sheet.preferredCornerRadius = 20
        }

        presentedScanner = host
        root.present(host, animated: true, completion: nil)
    }
    #endif

    private func finishScanCall(outcome: LiveTextScannerOutcome) {
        guard let call = activeCall else { return }
        activeCall = nil
        presentedScanner = nil

        switch outcome {
        case .recognized(let text):
            call.resolve(["text": text])
        case .cancelled:
            call.resolve(["cancelled": true])
        case .failed(let err):
            call.resolve(["error": err.rawValue])
        }
    }
}
