import SwiftUI

struct ContentView: View {
    private let brandBlue = Color(red: 0.43, green: 0.49, blue: 0.96)

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 34))
                .foregroundStyle(brandBlue)
            Text("Ballast")
                .font(.title3.bold())
            Text("השלט לאימון יגיע בקרוב")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
