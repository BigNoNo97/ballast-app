import Foundation

/// מצב האימון כפי שהאייפון שולח אותו (ראה src/services/watchSync.ts > buildWatchState)
struct WatchSet: Codable, Equatable {
    var weightKg: Double
    var reps: Int
    var completed: Bool
}

struct WatchExercise: Codable, Equatable {
    var exerciseId: String
    var name: String
    var restSec: Int
    var weightStep: Double
    var sets: [WatchSet]

    var openSetIndex: Int? { sets.firstIndex { !$0.completed } }
    var isDone: Bool { !sets.isEmpty && sets.allSatisfy(\.completed) }
}

/// התוכנית הפעילה מהאייפון, כדי שאפשר יהיה להתחיל אימון מהשעון בלבד (ראה buildWatchCatalog)
struct CatalogSet: Codable, Equatable {
    var weightKg: Double
    var reps: Int
}

struct CatalogExercise: Codable, Equatable {
    var exerciseId: String
    var name: String
    var restSec: Int
    var weightStep: Double
    var sets: [CatalogSet]
}

struct CatalogDay: Codable, Equatable {
    var dayNumber: Int
    var title: String
    var subtitle: String?
    var exercises: [CatalogExercise]
}

struct WorkoutCatalog: Codable, Equatable {
    var routineId: String
    var routineTitle: String
    var nextDayNumber: Int?
    var days: [CatalogDay]

    /// היום הבא בתור ראשון, ואחריו שאר הימים לפי הסדר
    var orderedDays: [CatalogDay] {
        guard let next = nextDayNumber, let i = days.firstIndex(where: { $0.dayNumber == next }) else { return days }
        return Array(days[i...]) + Array(days[..<i])
    }
}

/// מה שהשעון שולח לאייפון כשאימון מתחיל בשעון - מספיק כדי לבנות שם WorkoutSession אמיתי
struct StartExercise: Codable, Equatable {
    var exerciseId: String
    var sets: [CatalogSet]
}

struct StartPayload: Codable, Equatable {
    var routineId: String?
    var dayNumber: Int?
    var title: String
    var exercises: [StartExercise]
}

/// איך הסתיים האימון האחרון באייפון - כדי לסגור את סשן האימון של Apple בהתאם
struct LastEndedWorkout: Codable, Equatable {
    var workoutId: String
    var endTime: Double
    var outcome: String
    var phoneSaved: Bool?
}

struct WorkoutState: Codable, Equatable {
    var active: Bool
    var healthSync: Bool?
    var lastEnded: LastEndedWorkout?
    var catalog: WorkoutCatalog?
    var workoutId: String?
    var title: String?
    var startTime: Double?
    var pausedAt: Double?
    var pausedTotalMs: Double?
    var autoRest: Bool?
    var ackSeq: Int?
    var exercises: [WatchExercise]?

    var isPaused: Bool { pausedAt != nil }

    func elapsedSeconds(at date: Date) -> Int {
        guard let start = startTime else { return 0 }
        let end = pausedAt ?? date.timeIntervalSince1970 * 1000
        return max(0, Int((end - start - (pausedTotalMs ?? 0)) / 1000))
    }
}

/// פקודה מהשעון לאייפון. seq עולה לכל אימון; האייפון מחזיר ackSeq כדי שנדע מה כבר נקלט.
struct WatchCommand: Codable, Equatable {
    var seq: Int
    var workoutId: String
    var type: String
    var exerciseIndex: Int?
    var exerciseId: String?
    var setIndex: Int?
    var field: String?
    var value: Double?
    var at: Double
    var start: StartPayload?
}

enum WorkoutLogic {
    /// אותה התנהגות כמו applyWatchCommand באייפון, כדי שהשעון יציג מיד את התוצאה בלי לחכות לו
    static func apply(_ command: WatchCommand, to state: WorkoutState) -> WorkoutState {
        var state = state
        switch command.type {
        case "finishWorkout":
            guard state.active, let workoutId = state.workoutId else { return state }
            state.active = false
            state.lastEnded = LastEndedWorkout(workoutId: workoutId, endTime: command.at, outcome: "finished", phoneSaved: false)
        case "pause":
            if state.pausedAt == nil { state.pausedAt = command.at }
        case "resume":
            if let pausedAt = state.pausedAt {
                state.pausedTotalMs = (state.pausedTotalMs ?? 0) + max(0, command.at - pausedAt)
                state.pausedAt = nil
            }
        default:
            guard var exercises = state.exercises,
                  let ei = command.exerciseIndex, exercises.indices.contains(ei),
                  exercises[ei].exerciseId == command.exerciseId,
                  let si = command.setIndex, exercises[ei].sets.indices.contains(si)
            else { return state }

            switch command.type {
            case "completeSet":
                exercises[ei].sets[si].completed = true
            case "uncompleteSet":
                exercises[ei].sets[si].completed = false
            case "updateSet":
                guard let value = command.value, let field = command.field else { return state }
                // כמו באייפון: הערך עובר גם לסטים שאחרי, שעוד לא הושלמו - אף פעם לא לקודמים
                for i in exercises[ei].sets.indices where i == si || (i > si && !exercises[ei].sets[i].completed) {
                    if field == "weightKg" { exercises[ei].sets[i].weightKg = value }
                    if field == "reps" { exercises[ei].sets[i].reps = Int(value.rounded()) }
                }
            default:
                return state
            }
            state.exercises = exercises
        }
        return state
    }

    static func formatWeight(_ kg: Double) -> String {
        if kg.rounded() == kg { return String(Int(kg)) }
        var text = String(format: "%.2f", kg)
        while text.hasSuffix("0") { text.removeLast() }
        return text
    }

    static func formatClock(_ seconds: Int) -> String {
        let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }
}
