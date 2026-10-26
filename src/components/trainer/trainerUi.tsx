import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExperienceLevel, OnboardingGoal } from '../../types';

// אבני בניין משותפות למסכי המאמנים - מסך מלא עם כותרת וחזרה, כרטיסים ושורות לחיצות.

export const Screen: React.FC<{
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
  /** לשיחות: התוכן מנהל את הגלילה בעצמו */
  noScroll?: boolean;
}> = ({ title, subtitle, onBack, backLabel = 'חזרה', children, footer, scrollRef, noScroll }) => (
  <div
    dir="rtl"
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 210,
      background: 'var(--bg-app)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 'var(--safe-top)',
    }}
  >
    <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
      <button aria-label={backLabel} onClick={onBack} style={roundButton}>
        <ChevronRight size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '1.02rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{subtitle}</div>}
      </div>
    </header>
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: noScroll ? 'hidden' : 'auto',
        padding: noScroll ? '12px 14px calc(10px + var(--safe-bottom))' : '16px 16px calc(24px + var(--safe-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {children}
    </div>
    {footer}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div className="ios-card" style={{ padding: 14, ...style }}>
    {children}
  </div>
);

export const RowButton: React.FC<{
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: number;
  onClick: () => void;
}> = ({ icon, title, subtitle, badge, onClick }) => (
  <button
    className="ios-card"
    onClick={onClick}
    style={{
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      textAlign: 'right',
      border: 'none',
      background: 'var(--bg-surface-1)',
      color: 'var(--text-main)',
      font: 'inherit',
      cursor: 'pointer',
    }}
  >
    {icon}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>}
    </div>
    {!!badge && <Badge count={badge} />}
    <ChevronLeft size={18} color="var(--text-muted)" />
  </button>
);

export const Badge: React.FC<{ count: number }> = ({ count }) => (
  <span
    style={{
      minWidth: 20,
      height: 20,
      padding: '0 6px',
      borderRadius: 10,
      background: 'var(--color-red)',
      color: '#fff',
      fontSize: '0.7rem',
      fontWeight: 800,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {count > 99 ? '99+' : count}
  </span>
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '6px 2px 0' }}>{children}</h3>
);

export const Muted: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0, ...style }}>{children}</p>
);

export const ErrorNote: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <div style={{ background: 'var(--color-orange-bg)', borderRadius: 10, padding: '9px 12px', fontSize: '0.82rem', lineHeight: 1.5 }}>{text}</div>
  ) : null;

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ on, onChange, disabled }) => (
  <button
    className="btn-secondary"
    disabled={disabled}
    onClick={() => onChange(!on)}
    style={{
      padding: '6px 14px',
      borderRadius: 'var(--radius-full)',
      background: on ? 'rgba(110, 124, 245, 0.15)' : 'var(--bg-surface-2)',
      color: on ? 'var(--color-blue)' : 'var(--text-muted)',
      border: '1px solid var(--border-subtle)',
      fontWeight: 700,
      flexShrink: 0,
    }}
  >
    {on ? 'משותף ✓' : 'לא משותף'}
  </button>
);

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-surface-2)',
  color: 'var(--text-main)',
  fontSize: '16px',
  fontFamily: 'inherit',
};

export const roundButton: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'none',
  borderRadius: '50%',
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  flexShrink: 0,
};

export const GOAL_LABELS: Record<OnboardingGoal, string> = {
  lose_weight: 'ירידה במשקל',
  gain_muscle: 'בניית שריר',
  strength: 'כוח',
  maintain: 'שמירה',
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'מתחיל',
  intermediate: 'בינוני',
  advanced: 'מתקדם',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "היום" / "אתמול" / "לפני 3 ימים" / תאריך */
export function daysAgoLabel(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const startOfToday = new Date(new Date().toDateString()).getTime();
  if (t >= startOfToday) return 'היום';
  if (t >= startOfToday - DAY_MS) return 'אתמול';
  const days = Math.ceil((startOfToday - t) / DAY_MS);
  if (days < 14) return `לפני ${days} ימים`;
  return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** תצוגת תוכנית: ימים ותרגילים (סטים × חזרות). nameOf ממיר מזהה תרגיל לשם בעברית. */
export const RoutinePreview: React.FC<{
  routine: { title: string; days: { dayNumber: number; dayTitle: string; exercises: { exerciseId: string; targetSets: number; targetReps: number; repRangeMax?: number }[] }[] };
  nameOf: (id: string) => string;
}> = ({ routine, nameOf }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {routine.days.length === 0 && <Muted>אין ימים בתוכנית.</Muted>}
    {routine.days.map((d) => (
      <div key={d.dayNumber} style={{ background: 'var(--bg-surface-2)', borderRadius: 12, padding: '10px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: '0.86rem', marginBottom: 6 }}>{d.dayTitle}</div>
        {d.exercises.length === 0 ? (
          <Muted>יום מנוחה / ללא תרגילים</Muted>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {d.exercises.map((x, i) => (
              <li key={`${x.exerciseId}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.82rem' }}>
                <span>{nameOf(x.exerciseId)}</span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, direction: 'ltr' }}>
                  {x.targetSets} × {x.targetReps}
                  {x.repRangeMax && x.repRangeMax > x.targetReps ? `-${x.repRangeMax}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    ))}
  </div>
);
