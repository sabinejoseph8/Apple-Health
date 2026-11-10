import Capacitor
import UIKit

// The app's one screen: Capacitor's web view with Clarivi's own plugin added.
class ClariviViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ClariviHealthPlugin())
    }
}
