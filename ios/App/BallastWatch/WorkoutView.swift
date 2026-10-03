import SwiftUI
import WatchKit

extension Color {
    static let ballast = Color(red: 0.43, green: 0.49, blue: 0.96)
}

/// גדלים יחסיים למסך: 1.0 על שעון 41 מ"מ, גדול יותר על 45 מ"מ ועל Ultra (49 מ"מ)
enum WatchScale {
    static let factor: CGFloat = {
        let width = WKInterfaceDevice.current().screenBounds.width
        return min(1.25, max(0.9, width / 176))
    }()
}

/// גודל (פונט/מרווח) מותאם למסך השעון הנוכחי
func S(_ size: CGFloat) -> CGFloat { (size * WatchScale.factor).rounded() }

enum EditField { case weight, reps }

/// מה עורכים בגלגלת: איזה סט, איזה שדה, ומה הערך הנוכחי
struct EditRequest: Identifiable {
    let exerciseIndex: Int
    let setIndex: Int
    let field: EditField
    let current: Double
    let step: Double
    var id: String { "\(exerciseIndex)-\(setIndex)-\(field == .weight ? "w" : "r")" }
}

/// שלט לאימון: עמוד לכל תרגיל (החלקה ימינה/שמאלה) ועמוד סיום בסוף. לחיצה על משקל/חזרות
/// פותחת גלגלת לבחירת הערך, וכפתור "בוצע" מסמן את הסט הפתוח ומפעיל טיימר מנוחה.
struct WorkoutView: View {
    @EnvironmentObject private var connector: WatchConnector
    @EnvironmentObject private var restTimer: RestTimer
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let state: WorkoutState

    @State private var selection = 0
    @State private var editing: EditRequest?

    private var exercises: [WatchExercise] { state.exercises ?? [] }
    private var finishPageTag: Int { exercises.count }

    var body: some View {
        ZStack {
            TabView(selection: $selection) {
                ForEach(exercises.indices, id: \.self) { index in
                    ExercisePage(
                        exercise: exercises[index],
                        index: index,
                        total: exercises.count,
                        state: state,
                        nextLabel: nextOpenExercise(after: index) != nil ? "לתרגיל הבא" : "לסיום האימון",
                        syncing: !connector.pending.isEmpty,
                        onEdit: { field in openEditor(exerciseIndex: index, field: field) },
                        onComplete: { complete(exerciseIndex: index) },
                        onUndo: { undo(exerciseIndex: index) },
                        onNext: { goToNextOpen(after: index) },
                        onTogglePause: togglePause
                    )
                    .tag(index)
                }

                FinishPage(state: state, onFinish: finishWorkout)
                    .tag(finishPageTag)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            if restTimer.endDate != nil {
                RestOverlay()
            }
        }
        .sheet(item: $editing) { request in
            ValuePickerSheet(request: request) { value in
                save(request: request, value: value)
            }
        }
        .onAppear {
            selection = firstOpenExercise() ?? finishPageTag
        }
    }

    // MARK: - עריכת משקל/חזרות בגלגלת

    private func openEditor(exerciseIndex: Int, field: EditField) {
        guard exercises.indices.contains(exerciseIndex), let open = exercises[exerciseIndex].openSetIndex else { return }
        let exercise = exercises[exerciseIndex]
        let set = exercise.sets[open]
        editing = EditRequest(
            exerciseIndex: exerciseIndex,
            setIndex: open,
            field: field,
            current: field == .weight ? set.weightKg : Double(set.reps),
            step: field == .weight ? 0.5 : 1
        )
    }

    private func save(request: EditRequest, value: Double) {
        guard value != request.current else { return }
        connector.send(
            "updateSet",
            exerciseIndex: request.exerciseIndex,
            setIndex: request.setIndex,
            field: request.field == .weight ? "weightKg" : "reps",
            value: value
        )
        WKInterfaceDevice.current().play(.click)
    }

    // MARK: - Actions

    private func complete(exerciseIndex: Int) {
        guard exercises.indices.contains(exerciseIndex), let open = exercises[exerciseIndex].openSetIndex else { return }
        let exercise = exercises[exerciseIndex]
        connector.send("completeSet", exerciseIndex: exerciseIndex, setIndex: open)
        WKInterfaceDevice.current().play(.success)

        let nextSetInExercise = exercise.sets.indices.first { $0 > open && !exercise.sets[$0].completed }
        let exerciseNowDone = nextSetInExercise == nil
        let nextExercise = nextOpenExercise(after: exerciseIndex)

        if state.autoRest ?? true, nextSetInExercise != nil || nextExercise != nil {
            let nextUp: String
            if let k = nextSetInExercise {
                let s = exercise.sets[k]
                nextUp = "הבא: סט \(k + 1) · \(WorkoutLogic.formatWeight(s.weightKg)) ק״ג × \(s.reps)"
            } else {
                nextUp = "הבא: \(exercises[nextExercise!].name)"
            }
            restTimer.start(seconds: exercise.restSec, nextUp: nextUp)
        }

        if exerciseNowDone {
            // תרגיל נגמר -> לתרגיל הבא שעוד לא הושלם, ואם אין כזה - לעמוד הסיום
            let target = nextExercise ?? finishPageTag
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                withAnimation { selection = target }
            }
        }
    }

    private func undo(exerciseIndex: Int) {
        guard exercises.indices.contains(exerciseIndex),
              let last = exercises[exerciseIndex].sets.lastIndex(where: \.completed) else { return }
        connector.send("uncompleteSet", exerciseIndex: exerciseIndex, setIndex: last)
        WKInterfaceDevice.current().play(.directionDown)
    }

    private func togglePause() {
        connector.send(state.isPaused ? "resume" : "pause")
        WKInterfaceDevice.current().play(.click)
    }

    private func finishWorkout() {
        restTimer.skip()
        connector.send("finishWorkout")
        WKInterfaceDevice.current().play(.success)
    }

    private func goToNextOpen(after index: Int) {
        withAnimation { selection = nextOpenExercise(after: index) ?? finishPageTag }
    }

    private func firstOpenExercise() -> Int? {
        exercises.indices.first { exercises[$0].openSetIndex != nil }
    }

    private func nextOpenExercise(after index: Int) -> Int? {
        let order = Array(exercises.indices.dropFirst(index + 1)) + Array(exercises.indices.prefix(index))
        return order.first { exercises[$0].openSetIndex != nil }
    }
}

// MARK: - גלגלת בחירת ערך

private struct ValuePickerSheet: View {
    let request: EditRequest
    let onSave: (Double) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var value: Double

    init(request: EditRequest, onSave: @escaping (Double) -> Void) {
        self.request = request
        self.onSave = onSave
        _value = State(initialValue: request.current)
    }

    /// כפולות של הקפיצה (0.5 ק"ג או חזרה אחת), ותמיד גם הערך הנוכחי - גם אם הוא לא כפולה
    private var options: [Double] {
        let maxValue = request.field == .weight ? max(300, request.current + 50) : max(100, request.current + 20)
        let count = Int((maxValue / request.step).rounded(.down))
        var values = (0...count).map { Double($0) * request.step }
        if !values.contains(request.current) {
            values.append(request.current)
            values.sort()
        }
        return values
    }

    private func label(_ v: Double) -> String {
        request.field == .weight ? WorkoutLogic.formatWeight(v) : String(Int(v.rounded()))
    }

    var body: some View {
        VStack(spacing: S(4)) {
            Text(request.field == .weight ? "משקל (ק״ג)" : "חזרות")
                .font(.system(size: S(15), weight: .semibold))
                .foregroundStyle(.secondary)

            Picker(request.field == .weight ? "משקל" : "חזרות", selection: $value) {
                ForEach(options, id: \.self) { option in
                    Text(label(option))
                        .font(.system(size: S(30), weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .tag(option)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(maxHeight: .infinity)

            Button {
                onSave(value)
                dismiss()
            } label: {
                Label("אישור", systemImage: "checkmark")
                    .font(.system(size: S(17), weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: S(36))
            }
            .buttonStyle(.borderedProminent)
            .tint(.ballast)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

// MARK: - שורה עליונה: השהיה, שעון אימון, דופק

private struct WorkoutHeader: View {
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let state: WorkoutState
    let syncing: Bool
    let showUndo: Bool
    let onTogglePause: () -> Void
    let onUndo: () -> Void

    var body: some View {
        HStack(spacing: S(5)) {
            CircleButton(systemImage: state.isPaused ? "play.fill" : "pause.fill",
                         highlighted: state.isPaused, action: onTogglePause)

            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(WorkoutLogic.formatClock(state.elapsedSeconds(at: context.date)))
                    .font(.system(size: S(17), weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(state.isPaused ? Color.orange : Color.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            Spacer(minLength: 0)

            HeartRateButton(state: state)

            if syncing {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: S(10)))
                    .foregroundStyle(.secondary)
            }

            if showUndo {
                CircleButton(systemImage: "arrow.uturn.backward", highlighted: false, action: onUndo)
            }
        }
    }
}

private struct CircleButton: View {
    let systemImage: String
    let highlighted: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: S(12), weight: .bold))
                .frame(width: S(28), height: S(28))
                .background(Circle().fill(highlighted ? Color.ballast : Color.white.opacity(0.15)))
        }
        .buttonStyle(.plain)
    }
}

/// דופק תמיד מוצג: לב אדום עם הקצב, או לב אפור עם "--". לחיצה כשאין דופק מסבירה למה ומנסה שוב.
private struct HeartRateButton: View {
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let state: WorkoutState
    @State private var showingStatus = false

    var body: some View {
        Button {
            if sessionManager.heartRate == nil { showingStatus = true }
        } label: {
            HStack(spacing: S(3)) {
                BeatingHeart(bpm: sessionManager.heartRate, size: S(12))
                Text(sessionManager.heartRate.map(String.init) ?? "--")
                    .font(.system(size: S(16), weight: .semibold, design: .rounded))
                    .monospacedDigit()
            }
        }
        .buttonStyle(.plain)
        .alert("דופק", isPresented: $showingStatus) {
            Button("נסה שוב") { sessionManager.retry(with: state) }
            Button("סגור", role: .cancel) {}
        } message: {
            Text(sessionManager.statusMessage ?? "מתחבר לחיישן הדופק…")
        }
    }
}

/// לב שפועם בקצב הדופק שנמדד: פעימה אחת כל 60/bpm שניות - כיווץ מהיר והרפיה איטית יותר,
/// כמו פעימה אמיתית. בלי דופק: לב אפור וסטטי.
struct BeatingHeart: View {
    let bpm: Int?
    let size: CGFloat

    var body: some View {
        let icon = Image(systemName: "heart.fill").font(.system(size: size))
        if let bpm, bpm > 0 {
            let beat = 60.0 / Double(min(max(bpm, 30), 220))
            icon
                .foregroundStyle(.red)
                .phaseAnimator([false, true]) { content, expanded in
                    content.scaleEffect(expanded ? 1.3 : 1.0)
                } animation: { expanded in
                    expanded ? .easeOut(duration: beat * 0.3) : .easeIn(duration: beat * 0.7)
                }
        } else {
            icon.foregroundStyle(.gray)
        }
    }
}

// MARK: - עמוד תרגיל

private struct ExercisePage: View {
    let exercise: WatchExercise
    let index: Int
    let total: Int
    let state: WorkoutState
    let nextLabel: String
    let syncing: Bool
    let onEdit: (EditField) -> Void
    let onComplete: () -> Void
    let onUndo: () -> Void
    let onNext: () -> Void
    let onTogglePause: () -> Void

    var body: some View {
        VStack(spacing: S(4)) {
            WorkoutHeader(
                state: state,
                syncing: syncing,
                showUndo: exercise.sets.contains(where: \.completed),
                onTogglePause: onTogglePause,
                onUndo: onUndo
            )

            Text(exercise.name)
                .font(.system(size: S(17), weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            Text(statusLine)
                .font(.system(size: S(12)))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if let open = exercise.openSetIndex {
                HStack(spacing: S(6)) {
                    ValueTile(value: WorkoutLogic.formatWeight(exercise.sets[open].weightKg), label: "ק״ג")
                        .onTapGesture { onEdit(.weight) }

                    ValueTile(value: String(exercise.sets[open].reps), label: "חזרות")
                        .onTapGesture { onEdit(.reps) }
                }
                .frame(maxHeight: .infinity)

                Button(action: onComplete) {
                    Label("בוצע", systemImage: "checkmark")
                        .font(.system(size: S(16), weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: S(32))
                }
                .buttonStyle(.borderedProminent)
                .tint(.ballast)
            } else {
                VStack(spacing: S(4)) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: S(34)))
                        .foregroundStyle(.green)
                    Text("\(exercise.sets.count) סטים הושלמו")
                        .font(.system(size: S(15)))
                        .foregroundStyle(.secondary)
                }
                .frame(maxHeight: .infinity)

                Button(action: onNext) {
                    Label(nextLabel, systemImage: "chevron.left")
                        .font(.system(size: S(15), weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: S(32))
                }
                .buttonStyle(.borderedProminent)
                .tint(.ballast)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var statusLine: String {
        if let open = exercise.openSetIndex {
            return "תרגיל \(index + 1)/\(total) · סט \(open + 1) מתוך \(exercise.sets.count)"
        }
        return "תרגיל \(index + 1)/\(total) · הושלם ✓"
    }
}

private struct ValueTile: View {
    let value: String
    let label: String

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: min(geo.size.height * 0.55, geo.size.width * 0.42), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                HStack(spacing: S(3)) {
                    Text(label)
                    Image(systemName: "chevron.up.chevron.down")
                }
                .font(.system(size: S(12)))
                .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minHeight: S(48))
        .background(
            RoundedRectangle(cornerRadius: S(12))
                .fill(Color.white.opacity(0.1))
        )
        .overlay(
            RoundedRectangle(cornerRadius: S(12))
                .stroke(Color.ballast.opacity(0.6), lineWidth: 1.5)
        )
        .contentShape(Rectangle())
    }
}

// MARK: - עמוד סיום

private struct FinishPage: View {
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let state: WorkoutState
    let onFinish: () -> Void
    @State private var confirming = false

    private var sets: [WatchSet] { (state.exercises ?? []).flatMap(\.sets) }
    private var remaining: Int { sets.filter { !$0.completed }.count }

    var body: some View {
        VStack(spacing: S(6)) {
            Text("סיום אימון")
                .font(.system(size: S(18), weight: .bold))

            TimelineView(.periodic(from: .now, by: 1)) { context in
                Text(WorkoutLogic.formatClock(state.elapsedSeconds(at: context.date)))
                    .font(.system(size: S(32), weight: .bold, design: .rounded))
                    .monospacedDigit()
            }

            Text("\(sets.count - remaining) מתוך \(sets.count) סטים")
                .font(.system(size: S(14)))
                .foregroundStyle(.secondary)

            HStack(spacing: S(12)) {
                if let bpm = sessionManager.heartRate {
                    HStack(spacing: S(3)) {
                        BeatingHeart(bpm: bpm, size: S(13))
                        Text("\(bpm)").monospacedDigit()
                    }
                }
                if sessionManager.activeCalories > 0 {
                    Label("\(Int(sessionManager.activeCalories.rounded()))", systemImage: "flame.fill")
                        .foregroundStyle(.orange)
                }
            }
            .font(.system(size: S(14), weight: .semibold, design: .rounded))

            Spacer(minLength: 0)

            Button { confirming = true } label: {
                Label("סיים אימון", systemImage: "flag.checkered")
                    .font(.system(size: S(18), weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: S(40))
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .confirmationDialog(
            remaining > 0 ? "נשארו \(remaining) סטים שלא סומנו. לסיים בכל זאת?" : "לסיים את האימון?",
            isPresented: $confirming,
            titleVisibility: .visible
        ) {
            Button("סיים אימון") { onFinish() }
            Button("ביטול", role: .cancel) {}
        }
    }
}

// MARK: - מסך מנוחה

private struct RestOverlay: View {
    @EnvironmentObject private var restTimer: RestTimer
    @EnvironmentObject private var sessionManager: WorkoutSessionManager

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: S(6)) {
                HStack(spacing: S(10)) {
                    Text("מנוחה")
                        .font(.system(size: S(15)))
                        .foregroundStyle(.secondary)
                    if let bpm = sessionManager.heartRate {
                        HStack(spacing: S(3)) {
                            BeatingHeart(bpm: bpm, size: S(14))
                            Text("\(bpm)")
                                .font(.system(size: S(15), weight: .semibold, design: .rounded))
                                .monospacedDigit()
                        }
                    }
                }

                Text(WorkoutLogic.formatClock(remaining(at: context.date)))
                    .font(.system(size: S(54), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Color.ballast)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)

                Text(restTimer.nextUp)
                    .font(.system(size: S(13)))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)

                Spacer(minLength: 0)

                HStack(spacing: S(8)) {
                    Button("+15") { restTimer.addTime(15) }
                        .font(.system(size: S(17), weight: .semibold))
                    Button("דלג") { restTimer.skip() }
                        .font(.system(size: S(17), weight: .semibold))
                        .tint(.ballast)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
            .onChange(of: context.date) { _, now in restTimer.expireIfNeeded(now: now) }
        }
    }

    private func remaining(at date: Date) -> Int {
        guard let end = restTimer.endDate else { return 0 }
        return max(0, Int(end.timeIntervalSince(date).rounded(.up)))
    }
}
