import Foundation
import WatchConnectivity

/// הקשר עם האייפון. האייפון הוא מקור האמת; השעון מציג את המצב האחרון שקיבל, ועליו
/// מיישם מראש את הפקודות שנשלחו ועוד לא אושרו (pending), כך שכל לחיצה מתעדכנת מיד.
@MainActor
final class WatchConnector: NSObject, ObservableObject {
    @Published private(set) var serverState: WorkoutState?
    @Published private(set) var pending: [WatchCommand] = []

    private let stateKey = "ballast.watch.lastState"

    var state: WorkoutState? {
        guard let serverState else { return nil }
        return pending.reduce(serverState) { WorkoutLogic.apply($1, to: $0) }
    }

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: stateKey),
           let saved = try? JSONDecoder().decode(WorkoutState.self, from: data) {
            serverState = saved
        }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ type: String, exerciseIndex: Int? = nil, setIndex: Int? = nil, field: String? = nil, value: Double? = nil) {
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
            field: field, value: value, at: Date().timeIntervalSince1970 * 1000
        )
        pending.append(command)

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

    fileprivate func receive(stateJSON: String?) {
        guard let stateJSON, let data = stateJSON.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(WorkoutState.self, from: data) else { return }
        serverState = decoded
        UserDefaults.standard.set(data, forKey: stateKey)
        let ack = decoded.ackSeq ?? 0
        pending.removeAll { $0.workoutId != decoded.workoutId || $0.seq <= ack }
    }
}

extension WatchConnector: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let json = session.receivedApplicationContext["state"] as? String
        Task { @MainActor in self.receive(stateJSON: json) }
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
