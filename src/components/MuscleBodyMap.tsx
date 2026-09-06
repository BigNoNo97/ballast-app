import React from 'react';
import Model, { IExerciseData, Muscle } from 'react-body-highlighter';
import { MuscleGroup } from '../types';

interface MuscleBodyMapProps {
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  size?: number;
}

// ממפה את קבוצות השרירים של האפליקציה שלנו לשמות השרירים שהספרייה מכירה
// (react-body-highlighter, MIT license - https://github.com/giavinh79/react-body-highlighter)
const MUSCLE_MAP: Record<MuscleGroup, Muscle[]> = {
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

const HIGHLIGHT_COLORS = ['var(--muscle-secondary)', 'var(--color-blue)'];

export const MuscleBodyMap: React.FC<MuscleBodyMapProps> = ({ primaryMuscle, secondaryMuscles = [], size = 140 }) => {
  const data: IExerciseData[] = [
    { name: 'עיקרי', muscles: MUSCLE_MAP[primaryMuscle], frequency: 2 },
  ];
  const secondaryMapped = secondaryMuscles.flatMap((m) => MUSCLE_MAP[m]);
  if (secondaryMapped.length > 0) {
    data.push({ name: 'משני', muscles: secondaryMapped, frequency: 1 });
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Model
          type="anterior"
          data={data}
          bodyColor="var(--bg-surface-3)"
          highlightedColors={HIGHLIGHT_COLORS}
          style={{ width: size }}
        />
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600 }}>קדמי</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Model
          type="posterior"
          data={data}
          bodyColor="var(--bg-surface-3)"
          highlightedColors={HIGHLIGHT_COLORS}
          style={{ width: size }}
        />
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600 }}>אחורי</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--color-blue)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>שריר עיקרי</span>
        </div>
        {secondaryMapped.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--muscle-secondary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 600 }}>שריר משני</span>
          </div>
        )}
      </div>
    </div>
  );
};
