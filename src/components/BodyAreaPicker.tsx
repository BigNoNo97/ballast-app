import React from 'react';
import Model, { IExerciseData, IMuscleStats, Muscle } from 'react-body-highlighter';
import { InjuryArea, JointArea, MuscleGroup } from '../types';
import { MUSCLE_GROUP_LABELS } from '../data/exercises';
import { JOINT_AREAS, JOINT_LABELS, isJointArea } from '../services/training/injuries';

// בחירת אזורים על הדמיית גוף (קדמי + אחורי): לחיצה על שריר בוחרת/מבטלת אותו.
// mode="focus" - קבוצות שרירים להתמקדות. mode="injury" - מפרקים (כתף, ברך, גב תחתון, צוואר)
// נבחרים מהגוף או מהרשימה, ושרירים בגוף נבחרים כ"שריר פצוע".

const BODY_TO_MUSCLE: Partial<Record<Muscle, MuscleGroup>> = {
  chest: 'chest',
  'upper-back': 'back',
  'lower-back': 'lower_back',
  trapezius: 'traps',
  'front-deltoids': 'shoulders',
  'back-deltoids': 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  abs: 'core',
  obliques: 'core',
  quadriceps: 'quads',
  hamstring: 'hamstrings',
  gluteal: 'glutes',
  abductors: 'glutes',
  calves: 'calves',
  'left-soleus': 'calves',
  'right-soleus': 'calves',
};

// באזורי פציעה: חלקי גוף שהם בעצם מפרק
const BODY_TO_JOINT: Partial<Record<Muscle, JointArea>> = {
  'front-deltoids': 'shoulder',
  'back-deltoids': 'shoulder',
  knees: 'knee',
  neck: 'neck',
  'lower-back': 'lower_back',
  forearm: 'wrist',
};

const MUSCLE_TO_BODY: Record<MuscleGroup, Muscle[]> = {
  chest: ['chest'],
  back: ['upper-back'],
  lower_back: ['lower-back'],
  traps: ['trapezius'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  core: ['abs', 'obliques'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal', 'abductors'],
  calves: ['calves', 'left-soleus', 'right-soleus'],
};

const JOINT_TO_BODY: Partial<Record<JointArea, Muscle[]>> = {
  shoulder: ['front-deltoids', 'back-deltoids'],
  knee: ['knees'],
  neck: ['neck'],
  lower_back: ['lower-back'],
  wrist: ['forearm'],
  elbow: ['forearm'],
};

export const FOCUS_OPTIONS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'core', 'glutes', 'quads', 'hamstrings', 'calves', 'traps'];

interface BodyAreaPickerProps<T extends InjuryArea> {
  mode: 'focus' | 'injury';
  selected: T[];
  onChange: (next: T[]) => void;
  max?: number;
}

export function BodyAreaPicker<T extends InjuryArea>({ mode, selected, onChange, max }: BodyAreaPickerProps<T>) {
  const toggle = (area: T) => {
    if (selected.includes(area)) onChange(selected.filter((a) => a !== area));
    else if (!max || selected.length < max) onChange([...selected, area]);
  };

  const onBodyClick = (stats: IMuscleStats) => {
    const m = stats.muscle;
    if (mode === 'injury') {
      const joint = BODY_TO_JOINT[m];
      if (joint) return toggle(joint as T);
    }
    const muscle = BODY_TO_MUSCLE[m];
    if (muscle) toggle(muscle as T);
  };

  const highlighted: Muscle[] = selected.flatMap((a) =>
    isJointArea(a) ? JOINT_TO_BODY[a] || [] : MUSCLE_TO_BODY[a as MuscleGroup] || []
  );
  const data: IExerciseData[] = highlighted.length ? [{ name: 'נבחר', muscles: highlighted, frequency: 1 }] : [];
  const color = mode === 'injury' ? 'var(--color-red)' : 'var(--color-blue)';

  const chip = (area: T, label: string) => {
    const on = selected.includes(area);
    return (
      <button
        key={area}
        onClick={() => toggle(area)}
        className={`filter-chip ${on ? 'active' : ''}`}
        style={on && mode === 'injury' ? { background: 'var(--color-red-bg)', color: 'var(--color-red)', borderColor: 'var(--color-red)' } : undefined}
      >
        {label}
      </button>
    );
  };

  const muscleChips = selected.filter((a) => !isJointArea(a)) as MuscleGroup[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
        {(['anterior', 'posterior'] as const).map((type) => (
          <div key={type} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Model
              type={type}
              data={data}
              bodyColor="var(--bg-surface-3)"
              highlightedColors={[color]}
              onClick={onBodyClick}
              style={{ width: 128, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600 }}>{type === 'anterior' ? 'מלפנים' : 'מאחור'}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        {mode === 'focus' ? `לחץ על שריר בגוף או ברשימה${max ? ` (עד ${max})` : ''}` : 'לחץ על האזור בגוף, או בחר מפרק מהרשימה'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {mode === 'focus'
          ? FOCUS_OPTIONS.map((m) => chip(m as T, MUSCLE_GROUP_LABELS[m]?.he ?? m))
          : JOINT_AREAS.map((j) => chip(j as T, JOINT_LABELS[j]))}
      </div>
      {mode === 'injury' && muscleChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {muscleChips.map((m) => chip(m as T, `שריר ${MUSCLE_GROUP_LABELS[m]?.he ?? m}`))}
        </div>
      )}
    </div>
  );
}
