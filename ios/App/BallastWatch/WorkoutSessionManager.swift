import Foundation
import HealthKit

/// סשן אימון של Apple בשעון: דופק בזמן אמת, קלוריות שנמדדו, והאפליקציה נשארת פעילה גם
/// כשהיד למטה. בסוף האימון השעון שומר אותו ב-Health בעצמו - עם הנתונים האמיתיים - ובלבד
/// שהאייפון לא שמר כבר עותק (ואז הסשן נזרק כדי שלא יהיה אימון כפול).
@MainActor
final class WorkoutSessionManager: NSObject, ObservableObject {
    static let shared = WorkoutSessionManager()

    @Published private(set) var heartRate: Int?
    @Published private(set) var activeCalories: Double = 0
    @Published private(set) var boundWorkoutId: String?

    weak var connector: WatchConnector?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var starting = false
    private let boundKey = "ballast.watch.sessionWorkoutId"

    private var heartRateType: HKQuantityType { HKQuantityType(.heartRate) }
    private var energyType: HKQuantityType { HKQuantityType(.activeEnergyBurned) }

    private func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), energyType]
        let read: Set<HKObjectType> = [heartRateType, energyType, HKObjectType.workoutType()]
        do {
            try await healthStore.requestAuthorization(toShare: share, read: read)
            return true
        } catch {
            return false
        }
    }

    /// מתחיל סשן (כשמגיע מצב אימון פעיל, או כשהאייפון פתח את השעון עם אימון)
    func start(startDate: Date) async {
        guard session == nil, !starting else { return }
        starting = true
        defer { starting = false }
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
        } catch {
            reset()
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
                guard state.healthSync == true, !starting else { return }
                let phoneStart = state.startTime.map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
                // אימון שהתחיל מזמן (למשל נשכח פתוח) - מודדים מעכשיו ולא מתחילת היום
                let startDate = Date().timeIntervalSince(phoneStart) < 6 * 3600 ? phoneStart : Date()
                Task {
                    await start(startDate: startDate)
                    if session != nil { bind(to: workoutId) }
                }
                return
            }
            if boundWorkoutId == nil {
                bind(to: workoutId)
            } else if boundWorkoutId != workoutId {
                // אימון אחר התחיל בלי שקיבלנו את סיום הקודם - זורקים את הישן; החדש יתחיל בעדכון הבא
                discard()
                return
            }
            mirrorPause(paused: state.isPaused)
            return
        }

        if let ended = state.lastEnded, let bound = boundWorkoutId, ended.workoutId == bound {
            if ended.outcome == "finished" && ended.phoneSaved != true {
                finish(at: Date(timeIntervalSince1970: ended.endTime / 1000))
            } else {
                discard()
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

    private func bind(to workoutId: String) {
        guard boundWorkoutId != workoutId else { return }
        boundWorkoutId = workoutId
        UserDefaults.standard.set(workoutId, forKey: boundKey)
        connector?.send("watchSessionStarted")
    }

    private func mirrorPause(paused: Bool) {
        guard let session else { return }
        if paused, session.state == .running { session.pause() }
        if !paused, session.state == .paused { session.resume() }
    }

    private func finish(at endDate: Date) {
        guard let session, let builder else { return }
        session.end()
        Task {
            let end = max(endDate, builder.startDate ?? endDate)
            try? await builder.endCollection(at: end)
            _ = try? await builder.finishWorkout()
            reset()
        }
    }

    private func discard() {
        guard let session, let builder else { return }
        session.end()
        builder.discardWorkout()
        reset()
    }

    private func reset() {
        session = nil
        builder = nil
        boundWorkoutId = nil
        heartRate = nil
        activeCalories = 0
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

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
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
            if let bpm { self.heartRate = Int(bpm.rounded()) }
            if let kcal { self.activeCalories = kcal }
        }
    }
}
