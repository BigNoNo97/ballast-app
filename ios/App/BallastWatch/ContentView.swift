import SwiftUI
import WatchKit

struct ContentView: View {
    @EnvironmentObject private var connector: WatchConnector

    var body: some View {
        Group {
            if let summary = connector.finishedSummary {
                FinishedView(summary: summary)
            } else if let state = connector.state, state.active, !(state.exercises ?? []).isEmpty {
                WorkoutView(state: state)
                    .id(state.workoutId)
            } else if let state = connector.state, state.active {
                IdleView(title: "האימון פעיל באייפון", hint: "הוסף תרגיל באייפון והוא יופיע כאן")
            } else if let catalog = connector.catalog, !catalog.days.isEmpty {
                StartView(catalog: catalog)
            } else {
                IdleView(title: "אין אימון פעיל", hint: "פתח את Ballast באייפון כדי להעביר את התוכנית לשעון")
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

private struct IdleView: View {
    let title: String
    let hint: String

    var body: some View {
        VStack(spacing: S(8)) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: S(34)))
                .foregroundStyle(Color.ballast)
            Text(title)
                .font(.system(size: S(18), weight: .semibold))
                .multilineTextAlignment(.center)
            Text(hint)
                .font(.system(size: S(14)))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

/// התחלת אימון מהשעון: ימי התוכנית הפעילה, היום הבא בתור ראשון
private struct StartView: View {
    @EnvironmentObject private var connector: WatchConnector
    let catalog: WorkoutCatalog
    @State private var pendingDay: CatalogDay?

    var body: some View {
        ScrollView {
            VStack(spacing: S(6)) {
                Text("התחל אימון")
                    .font(.system(size: S(18), weight: .bold))
                Text(catalog.routineTitle)
                    .font(.system(size: S(12)))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                ForEach(catalog.orderedDays, id: \.dayNumber) { day in
                    let isNext = day.dayNumber == catalog.nextDayNumber
                    Button { pendingDay = day } label: {
                        VStack(alignment: .leading, spacing: S(2)) {
                            if isNext {
                                Text("הבא בתור")
                                    .font(.system(size: S(11), weight: .bold))
                                    .foregroundStyle(Color.white.opacity(0.85))
                            }
                            Text(day.title)
                                .font(.system(size: S(15), weight: .semibold))
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            Text("\(day.exercises.count) תרגילים" + ((day.subtitle ?? "").isEmpty ? "" : " · \(day.subtitle!)"))
                                .font(.system(size: S(11)))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, S(4))
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(isNext ? .ballast : Color.white.opacity(0.12))
                }
            }
        }
        .confirmationDialog(
            pendingDay.map { "להתחיל את \($0.title)?" } ?? "",
            isPresented: Binding(get: { pendingDay != nil }, set: { if !$0 { pendingDay = nil } }),
            titleVisibility: .visible,
            presenting: pendingDay
        ) { day in
            Button("התחל אימון") {
                connector.startLocalWorkout(day: day)
                WKInterfaceDevice.current().play(.start)
            }
            Button("ביטול", role: .cancel) {}
        }
    }
}

/// "כל הכבוד" אחרי שהאימון הסתיים - מהשעון או מהאייפון
private struct FinishedView: View {
    @EnvironmentObject private var connector: WatchConnector
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let summary: FinishedSummary

    private var stats: MeasuredStats? {
        sessionManager.lastStats?.workoutId == summary.workoutId ? sessionManager.lastStats : nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: S(8)) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: S(36)))
                    .foregroundStyle(.green)
                Text("כל הכבוד! 💪")
                    .font(.system(size: S(20), weight: .bold))

                StatRow(icon: "clock.fill", color: .ballast, text: WorkoutLogic.formatClock(summary.durationSec))
                StatRow(icon: "checkmark.circle.fill", color: .green, text: "\(summary.setsDone) מתוך \(summary.setsTotal) סטים")
                if let stats, stats.calories > 0 {
                    StatRow(icon: "flame.fill", color: .orange, text: "\(stats.calories) קלוריות")
                }
                if let avg = stats?.averageHeartRate {
                    StatRow(icon: "heart.fill", color: .red, text: "דופק ממוצע \(avg)")
                }

                Text("האימון נשמר באייפון כשהוא זמין")
                    .font(.system(size: S(12)))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button("סגור") { connector.dismissSummary() }
                    .tint(.ballast)
            }
        }
    }
}

private struct StatRow: View {
    let icon: String
    let color: Color
    let text: String

    var body: some View {
        HStack(spacing: S(6)) {
            Image(systemName: icon).foregroundStyle(color)
            Text(text)
            Spacer(minLength: 0)
        }
        .font(.system(size: S(16), weight: .semibold, design: .rounded))
    }
}
