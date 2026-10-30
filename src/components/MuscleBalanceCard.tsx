import React, { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { Exercise, MuscleGroup, WorkoutSession } from '../types';
import { MUSCLE_ORDER, muscleBalance, weeklySetsHistory } from '../services/muscleLoad';
import { formatSets, muscleHe } from './MuscleLoadCard';
import { TrendChart } from './TrendChart';

const RADAR_MAX = 150; // אחוז מהיעד שבקצה הרדאר; מעבר לזה נחתך
const BALANCE_WEEKS = 4;
const TREND_WEEKS = 8;

// שמות קצרים לרדאר - השמות המלאים ("גב / רחב גבי") ארוכים מדי לתווית סביב עיגול
const SHORT_LABEL: Partial<Record<MuscleGroup, string>> = {
  back: 'גב',
  traps: 'טרפזים',
  core: 'בטן',
};

const Radar: React.FC<{ data: { muscle: MuscleGroup; percent: number }[] }> = ({ data }) => {
  const size = 320;
  const c = size / 2;
  const r = 98;
  const n = data.length;
  const point = (i: number, pct: number) => {
    // מתחילים מלמעלה ומתקדמים עם כיוון השעון
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const d = (Math.min(pct, RADAR_MAX) / RADAR_MAX) * r;
    return [c + d * Math.cos(a), c + d * Math.sin(a)] as const;
  };
  const ring = (pct: number) => data.map((_, i) => point(i, pct).join(',')).join(' ');
  const shape = data.map((d, i) => point(i, d.percent).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} direction="ltr" style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto', direction: 'ltr' }} role="img" aria-label="איזון שרירים">
      {[50, 100, 150].map((pct) => (
        <polygon
          key={pct}
          points={ring(pct)}
          fill="none"
          stroke={pct === 100 ? 'var(--color-green)' : 'var(--border-subtle)'}
          strokeWidth={pct === 100 ? 1.5 : 1}
          strokeDasharray={pct === 100 ? '4 3' : undefined}
        />
      ))}
      {data.map((_, i) => {
        const [x, y] = point(i, RADAR_MAX);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--border-subtle)" strokeWidth={1} />;
      })}
      <polygon points={shape} fill="rgba(110, 124, 245, 0.28)" stroke="var(--color-blue)" strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => {
        const [x, y] = point(i, d.percent);
        const off = d.percent < 70 ? 'var(--color-orange)' : d.percent > 140 ? 'var(--color-orange)' : 'var(--color-blue)';
        return <circle key={d.muscle} cx={x} cy={y} r={3.5} fill={off} />;
      })}
      {data.map((d, i) => {
        // שם ואחוז בשתי שורות, כל אחת בכיוון אחד - שורה מעורבת עברית+מספר נשברת בתוך SVG.
        // ה-SVG ב-direction ltr כדי ש-start/end יתנהגו כשמאל/ימין גם באפליקציה שכולה RTL
        const [x, y] = point(i, RADAR_MAX + 26);
        const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end';
        return (
          <g key={d.muscle}>
            <text x={x} y={y - 6} textAnchor={anchor} dominantBaseline="middle" fontSize={11} fontWeight={700} fill="var(--text-main)">
              {SHORT_LABEL[d.muscle] ?? muscleHe(d.muscle)}
            </text>
            <text x={x} y={y + 8} textAnchor={anchor} dominantBaseline="middle" fontSize={10} fontWeight={600} fill="var(--text-muted)">
              {`${d.percent}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

interface MuscleBalanceCardProps {
  history: WorkoutSession[];
  library: Exercise[];
  targets: Partial<Record<MuscleGroup, number>>;
}

/** איזון שרירים (רדאר של עמידה ביעד ב-4 השבועות האחרונים) ומגמת סטים שבועית לכל שריר */
export const MuscleBalanceCard: React.FC<MuscleBalanceCardProps> = ({ history, library, targets }) => {
  const balance = useMemo(() => muscleBalance(history, library, targets, BALANCE_WEEKS), [history, library, targets]);
  const weekly = useMemo(() => weeklySetsHistory(history, library, TREND_WEEKS), [history, library]);
  const [muscle, setMuscle] = useState<MuscleGroup>('chest');

  // כשכמעט הכול מתחת ליעד זה לא חוסר איזון אלא נפח כללי נמוך - אז לא מונים שריר-שריר
  const behind = balance?.filter((b) => b.percent < 70).sort((a, b) => a.percent - b.percent) ?? [];
  const generallyLow = !!balance && behind.length > balance.length / 2;
  const points = weekly.map((w) => ({ id: String(w.weekStart), date: w.weekStart, value: w.sets[muscle] }));
  const avg = weekly.slice(0, -1).reduce((s, w) => s + w.sets[muscle], 0) / Math.max(1, weekly.length - 1);

  return (
    <div className="ios-card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Scale size={18} color="var(--color-blue)" />
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>איזון שרירים</h3>
      </div>
      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        כמה מהיעד השבועי קיבל כל שריר בממוצע ב-{BALANCE_WEEKS} השבועות האחרונים. הקו המקווקו הירוק הוא 100%.
      </p>

      {balance && balance.length >= 3 ? (
        <>
          <Radar data={balance} />
          {behind.length > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', background: 'var(--color-orange-bg)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginTop: 8 }}>
              {generallyLow
                ? 'רוב השרירים קיבלו פחות מ-70% מהיעד. כדאי קודם להגיע לכל האימונים בתוכנית, ואז לבדוק כאן שוב.'
                : `מקבלים פחות מדי: ${behind
                    .slice(0, 4)
                    .map((b) => `${muscleHe(b.muscle)} (${b.percent}%)`)
                    .join(', ')}`}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          אחרי שבוע אימונים שלם תראה כאן אם יש שרירים שמקבלים פחות או יותר מדי.
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 800, marginBottom: 8 }}>סטים בשבוע לפי שריר</div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {MUSCLE_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMuscle(m)}
              style={{
                flexShrink: 0,
                border: 'none',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: '0.76rem',
                fontWeight: 700,
                background: m === muscle ? 'var(--color-blue)' : 'var(--bg-surface-2)',
                color: m === muscle ? '#fff' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              {SHORT_LABEL[m] ?? muscleHe(m)}
            </button>
          ))}
        </div>
        <TrendChart points={points} targetValue={targets[muscle] ?? null} color="var(--color-blue)" />
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
          ממוצע {formatSets(Math.round(avg * 10) / 10)} סטים בשבוע ב-{TREND_WEEKS - 1} השבועות הקודמים
          {targets[muscle] ? `, היעד השבועי ${targets[muscle]}` : ''}
        </div>
      </div>
    </div>
  );
};
