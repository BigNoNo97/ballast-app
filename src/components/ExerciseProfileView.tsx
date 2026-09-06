import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Dumbbell, Trophy, Info } from 'lucide-react';
import { Exercise, WorkoutSession } from '../types';
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from '../data/exercises';
import { EXERCISE_IMAGES, EXERCISE_INSTRUCTIONS_HE } from '../data/exerciseContent';
import { StorageService, calculateEstimated1RM } from '../services/storage';
import { TrendChart, TrendPoint } from './TrendChart';
import { MuscleBodyMap } from './MuscleBodyMap';

interface ExerciseProfileViewProps {
  exercise: Exercise;
  history: WorkoutSession[];
  onClose: () => void;
}

export const ExerciseProfileView: React.FC<ExerciseProfileViewProps> = ({ exercise, history, onClose }) => {
  const images = EXERCISE_IMAGES[exercise.id];
  const instructions = EXERCISE_INSTRUCTIONS_HE[exercise.id];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!images) return;
    const interval = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1400);
    return () => clearInterval(interval);
  }, [images]);

  const personalRecord = useMemo(() => StorageService.getPersonalRecords()[exercise.id], [exercise.id]);

  const progressPoints: TrendPoint[] = useMemo(() => {
    const points: TrendPoint[] = [];
    const sorted = [...history].sort((a, b) => a.startTime - b.startTime);
    sorted.forEach((w) => {
      const found = w.exercises.find((e) => e.exerciseId === exercise.id);
      if (!found) return;
      let maxW = 0;
      let maxR = 0;
      let best1rm = 0;
      found.sets.forEach((s) => {
        if (!s.completed && s.weightKg <= 0) return;
        const e1rm = calculateEstimated1RM(s.weightKg, s.reps);
        if (e1rm > best1rm) {
          best1rm = e1rm;
          maxW = s.weightKg;
          maxR = s.reps;
        }
      });
      if (best1rm > 0) {
        points.push({ id: w.id, date: w.startTime, value: best1rm });
      }
    });
    return points;
  }, [history, exercise.id]);

  const recentSessions = useMemo(() => {
    const rows: { date: number; weight: number; reps: number }[] = [];
    const sorted = [...history].sort((a, b) => b.startTime - a.startTime);
    for (const w of sorted) {
      const found = w.exercises.find((e) => e.exerciseId === exercise.id);
      if (!found) continue;
      let maxW = 0;
      let maxR = 0;
      found.sets.forEach((s) => {
        if (s.weightKg > maxW) {
          maxW = s.weightKg;
          maxR = s.reps;
        }
      });
      if (maxW > 0) rows.push({ date: w.startTime, weight: maxW, reps: maxR });
      if (rows.length >= 5) break;
    }
    return rows;
  }, [history, exercise.id]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-app)',
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {exercise.nameHe}
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{exercise.nameEn}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px calc(var(--safe-bottom) + 24px)' }}>
        {/* Image */}
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            borderRadius: 18,
            overflow: 'hidden',
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 14,
            position: 'relative',
          }}
        >
          {images ? (
            images.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={exercise.nameEn}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: frame === i ? 1 : 0,
                  transition: 'opacity 500ms ease',
                }}
              />
            ))
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Dumbbell size={48} color="var(--text-muted)" />
            </div>
          )}
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <span className="filter-chip" style={{ pointerEvents: 'none' }}>
            {MUSCLE_GROUP_LABELS[exercise.muscle].icon} {MUSCLE_GROUP_LABELS[exercise.muscle].he}
          </span>
          <span className="filter-chip" style={{ pointerEvents: 'none' }}>
            {EQUIPMENT_LABELS[exercise.equipment].he}
          </span>
        </div>

        {/* Muscle Body Map - מוצג בנוסף לתמונת התרגיל למעלה (או במקום הפלייסהולדר אם אין תמונה) */}
        <div className="ios-card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 12 }}>שרירים מעורבים</h3>
          <MuscleBodyMap primaryMuscle={exercise.muscle} secondaryMuscles={exercise.secondaryMuscles} />
        </div>

        {/* Instructions */}
        {instructions && instructions.length > 0 && (
          <div className="ios-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Info size={18} color="var(--color-blue)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>איך מבצעים נכון</h3>
            </div>
            <ol style={{ margin: 0, paddingRight: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {instructions.map((step, i) => (
                <li key={i} style={{ fontSize: '0.87rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {exercise.tipsHe && (
          <div className="ios-card" style={{ marginBottom: 14, background: 'var(--bg-surface-2)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>טיפ</div>
            <div style={{ fontSize: '0.87rem', fontWeight: 600 }}>{exercise.tipsHe}</div>
          </div>
        )}

        {/* Personal Record */}
        {personalRecord && (
          <div className="ios-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Trophy size={18} color="var(--color-orange)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>שיא אישי</h3>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{personalRecord.maxWeight} ק"ג</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>× {personalRecord.repsAtMaxWeight} חזרות</div>
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-orange)' }}>{personalRecord.estimated1RM}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>1RM משוער</div>
              </div>
            </div>
          </div>
        )}

        {/* Progress chart */}
        {progressPoints.length > 1 && (
          <div className="ios-card" style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 10 }}>מגמת התקדמות (1RM משוער)</h3>
            <TrendChart points={progressPoints} color="var(--color-blue)" />
          </div>
        )}

        {/* Recent history */}
        {recentSessions.length > 0 && (
          <div className="ios-card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: 10 }}>ביצועים אחרונים</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentSessions.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    padding: '8px 0',
                    borderBottom: i < recentSessions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(row.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })}
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {row.weight} ק"ג × {row.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!personalRecord && recentSessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            עדיין אין היסטוריה לתרגיל הזה - בצע אותו באימון כדי לראות כאן נתונים.
          </div>
        )}
      </div>
    </div>
  );
};
