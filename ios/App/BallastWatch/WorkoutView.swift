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

/// שלט לאימון: עמוד לכל תרגיל (החלקה ימינה/שמאלה) ועמוד סיום בסוף. הכתר הדיגיטלי
/// משנה משקל/חזרות של הסט הפתוח, וכפתור "בוצע" מסמן אותו ומפעיל טיימר מנוחה.
struct WorkoutView: View {
    @EnvironmentObject private var connector: WatchConnector
    @EnvironmentObject private var restTimer: RestTimer
    @EnvironmentObject private var sessionManager: WorkoutSessionManager
    let state: WorkoutState

    @State private var selection = 0
    @State private var field: EditField = .weight
    @State private var draft: Double?
    @State private var draftExercise = -1
    @State private var draftSet = -1
    @State private var draftField: EditField = .weight
    @State private var commitTask: Task<Void, Never>?
    @FocusState private var crownFocused: Bool

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
                        field: field,
                        shownWeight: shownValue(exercise: index, field: .weight),
                        shownReps: shownValue(exercise: index, field: .reps).map { Int($0.rounded()) },
                        nextLabel: nextOpenExercise(after: index) != nil ? "לתרגיל הבא" : "לסיום האימון",
                        syncing: !connector.pending.isEmpty,
                        onSelectField: selectField,
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
            .focusable(true)
            .focused($crownFocused)
            .digitalCrownRotation(
                crownBinding,
                from: 0,
                through: field == .weight ? 500 : 100,
                by: field == .weight ? currentStep : 1,
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: true
            )

            if restTimer.endDate != nil {
                RestOverlay()
            }
        }
        .onAppear {
            selection = firstOpenExercise() ?? finishPageTag
            crownFocused = true
        }
        .onChange(of: selection) { _, _ in commitDraft() }
    }

    // MARK: - Crown editing (draft נשלח רק אחרי שהכתר נעצר, לא על כל קליק)

    private var currentStep: Double {
        exercises.indices.contains(selection) ? max(0.25, exercises[selection].weightStep) : 2.5
    }

    private func actualValue(exercise: Int, field: EditField) -> Double? {
        guard exercises.indices.contains(exercise), let open = exercises[exercise].openSetIndex else { return nil }
        let set = exercises[exercise].sets[open]
        return field == .weight ? set.weightKg : Double(set.reps)
    }

    private func shownValue(exercise: Int, field: EditField) -> Double? {
        guard exercises.indices.contains(exercise) else { return nil }
        if let draft, draftExercise == exercise, draftField == field,
           draftSet == exercises[exercise].openSetIndex {
            return draft
        }
        return actualValue(exercise: exercise, field: field)
    }

    private var crownBinding: Binding<Double> {
        Binding(
            get: { shownValue(exercise: selection, field: field) ?? 0 },
            set: { newValue in updateDraft(newValue) }
        )
    }

    private func updateDraft(_ value: Double) {
        guard exercises.indices.contains(selection), let open = exercises[selection].openSetIndex else { return }
        draft = max(0, field == .weight ? value : value.rounded())
        draftExercise = selection
        draftSet = open
        draftField = field
        commitTask?.cancel()
        commitTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            if !Task.isCancelled { commitDraft() }
        }
    }

    private func commitDraft() {
        commitTask?.cancel()
        guard let value = draft else { return }
        let exerciseIndex = draftExercise, setIndex = draftSet, editedField = draftField
        draft = nil
        let fieldName = editedField == .weight ? "weightKg" : "reps"
        if actualValue(exercise: exerciseIndex, field: editedField) != value {
            connector.send("updateSet", exerciseIndex: exerciseIndex, setIndex: setIndex, field: fieldName, value: value)
        }
    }

    private func selectField(_ newField: EditField) {
        commitDraft()
        field = newField
        crownFocused = true
    }

    // MARK: - Actions

    private func complete(exerciseIndex: Int) {
        commitDraft()
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
        commitDraft()
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
        commitDraft()
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
            HStack(spacing: S(2)) {
                Image(systemName: "heart.fill")
                    .font(.system(size: S(11)))
                    .foregroundStyle(sessionManager.heartRate == nil ? Color.gray : Color.red)
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

// MARK: - עמוד תרגיל

private struct ExercisePage: View {
    let exercise: WatchExercise
    let index: Int
    let total: Int
    let state: WorkoutState
    let field: EditField
    let shownWeight: Double?
    let shownReps: Int?
    let nextLabel: String
    let syncing: Bool
    let onSelectField: (EditField) -> Void
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

            if exercise.openSetIndex != nil {
                HStack(spacing: S(6)) {
                    ValueTile(
                        value: shownWeight.map(WorkoutLogic.formatWeight) ?? "–",
                        label: "ק״ג",
                        selected: field == .weight
                    )
                    .onTapGesture { onSelectField(.weight) }

                    ValueTile(
                        value: shownReps.map(String.init) ?? "–",
                        label: "חזרות",
                        selected: field == .reps
                    )
                    .onTapGesture { onSelectField(.reps) }
                }
                .frame(maxHeight: .infinity)

                Button(action: onComplete) {
                    Label("בוצע", systemImage: "checkmark")
                        .font(.system(size: S(18), weight: .bold))
                        .frame(maxWidth: .infinity, minHeight: S(40))
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
                        .font(.system(size: S(17), weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: S(40))
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
    let selected: Bool

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: min(geo.size.height * 0.55, geo.size.width * 0.42), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text(label)
                    .font(.system(size: S(12)))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minHeight: S(48))
        .background(
            RoundedRectangle(cornerRadius: S(12))
                .fill(selected ? Color.ballast.opacity(0.25) : Color.white.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: S(12))
                .stroke(selected ? Color.ballast : Color.clear, lineWidth: 2)
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
                    Label("\(bpm)", systemImage: "heart.fill")
                        .foregroundStyle(.red)
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
                        Label("\(bpm)", systemImage: "heart.fill")
                            .font(.system(size: S(15), weight: .semibold, design: .rounded))
                            .foregroundStyle(.red)
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
