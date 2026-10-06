import Foundation
import WatchConnectivity

/// סיכום אימון שהסתיים, למסך "כל הכבוד" בשעון
struct FinishedSummary: Equatable {
    var workoutId: String
    var title: String
    var durationSec: Int
    var setsDone: Int
    var setsTotal: Int
}

/// הקשר עם האייפון. האייפון הוא מקור האמת; השעון מציג את המצב האחרון שקיבל, ועליו
/// מיישם מראש את הפקודות שנשלחו ועוד לא אושרו (pending), כך שכל לחיצה מתעדכנת מיד.
@MainActor
final class WatchConnector: NSObject, ObservableObject {
    @Published private(set) var serverState: WorkoutState?
    @Published private(set) var pending: [WatchCommand] = []
    @Published private(set) var finishedSummary: FinishedSummary?
    /// התוכנית האחרונה שהגיעה מהאייפון (נשמרת, כדי שאפשר יהיה להתחיל אימון גם כשהאייפון לא בסביבה)
    @Published private(set) var catalog: WorkoutCatalog?
    /// מתי הגיע העדכון האחרון מהאייפון, ומה השתבש אם משהו השתבש - מוצג במסך הבית לאבחון
    @Published private(set) var lastSync: Date?
    @Published private(set) var syncError: String?

    private var lastActiveState: WorkoutState?

    private let stateKey = "ballast.watch.lastState"
    private let catalogKey = "ballast.watch.catalog"
    private let defaultsKey = "ballast.watch.defaults"
    /// הגדרות האייפון האחרונות (סנכרון Health, טיימר מנוחה אוטומטי) - לאימון שמתחיל בשעון
    private var lastHealthSync: Bool?
    private var lastAutoRest: Bool?

    var state: WorkoutState? {
        guard let serverState else { return nil }
        return pending.reduce(serverState) { WorkoutLogic.apply($1, to: $0) }
    }

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: stateKey),
           let saved = try? JSONDecoder().decode(WorkoutState.self, from: data) {
            serverState = saved
            if saved.active { lastActiveState = saved }
        }
        if let data = UserDefaults.standard.data(forKey: catalogKey),
           let saved = try? JSONDecoder().decode(WorkoutCatalog.self, from: data) {
            catalog = saved
        }
        if let defaults = UserDefaults.standard.dictionary(forKey: defaultsKey) {
            lastHealthSync = defaults["healthSync"] as? Bool
            lastAutoRest = defaults["autoRest"] as? Bool
        }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// מתחיל אימון בשעון בלבד, מיום בתוכנית. האייפון יאמץ אותו כאימון פעיל כשיקבל את הפקודה -
    /// מיד אם הוא בטווח, ואם לא, בפעם הבאה שהם יתחברו (כולל כל מה שנעשה בינתיים, עד הסיום).
    func startLocalWorkout(day: CatalogDay) {
        guard let catalog else { return }
        let now = Date().timeIntervalSince1970 * 1000
        let workoutId = "watch-\(Int(now))"
        let title = "\(catalog.routineTitle) - יום \(day.dayNumber)"

        var local = WorkoutState(active: true)
        local.workoutId = workoutId
        local.title = title
        local.startTime = now
        local.pausedTotalMs = 0
        local.healthSync = lastHealthSync
        local.autoRest = lastAutoRest ?? true
        local.ackSeq = 0
        local.exercises = day.exercises.map { ex in
            WatchExercise(
                exerciseId: ex.exerciseId,
                name: ex.name,
                restSec: ex.restSec,
                weightStep: ex.weightStep,
                sets: ex.sets.map { WatchSet(weightKg: $0.weightKg, reps: $0.reps, completed: false) }
            )
        }

        pending = []
        finishedSummary = nil
        serverState = local
        if let data = try? JSONEncoder().encode(local) {
            UserDefaults.standard.set(data, forKey: stateKey)
        }
        lastActiveState = local

        let start = StartPayload(
            routineId: catalog.routineId,
            dayNumber: day.dayNumber,
            title: title,
            exercises: day.exercises.map { StartExercise(exerciseId: $0.exerciseId, sets: $0.sets) }
        )
        send("startWorkout", start: start)
    }

    func send(_ type: String, exerciseIndex: Int? = nil, setIndex: Int? = nil, field: String? = nil, value: Double? = nil, start: StartPayload? = nil) {
        guard let current = state, current.active, let workoutId = current.workoutId else { return }

        let seqKey = "ballast.watch.seq.\(workoutId)"
        // גם אחרי התקנה מחדש של אפליקציית השעון ה-seq חייב לעלות על מה שהאייפון כבר אישר
        let seq = max(
            UserDefaults.standard.integer(forKey: seqKey),
            current.ackSeq ?? 0,
            pending.last?.seq ?? 0
        ) + 1
        UserDefaults.standard.set(seq, forKey: seqKey)

        var exerciseId: String?
        if let exerciseIndex, let exercises = current.exercises, exercises.indices.contains(exerciseIndex) {
            exerciseId = exercises[exerciseIndex].exerciseId
        }
        let command = WatchCommand(
            seq: seq, workoutId: workoutId, type: type,
            exerciseIndex: exerciseIndex, exerciseId: exerciseId, setIndex: setIndex,
            field: field, value: value, at: Date().timeIntervalSince1970 * 1000, start: start
        )
        pending.append(command)
        updateSummary()

        guard let data = try? JSONEncoder().encode(command), let json = String(data: data, encoding: .utf8) else { return }
        let payload: [String: Any] = ["command": json]
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        if session.isReachable {
            // הודעה מיידית; אם נכשלה - העברה מובטחת שתגיע כשהאייפון יהיה זמין
            session.sendMessage(payload, replyHandler: nil) { _ in session.transferUserInfo(payload) }
        } else {
            session.transferUserInfo(payload)
        }
    }

    /// מבקש מהאייפון את המצב העדכני. האייפון עונה מהעותק השמור שלו, גם אם האפליקציה שם סגורה.
    func requestState() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard session.isReachable else {
            if lastSync == nil { syncError = "האייפון לא בטווח - התוכנית תגיע כשהוא יהיה זמין" }
            return
        }
        session.sendMessage(["requestState": true], replyHandler: { reply in
            let json = reply["state"] as? String
            Task { @MainActor in self.receive(stateJSON: json) }
        }, errorHandler: { error in
            let message = error.localizedDescription
            Task { @MainActor in self.syncError = "אין קשר לאייפון: \(message)" }
        })
    }

    fileprivate func receive(stateJSON: String?) {
        guard let stateJSON, !stateJSON.isEmpty, let data = stateJSON.data(using: .utf8) else {
            if lastSync == nil { syncError = "האייפון עוד לא שלח נתונים - פתח את Ballast באייפון" }
            return
        }
        let decoded: WorkoutState
        do {
            decoded = try JSONDecoder().decode(WorkoutState.self, from: data)
        } catch {
            syncError = "לא הצלחתי לקרוא את הנתונים מהאייפון: \(error.localizedDescription)"
            return
        }
        lastSync = Date()
        syncError = nil

        if let newCatalog = decoded.catalog {
            catalog = newCatalog
            if let catalogData = try? JSONEncoder().encode(newCatalog) {
                UserDefaults.standard.set(catalogData, forKey: catalogKey)
            }
        } else if !decoded.active, decoded.noCatalog == true {
            catalog = nil
            UserDefaults.standard.removeObject(forKey: catalogKey)
        }
        if decoded.healthSync != nil || decoded.autoRest != nil {
            lastHealthSync = decoded.healthSync ?? lastHealthSync
            lastAutoRest = decoded.autoRest ?? lastAutoRest
            var defaults: [String: Any] = [:]
            if let lastHealthSync { defaults["healthSync"] = lastHealthSync }
            if let lastAutoRest { defaults["autoRest"] = lastAutoRest }
            UserDefaults.standard.set(defaults, forKey: defaultsKey)
        }

        // אימון שהתחיל בשעון ועוד לא נקלט באייפון: לא נותנים למצב ישן מהאייפון (שעוד לא יודע
        // עליו) להעלים אותו - עד שהאייפון מאמץ אותו (אותו מזהה) או מדווח שסיים אותו.
        if let local = serverState, local.active, let localId = local.workoutId, localId.hasPrefix("watch-"),
           decoded.workoutId != localId, decoded.lastEnded?.workoutId != localId {
            return
        }

        serverState = decoded
        UserDefaults.standard.set(data, forKey: stateKey)
        let ack = decoded.ackSeq ?? 0
        pending.removeAll { $0.workoutId != decoded.workoutId || $0.seq <= ack }
        updateSummary()
    }

    func dismissSummary() {
        finishedSummary = nil
    }

    /// כשהאימון עובר מפעיל לגמור (מהשעון או מהאייפון) - בונים סיכום מהמצב הפעיל האחרון
    private func updateSummary() {
        guard let current = state else { return }
        if current.active {
            lastActiveState = current
            return
        }
        guard let ended = current.lastEnded, ended.outcome == "finished",
              let previous = lastActiveState, previous.workoutId == ended.workoutId,
              finishedSummary?.workoutId != ended.workoutId else { return }
        let sets = (previous.exercises ?? []).flatMap(\.sets)
        finishedSummary = FinishedSummary(
            workoutId: ended.workoutId,
            title: previous.title ?? "",
            durationSec: previous.elapsedSeconds(at: Date(timeIntervalSince1970: ended.endTime / 1000)),
            setsDone: sets.filter(\.completed).count,
            setsTotal: sets.count
        )
    }
}

extension WatchConnector: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let json = session.receivedApplicationContext["state"] as? String
        Task { @MainActor in
            if json != nil { self.receive(stateJSON: json) }
            self.requestState()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in self.requestState() }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let json = applicationContext["state"] as? String
        Task { @MainActor in self.receive(stateJSON: json) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        let json = message["state"] as? String
        Task { @MainActor in self.receive(stateJSON: json) }
    }
}
