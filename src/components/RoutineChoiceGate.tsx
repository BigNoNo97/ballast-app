import React from 'react';
import { Sparkles, Hammer, ChevronLeft } from 'lucide-react';

interface RoutineChoiceGateProps {
  onChooseSystem: () => void;
  onChooseOwn: () => void;
}

// מוצג אחרי אונבורדינג למשתמש שסיים אותו בלי לבחור תוכנית אימונים בפועל
// (למשל דילג על שלב התוכנית) - לפני שמגיעים לעמוד הבית, חייבים לבחור כיוון.
export const RoutineChoiceGate: React.FC<RoutineChoiceGateProps> = ({ onChooseSystem, onChooseOwn }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
    <div style={{ padding: '36px 24px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>
        איך נבנה לך תוכנית אימונים?
      </div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55, maxWidth: 300, margin: '0 auto' }}>
        עוד לא בחרת תוכנית אימונים. אפשר תמיד לשנות את זה אחר כך מתוך "ניהול תוכניות".
      </div>
    </div>

    <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        onClick={onChooseSystem}
        style={{
          textAlign: 'start',
          background: 'var(--bg-surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: 20,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: 'var(--color-purple-bg)',
              color: 'var(--color-purple)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                שהמערכת תיצור לי תוכנית
              </span>
              <span className="pill-badge pill-purple">בקרוב</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          בעתיד ניצור לך כאן תוכנית מותאמת אישית לפי המטרה והניסיון שלך. בינתיים נתחיל אותך עם תוכנית פתיחה מומלצת, ותמיד אפשר להחליף.
        </div>
      </button>

      <button
        onClick={onChooseOwn}
        style={{
          textAlign: 'start',
          background: 'var(--bg-surface-1)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20,
          padding: 20,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: 'var(--color-blue-bg)',
              color: 'var(--color-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Hammer size={22} />
          </div>
          <div style={{ flex: 1, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>אני אבנה לעצמי</div>
          <ChevronLeft size={18} color="var(--text-dim)" />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
          עוברים ישר למסך בניית תוכנית - בוחרים ימי אימון, תרגילים וסטים בעצמך.
        </div>
      </button>
    </div>
  </div>
);
