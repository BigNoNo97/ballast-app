import React from 'react';

interface State {
  failed: boolean;
}

/// רשת ביטחון אחרונה: שגיאת רינדור בכל מסך הייתה משאירה מסך לבן ריק בלי דרך לצאת ממנו.
/// הנתונים שמורים מקומית ובענן, אז טעינה מחדש בטוחה ולא מאבדת כלום.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('render crash', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        dir="rtl"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          textAlign: 'center',
          background: 'var(--bg-app, #0b0b0f)',
          color: 'var(--text-main, #fff)',
        }}
      >
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>משהו השתבש</h2>
        <p style={{ color: 'var(--text-muted, #999)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 300 }}>
          הנתונים שלך שמורים. טעינה מחדש תחזיר את האפליקציה לפעולה.
        </p>
        <button className="btn-primary" style={{ padding: '10px 28px' }} onClick={() => window.location.reload()}>
          טען מחדש
        </button>
      </div>
    );
  }
}
