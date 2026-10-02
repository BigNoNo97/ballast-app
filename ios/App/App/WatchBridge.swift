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
    private let lock = NSLock()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// state = JSON של מצב האימון. applicationContext מגיע גם אם אפליקציית השעון סגורה
    /// (תמיד רק הגרסה האחרונה), sendMessage מוסיף עדכון מיידי כשהשעון פתוח.
    func send(state: String) {
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

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        enqueue(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
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
