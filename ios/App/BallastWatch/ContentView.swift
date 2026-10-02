import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var connector: WatchConnector

    var body: some View {
        Group {
            if let state = connector.state, state.active, !(state.exercises ?? []).isEmpty {
                WorkoutView(state: state)
                    .id(state.workoutId)
            } else if let state = connector.state, state.active {
                IdleView(title: "האימון פעיל באייפון", hint: "הוסף תרגיל באייפון והוא יופיע כאן")
            } else {
                IdleView(title: "אין אימון פעיל", hint: "התחל אימון באייפון והוא יופיע כאן")
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

private struct IdleView: View {
    let title: String
    let hint: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 30))
                .foregroundStyle(Color.ballast)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(hint)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
