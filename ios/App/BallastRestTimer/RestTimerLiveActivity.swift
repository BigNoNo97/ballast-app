import ActivityKit
import SwiftUI
import WidgetKit

/// התצוגה של טיימר המנוחה: מסך הנעילה (וגם באנר בהתראות) ו-Dynamic Island.
/// הספירה לאחור היא Text(timerInterval:) - המערכת מריצה אותה בעצמה, בלי עדכונים מהאפליקציה.
struct RestTimerLiveActivity: Widget {
    private let brand = Color(red: 0.43, green: 0.49, blue: 0.96) // #6E7CF5

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            LockScreenView(context: context, brand: brand)
                .activityBackgroundTint(Color.black.opacity(0.75))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("מנוחה", systemImage: "timer")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(brand)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context.state.endsAt)
                        .font(.title2.monospacedDigit().weight(.bold))
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.exerciseName).font(.subheadline.weight(.semibold)).lineLimit(1)
                        if !context.state.nextUp.isEmpty {
                            Text("הבא: \(context.state.nextUp)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(brand)
            } compactTrailing: {
                countdown(context.state.endsAt)
                    .monospacedDigit()
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "timer").foregroundStyle(brand)
            }
            .keylineTint(brand)
        }
    }

    private func countdown(_ endsAt: Date) -> some View {
        // אחרי הסוף: 0:00 ולא ספירה שלילית
        Text(timerInterval: Date()...max(Date(), endsAt), countsDown: true)
            .multilineTextAlignment(.trailing)
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>
    let brand: Color

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Label("מנוחה", systemImage: "timer")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(brand)
                Text(context.attributes.exerciseName)
                    .font(.headline)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if !context.state.nextUp.isEmpty {
                    Text("הבא: \(context.state.nextUp)")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            Text(timerInterval: Date()...max(Date(), context.state.endsAt), countsDown: true)
                .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
                .frame(width: 120, alignment: .trailing)
        }
        .padding(16)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

@main
struct BallastRestTimerBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}
