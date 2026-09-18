import React, { useState, useRef } from 'react';
import {
  ChevronLeft,
  Share2,
  ArrowUpDown,
  Link2,
  MoreHorizontal,
  Plus,
  Trash2,
  Shuffle,
  GripVertical,
  Check,
  Unlink2,
} from 'lucide-react';
import { RoutineTemplate, RoutineDay, Exercise, RoutineDayExercise } from '../types';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { StorageService } from '../services/storage';
import { computeProgressedTarget } from '../services/progression';
import { getExerciseState } from '../services/progressionEngine';
import { ExerciseSwapModal } from './ExerciseSwapModal';
import { triggerHaptic } from '../services/sound';

interface WorkoutDetailPreviewProps {
  routine: RoutineTemplate;
  day: RoutineDay;
  allExercises: Exercise[];
  onBack: () => void;
  onGetStarted: (exercises: RoutineDayExercise[]) => void;
  onOpenExerciseProfile?: (exerciseId: string) => void;
}

export const WorkoutDetailPreview: React.FC<WorkoutDetailPreviewProps> = ({
  routine,
  day,
  allExercises,
  onBack,
  onGetStarted,
  onOpenExerciseProfile,
}) => {
  const [exercisesList, setExercisesList] = useState(() => {
    return day.exercises.map((item) => {
      // תוכניות שהמערכת בנתה מנוהלות ע"י מנוע ההתקדמות המחזורי - ה"זיכרון" שלו (לא האימון
      // האחרון בלבד) קובע את המשקל/חזרות הנוכחיים, ו-targetSets כבר משקף את נפח השבוע הנוכחי.
      if (routine.isGenerated) {
        const state = getExerciseState(routine.id, item.exerciseId);
        if (state) {
          return { ...item, targetReps: state.currentTargetReps, suggestedWeight: state.currentWeightKg || item.suggestedWeight };
        }
      }
      const lastPerf = StorageService.getLastExercisePerformance(item.exerciseId);
      const bestSet = lastPerf ? lastPerf.sets.find((s) => s.weightKg === lastPerf.bestWeight) || lastPerf.sets[0] : null;
      const progressed = computeProgressedTarget(item.progressionRule, bestSet, item.suggestedWeight, item.targetReps);
      const setsCount = lastPerf?.sets?.length ? lastPerf.sets.length : item.targetSets || 3;
      return {
        ...item,
        targetSets: setsCount,
        targetReps: progressed.reps || item.targetReps || 10,
        suggestedWeight: progressed.weight || item.suggestedWeight,
      };
    });
  });
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isSupersetMode, setIsSupersetMode] = useState(false);
  const [selectedForSuperset, setSelectedForSuperset] = useState<number[]>([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState<number | null>(null);
  const [swapModalExercise, setSwapModalExercise] = useState<{
    exercise: Exercise;
    index: number;
  } | null>(null);

  // Drag and Drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const activeTouchIndex = useRef<number | null>(null);

  const exerciseMap = new Map<string, Exercise>();
  allExercises.forEach((e) => exerciseMap.set(e.id, e));

  // Reorder items by dragging
  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const updated = [...exercisesList];
    const item = updated.splice(fromIdx, 1)[0];
    updated.splice(toIdx, 0, item);
    setExercisesList(updated);
    triggerHaptic(40);
  };

  // HTML5 Drag & Drop Handlers (Desktop)
  const onDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragOverIdx !== idx) {
      setDragOverIdx(idx);
    }
  };

  const onDrop = (toIdx: number) => {
    if (draggedIdx !== null) {
      handleReorder(draggedIdx, toIdx);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const onDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Touch Handlers for Mobile / iPhone
  const onTouchStart = (idx: number, e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    activeTouchIndex.current = idx;
    setDraggedIdx(idx);
    triggerHaptic(30);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (activeTouchIndex.current === null) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemElement = targetElement?.closest('[data-exercise-idx]');
    if (itemElement) {
      const overIndex = parseInt(itemElement.getAttribute('data-exercise-idx') || '-1', 10);
      if (overIndex >= 0 && overIndex !== dragOverIdx) {
        setDragOverIdx(overIndex);
      }
    }
  };

  const onTouchEnd = () => {
    if (activeTouchIndex.current !== null && dragOverIdx !== null && activeTouchIndex.current !== dragOverIdx) {
      handleReorder(activeTouchIndex.current, dragOverIdx);
    }
    activeTouchIndex.current = null;
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Toggle selection for Superset
  const toggleSelectForSuperset = (index: number) => {
    triggerHaptic(30);
    if (selectedForSuperset.includes(index)) {
      setSelectedForSuperset(selectedForSuperset.filter((i) => i !== index));
    } else {
      setSelectedForSuperset([...selectedForSuperset, index]);
    }
  };

  // Create or remove Superset
  const handleApplySuperset = () => {
    if (selectedForSuperset.length < 2) return;

    const updated = [...exercisesList];
    // Check if all selected already belong to the same superset group -> unlink them
    const existingGroupId = updated[selectedForSuperset[0]].supersetGroupId;
    const allInSameGroup =
      existingGroupId && selectedForSuperset.every((idx) => updated[idx].supersetGroupId === existingGroupId);

    if (allInSameGroup) {
      // Unlink
      selectedForSuperset.forEach((idx) => {
        updated[idx] = { ...updated[idx], supersetGroupId: undefined };
      });
    } else {
      // Link as new superset group
      const newGroupId = `ss-${Date.now()}`;
      selectedForSuperset.forEach((idx) => {
        updated[idx] = { ...updated[idx], supersetGroupId: newGroupId };
      });
    }

    setExercisesList(updated);
    setSelectedForSuperset([]);
    setIsSupersetMode(false);
    triggerHaptic([50, 50, 100]);
  };

  // Remove exercise
  const removeExercise = (index: number) => {
    const updated = [...exercisesList];
    updated.splice(index, 1);
    setExercisesList(updated);
    setActiveMenuIndex(null);
  };

  // Perform Swap with another exercise from library
  const handleSwapExercise = (newEx: Exercise) => {
    if (swapModalExercise === null) return;
    const idx = swapModalExercise.index;
    const updated = [...exercisesList];

    const lastPerf = StorageService.getLastExercisePerformance(newEx.id);

    updated[idx] = {
      ...updated[idx],
      exerciseId: newEx.id,
      targetSets: updated[idx].targetSets || newEx.defaultSets,
      targetReps: lastPerf ? lastPerf.bestReps : (updated[idx].targetReps || newEx.defaultReps),
      suggestedWeight: lastPerf ? lastPerf.bestWeight : undefined,
    };

    setExercisesList(updated);
    setSwapModalExercise(null);
    setActiveMenuIndex(null);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `${routine.title} - ${day.dayTitle}`,
          text: `תוכנית אימון ב-Ballast: ${routine.title}\nתרגילים: ${exercisesList.length} תרגילים`,
        })
        .catch(() => {});
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: 80 }}>
      {/* Top Bar (Matching Image 2: < Back, Title, Share) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 6px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-main)',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ChevronLeft size={28} />
        </button>

        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          {routine.title}
        </h2>

        <button
          onClick={handleShare}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-main)',
            cursor: 'pointer',
            padding: 6,
          }}
        >
          <Share2 size={22} />
        </button>
      </div>

      {/* Sub-header Bar (Matching Image 2: Total of 7 | ⏱ 46 min, Reorder, Superset) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 4px 16px 4px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
          <span>סה״כ {exercisesList.length} תרגילים</span>
          <span style={{ margin: '0 8px', color: 'var(--text-dim)' }}>|</span>
          <span style={{ color: 'var(--text-muted)' }}>⏱ {day.estimatedMinutes || 46} דק׳</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Reorder Button */}
          <button
            onClick={() => {
              setIsReorderMode(!isReorderMode);
              if (isSupersetMode) setIsSupersetMode(false);
              triggerHaptic(40);
            }}
            style={{
              background: isReorderMode ? 'var(--color-blue)' : 'var(--bg-surface-3)',
              color: isReorderMode ? '#fff' : 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
              padding: '6px 14px',
              borderRadius: 10,
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: isReorderMode ? '0 2px 10px rgba(110, 124, 245, 0.4)' : 'none',
            }}
          >
            <ArrowUpDown size={14} />
            {isReorderMode ? 'סיים סידור ✓' : 'שנה סדר'}
          </button>

          {/* Superset Button */}
          <button
            onClick={() => {
              setIsSupersetMode(!isSupersetMode);
              if (isReorderMode) setIsReorderMode(false);
              setSelectedForSuperset([]);
              triggerHaptic(40);
            }}
            style={{
              background: isSupersetMode ? 'var(--color-blue)' : 'var(--bg-surface-3)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
              padding: '6px 14px',
              borderRadius: 10,
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: isSupersetMode ? '0 2px 10px rgba(110, 124, 245, 0.4)' : 'none',
            }}
          >
            <Link2 size={14} />
            {isSupersetMode ? 'ביטול בחירה' : 'סופרסט'}
          </button>
        </div>
      </div>

      {/* Superset Mode Action Banner */}
      {isSupersetMode && (
        <div
          style={{
            background: 'rgba(110, 124, 245, 0.12)',
            border: '1px solid rgba(110, 124, 245, 0.3)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-blue)' }}>
              בחר 2 תרגילים או יותר לחיבור בסופרסט
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {selectedForSuperset.length} תרגילים נבחרו
            </div>
          </div>

          {selectedForSuperset.length >= 2 && (
            <button
              onClick={handleApplySuperset}
              style={{
                background: 'var(--color-blue)',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(110, 124, 245, 0.4)',
              }}
            >
              קשר כסופרסט 🔗
            </button>
          )}
        </div>
      )}

      {/* Exercises List with Drag & Drop and Superset Badges */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {exercisesList.map((item, idx) => {
          const ex = exerciseMap.get(item.exerciseId);
          if (!ex) return null;

          const lastPerf = StorageService.getLastExercisePerformance(ex.id);
          const displayWeight = item.suggestedWeight || lastPerf?.bestWeight;
          const displayReps = item.targetReps || (lastPerf ? lastPerf.bestReps : 10);

          let setWeightString = `${item.targetSets || 3} סטים`;
          if (displayWeight) {
            setWeightString += ` × ${displayWeight} ק"ג × ${displayReps} חזרות`;
          }

          const isBeingDragged = draggedIdx === idx;
          const isDragTarget = dragOverIdx === idx && draggedIdx !== idx;
          const isSelectedSuperset = selectedForSuperset.includes(idx);
          const hasSuperset = Boolean(item.supersetGroupId);

          return (
            <div
              key={item.exerciseId + '-' + idx}
              data-exercise-idx={idx}
              draggable={isReorderMode}
              onDragStart={() => onDragStart(idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
              onDragEnd={onDragEnd}
              onClick={() => {
                if (isSupersetMode) {
                  toggleSelectForSuperset(idx);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 14,
                background: isSelectedSuperset
                  ? 'rgba(110, 124, 245, 0.2)'
                  : isBeingDragged
                  ? 'rgba(110, 124, 245, 0.15)'
                  : isDragTarget
                  ? 'rgba(110, 124, 245, 0.08)'
                  : hasSuperset
                  ? 'rgba(110, 124, 245, 0.06)'
                  : 'var(--bg-surface-2)',
                border: isSelectedSuperset
                  ? '1.5px solid var(--color-blue)'
                  : isDragTarget
                  ? '2px dashed var(--color-blue)'
                  : isBeingDragged
                  ? '1.5px solid var(--color-blue)'
                  : hasSuperset
                  ? '1px solid rgba(110, 124, 245, 0.3)'
                  : '1px solid var(--border-subtle)',
                opacity: isBeingDragged ? 0.6 : 1,
                transform: isBeingDragged ? 'scale(1.02)' : 'none',
                transition: 'transform 150ms ease, background-color 150ms ease, border-color 150ms ease',
                cursor: isReorderMode ? 'grab' : isSupersetMode ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              {/* Left: Checkbox (in Superset Mode) or Thumbnail & Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                {isSupersetMode && (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: isSelectedSuperset ? '2px solid var(--color-blue)' : '2px solid var(--border-strong)',
                      background: isSelectedSuperset ? 'var(--color-blue)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelectedSuperset && <Check size={16} color="#fff" strokeWidth={3} />}
                  </div>
                )}

                <ExerciseThumbnail
                  exerciseId={ex.id}
                  muscle={ex.muscle}
                  nameEn={ex.nameEn}
                  image={ex.image}
                  size={54}
                  onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(ex.id) : undefined}
                />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    {hasSuperset && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          color: 'var(--color-blue)',
                          background: 'rgba(110, 124, 245, 0.15)',
                          padding: '2px 6px',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <Link2 size={10} />
                        סופרסט
                      </span>
                    )}
                  </div>
                  <h3
                    style={{
                      fontSize: '1.02rem',
                      fontWeight: 800,
                      color: 'var(--text-main)',
                      marginBottom: 3,
                    }}
                  >
                    {idx + 1}. {ex.nameHe}
                  </h3>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {setWeightString}
                  </span>
                </div>
              </div>

              {/* Right: Drag Grip Handle or Three-Dots Menu */}
              {isReorderMode ? (
                <div
                  onTouchStart={(e) => onTouchStart(idx, e)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'var(--bg-surface-3)',
                    color: 'var(--color-blue)',
                    cursor: 'grab',
                    touchAction: 'none',
                  }}
                  title="גרור כדי להזיז"
                >
                  <GripVertical size={24} />
                </div>
              ) : isSupersetMode ? null : (
                <button
                  onClick={() => setActiveMenuIndex(idx)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    padding: 8,
                    cursor: 'pointer',
                  }}
                >
                  <MoreHorizontal size={22} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Button: Get Started (Matching Image 2) */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 12,
          background: 'linear-gradient(180deg, transparent 0%, var(--bg-surface-1) 30%)',
        }}
      >
        <button
          onClick={() => onGetStarted(exercisesList)}
          style={{
            backgroundColor: 'var(--color-blue)',
            color: '#fff',
            fontSize: '1.15rem',
            fontWeight: 800,
            padding: '16px',
            borderRadius: 18,
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            boxShadow: '0 4px 20px rgba(110, 124, 245, 0.4)',
            transition: 'transform 150ms ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          התחל אימון
        </button>
      </div>

      {/* Exercise Options Sheet (•••) */}
      {activeMenuIndex !== null && (
        <div className="modal-overlay" onClick={() => setActiveMenuIndex(null)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 14 }}>
              אפשרויות עבור: {exerciseMap.get(exercisesList[activeMenuIndex]?.exerciseId)?.nameHe}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '12px 16px', fontSize: '0.95rem' }}
                onClick={() => {
                  const ex = exerciseMap.get(exercisesList[activeMenuIndex].exerciseId);
                  if (ex) {
                    setSwapModalExercise({ exercise: ex, index: activeMenuIndex });
                  }
                }}
              >
                <Shuffle size={18} color="var(--color-blue)" />
                החלף תרגיל
              </button>

              {exercisesList[activeMenuIndex]?.supersetGroupId && (
                <button
                  className="btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '12px 16px', fontSize: '0.95rem', color: 'var(--color-blue)' }}
                  onClick={() => {
                    const updated = [...exercisesList];
                    updated[activeMenuIndex] = { ...updated[activeMenuIndex], supersetGroupId: undefined };
                    setExercisesList(updated);
                    setActiveMenuIndex(null);
                  }}
                >
                  <Unlink2 size={18} />
                  בטל חיבור סופרסט מתרגיל זה
                </button>
              )}

              <button
                className="btn-secondary"
                style={{ justifyContent: 'flex-start', padding: '12px 16px', fontSize: '0.95rem', color: 'var(--color-red)' }}
                onClick={() => removeExercise(activeMenuIndex)}
              >
                <Trash2 size={18} />
                הסר תרגיל
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Swap Modal */}
      {swapModalExercise && (
        <ExerciseSwapModal
          isOpen={true}
          currentExercise={swapModalExercise.exercise}
          allExercises={allExercises}
          onClose={() => setSwapModalExercise(null)}
          onSelectSwap={handleSwapExercise}
        />
      )}
    </div>
  );
};
