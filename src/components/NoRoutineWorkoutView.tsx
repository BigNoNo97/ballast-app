import React from 'react';
import { Settings, Sparkles, Hammer, ChevronLeft, Play } from 'lucide-react';

interface NoRoutineWorkoutViewProps {
  onChooseSystem: () => void;
  onOpenRoutinesMenu: () => void;
  onStartEmptyWorkout: () => void;
  onOpenSettings: () => void;
}

// מוצג בטאב "אימון" במקום WorkoutHomeView, כשלמשתמש אין תוכנית פעילה בפועל
// (למשל דילג על בחירת תוכנית באונבורדינג). שאר הטאבים באפליקציה נשארים נגישים
// כרגיל - זה לא חוסם את כל האפליקציה, רק מציע כיוון בטאב הזה בלבד.
export const NoRoutineWorkoutView: React.FC<NoRoutineWorkoutViewProps> = ({
  onChooseSystem,
  onOpenRoutinesMenu,
  onStartEmptyWorkout,
  onOpenSettings,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
    {/* כותרת עליונה - תואמת את הכותרת של WorkoutHomeView */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 4px 4px' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>אימון</h1>
      <button
        onClick={onOpenSettings}
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
        title="הגדרות"
      >
        <Settings size={22} />
      </button>
    </div>

    <div style={{ textAlign: 'center', padding: '4px 8px' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>
        עוד אין לך תוכנית אימונים
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        אפשר לבנות תוכנית בעצמך, לתת למערכת להציע אחת, או פשוט להתחיל להתאמן עכשיו בלי תוכנית.
      </div>
    </div>

    <button
      onClick={onChooseSystem}
      style={{
        textAlign: 'start',
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 20,
        padding: 18,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'var(--color-purple-bg)',
            color: 'var(--color-purple)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={20} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>שהמערכת תיצור לי תוכנית</span>
          <span className="pill-badge pill-purple">בקרוב</span>
        </div>
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        בעתיד ניצור לך כאן תוכנית מותאמת אישית. בינתיים נתחיל אותך עם תוכנית פתיחה מומלצת, ותמיד אפשר להחליף.
      </div>
    </button>

    <button
      onClick={onOpenRoutinesMenu}
      style={{
        textAlign: 'start',
        background: 'var(--bg-surface-1)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 20,
        padding: 18,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'var(--color-blue-bg)',
            color: 'var(--color-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Hammer size={20} />
        </div>
        <div style={{ flex: 1, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>אני אבנה לעצמי</div>
        <ChevronLeft size={18} color="var(--text-dim)" />
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        עוברים למסך ניהול תוכניות - בוחרים ימי אימון, תרגילים וסטים בעצמך.
      </div>
    </button>

    <button
      onClick={onStartEmptyWorkout}
      className="btn-secondary"
      style={{ width: '100%', padding: '14px', fontSize: '0.9rem' }}
    >
      <Play size={16} />
      התחל אימון חופשי בלי תוכנית
    </button>
  </div>
);
