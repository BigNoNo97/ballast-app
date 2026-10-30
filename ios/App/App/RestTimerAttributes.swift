import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// טיימר המנוחה כ-Live Activity (מסך הנעילה ו-Dynamic Island).
///
/// הקובץ הזה מקומפל גם ב-target של האפליקציה (שמתחילה/מעדכנת/מסיימת את הפעילות) וגם
/// ב-target של ההרחבה BallastRestTimer (שמציירת אותה) - שניהם חייבים את אותו טיפוס בדיוק.
@available(iOS 16.1, *)
struct RestTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// מתי המנוחה נגמרת - התצוגה סופרת לאחור לבד, בלי עדכונים מהאפליקציה
        var endsAt: Date
        /// הסט הבא, למשל "סט 3 · 80 ק״ג × 8"
        var nextUp: String
    }

    var exerciseName: String
}
#endif
