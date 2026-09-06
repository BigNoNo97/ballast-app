import Capacitor

/// תת-מחלקה של ה-ViewController הסטנדרטי של Capacitor, שנועדה אך ורק כדי לרשום
/// את הפלאגינים המקומיים שלנו (כאלה שלא הותקנו כחבילת npm, כמו AppleHealthPlugin).
///
/// `capacitorDidLoad()` היא נקודת ההרחבה הרשמית של Capacitor לכך - היא נקראת
/// מיד אחרי שה-bridge נוצר, לפני שהעמוד באמת נטען.
///
/// חשוב: קובץ זה חייב להתווסף ל-target של "App" ב-Xcode (Add Files to "App"...).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleHealthPlugin())
    }
}
