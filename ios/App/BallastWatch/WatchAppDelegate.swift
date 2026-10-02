import WatchKit
import HealthKit

/// האייפון פותח את האפליקציה עם אימון (HKHealthStore.startWatchApp) -> מתחילים סשן מיד.
/// ואם האפליקציה נסגרה באמצע סשן, watchOS מעיר אותה כדי לשחזר אותו.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            await WorkoutSessionManager.shared.start(startDate: Date())
        }
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            WorkoutSessionManager.shared.recover()
        }
    }
}
