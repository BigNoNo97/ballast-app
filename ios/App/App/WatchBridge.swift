import Foundation
import Capacitor
import WatchConnectivity

extension Notification.Name {
    static let ballastWatchCommandsAvailable = Notification.Name("ballastWatchCommandsAvailable")
}

/// הקשר עם אפליקציית השעון. מופעל ב-AppDelegate ולא בפלאגין, כי השעון יכול להעיר את
/// אפליקציית האייפון ברקע לפני שנוצר מסך כלשהו - ה-delegate חייב להיות מוגדר כבר אז,
/// אחרת ההודעה הולכת לאיבוד. פקודות נשמרות ב-UserDefaults עד שה-JS אוסף אותן.
final class WatchSessionCoordinator: NSObject, WCSessionDelegate {
    static let shared = WatchSessionCoordinator()

    private let pendingKey = "ballast.watch.pendingCommands"
    private let lastStateKey = "ballast.watch.lastSentState"
    private let lock = NSLock()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// state = JSON של מצב האימון. נשמר תמיד, ונשלח שוב בכל פעם שהקשר מוכן (סיום הפעלה,
    /// השעון התחבר/הותקן, או בקשה מהשעון) - כדי שעדכון שנשלח לפני שהקשר היה מוכן לא ילך לאיבוד.
    func send(state: String) {
        UserDefaults.standard.set(state, forKey: lastStateKey)
        push(state)
    }

    private var lastState: String? { UserDefaults.standard.string(forKey: lastStateKey) }

    private func pushLastState() {
        if let lastState { push(lastState) }
    }

    /// applicationContext מגיע גם אם אפליקציית השעון סגורה (תמיד רק הגרסה האחרונה),
    /// sendMessage מוסיף עדכון מיידי כשהשעון פתוח.
    private func push(_ state: String) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        try? session.updateApplicationContext(["state": state])
        if session.isReachable {
            session.sendMessage(["state": state], replyHandler: nil, errorHandler: nil)
        }
    }

    func takePendingCommands() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        let commands = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        UserDefaults.standard.removeObject(forKey: pendingKey)
        return commands
    }

    private func enqueue(_ payload: [String: Any]) {
        guard let command = payload["command"] as? String else { return }
        lock.lock()
        var commands = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        commands.append(command)
        UserDefaults.standard.set(commands, forKey: pendingKey)
        lock.unlock()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .ballastWatchCommandsAvailable, object: nil)
        }
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated { pushLastState() }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func sessionWatchStateDidChange(_ session: WCSession) { pushLastState() }
    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { pushLastState() }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if message["requestState"] != nil {
            pushLastState()
            return
        }
        enqueue(message)
    }

    /// השעון מבקש את המצב (בכל פתיחה) - עונים מהעותק השמור, בלי לחכות ל-JS: זה עובד גם
    /// כשאפליקציית האייפון סגורה והשעון העיר אותה ברקע רק בשביל הבקשה הזו.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        if message["requestState"] != nil {
            replyHandler(["state": lastState ?? ""])
            return
        }
        enqueue(message)
        replyHandler(["ok": true])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        enqueue(userInfo)
    }
}

/// הצד של Capacitor: JS שולח מצב אימון לשעון ואוסף פקודות שהגיעו ממנו.
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sendState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingCommands", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(commandsAvailable),
            name: .ballastWatchCommandsAvailable,
            object: nil
        )
    }

    @objc private func commandsAvailable() {
        notifyListeners("commandsAvailable", data: [:])
    }

    @objc func sendState(_ call: CAPPluginCall) {
        guard let state = call.getString("state") else {
            call.reject("חסר פרמטר 'state'")
            return
        }
        WatchSessionCoordinator.shared.send(state: state)
        call.resolve()
    }

    @objc func takePendingCommands(_ call: CAPPluginCall) {
        call.resolve(["commands": WatchSessionCoordinator.shared.takePendingCommands()])
    }
}
