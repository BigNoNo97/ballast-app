import SwiftUI
import UserNotifications

@main
struct BallastWatchApp: App {
    @StateObject private var connector = WatchConnector()
    @StateObject private var restTimer = RestTimer()

    init() {
        UNUserNotificationCenter.current().delegate = NotificationPresenter.shared
        RestTimer.requestPermission()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connector)
                .environmentObject(restTimer)
        }
    }
}
