import SwiftUI
import UserNotifications

@main
struct BallastWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @StateObject private var connector = WatchConnector()
    @StateObject private var restTimer = RestTimer()
    @StateObject private var sessionManager = WorkoutSessionManager.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        UNUserNotificationCenter.current().delegate = NotificationPresenter.shared
        RestTimer.requestPermission()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connector)
                .environmentObject(restTimer)
                .environmentObject(sessionManager)
                .onAppear {
                    sessionManager.connector = connector
                    sessionManager.sync(with: connector.state)
                }
                .onChange(of: connector.state) { _, newState in
                    sessionManager.sync(with: newState)
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { connector.requestState() }
                }
        }
    }
}
