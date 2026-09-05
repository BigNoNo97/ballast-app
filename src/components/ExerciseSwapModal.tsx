import React, { useState, useMemo } from 'react';
import { X, Search, Shuffle, Dumbbell, Sparkles } from 'lucide-react';
import { Exercise, EquipmentType } from '../types';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '../data/exercises';
import { StorageService } from '../services/storage';
import { ExerciseThumbnail } from './ExerciseThumbnail';

interface ExerciseSwapModalProps {
  currentExercise: Exercise;
  allExercises: Exercise[];
  isOpen: boolean;
  onClose: () => void;
  onSelectSwap: (newExercise: Exercise) => void;
}

export const ExerciseSwapModal: React.FC<ExerciseSwapModalProps> = ({
  currentExercise,
  allExercises,
  isOpen,
  onClose,
  onSelectSwap,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType | 'all'>('all');

  // Find direct alternatives & same-muscle exercises
  const candidateExercises = useMemo(() => {
    const directAltIds = new Set(currentExercise.alternatives || []);

    return allExercises
      .filter((ex) => ex.id !== currentExercise.id)
      .map((ex) => {
        const isDirectAlt = directAltIds.has(ex.id);
        const isSameMuscle = ex.muscle === currentExercise.muscle;

        let priority = 0;
        if (isDirectAlt) priority = 3;
        else if (isSameMuscle) priority = 2;
        else if (ex.secondaryMuscles?.includes(currentExercise.muscle)) priority = 1;

        return {
          exercise: ex,
          isDirectAlt,
          isSameMuscle,
          priority,
        };
      })
      .filter((item) => {
        // Equipment filter
        if (selectedEquipment !== 'all' && item.exercise.equipment !== selectedEquipment) {
          return false;
        }
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesNameHe = item.exercise.nameHe.toLowerCase().includes(q);
          const matchesNameEn = item.exercise.nameEn.toLowerCase().includes(q);
          const matchesMuscle = MUSCLE_GROUP_LABELS[item.exercise.muscle]?.he.toLowerCase().includes(q);
          return matchesNameHe || matchesNameEn || matchesMuscle;
        }
        // By default show direct alts and same muscle group
        return item.priority > 0;
      })
      .sort((a, b) => b.priority - a.priority);
  }, [currentExercise, allExercises, selectedEquipment, searchQuery]);

  if (!isOpen) return null;

  const currentMuscleLabel = MUSCLE_GROUP_LABELS[currentExercise.muscle]?.he || '';

  const equipmentOptions: { key: EquipmentType | 'all'; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'dumbbell', label: 'משקולות יד' },
    { key: 'machine', label: 'מכונה' },
    { key: 'cable', label: 'כבלים/פולי' },
    { key: 'barbell', label: 'מוט' },
    { key: 'smith', label: 'סמית׳' },
    { key: 'bodyweight', label: 'משקל גוף' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="action-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ height: 'calc(var(--app-vh, 1vh) * 86)', display: 'flex', flexDirection: 'column' }}
      >
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="pill-badge pill-orange">
                <Shuffle size={12} />
                מכשיר תפוס? החלפת תרגיל
              </span>
              <span className="pill-badge pill-blue">{currentMuscleLabel}</span>
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
              חלופה ל: {currentExercise.nameHe}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              בחר תרגיל פנוי שעובד על אותה קבוצת שריר
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface-2)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
            }}
          />
          <input
            type="text"
            placeholder="חפש תרגיל חלופי..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 38px 10px 14px',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Equipment Filters */}
        <div className="filter-chip-row" style={{ marginBottom: 12 }}>
          {equipmentOptions.map((opt) => (
            <button
              key={opt.key}
              className={`filter-chip ${selectedEquipment === opt.key ? 'active' : ''}`}
              onClick={() => setSelectedEquipment(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Alternatives List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {candidateExercises.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              לא נמצאו תרגילים חלופיים מתאימים.
            </div>
          ) : (
            candidateExercises.map(({ exercise, isDirectAlt }) => {
              const workoutCount = StorageService.getExerciseWorkoutCount(exercise.id);

              return (
                <div
                  key={exercise.id}
                  onClick={() => {
                    onSelectSwap(exercise);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-surface-2)',
                    border: isDirectAlt ? '1px solid rgba(255, 159, 10, 0.4)' : '1px solid var(--border-subtle)',
                    borderRadius: 16,
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <ExerciseThumbnail
                      exerciseId={exercise.id}
                      muscle={exercise.muscle}
                      nameEn={exercise.nameEn}
                      image={exercise.image}
                      size={52}
                    />

                    <div>
                      {isDirectAlt && (
                        <span className="pill-badge pill-orange" style={{ marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem' }}>
                          <Sparkles size={10} />
                          חלופה מומלצת
                        </span>
                      )}
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 2 }}>
                        {exercise.nameHe}
                      </h4>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }} dir="ltr">
                        {exercise.nameEn}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                        {EQUIPMENT_LABELS[exercise.equipment]?.he || exercise.equipment}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: workoutCount > 0 ? 'var(--color-blue)' : 'var(--text-dim)', fontWeight: 600 }}>
                        {workoutCount > 0 ? `בוצע ב-${workoutCount} אימונים` : 'טרם בוצע באימונים'}
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    style={{
                      width: 'auto',
                      padding: '8px 14px',
                      fontSize: '0.82rem',
                      borderRadius: 'var(--radius-full)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSwap(exercise);
                      onClose();
                    }}
                  >
                    החלף לזה ⚡
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
