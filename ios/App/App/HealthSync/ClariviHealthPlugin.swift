import Capacitor
import Foundation
import UIKit

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
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notificationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "planFollowUp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelFollowUp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appState", returnType: CAPPluginReturnPromise),
    ]

    // MARK: Whether the app is on screen (10f)

    // iOS also starts the app out of sight, when the Watch saves sleep (the
    // Health observer), and the web page then loads with no one looking. The
    // web app asks here before it counts a card as seen, and hears when the
    // app comes to the front or goes away.
    public override func load() {
        let centre = NotificationCenter.default
        centre.addObserver(self, selector: #selector(cameToFront), name: UIApplication.didBecomeActiveNotification, object: nil)
        centre.addObserver(self, selector: #selector(wentAway), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    @objc private func cameToFront() { notifyListeners("appState", data: ["inFront": true]) }
    @objc private func wentAway() { notifyListeners("appState", data: ["inFront": false]) }

    // Opening the app passes through "inactive" before "active", so only
    // "background" means out of sight.
    @objc func appState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["inFront": UIApplication.shared.applicationState != .background])
        }
    }

    // MARK: Notifications the phone schedules itself (10c)

    @objc func notificationStatus(_ call: CAPPluginCall) {
        Task { call.resolve(["status": await LocalNotifications.status()]) }
    }

    // Once allowed, anything planned before permission existed is planned
    // again: iOS drops a request made before the person says yes.
    @objc func requestNotifications(_ call: CAPPluginCall) {
        Task {
            let ok = await LocalNotifications.request()
            if ok {
                HealthSync.shared.planReminders()
                LocalNotifications.replanFollowUp()
            }
            call.resolve(["granted": ok])
        }
    }

    @objc func planFollowUp(_ call: CAPPluginCall) {
        guard let day = call.getString("date") else { return call.reject("date is needed") }
        LocalNotifications.planFollowUp(day: day)
        call.resolve()
    }

    @objc func cancelFollowUp(_ call: CAPPluginCall) {
        guard let day = call.getString("date") else { return call.reject("date is needed") }
        LocalNotifications.cancelFollowUp(day: day)
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        Task {
            let asked = await HealthSync.shared.permissionAsked()
            call.resolve(["available": HealthSync.available,
                          "hasToken": HealthSync.shared.token != nil,
                          "permissionAsked": asked,
                          "lastRun": HealthSync.shared.lastRun ?? NSNull()])
        }
    }

    // On each open: the server address, the signed-in account and the words
    // for the notifications (10c), then the reminders are planned.
    @objc func configure(_ call: CAPPluginCall) {
        guard let url = call.getString("ingestUrl"), !url.isEmpty,
              let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("ingestUrl and userId are needed")
            return
        }
        HealthSync.shared.configure(ingestUrl: url, userId: userId)
        var texts: [String: String] = [:]
        for key in ["title", "readingsIn", "reminderTitle", "reminder", "followUpTitle", "followUp"] {
            if let t = call.getString(key) { texts[key] = t }
        }
        if !texts.isEmpty { LocalNotifications.texts = texts }
        HealthSync.shared.planReminders()
        if HealthSync.shared.token != nil { HealthSync.shared.enableBackgroundDelivery() }
        call.resolve()
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        Task {
            let ok = await HealthSync.shared.requestPermission()
            if ok { HealthSync.shared.enableBackgroundDelivery() }
            call.resolve(["asked": ok])
        }
    }

    // The token is shown to the person once by Settings and handed here to
    // the keychain, under the signed-in account.
    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("token is needed")
            return
        }
        if HealthSync.shared.setToken(token.trimmingCharacters(in: .whitespacesAndNewlines)) {
            HealthSync.shared.enableBackgroundDelivery()
            HealthSync.shared.planReminders()
            call.resolve()
        } else {
            call.reject("the token couldn't be saved")
        }
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        HealthSync.shared.forget()
        call.resolve()
    }

    // Only the app's own trigger words reach the server's log (D115).
    @objc func sync(_ call: CAPPluginCall) {
        let trigger = call.getString("trigger") ?? "health_open"
        guard ["health_open", "health_button"].contains(trigger) else {
            call.reject("unknown trigger")
            return
        }
        let byHand = trigger == "health_button"
        Task {
            let out = await HealthSync.shared.run(trigger: trigger, byHand: byHand)
            call.resolve(out)
        }
    }
}
