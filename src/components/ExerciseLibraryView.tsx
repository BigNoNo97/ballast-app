import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Heart,
  ChevronLeft,
  X,
  Dumbbell,
  Sparkles,
  Layers,
  History,
} from 'lucide-react';
import { Exercise, MuscleGroup, EquipmentType } from '../types';
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from '../data/exercises';
import { StorageService } from '../services/storage';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { triggerHaptic } from '../services/sound';

interface ExerciseLibraryViewProps {
  allExercises: Exercise[];
  onAddCustomExercise: (newEx: Exercise) => void;
  onSelectExerciseForWorkout?: (ex: Exercise) => void;
  onBack?: () => void;
  onOpenExerciseProfile?: (exerciseId: string) => void;
}

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({
  allExercises,
  onAddCustomExercise,
  onSelectExerciseForWorkout,
  onBack,
  onOpenExerciseProfile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'recent'>('all');
  const [selectedArea, setSelectedArea] = useState<MuscleGroup | 'all'>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType | 'all'>('all');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    StorageService.getFavoriteExerciseIds()
  );
  const [showAddModal, setShowAddModal] = useState(false);

  // New custom exercise form states
  const [nameHe, setNameHe] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState<EquipmentType>('dumbbell');
  const [tipsHe, setTipsHe] = useState('');

  // Toggle favorite
  const handleToggleFavorite = (exerciseId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isFav = StorageService.toggleFavoriteExercise(exerciseId);
    setFavoriteIds(StorageService.getFavoriteExerciseIds());
    triggerHaptic(isFav ? [40, 60] : 30);
  };

  // Recent exercise IDs from history
  const recentExerciseIds = useMemo(() => {
    const history = StorageService.getWorkoutHistory();
    const set = new Set<string>();
    for (const w of history) {
      for (const ex of w.exercises) {
        set.add(ex.exerciseId);
      }
    }
    return set;
  }, []);

  const filteredExercises = useMemo(() => {
    return allExercises.filter((ex) => {
      // תרגילי חימום כלליים לא מוצעים כתרגיל רגיל למאגר/הוספה לאימון
      if (ex.isWarmup) return false;
      // Tab filter
      if (activeTab === 'favorites' && !favoriteIds.includes(ex.id)) return false;
      if (activeTab === 'recent' && !recentExerciseIds.has(ex.id)) return false;

      // Area / Muscle filter
      if (selectedArea !== 'all' && ex.muscle !== selectedArea) return false;

      // Equipment filter
      if (selectedEquipment !== 'all' && ex.equipment !== selectedEquipment) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          ex.nameHe.toLowerCase().includes(q) ||
          ex.nameEn.toLowerCase().includes(q) ||
          MUSCLE_GROUP_LABELS[ex.muscle]?.he.toLowerCase().includes(q) ||
          EQUIPMENT_LABELS[ex.equipment]?.he.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allExercises, activeTab, selectedArea, selectedEquipment, searchQuery, favoriteIds, recentExerciseIds]);

  const handleSaveCustom = () => {
    if (!nameHe.trim()) return;

    const newEx: Exercise = {
      id: `custom-ex-${Date.now()}`,
      nameHe: nameHe.trim(),
      nameEn: nameEn.trim() || nameHe.trim(),
      muscle,
      equipment,
      alternatives: [],
      defaultSets: 3,
      defaultReps: 10,
      defaultRestSec: 90,
      tipsHe: tipsHe.trim() || undefined,
      isCustom: true,
    };

    onAddCustomExercise(newEx);
    setShowAddModal(false);
    setNameHe('');
    setNameEn('');
    setTipsHe('');
    triggerHaptic([50, 50]);
  };

  const areaOptions: { key: MuscleGroup | 'all'; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'chest', label: 'חזה' },
    { key: 'back', label: 'גב' },
    { key: 'quads', label: 'רגליים' },
    { key: 'shoulders', label: 'כתפיים' },
    { key: 'triceps', label: 'יד אחורית' },
    { key: 'biceps', label: 'יד קדמית' },
    { key: 'core', label: 'בטן' },
  ];

  const equipmentOptions: { key: EquipmentType | 'all'; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'barbell', label: 'מוט' },
    { key: 'dumbbell', label: 'משקולות יד' },
    { key: 'machine', label: 'מכונה' },
    { key: 'cable', label: 'כבלים/פולי' },
    { key: 'bodyweight', label: 'משקל גוף' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <ChevronLeft size={24} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>מאגר תרגילים</h2>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            background: 'var(--color-blue-bg)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--color-blue)',
            padding: '6px 14px',
            borderRadius: 10,
            fontSize: '0.82rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          הוסף תרגיל
        </button>
      </div>

      {/* Search Input (Matching Image) */}
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
        />
        <input
          type="text"
          placeholder="חפש תרגיל לפי שם או שריר..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '11px 40px 11px 14px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
      </div>

      {/* Filter Row 1: MY / Favorites / Recent */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 2px', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'all' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
            paddingBottom: 4,
            borderBottom: activeTab === 'all' ? '2px solid var(--color-blue)' : '2px solid transparent',
          }}
        >
          הכל ({allExercises.length})
        </button>

        <button
          onClick={() => setActiveTab('favorites')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'favorites' ? '#FF2D55' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
            paddingBottom: 4,
            borderBottom: activeTab === 'favorites' ? '2px solid #FF2D55' : '2px solid transparent',
          }}
        >
          <Heart size={14} fill={activeTab === 'favorites' ? '#FF2D55' : 'transparent'} />
          מועדפים ({favoriteIds.length})
        </button>

        <button
          onClick={() => setActiveTab('recent')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'recent' ? 'var(--color-blue)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
            paddingBottom: 4,
            borderBottom: activeTab === 'recent' ? '2px solid var(--color-blue)' : '2px solid transparent',
          }}
        >
          אחרונים ({recentExerciseIds.size})
        </button>
      </div>

      {/* Filter Row 2: Area / Muscle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>אזור:</span>
        {areaOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedArea(opt.key)}
            style={{
              flexShrink: 0,
              background: selectedArea === opt.key ? 'var(--bg-surface-3)' : 'transparent',
              border: selectedArea === opt.key ? '1px solid var(--border-strong)' : 'none',
              color: selectedArea === opt.key ? 'var(--text-main)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: selectedArea === opt.key ? 800 : 500,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filter Row 3: Equipment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>ציוד:</span>
        {equipmentOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSelectedEquipment(opt.key)}
            style={{
              flexShrink: 0,
              background: selectedEquipment === opt.key ? 'var(--bg-surface-3)' : 'transparent',
              border: selectedEquipment === opt.key ? '1px solid var(--border-strong)' : 'none',
              color: selectedEquipment === opt.key ? 'var(--text-main)' : 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: selectedEquipment === opt.key ? 800 : 500,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Total Count Header */}
      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>
        סה״כ {filteredExercises.length} תרגילים
      </div>

      {/* Exercises List (Matching Image in RTL) */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 }}>
        {filteredExercises.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            לא נמצאו תרגילים התואמים את החיפוש והסינון.
          </div>
        ) : (
          filteredExercises.map((ex) => {
            const muscleLabel = MUSCLE_GROUP_LABELS[ex.muscle]?.he || ex.muscle;
            const equipLabel = EQUIPMENT_LABELS[ex.equipment]?.he || ex.equipment;
            const workoutCount = StorageService.getExerciseWorkoutCount(ex.id);
            const isFav = favoriteIds.includes(ex.id);

            return (
              <div
                key={ex.id}
                onClick={() => {
                  if (onSelectExerciseForWorkout) {
                    onSelectExerciseForWorkout(ex);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 16,
                  padding: '12px 14px',
                  cursor: onSelectExerciseForWorkout ? 'pointer' : 'default',
                  transition: 'background-color 150ms ease',
                }}
              >
                {/* Right Side (RTL Start): Illustration & Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                  {/* Exercise Illustration Thumbnail */}
                  <div style={{ flexShrink: 0 }}>
                    <ExerciseThumbnail
                      exerciseId={ex.id}
                      muscle={ex.muscle}
                      nameEn={ex.nameEn}
                      image={ex.image}
                      size={54}
                      onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(ex.id) : undefined}
                    />
                  </div>

                  {/* Exercise Name, Description & Workout Count */}
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 2 }}>
                      {ex.nameHe}
                    </h4>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 2 }} dir="ltr">
                      {ex.nameEn}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 3 }}>
                      {muscleLabel} ({equipLabel})
                    </div>

                    {/* Workouts count */}
                    <div style={{ fontSize: '0.74rem', color: workoutCount > 0 ? 'var(--color-blue)' : 'var(--text-dim)', fontWeight: 600 }}>
                      {workoutCount > 0
                        ? `בוצע ב-${workoutCount} אימונים`
                        : 'טרם בוצע באימונים'}
                    </div>
                  </div>
                </div>

                {/* Left Side (RTL End): Action Button & Favorite Heart */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {onSelectExerciseForWorkout && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectExerciseForWorkout(ex);
                      }}
                      style={{
                        background: 'var(--color-blue)',
                        border: 'none',
                        color: '#ffffff',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      + הוסף
                    </button>
                  )}

                  <button
                    onClick={(e) => handleToggleFavorite(ex.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isFav ? '#FF2D55' : 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={isFav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                  >
                    <Heart size={20} fill={isFav ? '#FF2D55' : 'transparent'} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Custom Exercise Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="action-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 85)', overflowY: 'auto' }}
          >
            <div className="sheet-handle" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>הוספת תרגיל חדש</h3>
              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  שם התרגיל בעברית
                </label>
                <input
                  type="text"
                  placeholder="למשל: לחיצת חזה בשיפוע חיובי"
                  value={nameHe}
                  onChange={(e) => setNameHe(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  שם באנגלית (אופציונלי)
                </label>
                <input
                  type="text"
                  placeholder="Incline Bench Press"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.9rem',
                    direction: 'ltr',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    קבוצת שריר
                  </label>
                  <select
                    value={muscle}
                    onChange={(e) => setMuscle(e.target.value as MuscleGroup)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    {Object.entries(MUSCLE_GROUP_LABELS).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.he}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    ציוד נדרש
                  </label>
                  <select
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value as EquipmentType)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-main)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    {Object.entries(EQUIPMENT_LABELS).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.he}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                  טיפים ודגשי ביצוע (אופציונלי)
                </label>
                <textarea
                  placeholder="דגשים טכניים לביצוע נכון..."
                  value={tipsHe}
                  onChange={(e) => setTipsHe(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <button
                className="btn-primary"
                onClick={handleSaveCustom}
                disabled={!nameHe.trim()}
                style={{ marginTop: 8 }}
              >
                שמור תרגיל במאגר
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
