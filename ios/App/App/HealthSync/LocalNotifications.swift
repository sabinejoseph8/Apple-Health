import Foundation
import UserNotifications

// Notifications the native app schedules on the phone itself (D115, 10c):
// Apple's push service needs the paid developer membership, which this
// project does without. Three kinds, each with the words the web app passes
// in from the wording module (R61: all wording lives there), never a reading:
//   readings-in       about a minute after a background sync completed the
//                     night, so the person knows the status is ready;
//   reminder-<day>    11:30 local on a day with no sync yet (R31 as the
//                     server sends it to the web app), removed once the
//                     night is in;
//   follow-up-<day>   8pm on an Ease off or Rest day (R52), set by the card
//                     when it shows a change day and removed when answered.
enum LocalNotifications {
    private static let center = UNUserNotificationCenter.current()
    private static let textsKey = "clarivi.notificationTexts"

    // MARK: Words

    static var texts: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: textsKey) as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: textsKey) }
    }

    private static func text(_ key: String) -> String? {
        guard let t = texts[key], !t.isEmpty else { return nil }
        return t
    }

    // MARK: Permission

    // "notDetermined", "denied" or "authorized".
    static func status() async -> String {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined: return "notDetermined"
        case .denied: return "denied"
        default: return "authorized"
        }
    }

    static func request() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    // MARK: The three notifications

    static func readingsIn(after seconds: TimeInterval) {
        guard let body = text("readingsIn") else { return }
        schedule(id: "readings-in", title: text("title") ?? "Clarivi", body: body,
                 trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false))
    }

    // Keeps one reminder for today (unless today's sync is done, or it is
    // past 11:30) and one for tomorrow, so a morning the app never wakes on
    // still gets its reminder.
    static func planReminders(todayDone: Bool, now: Date = Date()) {
        guard let body = text("reminder") else { return }
        let title = text("reminderTitle") ?? text("title") ?? "Clarivi"
        let cal = Calendar.current
        let today = dayId(now)
        if todayDone {
            center.removePendingNotificationRequests(withIdentifiers: ["reminder-\(today)"])
        } else if let at = cal.date(bySettingHour: 11, minute: 30, second: 0, of: now), at > now {
            schedule(id: "reminder-\(today)", title: title, body: body, trigger: calendarTrigger(at))
        }
        if let tomorrow = cal.date(byAdding: .day, value: 1, to: now),
           let at = cal.date(bySettingHour: 11, minute: 30, second: 0, of: tomorrow) {
            schedule(id: "reminder-\(dayId(tomorrow))", title: title, body: body, trigger: calendarTrigger(at))
        }
    }

    static func planFollowUp(day: String, now: Date = Date()) {
        guard let body = text("followUp") else { return }
        let cal = Calendar.current
        var parts = DateComponents()
        let bits = day.split(separator: "-").compactMap { Int($0) }
        guard bits.count == 3 else { return }
        parts.year = bits[0]
        parts.month = bits[1]
        parts.day = bits[2]
        parts.hour = 20
        parts.minute = 0
        guard let at = cal.date(from: parts), at > now else { return }
        schedule(id: "follow-up-\(day)", title: text("followUpTitle") ?? text("title") ?? "Clarivi", body: body,
                 trigger: calendarTrigger(at))
    }

    static func cancelFollowUp(day: String) {
        center.removePendingNotificationRequests(withIdentifiers: ["follow-up-\(day)"])
    }

    // Sign out and Delete my data: nothing left waiting on this phone.
    static func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }

    // Test builds only: what is waiting, for the log (ids and fire dates, no words).
    static func pendingSummary() async -> String {
        let requests = await center.pendingNotificationRequests()
        return requests.map { r in
            let when = (r.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate().map { ISO8601DateFormatter().string(from: $0) }
                ?? (r.trigger as? UNTimeIntervalNotificationTrigger).map { "in \(Int($0.timeInterval))s" } ?? "?"
            return "\(r.identifier) at \(when)"
        }.joined(separator: "; ")
    }

    // MARK: Helpers

    private static func schedule(id: String, title: String, body: String, trigger: UNNotificationTrigger) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    private static func calendarTrigger(_ at: Date) -> UNCalendarNotificationTrigger {
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: at)
        return UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
    }

    private static func dayId(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
