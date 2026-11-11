import Foundation
import HealthKit
import UIKit

// The native sync (D115, Phase 10, 10b): what the Clarivi Sync Shortcut does,
// done by the app itself. One run is one morning's attempt:
//   1. automatic runs act only between 4am and 8pm (D119; noon before), and never twice in a day
//      on this phone (the same rules as the Shortcut's automations);
//   2. a small ping asks the server whether today's sync is already complete;
//   3. yesterday's and today's readings are read from Health, the five types
//      the Shortcut reads, and sent as one daily post in the same column
//      format, with the upload token from the keychain;
//   4. a reply with night_complete marks the day done on this phone.
// The server keeps the rules about what counts (the 6pm to noon heart rate
// window, ranges, duplicates), so nothing here decides anything about health.
// Replies hold counts and a message, never readings, and the run's outcome
// is kept for Settings without any reading in it.
final class HealthSync {
    static let shared = HealthSync()

    private let store = HKHealthStore()
    private let defaults = UserDefaults.standard
    private let lock = NSLock()
    // The run in progress, if any: a second caller waits for it and gets its
    // outcome, so two triggers at once make one sync, not a sync and a refusal.
    private var current: Task<[String: Any], Never>?
    // The one observer query for new sleep data; set up once per launch.
    private var observer: HKObserverQuery?

    // iOS gives a background wake about 30 seconds in all, so a background
    // run gives each request less time than a run with the app open.
    private static let foregroundTimeout: TimeInterval = 60
    private static let backgroundTimeout: TimeInterval = 12

    private static let markerKey = "clarivi.lastSyncDay"
    private static let lastRunKey = "clarivi.lastRun"
    private static let ingestUrlKey = "clarivi.ingestUrl"
    private static let userIdKey = "clarivi.userId"
    private static let schemaVersion = 1

    // The reading types, named as the server expects them (ingest-schema.ts).
    private struct Reading {
        let name: String
        let type: HKSampleType
        let unit: HKUnit?
    }

    private static let readings: [Reading] = [
        Reading(name: "heart_rate", type: HKQuantityType(.heartRate), unit: HKUnit.count().unitDivided(by: .minute())),
        Reading(name: "hrv_sdnn", type: HKQuantityType(.heartRateVariabilitySDNN), unit: HKUnit.secondUnit(with: .milli)),
        Reading(name: "respiratory_rate", type: HKQuantityType(.respiratoryRate), unit: HKUnit.count().unitDivided(by: .minute())),
        Reading(name: "resting_hr", type: HKQuantityType(.restingHeartRate), unit: HKUnit.count().unitDivided(by: .minute())),
        Reading(name: "sleep_stage", type: HKCategoryType(.sleepAnalysis), unit: nil),
    ]

    static let sleepType = HKCategoryType(.sleepAnalysis)

    private static var readTypes: Set<HKObjectType> { Set(readings.map { $0.type }) }

    static var available: Bool { HKHealthStore.isHealthDataAvailable() }

    // MARK: What the app passes in on each open

    // The server address the web build was made for, and the signed-in
    // account, whose token is the only one this phone uses. A different
    // account signing in starts afresh: no marker, no run, no reminders.
    func configure(ingestUrl: String, userId: String) {
        if let previous = defaults.string(forKey: Self.userIdKey), previous != userId {
            Keychain.clearToken(for: previous)
            defaults.removeObject(forKey: Self.markerKey)
            defaults.removeObject(forKey: Self.lastRunKey)
            LocalNotifications.cancelAll()
        }
        defaults.set(ingestUrl, forKey: Self.ingestUrlKey)
        defaults.set(userId, forKey: Self.userIdKey)
    }

    var ingestUrl: String? { defaults.string(forKey: Self.ingestUrlKey) }
    var userId: String? { defaults.string(forKey: Self.userIdKey) }

    var token: String? {
        guard let userId else { return nil }
        return Keychain.token(for: userId)
    }

    func setToken(_ token: String) -> Bool {
        guard let userId else { return false }
        return Keychain.setToken(token, for: userId)
    }

    var lastRun: [String: Any]? { defaults.dictionary(forKey: Self.lastRunKey) }

    // MARK: Permission

    // Whether the Health permission sheet has been shown. iOS never says
    // whether reading was allowed, only whether it still needs to ask.
    func permissionAsked() async -> Bool {
        guard Self.available else { return false }
        return await withCheckedContinuation { cont in
            store.getRequestStatusForAuthorization(toShare: [], read: Self.readTypes) { status, _ in
                cont.resume(returning: status == .unnecessary)
            }
        }
    }

    func requestPermission() async -> Bool {
        guard Self.available else { return false }
        return await withCheckedContinuation { cont in
            store.requestAuthorization(toShare: [], read: Self.readTypes) { ok, _ in cont.resume(returning: ok) }
        }
    }

    // MARK: Background delivery

    // Health wakes the app when new sleep data arrives (R7's "by itself").
    // The handler runs a morning sync under the same rules as any automatic
    // run, so a wake outside 4am to 8pm, or after today's sync, does nothing.
    func enableBackgroundDelivery() {
        guard Self.available else { return }
        lock.lock()
        let alreadySet = observer != nil
        lock.unlock()
        guard !alreadySet else { return }
        let query = HKObserverQuery(sampleType: Self.sleepType, predicate: nil) { _, completion, _ in
            Task {
                _ = await HealthSync.shared.run(trigger: "health_background", byHand: false)
                completion()
            }
        }
        lock.lock()
        observer = query
        lock.unlock()
        store.execute(query)
        store.enableBackgroundDelivery(for: Self.sleepType, frequency: .immediate) { _, _ in }
    }

    // MARK: The run

    // Returns the outcome for the app: result, message, at, trigger. Results:
    // no_token, no_url, no_permission, outside_window, done_today,
    // already_complete, night_complete, night_not_finished, unreadable,
    // refused, failed. The message is the
    // server's own sentence when it sent one (from its wording module) and
    // empty otherwise: the app puts words to each result from the wording
    // module, so no sentence for the person lives here.
    func run(trigger: String, byHand: Bool) async -> [String: Any] {
        let (task, started) = joinOrStart(trigger: trigger, byHand: byHand)
        let out = await task.value
        if started { finished() }
        return out
    }

    // The run in progress, or a new one. Locking happens here, outside any
    // async code.
    private func joinOrStart(trigger: String, byHand: Bool) -> (Task<[String: Any], Never>, Bool) {
        lock.lock()
        defer { lock.unlock() }
        if let inFlight = current { return (inFlight, false) }
        let task = Task { await self.runOnce(trigger: trigger, byHand: byHand) }
        current = task
        return (task, true)
    }

    private func finished() {
        lock.lock()
        current = nil
        lock.unlock()
    }

    // Whether the app is on screen. Health's observer also calls back when
    // the app has just been opened, and that run is an open run, not a
    // background one.
    private func onScreen() async -> Bool {
        await MainActor.run { UIApplication.shared.applicationState == .active }
    }

    private func runOnce(trigger asked: String, byHand: Bool) async -> [String: Any] {
        let now = Date()
        let inFront = await onScreen()
        let trigger = asked == "health_background" && inFront ? "health_open" : asked
        let timeout = trigger == "health_background" ? Self.backgroundTimeout : Self.foregroundTimeout
        guard let token else {
            return outcome("no_token", trigger: trigger)
        }
        guard let urlText = ingestUrl, let url = URL(string: urlText) else {
            return outcome("no_url", trigger: trigger)
        }
        // Health has not been asked yet (a fresh install resets it): the card
        // asks; a run now would only fail at the reading step.
        if await !permissionAsked() {
            return outcome("no_permission", trigger: trigger)
        }
        let today = Self.dayFormatter.string(from: now)
        if !byHand {
            let hour = Calendar.current.component(.hour, from: now)
            if hour < 4 || hour >= 20 {
                return outcome("outside_window", trigger: trigger, keep: false)
            }
        }
        if defaults.string(forKey: Self.markerKey) == today {
            return outcome("done_today", trigger: trigger, keep: false)
        }

        let offsetMinutes = TimeZone.current.secondsFromGMT(for: now) / 60

        // 2. The ping.
        let ping: [String: Any] = ["schema_version": Self.schemaVersion, "kind": "ping",
                                   "device_tz_offset_min": offsetMinutes, "trigger": trigger]
        guard let pingReply = await post(ping, to: url, token: token, timeout: timeout) else {
            return outcome("failed", trigger: trigger)
        }
        if pingReply["error"] != nil {
            return outcome("refused", pingReply["message"] as? String, trigger: trigger)
        }
        if pingReply["already_complete_today"] as? Bool == true {
            defaults.set(today, forKey: Self.markerKey)
            LocalNotifications.planReminders(todayDone: true, now: now)
            return outcome("already_complete", pingReply["message"] as? String, trigger: trigger)
        }

        // 3. Yesterday's and today's readings.
        let start = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: -1, to: now) ?? now)
        var series: [[String: Any]] = []
        for reading in Self.readings {
            guard let samples = await fetch(reading.type, from: start, to: now) else {
                return outcome("unreadable", trigger: trigger)
            }
            series.append(Self.series(reading, samples))
        }

        // 4. The daily post.
        let body: [String: Any] = ["schema_version": Self.schemaVersion, "kind": "daily",
                                   "device_tz_offset_min": offsetMinutes, "trigger": trigger, "series": series]
        guard let reply = await post(body, to: url, token: token, timeout: timeout) else {
            return outcome("failed", trigger: trigger)
        }
        if reply["error"] != nil {
            return outcome("refused", reply["message"] as? String, trigger: trigger)
        }
        let complete = reply["night_complete"] as? Bool == true
        if complete { defaults.set(today, forKey: Self.markerKey) }
        // 10c: the reminder goes once the night is in; a background sync that
        // completed it says so about a minute later, when the status is ready.
        LocalNotifications.planReminders(todayDone: complete, now: now)
        if complete && trigger == "health_background" && !inFront { LocalNotifications.readingsIn(after: 75) }
        return outcome(complete ? "night_complete" : "night_not_finished", reply["message"] as? String, trigger: trigger)
    }

    // Each time the app opens (10c): today's reminder stays unless today's
    // sync is done, and tomorrow's is set. Only with a token on this phone.
    func planReminders() {
        guard token != nil else { return }
        let now = Date()
        LocalNotifications.planReminders(todayDone: defaults.string(forKey: Self.markerKey) == Self.dayFormatter.string(from: now), now: now)
    }

    // MARK: Health

    private func fetch(_ type: HKSampleType, from start: Date, to end: Date) async -> [HKSample]? {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        return await withCheckedContinuation { cont in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                cont.resume(returning: error == nil ? (samples ?? []) : nil)
            }
            store.execute(query)
        }
    }

    // One reading type as columns, the shape the Shortcut sends (D42). A
    // sleep stage's value is HealthKit's number (0 to 5), which the server
    // names; the other values are numbers in the unit given.
    private static func series(_ reading: Reading, _ samples: [HKSample]) -> [String: Any] {
        var start: [String] = [], end: [String] = [], value: [Any] = [], unit: [String] = [], source: [String] = [], device: [String] = []
        for sample in samples {
            if let q = sample as? HKQuantitySample, let u = reading.unit {
                value.append(q.quantity.doubleValue(for: u))
                unit.append(u.unitString)
            } else if let c = sample as? HKCategorySample {
                value.append(c.value)
                unit.append("")
            } else {
                continue
            }
            start.append(timeFormatter.string(from: sample.startDate))
            end.append(timeFormatter.string(from: sample.endDate))
            source.append(sample.sourceRevision.source.name)
            device.append(sample.device?.name ?? "")
        }
        return ["type": reading.name, "start": start, "end": end, "value": value, "unit": unit, "source": source, "device": device]
    }

    // MARK: The server

    private func post(_ body: [String: Any], to url: URL, token: String, timeout: TimeInterval) async -> [String: Any]? {
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return nil }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (reply, response) = try? await URLSession.shared.data(for: request) else { return nil }
        guard let json = (try? JSONSerialization.jsonObject(with: reply)) as? [String: Any] else { return nil }
        // The ingest function answers 200, or an error with its own "error"
        // field. Anything else (a gateway's error page in JSON) is a failed run.
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return status == 200 || json["error"] != nil ? json : nil
    }

    // MARK: Bookkeeping

    private func outcome(_ result: String, _ serverMessage: String? = nil, trigger: String, keep: Bool = true) -> [String: Any] {
        let out: [String: Any] = ["result": result, "message": serverMessage ?? "", "trigger": trigger,
                                  "at": Self.timeFormatter.string(from: Date())]
        if keep { defaults.set(out, forKey: Self.lastRunKey) }
        return out
    }

    func forget() {
        if let userId { Keychain.clearToken(for: userId) }
        defaults.removeObject(forKey: Self.markerKey)
        defaults.removeObject(forKey: Self.lastRunKey)
        LocalNotifications.cancelAll()
    }

    // ISO 8601 with the phone's offset, as the Shortcut formats it.
    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .autoupdatingCurrent
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ssXXXXX"
        return f
    }()

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .autoupdatingCurrent
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}
