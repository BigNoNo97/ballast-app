import React, { useMemo, useState } from 'react';
import Model, { IExerciseData, Muscle } from 'react-body-highlighter';
import { Activity, Plus } from 'lucide-react';
import { MuscleGroup } from '../types';
import { MUSCLE_GROUP_LABELS } from '../data/exercises';
import { LoadLevel, LoadSuggestion, MuscleLoadRow } from '../services/muscleLoad';

// אותו מיפוי כמו ב-MuscleBodyMap: קבוצת שריר שלנו -> השרירים שהספרייה מציירת
export const BODY_MAP_MUSCLES: Record<MuscleGroup, Muscle[]> = {
  chest: ['chest'],
  back: ['upper-back'],
  traps: ['trapezius'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  core: ['abs', 'obliques'],
  lower_back: ['lower-back'],
};
const GROUP_OF_BODY_MUSCLE = new Map<Muscle, MuscleGroup>(
  (Object.entries(BODY_MAP_MUSCLES) as [MuscleGroup, Muscle[]][]).flatMap(([g, ms]) => ms.map((m) => [m, g] as [Muscle, MuscleGroup]))
);

export const LEVEL_STYLE: Record<Exclude<LoadLevel, 'none'>, { color: string; label: string }> = {
  extra: { color: 'var(--muscle-secondary)', label: 'נפח עקיף' },
  low: { color: 'rgba(255, 159, 10, 0.55)', label: 'רחוק מהיעד' },
  building: { color: 'var(--color-blue)', label: 'בדרך ליעד' },
  target: { color: 'var(--color-green)', label: 'ביעד' },
  over: { color: 'var(--color-orange)', label: 'מעל היעד' },
};
// הספרייה צובעת לפי frequency: highlightedColors[frequency - 1]
const MAP_LEVELS = Object.keys(LEVEL_STYLE) as Exclude<LoadLevel, 'none'>[];

export const formatSets = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const muscleHe = (m: MuscleGroup) => MUSCLE_GROUP_LABELS[m]?.he ?? m;

export const MuscleLoadMap: React.FC<{
  rows: MuscleLoadRow[];
  size?: number;
  selected?: MuscleGroup | null;
  onSelect?: (m: MuscleGroup) => void;
}> = ({ rows, size = 120, selected, onSelect }) => {
  const data: IExerciseData[] = rows
    .filter((r) => r.level !== 'none')
    .map((r) => ({
      name: r.muscle,
      muscles: BODY_MAP_MUSCLES[r.muscle],
      frequency: MAP_LEVELS.indexOf(r.level as Exclude<LoadLevel, 'none'>) + 1,
    }));
  const colors = MAP_LEVELS.map((l) => LEVEL_STYLE[l].color);
  const click = (e: { muscle: Muscle }) => {
    const g = GROUP_OF_BODY_MUSCLE.get(e.muscle);
    if (g && onSelect) onSelect(g);
  };
  const view = (type: 'anterior' | 'posterior', label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Model type={type} data={data} bodyColor="var(--bg-surface-3)" highlightedColors={colors} onClick={click} style={{ width: size }} />
      <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }} aria-label={selected ? muscleHe(selected) : undefined}>
      {view('anterior', 'קדמי')}
      {view('posterior', 'אחורי')}
    </div>
  );
};

export const LoadLegend: React.FC<{ levels?: Exclude<LoadLevel, 'none'>[] }> = ({ levels = ['low', 'building', 'target', 'over'] }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', justifyContent: 'center' }}>
    {levels.map((l) => (
      <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: LEVEL_STYLE[l].color }} />
        {LEVEL_STYLE[l].label}
      </span>
    ))}
  </div>
);

export const LoadBar: React.FC<{ row: MuscleLoadRow; highlighted?: boolean; onClick?: () => void }> = ({ row, highlighted, onClick }) => {
  const pct = row.target ? Math.min(100, (row.sets / row.target) * 100) : row.sets > 0 ? 100 : 0;
  const color = row.level === 'none' ? 'transparent' : LEVEL_STYLE[row.level].color;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 6px',
        margin: '0 -6px',
        borderRadius: 8,
        background: highlighted ? 'var(--color-blue-bg)' : undefined,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', width: 96, flexShrink: 0, fontWeight: highlighted ? 800 : 500 }}>
        {muscleHe(row.muscle)}
      </span>
      <div style={{ flex: 1, background: 'var(--bg-surface-2)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 300ms ease-out' }} />
      </div>
      <span style={{ fontSize: '0.76rem', fontWeight: 800, width: 52, textAlign: 'left', fontVariantNumeric: 'tabular-nums', direction: 'ltr' }}>
        {row.target ? `${formatSets(row.sets)}/${row.target}` : formatSets(row.sets)}
      </span>
    </div>
  );
};

interface MuscleLoadCardProps {
  rows: MuscleLoadRow[];
  title?: string;
  subtitle?: string;
  headerExtra?: React.ReactNode;
  suggestions?: LoadSuggestion[];
  onSuggestionPress?: (s: LoadSuggestion) => void;
  emptyText?: string;
}

/** כרטיס עומס השרירים: מפת גוף צבועה לפי העמידה ביעד, פסים לכל שריר, והצעות להשלמה */
export const MuscleLoadCard: React.FC<MuscleLoadCardProps> = ({
  rows,
  title = 'עומס שרירים השבוע',
  subtitle = 'סטים שהשלמת לכל שריר מול היעד השבועי שלך. שריר משני בתרגיל נספר כחצי סט.',
  headerExtra,
  suggestions = [],
  onSuggestionPress,
  emptyText = 'עוד לא השלמת סטים השבוע. אחרי האימון הראשון תראה כאן אילו שרירים עבדו.',
}) => {
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const anySets = rows.some((r) => r.sets > 0);
  const visible = useMemo(() => rows.filter((r) => r.target || r.sets > 0), [rows]);
  const hasExtra = rows.some((r) => r.level === 'extra');

  return (
    <div className="ios-card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Activity size={18} color="var(--color-green)" />
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>{title}</h3>
        {headerExtra}
      </div>
      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 12 }}>{subtitle}</p>

      <MuscleLoadMap rows={rows} selected={selected} onSelect={(m) => setSelected((cur) => (cur === m ? null : m))} />
      <div style={{ margin: '10px 0 14px' }}>
        <LoadLegend levels={hasExtra ? ['low', 'building', 'target', 'over', 'extra'] : undefined} />
      </div>

      {!anySets && (
        <div style={{ textAlign: 'center', padding: '4px 10px 12px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{emptyText}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map((r) => (
          <LoadBar key={r.muscle} row={r} highlighted={selected === r.muscle} onClick={() => setSelected((cur) => (cur === r.muscle ? null : r.muscle))} />
        ))}
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: 8 }}>להשלמת היעד השבוע</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestions.map((s) => (
              <button
                key={s.muscle}
                type="button"
                onClick={onSuggestionPress && s.exercise ? () => onSuggestionPress(s) : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'right',
                  background: 'var(--bg-surface-2)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  color: 'var(--text-main)',
                  cursor: onSuggestionPress && s.exercise ? 'pointer' : 'default',
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'var(--color-blue-bg)',
                    color: 'var(--color-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700 }}>
                    עוד {s.missingSets} סטים ל{muscleHe(s.muscle)}
                  </span>
                  {s.exercise && (
                    <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)' }}>למשל {s.exercise.nameHe}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
