import Foundation
import Capacitor
import HealthKit

/// פלאגין Capacitor מותאם-אישית לחיבור עם Apple Health.
/// נכתב במיוחד לאפליקציית Ballast - לא פלאגין npm חיצוני.
///
/// חשוב: קובץ זה חייב להתווסף ל-target של "App" ב-Xcode (Add Files to "App"...)
/// כדי שהוא בכלל יתקמפל וייכלל באפליקציה. ראה את הוראות ההתקנה שנמסרו בנפרד.
@objc(AppleHealthPlugin)
public class AppleHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleHealthPlugin"
    public let jsName = "AppleHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBodyWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStepsToday", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    private var bodyMassType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .bodyMass)! }
    private var heartRateType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .heartRate)! }
    private var stepType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .stepCount)! }
    private var activeEnergyType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)! }
    private var workoutType: HKWorkoutType { HKObjectType.workoutType() }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit אינו זמין על המכשיר הזה")
            return
        }

        let readTypes: Set<HKObjectType> = [heartRateType, stepType, bodyMassType, workoutType]
        let writeTypes: Set<HKSampleType> = [bodyMassType, activeEnergyType, workoutType]

        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["granted": success])
                }
            }
        }
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        let status = healthStore.authorizationStatus(for: workoutType)
        let statusString: String
        switch status {
        case .notDetermined:
            statusString = "notDetermined"
        case .sharingDenied:
            statusString = "denied"
        case .sharingAuthorized:
            statusString = "authorized"
        @unknown default:
            statusString = "unknown"
        }
        call.resolve(["status": statusString])
    }

    @objc func saveBodyWeight(_ call: CAPPluginCall) {
        guard let kg = call.getDouble("kg") else {
            call.reject("חסר פרמטר 'kg'")
            return
        }
        let dateMs = call.getDouble("dateMs")
        let date = dateMs != nil ? Date(timeIntervalSince1970: dateMs! / 1000) : Date()

        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg)
        let sample = HKQuantitySample(type: bodyMassType, quantity: quantity, start: date, end: date)

        healthStore.save(sample) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["success": success])
                }
            }
        }
    }

    private func millis(_ value: JSValue?) -> Double? {
        if let n = value as? NSNumber { return n.doubleValue }
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        return nil
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let startMs = call.getDouble("startMs"), let endMs = call.getDouble("endMs") else {
            call.reject("חסרים פרמטרים 'startMs'/'endMs'")
            return
        }

        // requestAuthorization מחזיר הצלחה גם כשהמשתמש השאיר את "אימונים" כבוי בדיאלוג,
        // אז בודקים כאן במפורש ומחזירים קוד שה-JS יודע להסביר למשתמש.
        guard healthStore.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            call.reject("אין הרשאה לשמור אימונים ב-Health", "WORKOUT_NOT_AUTHORIZED")
            return
        }

        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let kcal = call.getDouble("activeEnergyKcal")
        let canWriteEnergy = healthStore.authorizationStatus(for: activeEnergyType) == .sharingAuthorized

        // הפסקות בשעון האימון -> אירועי pause/resume, כך ש-Health מחשב משך אימון בלי זמן ההשהיה
        var pauseEvents: [HKWorkoutEvent] = []
        for pause in call.getArray("pauses", JSObject.self) ?? [] {
            guard let ps = millis(pause["startMs"]), let pe = millis(pause["endMs"]) else { continue }
            let pauseStart = max(start, Date(timeIntervalSince1970: ps / 1000))
            let pauseEnd = min(end, Date(timeIntervalSince1970: pe / 1000))
            guard pauseStart < end, pauseStart <= pauseEnd else { continue }
            pauseEvents.append(HKWorkoutEvent(type: .pause, dateInterval: DateInterval(start: pauseStart, duration: 0), metadata: nil))
            if pauseEnd < end {
                pauseEvents.append(HKWorkoutEvent(type: .resume, dateInterval: DateInterval(start: pauseEnd, duration: 0), metadata: nil))
            }
        }

        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining

        let builder = HKWorkoutBuilder(healthStore: healthStore, configuration: config, device: .local())

        builder.beginCollection(withStart: start) { started, error in
            guard started else {
                DispatchQueue.main.async {
                    call.reject(error?.localizedDescription ?? "כשל בפתיחת רישום האימון ב-Health")
                }
                return
            }

            let finishUp: () -> Void = {
                builder.endCollection(withEnd: end) { ended, error in
                    guard ended else {
                        DispatchQueue.main.async {
                            call.reject(error?.localizedDescription ?? "כשל בסגירת רישום האימון ב-Health")
                        }
                        return
                    }
                    builder.finishWorkout { workout, error in
                        DispatchQueue.main.async {
                            if let error = error {
                                call.reject(error.localizedDescription)
                            } else {
                                call.resolve([
                                    "success": true,
                                    "workoutId": workout?.uuid.uuidString ?? "",
                                    "energySaved": canWriteEnergy && (kcal ?? 0) > 0,
                                ])
                            }
                        }
                    }
                }
            }

            // קלוריות ואירועי השהיה הם תוספות - כשל באחד מהם לא אמור להפיל את שמירת האימון עצמו
            let addPausesThenFinish: () -> Void = {
                guard !pauseEvents.isEmpty else { finishUp(); return }
                builder.addWorkoutEvents(pauseEvents) { _, _ in finishUp() }
            }

            if let kcal = kcal, kcal > 0, canWriteEnergy {
                let energySample = HKQuantitySample(
                    type: self.activeEnergyType,
                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                    start: start,
                    end: end
                )
                builder.add([energySample]) { _, _ in addPausesThenFinish() }
            } else {
                addPausesThenFinish()
            }
        }
    }

    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let startMs = call.getDouble("startMs") else {
            call.reject("חסר פרמטר 'startMs'")
            return
        }
        guard healthStore.authorizationStatus(for: workoutType) == .sharingAuthorized else {
            call.reject("אין הרשאה למחוק אימונים מ-Health", "WORKOUT_NOT_AUTHORIZED")
            return
        }

        // מזהים את האימון לפי שעת ההתחלה (±2 שניות), ורק מתוך מה ש-Ballast עצמה שמרה -
        // אימונים מאפליקציות אחרות באותן שעות לא נוגעים בהם.
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let timePredicate = HKQuery.predicateForSamples(
            withStart: start.addingTimeInterval(-2),
            end: start.addingTimeInterval(2),
            options: .strictStartDate
        )
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            timePredicate,
            HKQuery.predicateForObjects(from: HKSource.default()),
        ])

        healthStore.deleteObjects(of: workoutType, predicate: predicate) { success, deletedCount, error in
            guard success else {
                DispatchQueue.main.async {
                    call.reject(error?.localizedDescription ?? "כשל במחיקת האימון מ-Health")
                }
                return
            }
            let resolve = {
                DispatchQueue.main.async { call.resolve(["deletedWorkouts": deletedCount]) }
            }
            // הקלוריות נשמרו כדגימה נפרדת שמתחילה באותו רגע - מוחקים גם אותה
            guard self.healthStore.authorizationStatus(for: self.activeEnergyType) == .sharingAuthorized else {
                resolve()
                return
            }
            self.healthStore.deleteObjects(of: self.activeEnergyType, predicate: predicate) { _, _, _ in resolve() }
        }
    }

    @objc func getLatestHeartRate(_ call: CAPPluginCall) {
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: heartRateType, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let sample = samples?.first as? HKQuantitySample else {
                    call.resolve(["bpm": NSNull(), "date": NSNull()])
                    return
                }
                let bpm = sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: HKUnit.minute()))
                call.resolve([
                    "bpm": bpm,
                    "date": sample.startDate.timeIntervalSince1970 * 1000
                ])
            }
        }
        healthStore.execute(query)
    }

    @objc func getStepsToday(_ call: CAPPluginCall) {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)

        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                let steps = statistics?.sumQuantity()?.doubleValue(for: .count()) ?? 0
                call.resolve(["steps": steps])
            }
        }
        healthStore.execute(query)
    }
}
