import Foundation
import HealthKit

#if DEBUG
// Test builds only: a made-up night for the simulator, which has no Watch.
// Everything here is invented (the design's sample day, roughly), written as
// if an Apple Watch had recorded it, so the server builds a night from it.
enum HealthSeed {
    static func writeMadeUpNight() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let store = HKHealthStore()
        let types: Set<HKSampleType> = [
            HKQuantityType(.heartRate), HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.respiratoryRate), HKQuantityType(.restingHeartRate), HKCategoryType(.sleepAnalysis),
        ]
        let allowed = await withCheckedContinuation { cont in
            store.requestAuthorization(toShare: types, read: types) { ok, _ in cont.resume(returning: ok) }
        }
        guard allowed else { return false }

        let cal = Calendar.current
        let now = Date()
        // Asleep from 11pm yesterday to 6:40am today, in stages, with a short wake.
        let today = cal.startOfDay(for: now)
        let bedtime = cal.date(byAdding: .hour, value: -1, to: today)!
        let wake = cal.date(byAdding: .minute, value: 6 * 60 + 40, to: today)!
        let bpm = HKUnit.count().unitDivided(by: .minute())
        var samples: [HKSample] = []

        let stages: [(HKCategoryValueSleepAnalysis, Int)] = [
            (.asleepCore, 90), (.asleepDeep, 60), (.asleepCore, 80), (.asleepREM, 50), (.awake, 10),
            (.asleepCore, 90), (.asleepDeep, 40), (.asleepREM, 60), (.asleepCore, 80),
        ]
        var t = bedtime
        for (stage, minutes) in stages {
            let end = min(cal.date(byAdding: .minute, value: minutes, to: t)!, wake)
            samples.append(HKCategorySample(type: HKCategoryType(.sleepAnalysis), value: stage.rawValue, start: t, end: end))
            t = end
        }

        // A heart rate reading every five minutes through the night, 48 to 56.
        var at = bedtime
        var i = 0
        while at < wake {
            let value = 52.0 + 4.0 * sin(Double(i) / 7.0)
            samples.append(HKQuantitySample(type: HKQuantityType(.heartRate), quantity: HKQuantity(unit: bpm, doubleValue: value), start: at, end: at))
            at = cal.date(byAdding: .minute, value: 5, to: at)!
            i += 1
        }
        // A few HRV readings overnight, around 52 ms.
        for h in [1, 3, 5] {
            let when = cal.date(byAdding: .hour, value: h, to: today)!
            samples.append(HKQuantitySample(type: HKQuantityType(.heartRateVariabilitySDNN),
                                            quantity: HKQuantity(unit: .secondUnit(with: .milli), doubleValue: 50.0 + Double(h)), start: when, end: when))
        }
        for h in [2, 4] {
            let when = cal.date(byAdding: .hour, value: h, to: today)!
            samples.append(HKQuantitySample(type: HKQuantityType(.respiratoryRate), quantity: HKQuantity(unit: bpm, doubleValue: 15.0), start: when, end: when))
        }
        let yesterday = cal.date(byAdding: .day, value: -1, to: today)!
        samples.append(HKQuantitySample(type: HKQuantityType(.restingHeartRate), quantity: HKQuantity(unit: bpm, doubleValue: 57.0),
                                        start: cal.date(byAdding: .hour, value: 12, to: yesterday)!, end: cal.date(byAdding: .hour, value: 20, to: yesterday)!))

        return await withCheckedContinuation { cont in
            store.save(samples) { ok, _ in cont.resume(returning: ok) }
        }
    }
}
#endif
