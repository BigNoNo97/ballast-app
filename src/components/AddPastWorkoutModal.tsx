import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Exercise, WorkoutExercise, WorkoutSet, WorkoutSession } from '../types';
import { ExerciseLibraryView } from './ExerciseLibraryView';

interface AddPastWorkoutModalProps {
  allExercises: Exercise[];
  onAddCustomExercise: (newEx: Exercise) => void;
  onClose: () => void;
  onSave: (session: WorkoutSession) => void;
  initialDate?: string;
}

function todayDateInputValue(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function makeEmptySet(setNumber: number): WorkoutSet {
  return { id: `set-${Date.now()}-${setNumber}-${Math.random().toString(36).slice(2, 6)}`, setNumber, type: 'normal', weightKg: 0, reps: 0, completed: true };
}

export const AddPastWorkoutModal: React.FC<AddPastWorkoutModalProps> = ({
  allExercises,
  onAddCustomExercise,
  onClose,
  onSave,
  initialDate,
}) => {
  const [date, setDate] = useState(initialDate || todayDateInputValue());
  const [title, setTitle] = useState('אימון בדיעבד');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const exerciseMap = new Map(allExercises.map((e) => [e.id, e]));

  const addExercise = (ex: Exercise) => {
    setExercises((prev) => [
      ...prev,
      { exerciseId: ex.id, sets: [makeEmptySet(1), makeEmptySet(2), makeEmptySet(3)] },
    ]);
    setShowPicker(false);
  };

  const removeExercise = (idx: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSet = (exIdx: number, setIdx: number, field: 'weightKg' | 'reps', value: string) => {
    setExercises((prev) => {
      const copy = prev.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }));
      copy[exIdx].sets[setIdx][field] = value === '' ? 0 : parseFloat(value);
      return copy;
    });
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) => {
      const copy = prev.map((e) => ({ ...e, sets: [...e.sets] }));
      copy[exIdx].sets.push(makeEmptySet(copy[exIdx].sets.length + 1));
      return copy;
    });
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) => {
      const copy = prev.map((e) => ({ ...e, sets: [...e.sets] }));
      copy[exIdx].sets.splice(setIdx, 1);
      return copy;
    });
  };

  const handleSave = () => {
    if (exercises.length === 0) return;

    const cleanedExercises = exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.weightKg > 0 || s.reps > 0) }))
      .filter((e) => e.sets.length > 0);

    if (cleanedExercises.length === 0) return;

    let totalVolume = 0;
    let completedSets = 0;
    cleanedExercises.forEach((e) => {
      e.sets.forEach((s) => {
        totalVolume += s.weightKg * s.reps;
        completedSets += 1;
      });
    });

    const timestamp = new Date(`${date}T12:00:00`).getTime();

    const session: WorkoutSession = {
      id: `workout-${Date.now()}`,
      title: title.trim() || 'אימון בדיעבד',
      startTime: timestamp,
      endTime: timestamp,
      durationSec: 0,
      exercises: cleanedExercises,
      isCompleted: true,
      totalVolumeKg: totalVolume,
      completedSetsCount: completedSets,
    };

    onSave(session);
    onClose();
  };

  if (showPicker) {
    return (
      <div className="modal-overlay" onClick={() => setShowPicker(false)}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 88)', overflowY: 'auto' }}>
          <div className="sheet-handle" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>הוספת תרגיל</h3>
            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setShowPicker(false)}>
              סגור
            </button>
          </div>
          <ExerciseLibraryView
            allExercises={allExercises}
            onAddCustomExercise={onAddCustomExercise}
            onSelectExerciseForWorkout={addExercise}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 90)', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>הוספת אימון בדיעבד</h3>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>תאריך</label>
              <input
                type="date"
                value={date}
                max={todayDateInputValue()}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-main)', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>שם האימון</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-main)', fontSize: '0.9rem' }}
              />
            </div>
          </div>

          {exercises.map((ex, exIdx) => {
            const exData = exerciseMap.get(ex.exerciseId);
            return (
              <div key={exIdx} className="ios-card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{exData?.nameHe || 'תרגיל'}</span>
                  <button onClick={() => removeExercise(exIdx)} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </div>

                {ex.sets.map((s, setIdx) => (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 24px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <div className="set-number-badge">{setIdx + 1}</div>
                    <input
                      type="number"
                      step="0.5"
                      inputMode="decimal"
                      className="gym-input-box"
                      placeholder="ק״ג"
                      value={s.weightKg === 0 ? '' : s.weightKg}
                      onChange={(e) => updateSet(exIdx, setIdx, 'weightKg', e.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      className="gym-input-box"
                      placeholder="חזרות"
                      value={s.reps === 0 ? '' : s.reps}
                      onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                    />
                    <button onClick={() => removeSet(exIdx, setIdx)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}

                <button
                  className="btn-secondary"
                  style={{ width: '100%', marginTop: 6, fontSize: '0.8rem', padding: '6px 0' }}
                  onClick={() => addSet(exIdx)}
                >
                  <Plus size={14} /> הוסף סט
                </button>
              </div>
            );
          })}

          <button className="btn-secondary" style={{ width: '100%', marginBottom: 14 }} onClick={() => setShowPicker(true)}>
            <Plus size={16} /> הוסף תרגיל
          </button>
        </div>

        <button className="btn-primary" style={{ width: '100%', flexShrink: 0 }} onClick={handleSave} disabled={exercises.length === 0}>
          שמירת האימון
        </button>
      </div>
    </div>
  );
};
