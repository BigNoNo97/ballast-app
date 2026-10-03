import Foundation
import HealthKit

/// סיכום הנתונים שהשעון מדד באימון שהסתיים - למסך הסיום בשעון
struct MeasuredStats: Equatable {
    var workoutId: String?
    var calories: Int
    var averageHeartRate: Int?
}

/// סשן אימון של Apple בשעון: דופק בזמן אמת, קלוריות שנמדדו, והאפליקציה נשארת פעילה גם
/// כשהיד למטה. הסשן רץ בכל אימון פעיל (בשביל הדופק); הוא נשמר ב-Health רק כשהסנכרון
/// פעיל באייפון ורק אם האייפון לא שמר כבר עותק - אחרת הוא נזרק בסוף.
@MainActor
final class WorkoutSessionManager: NSObject, ObservableObject {
    static let shared = WorkoutSessionManager()

    @Published private(set) var heartRate: Int?
    @Published private(set) var activeCalories: Double = 0
    @Published private(set) var boundWorkoutId: String?
    /// הסבר כשאין דופק (אין הרשאה / שגיאה / לא מתקבלים נתונים). nil כשהכל תקין.
    @Published private(set) var statusMessage: String?
    @Published private(set) var lastStats: MeasuredStats?

    weak var connector: WatchConnector?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var starting = false
    private var noDataCheck: Task<Void, Never>?
    private let boundKey = "ballast.watch.sessionWorkoutId"

    private var heartRateType: HKQuantityType { HKQuantityType(.heartRate) }
    private var energyType: HKQuantityType { HKQuantityType(.activeEnergyBurned) }

    var isRunning: Bool { session != nil }

    private func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            statusMessage = "Health לא זמין בשעון הזה"
            return false
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), energyType]
        let read: Set<HKObjectType> = [heartRateType, energyType, HKObjectType.workoutType()]
        do {
            try await healthStore.requestAuthorization(toShare: share, read: read)
            return true
        } catch {
            statusMessage = "לא ניתן לבקש הרשאה מ-Health: \(error.localizedDescription)"
            return false
        }
    }

    private var canSaveWorkouts: Bool {
        healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
    }

    /// מתחיל סשן (כשמגיע מצב אימון פעיל, כשהאייפון פתח את השעון עם אימון, או בלחיצה על הלב)
    func start(startDate: Date) async {
        guard session == nil, !starting else { return }
        starting = true
        defer { starting = false }
        statusMessage = "מתחבר לחיישן הדופק…"
        guard await requestAuthorization() else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder
            session.startActivity(with: startDate)
            try await builder.beginCollection(at: startDate)
            scheduleNoDataCheck()
        } catch {
            reset()
            statusMessage = "לא ניתן להתחיל מדידת דופק: \(error.localizedDescription)"
        }
    }

    /// לחיצה על הלב כשאין דופק: מנסה שוב להתחיל מדידה ולקשר אותה לאימון הנוכחי
    func retry(with state: WorkoutState?) {
        guard session == nil else {
            scheduleNoDataCheck()
            return
        }
        Task {
            await start(startDate: Date())
            sync(with: state)
        }
    }

    /// אם תוך 30 שניות לא הגיע אף דופק - כנראה אין הרשאת קריאת דופק
    private func scheduleNoDataCheck() {
        noDataCheck?.cancel()
        noDataCheck = Task { @MainActor in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled, session != nil, heartRate == nil else { return }
            statusMessage = "לא מתקבל דופק. ודא שהשעון צמוד ליד, ושיש הרשאה: באייפון > Health > תמונת הפרופיל > אפליקציות > Ballast > דופק"
        }
    }

    /// שחזור סשן שרץ כשהאפליקציה נסגרה/קרסה (watchOS מעיר אותנו עם handleActiveWorkoutRecovery)
    func recover() {
        healthStore.recoverActiveWorkoutSession { session, _ in
            Task { @MainActor in
                guard let session else { return }
                let builder = session.associatedWorkoutBuilder()
                session.delegate = self
                builder.delegate = self
                self.session = session
                self.builder = builder
                self.boundWorkoutId = UserDefaults.standard.string(forKey: self.boundKey)
            }
        }
    }

    /// מיישר את הסשן עם מצב האימון שהגיע מהאייפון (נקרא על כל שינוי במצב)
    func sync(with state: WorkoutState?) {
        guard let state else { return }

        if state.active, let workoutId = state.workoutId {
            if session == nil {
                guard !starting else { return }
                let phoneStart = state.startTime.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
                // אימון שהתחיל מזמן (למשל נשכח פתוח) - מודדים מעכשיו ולא מתחילת היום
                let startDate = Date().timeIntervalSince(phoneStart) < 6 * 3600 ? phoneStart : Date()
                Task {
                    await start(startDate: startDate)
                    if session != nil { bind(to: workoutId, healthSync: state.healthSync == true) }
                }
                return
            }
            if boundWorkoutId == nil {
                bind(to: workoutId, healthSync: state.healthSync == true)
            } else if boundWorkoutId != workoutId {
                // אימון אחר התחיל בלי שקיבלנו את סיום הקודם - זורקים את הישן; החדש יתחיל בעדכון הבא
                discard()
                return
            }
            mirrorPause(paused: state.isPaused)
            return
        }

        if let ended = state.lastEnded, let bound = boundWorkoutId, ended.workoutId == bound {
            if ended.outcome == "finished", ended.phoneSaved != true, state.healthSync == true, canSaveWorkouts {
                finish(at: Date(timeIntervalSince1970: ended.endTime / 1000), workoutId: bound)
            } else {
                discard(workoutId: bound)
            }
            return
        }

        // האייפון פתח את השעון עם אימון, אבל האימון הסתיים/בוטל עוד לפני שקיבלנו אותו -
        // הסשן מעולם לא נקשר לאימון, אז אין מה לשמור; זורקים כדי שלא ירוץ לנצח.
        if boundWorkoutId == nil, session != nil, let ended = state.lastEnded,
           let sessionStart = builder?.startDate,
           ended.endTime / 1000 >= sessionStart.timeIntervalSince1970 - 60 {
            discard()
        }
    }

    /// מקשר את הסשן לאימון. האייפון מדלג על שמירה משלו רק אם השעון באמת ישמור (סנכרון פעיל + הרשאה)
    private func bind(to workoutId: String, healthSync: Bool) {
        guard boundWorkoutId != workoutId else { return }
        boundWorkoutId = workoutId
        UserDefaults.standard.set(workoutId, forKey: boundKey)
        if healthSync, canSaveWorkouts {
            connector?.send("watchSessionStarted")
        }
    }

    private func mirrorPause(paused: Bool) {
        guard let session else { return }
        if paused, session.state == .running { session.pause() }
        if !paused, session.state == .paused { session.resume() }
    }

    private func captureStats(workoutId: String?) {
        let avg = builder?.statistics(for: heartRateType)?
            .averageQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        lastStats = MeasuredStats(
            workoutId: workoutId,
            calories: Int(activeCalories.rounded()),
            averageHeartRate: avg.map { Int($0.rounded()) }
        )
    }

    private func finish(at endDate: Date, workoutId: String) {
        guard let session, let builder else { return }
        captureStats(workoutId: workoutId)
        session.end()
        Task {
            let end = max(endDate, builder.startDate ?? endDate)
            try? await builder.endCollection(at: end)
            _ = try? await builder.finishWorkout()
            reset()
        }
    }

    private func discard(workoutId: String? = nil) {
        guard let session, let builder else { return }
        captureStats(workoutId: workoutId)
        session.end()
        builder.discardWorkout()
        reset()
    }

    private func reset() {
        noDataCheck?.cancel()
        session = nil
        builder = nil
        boundWorkoutId = nil
        heartRate = nil
        activeCalories = 0
        statusMessage = nil
        UserDefaults.standard.removeObject(forKey: boundKey)
    }
}

extension WorkoutSessionManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in self.statusMessage = "מדידת הדופק נעצרה: \(message)" }
    }
}

extension WorkoutSessionManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let heartRateType = HKQuantityType(.heartRate)
        let energyType = HKQuantityType(.activeEnergyBurned)
        var bpm: Double?
        var kcal: Double?
        if collectedTypes.contains(heartRateType) {
            bpm = workoutBuilder.statistics(for: heartRateType)?
                .mostRecentQuantity()?
                .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        }
        if collectedTypes.contains(energyType) {
            kcal = workoutBuilder.statistics(for: energyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())
        }
        Task { @MainActor in
            if let bpm {
                self.heartRate = Int(bpm.rounded())
                self.statusMessage = nil
            }
            if let kcal { self.activeCalories = kcal }
        }
    }
}
