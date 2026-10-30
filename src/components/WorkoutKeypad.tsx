import React from 'react';
import { Check, ChevronDown, Delete, Disc, Minus, Plus } from 'lucide-react';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

/**
 * עדכון הטקסט במקלדת. fresh = הלחיצה הראשונה על השדה: מחליפה את הערך במקום להוסיף לו
 * (כמו סימון-הכול בשדה רגיל). מחזיר null כשהלחיצה לא חוקית (נקודה בחזרות, יותר מ-2 ספרות
 * אחרי הנקודה, או ערך מעל המקסימום) - ואז לא משנים כלום.
 */
export function applyKeypadKey(current: string, key: KeypadKey, fresh: boolean, allowDecimal: boolean, max: number): string | null {
  const base = fresh ? '' : current;
  if (key === 'back') return base.slice(0, -1);
  if (key === '.') {
    if (!allowDecimal || base.includes('.')) return null;
    return `${base || '0'}.`;
  }
  const next = base === '0' ? key : base + key;
  if (/\.\d{3,}$/.test(next) || parseFloat(next) > max) return null;
  return next;
}

interface WorkoutKeypadProps {
  /** למשל "סט 2 · משקל (ק״ג)" */
  label: string;
  value: string;
  isWeight: boolean;
  onKey: (key: KeypadKey) => void;
  onStep: (direction: 1 | -1) => void;
  stepLabel: string;
  onNext: () => void;
  nextLabel: string;
  onComplete: () => void;
  onClose: () => void;
  onPlates?: () => void;
}

const keyStyle: React.CSSProperties = {
  height: 50,
  borderRadius: 12,
  border: 'none',
  background: 'var(--bg-surface-2)',
  color: 'var(--text-main)',
  fontSize: '1.35rem',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  cursor: 'pointer',
  touchAction: 'manipulation',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

/** מקלדת מספרים של האפליקציה למסך האימון - מקשים גדולים, ±, "הבא" וסימון סט, בלי המקלדת של המכשיר */
export const WorkoutKeypad: React.FC<WorkoutKeypadProps> = ({
  label,
  value,
  isWeight,
  onKey,
  onStep,
  stepLabel,
  onNext,
  nextLabel,
  onComplete,
  onClose,
  onPlates,
}) => {
  // pointerdown ולא click: מגיב מיד, ולא גונב פוקוס משום דבר
  const press = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });
  const digit = (k: KeypadKey) => (
    <button key={k} type="button" style={keyStyle} {...press(() => onKey(k))}>
      {k}
    </button>
  );

  return (
    <div
      role="group"
      aria-label="מקלדת אימון"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 150,
        background: 'var(--bg-surface-1)',
        borderTop: '1px solid var(--border-subtle)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        padding: '8px 10px calc(10px + env(safe-area-inset-bottom))',
        animation: 'slideUp 180ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', direction: 'ltr', textAlign: 'right' }}>
            {value || '0'}
          </div>
        </div>
        {isWeight && onPlates && (
          <button type="button" className="filter-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} {...press(onPlates)}>
            <Disc size={14} /> פלטות
          </button>
        )}
        <button
          type="button"
          aria-label="סגירת המקלדת"
          style={{ ...keyStyle, width: 40, height: 36, fontSize: '1rem', background: 'transparent' }}
          {...press(onClose)}
        >
          <ChevronDown size={22} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, direction: 'ltr' }}>
        {digit('1')}
        {digit('2')}
        {digit('3')}
        <button type="button" aria-label={`פחות ${stepLabel}`} style={{ ...keyStyle, fontSize: '0.85rem' }} {...press(() => onStep(-1))}>
          <Minus size={16} />
          {stepLabel}
        </button>
        {digit('4')}
        {digit('5')}
        {digit('6')}
        <button type="button" aria-label={`עוד ${stepLabel}`} style={{ ...keyStyle, fontSize: '0.85rem' }} {...press(() => onStep(1))}>
          <Plus size={16} />
          {stepLabel}
        </button>
        {digit('7')}
        {digit('8')}
        {digit('9')}
        <button type="button" aria-label="מחיקה" style={keyStyle} {...press(() => onKey('back'))}>
          <Delete size={20} />
        </button>
        <button type="button" style={{ ...keyStyle, opacity: isWeight ? 1 : 0.35 }} disabled={!isWeight} {...press(() => onKey('.'))}>
          .
        </button>
        {digit('0')}
        <button type="button" style={{ ...keyStyle, fontSize: '0.92rem', background: 'var(--color-blue-bg)', color: 'var(--color-blue)' }} {...press(onNext)}>
          {nextLabel}
        </button>
        <button type="button" aria-label="סימון הסט כהושלם" style={{ ...keyStyle, background: 'var(--color-green)', color: '#fff' }} {...press(onComplete)}>
          <Check size={22} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};
