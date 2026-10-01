import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Check,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  Dumbbell,
  CheckCircle2,
  Calendar,
  Save,
  TrendingUp,
} from 'lucide-react';
import { RoutineTemplate, RoutineDay, Exercise, ProgressionRule } from '../types';
import { describeProgressionRule } from '../services/progression';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from '../data/exercises';
import { triggerHaptic } from '../services/sound';

interface RoutinesViewProps {
  routines: RoutineTemplate[];
  activeRoutine: RoutineTemplate | null;
  allExercises: Exercise[];
  onSelectActiveRoutine: (routine: RoutineTemplate) => void;
  onStartRoutine: (routine: RoutineTemplate) => void;
  onStartEmptyWorkout: () => void;
  onSaveRoutine: (routine: RoutineTemplate) => void;
  onDeleteRoutine: (routineId: string) => void;
  onClose: () => void;
  onOpenExerciseProfile?: (exerciseId: string) => void;
}

export const RoutinesView: React.FC<RoutinesViewProps> = ({
  routines,
  activeRoutine,
  allExercises,
  onSelectActiveRoutine,
  onStartRoutine,
  onStartEmptyWorkout,
  onSaveRoutine,
  onDeleteRoutine,
  onClose,
  onOpenExerciseProfile,
}) => {
  const [editingRoutine, setEditingRoutine] = useState<RoutineTemplate | null>(null);
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(0);
  const [exercisePickerDayIndex, setExercisePickerDayIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<{ dayIdx: number; exIdx: number } | null>(null);

  const exerciseMap = new Map<string, Exercise>();
  allExercises.forEach((e) => exerciseMap.set(e.id, e));

  // Open editor with an existing routine
  const handleStartEdit = (routine: RoutineTemplate) => {
    // Deep clone to allow safe editing
    const clone: RoutineTemplate = JSON.parse(JSON.stringify(routine));
    setEditingRoutine(clone);
    setExpandedDayIndex(0);
    triggerHaptic(40);
  };

  // Open editor for creating a brand new routine from scratch
  const handleStartCreateNew = () => {
    const newRoutine: RoutineTemplate = {
      id: `custom-routine-${Date.now()}`,
      title: 'תוכנית אימון חדשה',
      description: 'תוכנית מותאמת אישית',
      category: 'custom',
      isCustom: true,
      createdAt: Date.now(),
      exercises: [],
      days: [
        {
          dayNumber: 1,
          dayTitle: 'יום 1 - פלג גוף עליון',
          targetMuscles: 'חזה, גב, כתפיים',
          estimatedCalories: 300,
          estimatedMinutes: 45,
          exercises: [],
        },
        {
          dayNumber: 2,
          dayTitle: 'יום 2 - רגליים ובטן',
          targetMuscles: 'ארבע-ראשי, ירך אחורית, בטן',
          estimatedCalories: 320,
          estimatedMinutes: 50,
          exercises: [],
        },
        {
          dayNumber: 3,
          dayTitle: 'יום 3 - ידיים וכתפיים',
          targetMuscles: 'יד קדמית, יד אחורית, כתפיים',
          estimatedCalories: 280,
          estimatedMinutes: 40,
          exercises: [],
        },
      ],
    };
    setEditingRoutine(newRoutine);
    setExpandedDayIndex(0);
    triggerHaptic(40);
  };

  // Reorder days in editing routine
  const handleMoveDay = (fromIdx: number, direction: 'up' | 'down') => {
    if (!editingRoutine) return;
    if (direction === 'up' && fromIdx === 0) return;
    if (direction === 'down' && fromIdx === editingRoutine.days.length - 1) return;

    const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
    const updatedDays = [...editingRoutine.days];
    const item = updatedDays.splice(fromIdx, 1)[0];
    updatedDays.splice(toIdx, 0, item);

    // Re-number days
    updatedDays.forEach((d, idx) => {
      d.dayNumber = idx + 1;
    });

    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    setExpandedDayIndex(toIdx);
    triggerHaptic(30);
  };

  // Add a new Day to editing routine
  const handleAddDay = () => {
    if (!editingRoutine) return;
    const newDayNum = editingRoutine.days.length + 1;
    const newDay: RoutineDay = {
      dayNumber: newDayNum,
      dayTitle: `Day ${newDayNum} - יום אימון`,
      targetMuscles: 'שרירי מטרה',
      estimatedCalories: 300,
      estimatedMinutes: 45,
      exercises: [],
    };
    const updatedDays = [...editingRoutine.days, newDay];
    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    setExpandedDayIndex(updatedDays.length - 1);
    triggerHaptic(40);
  };

  // Remove a Day from editing routine
  const handleRemoveDay = (dayIdx: number) => {
    if (!editingRoutine || editingRoutine.days.length <= 1) return;
    const updatedDays = [...editingRoutine.days];
    updatedDays.splice(dayIdx, 1);
    updatedDays.forEach((d, idx) => {
      d.dayNumber = idx + 1;
    });
    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    setExpandedDayIndex(Math.max(0, dayIdx - 1));
    triggerHaptic(40);
  };

  // Reorder exercises inside a day
  const handleMoveExerciseInDay = (dayIdx: number, exIdx: number, direction: 'up' | 'down') => {
    if (!editingRoutine) return;
    const targetDay = editingRoutine.days[dayIdx];
    if (!targetDay) return;
    if (direction === 'up' && exIdx === 0) return;
    if (direction === 'down' && exIdx === targetDay.exercises.length - 1) return;

    const toIdx = direction === 'up' ? exIdx - 1 : exIdx + 1;
    const updatedExercises = [...targetDay.exercises];
    const item = updatedExercises.splice(exIdx, 1)[0];
    updatedExercises.splice(toIdx, 0, item);

    const updatedDays = [...editingRoutine.days];
    updatedDays[dayIdx] = {
      ...targetDay,
      exercises: updatedExercises,
    };

    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    triggerHaptic(30);
  };

  // Remove exercise from a day
  const handleRemoveExerciseFromDay = (dayIdx: number, exIdx: number) => {
    if (!editingRoutine) return;
    const targetDay = editingRoutine.days[dayIdx];
    if (!targetDay) return;

    const updatedExercises = [...targetDay.exercises];
    updatedExercises.splice(exIdx, 1);

    const updatedDays = [...editingRoutine.days];
    updatedDays[dayIdx] = {
      ...targetDay,
      exercises: updatedExercises,
    };

    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    triggerHaptic(40);
  };

  // Update sets/reps/weight/progression rule for a specific exercise within a day
  const handleUpdateExerciseInDay = (
    dayIdx: number,
    exIdx: number,
    updates: Partial<{ targetSets: number; targetReps: number; suggestedWeight?: number; progressionRule?: ProgressionRule }>
  ) => {
    if (!editingRoutine) return;
    const targetDay = editingRoutine.days[dayIdx];
    if (!targetDay) return;

    const updatedExercises = [...targetDay.exercises];
    updatedExercises[exIdx] = { ...updatedExercises[exIdx], ...updates };

    const updatedDays = [...editingRoutine.days];
    updatedDays[dayIdx] = { ...targetDay, exercises: updatedExercises };

    setEditingRoutine({ ...editingRoutine, days: updatedDays });
  };

  // Add exercise to a specific day from picker
  const handleAddExerciseToDay = (dayIdx: number, exercise: Exercise) => {
    if (!editingRoutine) return;
    const targetDay = editingRoutine.days[dayIdx];
    if (!targetDay) return;

    const newEx = {
      exerciseId: exercise.id,
      targetSets: exercise.defaultSets || 3,
      targetReps: exercise.defaultReps || 10,
    };

    const updatedDays = [...editingRoutine.days];
    updatedDays[dayIdx] = {
      ...targetDay,
      exercises: [...targetDay.exercises, newEx],
    };

    setEditingRoutine({
      ...editingRoutine,
      days: updatedDays,
    });
    setExercisePickerDayIndex(null);
    triggerHaptic(40);
  };

  // Save the entire edited routine
  const handleSaveRoutineChanges = () => {
    if (!editingRoutine || !editingRoutine.title.trim()) return;

    // Fallback exercises array for single-day legacy queries
    const allExercisesFlat = editingRoutine.days.flatMap((d) => d.exercises);

    const finalRoutine: RoutineTemplate = {
      ...editingRoutine,
      title: editingRoutine.title.trim(),
      exercises: allExercisesFlat,
      // מסמנים שהמשתמש נגע ידנית בתוכנית שנבנתה אוטומטית - כדי שמנוע ההתקדמות לא ידרוס
      // את העריכה הזו בעדכון נפח שבועי או ב-rollover למחזור הבא (ראו programGenerator.ts).
      manuallyEditedAt: editingRoutine.isGenerated ? Date.now() : editingRoutine.manuallyEditedAt,
    };

    onSaveRoutine(finalRoutine);
    onSelectActiveRoutine(finalRoutine);
    setEditingRoutine(null);
    triggerHaptic([60, 60, 100]);
  };

  // Filtered exercises for picker modal
  const filteredPickerExercises = allExercises.filter((ex) => {
    if (ex.isWarmup) return false; // תרגילי חימום כלליים לא נבחרים ידנית - נוספים אוטומטית
    const matchesSearch =
      ex.nameHe.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMuscle = selectedMuscleFilter === 'all' || ex.muscle === selectedMuscleFilter;
    return matchesSearch && matchesMuscle;
  });

  // ==========================================
  // VIEW: ROUTINE EDITOR (Create / Edit Screen)
  // ==========================================
  if (editingRoutine) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
        {/* Editor Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <span style={{ fontSize: '0.76rem', color: 'var(--color-blue)', fontWeight: 800 }}>עריכת תוכנית אימון</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{editingRoutine.title}</h2>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditingRoutine(null)}
              style={{
                background: 'var(--bg-surface-2)',
                border: 'none',
                color: 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              ביטול
            </button>

            <button
              onClick={handleSaveRoutineChanges}
              style={{
                background: 'var(--color-blue)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(110, 124, 245, 0.4)',
              }}
            >
              <Save size={15} />
              שמור תוכנית
            </button>
          </div>
        </div>

        {/* Routine Name & Description Inputs */}
        <div className="ios-card" style={{ padding: '14px', marginBottom: 0 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              שם התוכנית
            </label>
            <input
              type="text"
              value={editingRoutine.title}
              onChange={(e) => setEditingRoutine({ ...editingRoutine, title: e.target.value })}
              placeholder="למשל: Science - ULPPL, תוכנית כוח 4 ימים..."
              style={{
                width: '100%',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                fontWeight: 700,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              תיאור
            </label>
            <input
              type="text"
              value={editingRoutine.description}
              onChange={(e) => setEditingRoutine({ ...editingRoutine, description: e.target.value })}
              placeholder="למשל: תוכנית מבוססת מדעית, חלוקת עליון/תחתון/דחיפה/משיכה..."
              style={{
                width: '100%',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '8px 12px',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block' }}>נדרש תיעוד כדי להתקדם</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                האימון הבא לא יתקדם אם לא נרשם אף סט באימון הנוכחי
              </span>
            </div>
            <button
              onClick={() => setEditingRoutine({ ...editingRoutine, requireLogToAdvance: !editingRoutine.requireLogToAdvance })}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: editingRoutine.requireLogToAdvance ? 'rgba(110, 124, 245, 0.15)' : 'var(--bg-surface-2)',
                color: editingRoutine.requireLogToAdvance ? 'var(--color-blue)' : 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {editingRoutine.requireLogToAdvance ? 'פעיל ✓' : 'כבוי'}
            </button>
          </div>
        </div>

        {/* Days Header & Add Day Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
            ימי האימון ({editingRoutine.days.length} ימים)
          </h3>

          <button
            onClick={handleAddDay}
            style={{
              background: 'var(--bg-surface-3)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--color-blue)',
              padding: '6px 12px',
              borderRadius: 10,
              fontSize: '0.8rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            הוסף יום אימון
          </button>
        </div>

        {/* Days Accordion List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 30 }}>
          {editingRoutine.days.map((day, dayIdx) => {
            const isExpanded = expandedDayIndex === dayIdx;

            return (
              <div
                key={day.dayNumber + '-' + dayIdx}
                className="ios-card"
                style={{
                  padding: '14px',
                  border: isExpanded ? '1.5px solid var(--color-blue)' : '1px solid var(--border-subtle)',
                  borderRadius: 16,
                  background: isExpanded ? 'rgba(110, 124, 245, 0.03)' : 'var(--bg-surface-1)',
                  marginBottom: 0,
                }}
              >
                {/* Day Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div
                    onClick={() => setExpandedDayIndex(isExpanded ? null : dayIdx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'var(--color-blue)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                      }}
                    >
                      {dayIdx + 1}
                    </span>

                    <div>
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {day.dayTitle}
                      </h4>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {day.exercises.length} תרגילים • {day.targetMuscles || 'שרירי מטרה'}
                      </span>
                    </div>
                  </div>

                  {/* Day Action Buttons: Move Up/Down, Expand, Delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      disabled={dayIdx === 0}
                      onClick={() => handleMoveDay(dayIdx, 'up')}
                      style={{
                        background: 'var(--bg-surface-3)',
                        border: 'none',
                        color: dayIdx === 0 ? 'var(--text-dim)' : 'var(--text-main)',
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: dayIdx === 0 ? 'default' : 'pointer',
                      }}
                      title="העלה סדר יום זה"
                    >
                      <ArrowUp size={15} />
                    </button>

                    <button
                      disabled={dayIdx === editingRoutine.days.length - 1}
                      onClick={() => handleMoveDay(dayIdx, 'down')}
                      style={{
                        background: 'var(--bg-surface-3)',
                        border: 'none',
                        color: dayIdx === editingRoutine.days.length - 1 ? 'var(--text-dim)' : 'var(--text-main)',
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: dayIdx === editingRoutine.days.length - 1 ? 'default' : 'pointer',
                      }}
                      title="הורד סדר יום זה"
                    >
                      <ArrowDown size={15} />
                    </button>

                    {editingRoutine.days.length > 1 && (
                      <button
                        onClick={() => handleRemoveDay(dayIdx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-red)',
                          width: 30,
                          height: 30,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        title="מחק יום זה"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                    <button
                      onClick={() => setExpandedDayIndex(isExpanded ? null : dayIdx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Day Details: Edit Titles & Exercises */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    {/* Day Title & Target Muscles inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                          שם יום האימון
                        </label>
                        <input
                          type="text"
                          value={day.dayTitle}
                          onChange={(e) => {
                            const updatedDays = [...editingRoutine.days];
                            updatedDays[dayIdx].dayTitle = e.target.value;
                            setEditingRoutine({ ...editingRoutine, days: updatedDays });
                          }}
                          placeholder="למשל: Upper Body..."
                          style={{
                            width: '100%',
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 8,
                            padding: '7px 10px',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                          שרירי מיקוד
                        </label>
                        <input
                          type="text"
                          value={day.targetMuscles}
                          onChange={(e) => {
                            const updatedDays = [...editingRoutine.days];
                            updatedDays[dayIdx].targetMuscles = e.target.value;
                            setEditingRoutine({ ...editingRoutine, days: updatedDays });
                          }}
                          placeholder="למשל: Back, Leg, Core"
                          style={{
                            width: '100%',
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 8,
                            padding: '7px 10px',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Day Exercises List */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>
                          תרגילי היום ({day.exercises.length})
                        </span>

                        <button
                          onClick={() => setExercisePickerDayIndex(dayIdx)}
                          style={{
                            background: 'rgba(110, 124, 245, 0.15)',
                            border: '1px solid rgba(110, 124, 245, 0.3)',
                            color: 'var(--color-blue)',
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'pointer',
                          }}
                        >
                          <Plus size={13} />
                          הוסף תרגיל
                        </button>
                      </div>

                      {day.exercises.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-dim)', fontSize: '0.8rem', background: 'var(--bg-surface-2)', borderRadius: 10 }}>
                          עדיין אין תרגילים ביום זה. לחץ על "+ הוסף תרגיל" לבחירה מבנק התרגילים.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {day.exercises.map((item, exIdx) => {
                            const ex = exerciseMap.get(item.exerciseId);
                            if (!ex) return null;

                            return (
                              <div
                                key={item.exerciseId + '-' + exIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: 'var(--bg-surface-2)',
                                  padding: '8px 10px',
                                  borderRadius: 10,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                  <ExerciseThumbnail
                                    exerciseId={ex.id}
                                    muscle={ex.muscle}
                                    nameEn={ex.nameEn}
                                    image={ex.image}
                                    size={36}
                                    onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(ex.id) : undefined}
                                  />
                                  <div>
                                    <h5 style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {exIdx + 1}. {ex.nameHe}
                                      {ex.isWarmup && <span className="pill-badge pill-orange">חימום</span>}
                                    </h5>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      {item.targetSets || 3} סטים × {item.targetReps || 10} חזרות
                                      {item.suggestedWeight ? ` × ${item.suggestedWeight} ק"ג` : ''}
                                    </span>
                                    {item.progressionRule && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                                        <TrendingUp size={11} color="var(--color-blue)" />
                                        <span style={{ fontSize: '0.68rem', color: 'var(--color-blue)', fontWeight: 700 }}>
                                          {describeProgressionRule(item.progressionRule)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Edit / Move / Delete */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button
                                    onClick={() => setEditingItem({ dayIdx, exIdx })}
                                    style={{
                                      background: 'var(--bg-surface-3)',
                                      border: 'none',
                                      color: 'var(--text-main)',
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    disabled={exIdx === 0}
                                    onClick={() => handleMoveExerciseInDay(dayIdx, exIdx, 'up')}
                                    style={{
                                      background: 'var(--bg-surface-3)',
                                      border: 'none',
                                      color: exIdx === 0 ? 'var(--text-dim)' : 'var(--text-main)',
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: exIdx === 0 ? 'default' : 'pointer',
                                    }}
                                  >
                                    <ArrowUp size={13} />
                                  </button>

                                  <button
                                    disabled={exIdx === day.exercises.length - 1}
                                    onClick={() => handleMoveExerciseInDay(dayIdx, exIdx, 'down')}
                                    style={{
                                      background: 'var(--bg-surface-3)',
                                      border: 'none',
                                      color: exIdx === day.exercises.length - 1 ? 'var(--text-dim)' : 'var(--text-main)',
                                      width: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: exIdx === day.exercises.length - 1 ? 'default' : 'pointer',
                                    }}
                                  >
                                    <ArrowDown size={13} />
                                  </button>

                                  <button
                                    onClick={() => handleRemoveExerciseFromDay(dayIdx, exIdx)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--color-red)',
                                      width: 26,
                                      height: 26,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal: Edit sets/reps/weight + progression rule for one exercise */}
        {editingItem && editingRoutine && (
          <ExerciseItemEditor
            item={editingRoutine.days[editingItem.dayIdx].exercises[editingItem.exIdx]}
            exerciseName={exerciseMap.get(editingRoutine.days[editingItem.dayIdx].exercises[editingItem.exIdx].exerciseId)?.nameHe || 'תרגיל'}
            onClose={() => setEditingItem(null)}
            onSave={(updates) => {
              handleUpdateExerciseInDay(editingItem.dayIdx, editingItem.exIdx, updates);
              setEditingItem(null);
            }}
          />
        )}

        {/* Modal: Exercise Bank Picker for Adding to Day */}
        {exercisePickerDayIndex !== null && (
          <div className="modal-overlay" onClick={() => setExercisePickerDayIndex(null)}>
            <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 85)', display: 'flex', flexDirection: 'column' }}>
              <div className="sheet-handle" />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>בחר תרגיל להוספה</h3>
                <button
                  onClick={() => setExercisePickerDayIndex(null)}
                  style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={16} style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חפש תרגיל לפי שם או שריר..."
                  style={{
                    width: '100%',
                    padding: '10px 38px 10px 14px',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    color: 'var(--text-main)',
                    outline: 'none',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              {/* Muscle Filters */}
              <div className="filter-chip-row" style={{ marginBottom: 10 }}>
                <button
                  className={`filter-chip ${selectedMuscleFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedMuscleFilter('all')}
                >
                  הכל
                </button>
                {Object.entries(MUSCLE_GROUP_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`filter-chip ${selectedMuscleFilter === key ? 'active' : ''}`}
                    onClick={() => setSelectedMuscleFilter(key)}
                  >
                    {label.he}
                  </button>
                ))}
              </div>

              {/* Exercise List */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredPickerExercises.map((ex) => (
                  <div
                    key={ex.id}
                    onClick={() => handleAddExerciseToDay(exercisePickerDayIndex, ex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-surface-1)',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ExerciseThumbnail
                        exerciseId={ex.id}
                        muscle={ex.muscle}
                        nameEn={ex.nameEn}
                        image={ex.image}
                        size={44}
                        onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(ex.id) : undefined}
                      />
                      <div>
                        <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{ex.nameHe}</h4>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {MUSCLE_GROUP_LABELS[ex.muscle]?.he}
                        </span>
                      </div>
                    </div>

                    <button
                      style={{
                        background: 'var(--color-blue)',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      + הוסף
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW: ROUTINES DIRECTORY / LIST
  // ==========================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>תוכניות אימונים</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            בחר תוכנית פעילה, ערוך את סדר הימים והתרגילים או צור תוכנית חדשה
          </p>
        </div>

        <button
          onClick={handleStartCreateNew}
          style={{
            background: 'var(--color-blue)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 12,
            fontWeight: 800,
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(110, 124, 245, 0.4)',
          }}
        >
          תוכנית חדשה
        </button>
      </div>

      {/* Active Routine Card - או מסך ריק אם עוד אין למשתמש שום תוכנית משלו */}
      {!activeRoutine ? (
        <div
          className="ios-card"
          style={{
            border: '1px dashed var(--border-strong)',
            padding: '20px 16px',
            borderRadius: 18,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>
            עדיין אין לך תוכנית משלך
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            לחץ על "תוכנית חדשה" למעלה כדי לבנות את התוכנית הראשונה שלך.
          </div>
        </div>
      ) : (
      <div
        className="ios-card"
        style={{
          background: 'linear-gradient(135deg, rgba(110, 124, 245, 0.15), rgba(110, 124, 245, 0.1))',
          border: '1.5px solid var(--color-blue)',
          padding: '16px',
          borderRadius: 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#fff',
                background: 'var(--color-blue)',
                padding: '3px 8px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 6,
              }}
            >
              <Check size={12} strokeWidth={3} />
              תוכנית פעילה כעת
            </span>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {activeRoutine.title}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {activeRoutine.description}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
            <button
              onClick={() => handleStartEdit(activeRoutine)}
              style={{
                background: 'var(--bg-surface-3)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--color-blue)',
                padding: '6px 14px',
                borderRadius: 10,
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
            >
              <Edit3 size={14} />
              ערוך
            </button>

            {routines.length > 1 && (
              <button
                onClick={() => {
                  if (window.confirm(`האם אתה בטוח שברצונך למחוק את התוכנית "${activeRoutine.title}" לצמיתות?`)) {
                    onDeleteRoutine(activeRoutine.id);
                    triggerHaptic([40, 40]);
                  }
                }}
                style={{
                  background: 'rgba(255, 69, 58, 0.12)',
                  border: '1px solid rgba(255, 69, 58, 0.3)',
                  color: 'var(--color-red)',
                  padding: '5px 14px',
                  borderRadius: 10,
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                מחק
              </button>
            )}
          </div>
        </div>

        {/* Days summary */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {activeRoutine.days?.map((d, idx) => (
            <span
              key={idx}
              style={{
                background: 'var(--bg-surface-3)',
                border: '1px solid var(--border-subtle)',
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: '0.76rem',
                color: 'var(--text-main)',
                fontWeight: 600,
              }}
            >
              {d.dayTitle} ({d.exercises.length} תרגילים)
            </span>
          ))}
        </div>
      </div>
      )}

      {/* Other Available Routines List */}
      {(() => {
        const otherRoutines = activeRoutine ? routines.filter((r) => r.id !== activeRoutine.id) : routines;
        if (otherRoutines.length === 0) return null;

        return (
          <>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 4 }}>
              התוכניות האחרות שלך
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {otherRoutines.map((routine) => (
                <div
                  key={routine.id}
                  className="ios-card"
                  style={{
                    padding: '16px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        {routine.isCustom && (
                          <span className="pill-badge pill-purple">אישית שלי</span>
                        )}
                        <span className="pill-badge pill-gray">
                          {routine.days?.length || 1} ימי אימון
                        </span>
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {routine.title}
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {routine.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                      <button
                        onClick={() => handleStartEdit(routine)}
                        style={{
                          background: 'var(--bg-surface-3)',
                          border: 'none',
                          color: 'var(--text-main)',
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={13} />
                        ערוך
                      </button>

                      {routines.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`האם אתה בטוח שברצונך למחוק את התוכנית "${routine.title}" לצמיתות?`)) {
                              onDeleteRoutine(routine.id);
                              triggerHaptic([40, 40]);
                            }
                          }}
                          style={{
                            background: 'rgba(255, 69, 58, 0.12)',
                            border: '1px solid rgba(255, 69, 58, 0.25)',
                            color: 'var(--color-red)',
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            cursor: 'pointer',
                          }}
                          title="מחק תוכנית"
                        >
                          <Trash2 size={13} />
                          מחק
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Days preview */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 14px 0' }}>
                    {routine.days?.map((d, dIdx) => (
                      <span
                        key={dIdx}
                        style={{
                          background: 'var(--bg-surface-2)',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {d.dayTitle}
                      </span>
                    ))}
                  </div>

                  {/* Select as active button */}
                  <button
                    onClick={() => {
                      onSelectActiveRoutine(routine);
                      triggerHaptic(60);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-blue)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(110, 124, 245, 0.3)',
                      transition: 'transform 150ms ease',
                    }}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    בחר כתוכנית פעילה
                  </button>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
};

// ===== עורך יעדים לתרגיל בודד בתוך יום אימון (סטים/חזרות/משקל + חוק התקדמות) =====

interface ExerciseItemEditorProps {
  item: {
    targetSets: number;
    targetReps: number;
    suggestedWeight?: number;
    progressionRule?: ProgressionRule;
  };
  exerciseName: string;
  onClose: () => void;
  onSave: (updates: {
    targetSets: number;
    targetReps: number;
    suggestedWeight?: number;
    progressionRule?: ProgressionRule;
  }) => void;
}

const ExerciseItemEditor: React.FC<ExerciseItemEditorProps> = ({ item, exerciseName, onClose, onSave }) => {
  const [targetSets, setTargetSets] = useState(item.targetSets || 3);
  const [targetReps, setTargetReps] = useState(item.targetReps || 10);
  const [suggestedWeight, setSuggestedWeight] = useState<string>(item.suggestedWeight ? String(item.suggestedWeight) : '');
  const [ruleEnabled, setRuleEnabled] = useState(!!item.progressionRule);
  const [metric, setMetric] = useState<ProgressionRule['metric']>(item.progressionRule?.metric || 'weight');
  const [mode, setMode] = useState<ProgressionRule['mode']>(item.progressionRule?.mode || 'add');
  const [amount, setAmount] = useState<string>(item.progressionRule ? String(item.progressionRule.amount) : '1.25');
  const [requireCompletion, setRequireCompletion] = useState(item.progressionRule?.requireCompletion ?? true);

  const handleSave = () => {
    const rule: ProgressionRule | undefined = ruleEnabled
      ? { metric, mode, amount: parseFloat(amount) || 0, requireCompletion }
      : undefined;

    onSave({
      targetSets: Math.max(1, targetSets),
      targetReps: Math.max(1, targetReps),
      suggestedWeight: suggestedWeight ? parseFloat(suggestedWeight) : undefined,
      progressionRule: rule,
    });
  };

  const radioStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 6px',
    borderRadius: 8,
    border: `1px solid ${active ? 'var(--color-blue)' : 'var(--border-subtle)'}`,
    background: active ? 'rgba(110, 124, 245, 0.12)' : 'var(--bg-surface-2)',
    color: active ? 'var(--color-blue)' : 'var(--text-muted)',
    fontWeight: 700,
    fontSize: '0.8rem',
    textAlign: 'center',
    cursor: 'pointer',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 90)', overflowY: 'auto' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{exerciseName}</h3>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          <div>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>סטים</label>
            <input type="number" className="gym-input-box" value={targetSets} onChange={(e) => setTargetSets(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>חזרות</label>
            <input type="number" className="gym-input-box" value={targetReps} onChange={(e) => setTargetReps(parseInt(e.target.value, 10) || 1)} />
          </div>
          <div>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>משקל (ק״ג)</label>
            <input type="number" step="0.25" className="gym-input-box" placeholder="-" value={suggestedWeight} onChange={(e) => setSuggestedWeight(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={16} color="var(--color-blue)" />
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>חוק התקדמות אוטומטי</span>
          </div>
          <button
            onClick={() => setRuleEnabled(!ruleEnabled)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: ruleEnabled ? 'rgba(110, 124, 245, 0.15)' : 'var(--bg-surface-2)',
              color: ruleEnabled ? 'var(--color-blue)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {ruleEnabled ? 'פעיל ✓' : 'כבוי'}
          </button>
        </div>

        {ruleEnabled && (
          <div className="ios-card" style={{ padding: 12, marginBottom: 16 }}>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              בכל פעם שתתחיל את האימון הזה, היעד יעודכן אוטומטית לפי הכלל הזה - בהתבסס על מה שביצעת בפעם הקודמת.
            </p>

            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>מה להעלות</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={radioStyle(metric === 'weight')} onClick={() => setMetric('weight')}>משקל</div>
              <div style={radioStyle(metric === 'reps')} onClick={() => setMetric('reps')}>חזרות</div>
            </div>

            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>איך להעלות</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={radioStyle(mode === 'add')} onClick={() => setMode('add')}>כמות קבועה</div>
              <div style={radioStyle(mode === 'percent')} onClick={() => setMode('percent')}>אחוז</div>
            </div>

            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              כמות ({mode === 'percent' ? '%' : metric === 'weight' ? 'ק״ג' : 'חזרות'})
            </label>
            <input
              type="number"
              step={metric === 'weight' && mode === 'add' ? '0.25' : '1'}
              className="gym-input-box"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <button
              onClick={() => setRequireCompletion(!requireCompletion)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'var(--bg-surface-2)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                להעלות רק אם הסט האחרון סומן כהושלם
              </span>
              <span
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `1.5px solid ${requireCompletion ? 'var(--color-blue)' : 'var(--border-subtle)'}`,
                  background: requireCompletion ? 'var(--color-blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', color: '#fff', flexShrink: 0,
                }}
              >
                {requireCompletion ? '✓' : ''}
              </span>
            </button>
          </div>
        )}

        <button className="btn-primary" style={{ width: '100%' }} onClick={handleSave}>
          <Save size={16} /> שמירה
        </button>
      </div>
    </div>
  );
};
