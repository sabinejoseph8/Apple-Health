import Capacitor
import Foundation

// The bridge between the web app and the native Health sync (D115, 10b). The
// web app calls these from src/lib/native.ts; replies never hold a reading.
@objc(ClariviHealthPlugin)
public class ClariviHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ClariviHealthPlugin"
    public let jsName = "ClariviHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
    ]

    @objc func status(_ call: CAPPluginCall) {
        Task {
            let asked = await HealthSync.shared.permissionAsked()
            call.resolve(["available": HealthSync.available,
                          "hasToken": Keychain.token() != nil,
                          "permissionAsked": asked,
                          "lastRun": HealthSync.shared.lastRun ?? NSNull()])
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        Task {
            let ok = await HealthSync.shared.requestPermission()
            if ok { HealthSync.shared.enableBackgroundDelivery() }
            call.resolve(["asked": ok])
        }
    }

    // The token is shown to the person once by Settings and handed here to
    // the keychain, with the server address the web build was made with.
    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty,
              let url = call.getString("ingestUrl"), !url.isEmpty else {
            call.reject("token and ingestUrl are needed")
            return
        }
        HealthSync.shared.ingestUrl = url
        if Keychain.setToken(token.trimmingCharacters(in: .whitespacesAndNewlines)) {
            HealthSync.shared.enableBackgroundDelivery()
            call.resolve()
        } else {
            call.reject("the token couldn't be saved")
        }
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        HealthSync.shared.forget()
        call.resolve()
    }

    @objc func sync(_ call: CAPPluginCall) {
        let trigger = call.getString("trigger") ?? "health_open"
        let byHand = trigger == "health_button"
        Task {
            let out = await HealthSync.shared.run(trigger: trigger, byHand: byHand)
            call.resolve(out)
        }
    }
}
