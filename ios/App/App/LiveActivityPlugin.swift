import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// מתחיל, מעדכן ומסיים את טיימר המנוחה על מסך הנעילה וב-Dynamic Island.
/// iOS 16.2 ומעלה; בגרסאות ישנות יותר, או כשהמשתמש כיבה Live Activities, כל הקריאות
/// מסתיימות בשקט - ההתראה המקומית בסוף המנוחה ממשיכה לעבוד כרגיל.
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRest", returnType: CAPPluginReturnPromise),
    ]

    @objc func startRest(_ call: CAPPluginCall) {
        guard let endsAtMs = call.getDouble("endsAt") else {
            call.reject("חסר פרמטר 'endsAt'")
            return
        }
        let exercise = call.getString("exercise") ?? ""
        let nextUp = call.getString("nextUp") ?? ""
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                await Self.endAll()
                guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                    call.resolve(["started": false])
                    return
                }
                let state = RestTimerAttributes.ContentState(endsAt: Date(timeIntervalSince1970: endsAtMs / 1000), nextUp: nextUp)
                do {
                    _ = try Activity.request(
                        attributes: RestTimerAttributes(exerciseName: exercise),
                        content: ActivityContent(state: state, staleDate: state.endsAt.addingTimeInterval(60)),
                        pushType: nil
                    )
                    call.resolve(["started": true])
                } catch {
                    call.resolve(["started": false])
                }
            }
            return
        }
        #endif
        call.resolve(["started": false])
    }

    @objc func updateRest(_ call: CAPPluginCall) {
        guard let endsAtMs = call.getDouble("endsAt") else {
            call.reject("חסר פרמטר 'endsAt'")
            return
        }
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
            Task {
                for activity in Activity<RestTimerAttributes>.activities {
                    let state = RestTimerAttributes.ContentState(endsAt: endsAt, nextUp: call.getString("nextUp") ?? activity.content.state.nextUp)
                    await activity.update(ActivityContent(state: state, staleDate: endsAt.addingTimeInterval(60)))
                }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func endRest(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                await Self.endAll()
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private static func endAll() async {
        for activity in Activity<RestTimerAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
    #endif
}
