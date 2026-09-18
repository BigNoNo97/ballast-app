import React from 'react';

// מסך טעינה קטן שמוצג בזמן שהמנוע בונה תוכנית אישית - כדי שברור שקורה משהו אמיתי
// ("הולכים למאגר ובונים"), לא רק הופעה מיידית של תוכנית מוכנה מראש.
export const ProgramGeneratingLoader: React.FC = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      gap: 22,
      padding: 32,
      textAlign: 'center',
    }}
  >
    <svg width={84} height={84} viewBox="0 0 84 84">
      <defs>
        <linearGradient id="programLoaderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-blue)" />
          <stop offset="100%" stopColor="var(--color-purple)" />
        </linearGradient>
      </defs>
      <circle cx={42} cy={42} r={34} fill="none" stroke="var(--bg-surface-2)" strokeWidth={8} />
      <circle
        cx={42}
        cy={42}
        r={34}
        fill="none"
        stroke="url(#programLoaderGradient)"
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray="90 300"
        style={{ transformOrigin: '42px 42px', animation: 'programLoaderSpin 1.1s linear infinite' }}
      />
    </svg>
    <div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>
        בונים לך את התוכנית הכי טובה...
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 260 }}>
        בוחרים תרגילים ומחלקים נפח וזמן בהתאם לימים, הציוד ומשך האימון שבחרת - עוד רגע מוכן.
      </div>
    </div>
  </div>
);
