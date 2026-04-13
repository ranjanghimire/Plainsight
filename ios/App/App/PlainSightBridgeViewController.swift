import Capacitor
import UIKit

/// Registers local native plugins with the Capacitor bridge.
final class PlainSightBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LiveTextScannerPlugin())
    }
}
