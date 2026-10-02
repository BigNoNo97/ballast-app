import SwiftUI
import WatchKit

extension Color {
    static let ballast = Color(red: 0.43, green: 0.49, blue: 0.96)
}

enum EditField { case weight, reps }

/// שלט לאימון: עמוד לכל תרגיל (החלקה ימינה/שמאלה), הכתר הדיגיטלי משנה משקל/חזרות
/// של הסט הפתוח, וכפתור "בוצע" מסמן אותו ומפעיל טיימר מנוחה.
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
                        hasNext: nextOpenExercise(after: index) != nil,
                        syncing: !connector.pending.isEmpty,
                        heartRate: sessionManager.heartRate,
                        onSelectField: selectField,
                        onComplete: { complete(exerciseIndex: index) },
                        onUndo: { undo(exerciseIndex: index) },
                        onNext: { goToNextOpen(after: index) },
                        onTogglePause: togglePause
                    )
                    .tag(index)
                }
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
            selection = firstOpenExercise() ?? 0
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

        if state.autoRest ?? true {
            let nextUp: String
            if let k = nextSetInExercise {
                let s = exercise.sets[k]
                nextUp = "הבא: סט \(k + 1) · \(WorkoutLogic.formatWeight(s.weightKg)) ק״ג × \(s.reps)"
            } else if let n = nextExercise {
                nextUp = "הבא: \(exercises[n].name)"
            } else {
                nextUp = "סיימת את כל הסטים 💪"
            }
            if nextSetInExercise != nil || nextExercise != nil {
                restTimer.start(seconds: exercise.restSec, nextUp: nextUp)
            }
        }

        if exerciseNowDone, let n = nextExercise {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                withAnimation { selection = n }
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

    private func goToNextOpen(after index: Int) {
        guard let n = nextOpenExercise(after: index) else { return }
        withAnimation { selection = n }
    }

    private func firstOpenExercise() -> Int? {
        exercises.indices.first { exercises[$0].openSetIndex != nil }
    }

    private func nextOpenExercise(after index: Int) -> Int? {
        let order = Array(exercises.indices.dropFirst(index + 1)) + Array(exercises.indices.prefix(index))
        return order.first { exercises[$0].openSetIndex != nil }
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
    let hasNext: Bool
    let syncing: Bool
    let heartRate: Int?
    let onSelectField: (EditField) -> Void
    let onComplete: () -> Void
    let onUndo: () -> Void
    let onNext: () -> Void
    let onTogglePause: () -> Void

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Button(action: onTogglePause) {
                    Image(systemName: state.isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 11, weight: .bold))
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(state.isPaused ? Color.ballast : Color.white.opacity(0.15)))
                }
                .buttonStyle(.plain)

                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(WorkoutLogic.formatClock(state.elapsedSeconds(at: context.date)))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(state.isPaused ? Color.orange : Color.primary)
                }

                Spacer(minLength: 0)

                if let heartRate {
                    HeartRateLabel(bpm: heartRate)
                }

                if syncing {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }

                if exercise.sets.contains(where: \.completed) {
                    Button(action: onUndo) {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 11, weight: .bold))
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(Color.white.opacity(0.15)))
                    }
                    .buttonStyle(.plain)
                }
            }

            Text(exercise.name)
                .font(.system(size: 15, weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.75)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            Text(statusLine)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            if exercise.openSetIndex != nil {
                HStack(spacing: 6) {
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

                Button(action: onComplete) {
                    Label("בוצע", systemImage: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.ballast)
            } else {
                Text("\(exercise.sets.count) סטים הושלמו")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .frame(maxHeight: .infinity)

                if hasNext {
                    Button(action: onNext) {
                        Label("לתרגיל הבא", systemImage: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.ballast)
                }
            }
        }
        .padding(.horizontal, 4)
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
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(selected ? Color.ballast.opacity(0.25) : Color.white.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(selected ? Color.ballast : Color.clear, lineWidth: 1.5)
        )
        .contentShape(Rectangle())
    }
}

private struct HeartRateLabel: View {
    let bpm: Int

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "heart.fill")
                .font(.system(size: 9))
                .foregroundStyle(.red)
            Text("\(bpm)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
    }
}

// MARK: - מסך מנוחה

private struct RestOverlay: View {
    @EnvironmentObject private var restTimer: RestTimer
    @EnvironmentObject private var sessionManager: WorkoutSessionManager

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    Text("מנוחה")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                    if let bpm = sessionManager.heartRate {
                        HeartRateLabel(bpm: bpm)
                    }
                }

                Text(WorkoutLogic.formatClock(remaining(at: context.date)))
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Color.ballast)

                Text(restTimer.nextUp)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)

                HStack(spacing: 8) {
                    Button("+15") { restTimer.addTime(15) }
                    Button("דלג") { restTimer.skip() }
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
