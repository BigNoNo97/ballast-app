import Foundation
import UserNotifications

/// טיימר מנוחה. הרטט בסוף מגיע מהתראה מקומית ולא מטיימר בתוך האפליקציה - כשהיד יורדת
/// האפליקציה מושהית והטיימר שלה לא רץ, אבל התראה מתוזמנת תמיד מרטטת על היד.
@MainActor
final class RestTimer: ObservableObject {
    @Published private(set) var endDate: Date?
    private(set) var nextUp = ""
    private let notificationId = "ballast.rest"

    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    func start(seconds: Int, nextUp: String) {
        self.nextUp = nextUp
        endDate = Date().addingTimeInterval(TimeInterval(max(1, seconds)))
        scheduleNotification()
    }

    func addTime(_ seconds: Int) {
        guard let endDate else { return }
        self.endDate = endDate.addingTimeInterval(TimeInterval(seconds))
        scheduleNotification()
    }

    func skip() {
        endDate = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [notificationId])
    }

    /// נקרא מהמסך כל שנייה - סוגר את מסך המנוחה כשהזמן נגמר (ההתראה עצמה כבר רטטה)
    func expireIfNeeded(now: Date) {
        if let endDate, now >= endDate { self.endDate = nil }
    }

    private func scheduleNotification() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [notificationId])
        guard let endDate else { return }
        let content = UNMutableNotificationContent()
        content.title = "המנוחה הסתיימה"
        content.body = nextUp
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, endDate.timeIntervalSinceNow), repeats: false)
        center.add(UNNotificationRequest(identifier: notificationId, content: content, trigger: trigger))
    }
}

/// מציג את התראת סוף המנוחה (ואת הרטט שלה) גם כשהאפליקציה פתוחה על המסך
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationPresenter()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
