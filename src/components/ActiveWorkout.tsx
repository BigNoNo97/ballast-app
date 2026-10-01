import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Shuffle,
  Check,
  Timer,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  CheckCircle2,
  Sparkles,
  ArrowUpDown,
  X,
  GripVertical,
  Link2,
  Unlink2,
  FileText,
  Pause,
  Play,
} from 'lucide-react';
import {
  WorkoutSession,
  WorkoutExercise,
  WorkoutSet,
  Exercise,
  SetType,
  PersonalRecord,
} from '../types';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '../data/exercises';
import { StorageService, calculateEstimated1RM } from '../services/storage';
import { getExerciseState } from '../services/progressionEngine';
import { getWeightIncrement } from '../data/exerciseClassification';
import { ExerciseSwapModal } from './ExerciseSwapModal';
import { RestTimerModal } from './RestTimerModal';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { triggerHaptic } from '../services/sound';

// גודל (בפיקסלים) של כפתור המחיקה שנחשף בסלייד על שורת תרגיל, וסף הגרירה להשארתו פתוח
const SWIPE_DELETE_WIDTH = 84;
const SWIPE_OPEN_THRESHOLD = 40;

const computeElapsedSec = (w: WorkoutSession, now: number = Date.now()): number => {
  const start = w.startTime || now;
  const end = w.pausedAt ?? now;
  return Math.max(0, Math.floor((end - start - (w.pausedTotalMs || 0)) / 1000));
};

// התווית "קודם: X" יושבת בתוך התיבה (absolute) כדי שהופעתה לא תשנה את גובה השורה.
// הריפוד העליון המוגדל קבוע לכל התיבות, כך שהמספר לא קופץ כשהתווית מופיעה/נעלמת.
const setInputStyle: React.CSSProperties = { paddingTop: 12, paddingBottom: 4 };

// לחיצה על תיבה מסמנת את כל המספר, כך שהקלדה מחליפה אותו מיד. ב-iOS הנגיעה עצמה ממקמת
// סמן אחרי ה-focus ומבטלת את הסימון, לכן מסמנים שוב רגע אחרי שהנגיעה הסתיימה.
const selectAllOnFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget;
  el.select();
  setTimeout(() => {
    if (document.activeElement === el) el.select();
  }, 50);
};
const setInputHintStyle: React.CSSProperties = {
  position: 'absolute',
  top: 3,
  insetInline: 0,
  fontSize: '0.55rem',
  lineHeight: 1,
  color: 'var(--text-dim)',
  textAlign: 'center',
  pointerEvents: 'none',
};

interface ActiveWorkoutProps {
  workout: WorkoutSession;
  allExercises: Exercise[];
  onUpdateWorkout: (updated: WorkoutSession) => void;
  onFinishWorkout: (finished: WorkoutSession) => void;
  onCancelWorkout: () => void;
  onAddExerciseClick: () => void;
  defaultRestSec?: number;
  autoRestTimerEnabled?: boolean;
  onDisableAutoTimer?: () => void;
  onOpenExerciseProfile?: (exerciseId: string) => void;
}

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  workout,
  allExercises,
  onUpdateWorkout,
  onFinishWorkout,
  onCancelWorkout,
  onAddExerciseClick,
  defaultRestSec = 90,
  autoRestTimerEnabled = true,
  onDisableAutoTimer,
  onOpenExerciseProfile,
}) => {
  const [elapsedSec, setElapsedSec] = useState(() => computeElapsedSec(workout));
  const isTimerPaused = workout.pausedAt != null;
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [showOverviewSheet, setShowOverviewSheet] = useState(false);
  const [isReorderingMidWorkout, setIsReorderingMidWorkout] = useState(false);
  const [isSupersetModeMidWorkout, setIsSupersetModeMidWorkout] = useState(false);
  const [selectedForSuperset, setSelectedForSuperset] = useState<number[]>([]);

  // Drag and Drop state for Mid-Workout reordering
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const activeTouchIndex = useRef<number | null>(null);

  const [swapModalExercise, setSwapModalExercise] = useState<{
    exercise: Exercise;
    index: number;
  } | null>(null);

  const [restTimerState, setRestTimerState] = useState<{
    isOpen: boolean;
    seconds: number;
  }>({
    isOpen: false,
    seconds: defaultRestSec,
  });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // הצעת "קל מדי" בזמן אמת (בלי RPE) - מוצגת אחרי שסימנו סט ✓ עם חריגה בולטת מהמטרה/מהעבר
  const [easyNudge, setEasyNudge] = useState<{ exerciseIndex: number; exerciseName: string; suggestedWeight: number } | null>(null);
  useEffect(() => {
    setEasyNudge(null);
  }, [currentExerciseIndex]);

  // הסרת תרגיל מהאימון הנוכחי (לא ממאגר התרגילים)
  const [removeExerciseIdx, setRemoveExerciseIdx] = useState<number | null>(null);

  // סלייד-למחיקה על שורת תרגיל ברשימת הסקירה
  const [openSwipeIdx, setOpenSwipeIdx] = useState<number | null>(null);
  const [swipeState, setSwipeState] = useState<{ idx: number; startX: number; baseX: number; deltaX: number } | null>(
    null
  );
  const suppressRowClickRef = useRef(false);

  // Exercise map for fast lookup
  const exerciseMap = new Map<string, Exercise>();
  allExercises.forEach((e) => exerciseMap.set(e.id, e));

  // כשמוסיפים תרגיל חדש באמצע האימון, המסך צריך לעבור להציג אותו - לא להישאר על התרגיל הקודם
  const prevExerciseCount = useRef(workout.exercises.length);
  useEffect(() => {
    if (workout.exercises.length > prevExerciseCount.current) {
      setCurrentExerciseIndex(workout.exercises.length - 1);
    }
    prevExerciseCount.current = workout.exercises.length;
  }, [workout.exercises.length]);

  // Elapsed workout timer
  useEffect(() => {
    const tick = () => setElapsedSec(computeElapsedSec(workout));
    tick();
    if (workout.pausedAt != null) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.startTime, workout.pausedAt, workout.pausedTotalMs]);

  const handleToggleTimerPause = () => {
    const now = Date.now();
    if (workout.pausedAt != null) {
      onUpdateWorkout({
        ...workout,
        pausedAt: undefined,
        pausedTotalMs: (workout.pausedTotalMs || 0) + (now - workout.pausedAt),
      });
    } else {
      onUpdateWorkout({ ...workout, pausedAt: now, durationSec: computeElapsedSec(workout, now) });
    }
    triggerHaptic(30);
  };

  // Format Elapsed Time (hh:mm:ss or mm:ss)
  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  // Update a specific set
  const handleUpdateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: keyof WorkoutSet,
    value: any
  ) => {
    const updatedExercises = [...workout.exercises];
    const exercise = updatedExercises[exerciseIndex];
    // עדכון מהיר: שינוי משקל/חזרות בסט אחד מחיל את אותו ערך על הסטים *שאחריו* באותו תרגיל
    // שעדיין לא הושלמו - אף פעם לא על סטים קודמים, בלי לסמן אותם ✓, ובלי לגעת בסטים שכבר אושרו.
    const isCascadeField = field === 'weightKg' || field === 'reps';
    const updatedSets = exercise.sets.map((s, idx) => {
      if (idx === setIndex) {
        // עריכה ישירה של המשתמש על השדה הזה - מבטלת את תזכורת "עודכן אוטומטית" שלו,
        // כי מעכשיו זה הערך שהמשתמש עצמו בחר, לא הצעה של המערכת.
        if (field === 'weightKg') return { ...s, weightKg: value, autoFilledFromWeight: undefined };
        if (field === 'reps') return { ...s, reps: value, autoFilledFromReps: undefined };
        return { ...s, [field]: value };
      }
      if (isCascadeField && idx > setIndex && !s.completed && s[field] !== value) {
        const prevKey = field === 'weightKg' ? 'autoFilledFromWeight' : 'autoFilledFromReps';
        // שומרים את הערך שהיה לפני תחילת העריכה, לא את זה של ההקשה הקודמת -
        // אחרת הקלדת "12" משאירה "קודם: 1". ואם חזרנו בדיוק לערך המקורי, אין מה להציג.
        const original = s[prevKey] ?? s[field];
        return { ...s, [field]: value, [prevKey]: original === value ? undefined : original };
      }
      return s;
    });
    updatedExercises[exerciseIndex] = { ...exercise, sets: updatedSets };

    const updated = {
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    };
    onUpdateWorkout(updated);
  };

  // Update exercise notes (persisted across all workouts for this exercise ID)
  const handleUpdateExerciseNotes = (exerciseIndex: number, notes: string) => {
    const targetEx = workout.exercises[exerciseIndex];
    if (targetEx) {
      StorageService.saveNoteForExercise(targetEx.exerciseId, notes);
    }
    const updatedExercises = [...workout.exercises];
    updatedExercises[exerciseIndex] = {
      ...updatedExercises[exerciseIndex],
      notes,
    };
    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });
  };

  // Check if all sets for a given exercise are completed
  const isExerciseFullyCompleted = (ex: WorkoutExercise) => {
    return ex.sets.length > 0 && ex.sets.every((s) => s.completed);
  };

  // Toggle set completion and trigger Superset auto-switch + rest timer
  const handleToggleSetComplete = (exerciseIndex: number, setIndex: number) => {
    const targetEx = workout.exercises[exerciseIndex];
    const set = targetEx.sets[setIndex];
    const newCompleted = !set.completed;

    // Clone exercises (עמוק - לא רק המערך החיצוני, אחרת updatedExercises[exerciseIndex] היה
    // עדיין אותו רפרנס בדיוק ל-workout.exercises[exerciseIndex] ומוטציה עליו הייתה פוגעת גם ב-state הקודם)
    const updatedExercises = workout.exercises.map((ex, idx) => {
      if (idx !== exerciseIndex) return ex;
      const updatedSets = ex.sets.map((s, sIdx) =>
        sIdx === setIndex ? { ...s, completed: newCompleted, completedAt: newCompleted ? Date.now() : undefined } : s
      );
      return { ...ex, sets: updatedSets };
    });

    const updated = {
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    };
    onUpdateWorkout(updated);

    if (newCompleted) {
      triggerHaptic(50);
      const exId = targetEx.exerciseId;
      const exData = exerciseMap.get(exId);
      const restTime = exData?.defaultRestSec || defaultRestSec;

      // זיהוי "קל מדי" בזמן אמת בלי RPE - שני אותות אובייקטיביים: הגעה לתקרת טווח החזרות
      // המתוכנן (לתוכניות שהמערכת בנתה, מדויק) או שיפור בולט לעומת האימון הקודם על התרגיל
      // הזה (עובד לכל תוכנית, כולל תוכניות ידניות, כי לא תלוי ב-state של מנוע ההתקדמות).
      if (exData && !exData.isWarmup && !easyNudge) {
        const progressState = workout.routineId ? getExerciseState(workout.routineId, exId) : null;
        const hitCeiling = !!progressState && set.reps >= progressState.repRangeMax;
        const beatHistory = set.previousReps != null && set.reps >= set.previousReps + 3;
        if (hitCeiling || beatHistory) {
          const currentWeight = set.weightKg || progressState?.currentWeightKg || 0;
          const increment = getWeightIncrement(exData.muscle);
          setEasyNudge({
            exerciseIndex,
            exerciseName: exData.nameHe,
            suggestedWeight: Math.round((currentWeight + increment) * 4) / 4,
          });
        }
      }

      // Check if this exercise is part of a SUPERSET
      const supersetGroupId = targetEx.supersetGroupId;

      if (supersetGroupId) {
        // Find partner exercises in this superset group
        const groupExerciseIndices = updatedExercises
          .map((ex, idx) => ({ ex, idx }))
          .filter((item) => item.ex.supersetGroupId === supersetGroupId);

        // Find the next partner exercise that has an incomplete set for this round or overall
        const currentExCompletedCount = updatedExercises[exerciseIndex].sets.filter((s) => s.completed).length;

        // Look for a partner exercise whose completed count is less than currentExCompletedCount
        let nextPartner = groupExerciseIndices.find(
          (item) =>
            item.idx !== exerciseIndex &&
            item.ex.sets.filter((s) => s.completed).length < currentExCompletedCount &&
            !isExerciseFullyCompleted(item.ex)
        );

        // If none found with less count, look for next partner in cyclic order that is not yet fully completed
        if (!nextPartner) {
          const currentPosInGroup = groupExerciseIndices.findIndex((item) => item.idx === exerciseIndex);
          for (let i = 1; i <= groupExerciseIndices.length; i++) {
            const nextIdxInGroup = (currentPosInGroup + i) % groupExerciseIndices.length;
            const candidate = groupExerciseIndices[nextIdxInGroup];
            if (!isExerciseFullyCompleted(candidate.ex)) {
              nextPartner = candidate;
              break;
            }
          }
        }

        if (nextPartner && nextPartner.idx !== exerciseIndex) {
          // Switch to partner exercise in the superset!
          setTimeout(() => {
            setCurrentExerciseIndex(nextPartner!.idx);
            triggerHaptic([60, 60]);
          }, 500);

          // Rest timer between superset rounds if completed full circuit
          const allInGroupSameCount = groupExerciseIndices.every(
            (item) => item.ex.sets.filter((s) => s.completed).length === currentExCompletedCount
          );

          if (allInGroupSameCount && autoRestTimerEnabled) {
            setRestTimerState({
              isOpen: true,
              seconds: restTime,
            });
          }
          return;
        }

        // If all exercises in the superset group are now fully done
        const allGroupDone = groupExerciseIndices.every((item) => isExerciseFullyCompleted(item.ex));
        if (allGroupDone) {
          // Advance to the next exercise after this superset group
          const maxGroupIndex = Math.max(...groupExerciseIndices.map((item) => item.idx));
          if (maxGroupIndex < workout.exercises.length - 1) {
            setTimeout(() => {
              setCurrentExerciseIndex(maxGroupIndex + 1);
              triggerHaptic([60, 40, 80]);
            }, 600);
          }
          if (autoRestTimerEnabled) {
            setRestTimerState({
              isOpen: true,
              seconds: restTime,
            });
          }
          return;
        }
      }

      // Standard (Non-superset) behavior
      if (autoRestTimerEnabled) {
        setRestTimerState({
          isOpen: true,
          seconds: restTime,
        });
      }

      // Check if all sets in this single exercise are now completed
      const allDone = updatedExercises[exerciseIndex].sets.every((s) => s.completed);
      if (allDone) {
        if (exerciseIndex < workout.exercises.length - 1) {
          setTimeout(() => {
            setCurrentExerciseIndex(exerciseIndex + 1);
            triggerHaptic([60, 40, 80]);
          }, 600);
        }
      }
    }
  };

  // מפעיל את הצעת "קל מדי" - מעדכן את המשקל בכל הסטים שעדיין לא הושלמו באותו תרגיל,
  // בלי לסמן אותם ✓ בעצמו (בדיוק כמו עדכון-קבוצתי רגיל, רק עם ערך מוצע מוכן מראש).
  const applyEasyNudge = () => {
    if (!easyNudge) return;
    const updatedExercises = [...workout.exercises];
    const exercise = updatedExercises[easyNudge.exerciseIndex];
    const updatedSets = exercise.sets.map((s) =>
      s.completed || s.weightKg === easyNudge.suggestedWeight
        ? s
        : { ...s, weightKg: easyNudge.suggestedWeight, autoFilledFromWeight: s.weightKg }
    );
    updatedExercises[easyNudge.exerciseIndex] = { ...exercise, sets: updatedSets };
    onUpdateWorkout({ ...workout, durationSec: elapsedSec, exercises: updatedExercises });
    triggerHaptic(50);
    setEasyNudge(null);
  };

  // Add a new set to an exercise
  const handleAddSet = (exerciseIndex: number) => {
    const currentSets = workout.exercises[exerciseIndex].sets;
    const lastSet = currentSets[currentSets.length - 1];

    const newSet: WorkoutSet = {
      id: `set-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      setNumber: currentSets.length + 1,
      type: 'normal',
      weightKg: lastSet ? lastSet.weightKg : 20,
      reps: lastSet ? lastSet.reps : 10,
      completed: false,
      previousWeight: lastSet?.previousWeight,
      previousReps: lastSet?.previousReps,
    };

    const updatedExercises = workout.exercises.map((ex, idx) =>
      idx === exerciseIndex ? { ...ex, sets: [...ex.sets, newSet] } : ex
    );
    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });
  };

  // Remove a set
  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    const updatedExercises = workout.exercises.map((ex, idx) => {
      if (idx !== exerciseIndex) return ex;
      const remainingSets = ex.sets
        .filter((_, sIdx) => sIdx !== setIndex)
        .map((s, i) => ({ ...s, setNumber: i + 1 }));
      return { ...ex, sets: remainingSets };
    });

    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });
  };

  // Reorder exercises by Drag and Drop
  const handleReorderExercises = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    const updatedExercises = [...workout.exercises];
    const item = updatedExercises.splice(fromIndex, 1)[0];
    updatedExercises.splice(toIndex, 0, item);

    // Track active exercise index position
    if (currentExerciseIndex === fromIndex) {
      setCurrentExerciseIndex(toIndex);
    } else if (fromIndex < currentExerciseIndex && toIndex >= currentExerciseIndex) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
    } else if (fromIndex > currentExerciseIndex && toIndex <= currentExerciseIndex) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
    }

    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });
    triggerHaptic(40);
  };

  // הסרת תרגיל מהאימון הנוכחי בלבד - התרגיל עצמו נשאר במאגר התרגילים
  const handleRemoveExercise = (index: number) => {
    if (index < 0 || index >= workout.exercises.length) return;

    let updatedExercises = workout.exercises.filter((_, i) => i !== index);

    // אם ההסרה משאירה שותף סופרסט בודד - מנתקים אותו כי אין יותר עם מה לחבר
    const groupCounts = new Map<string, number>();
    updatedExercises.forEach((ex) => {
      if (ex.supersetGroupId) groupCounts.set(ex.supersetGroupId, (groupCounts.get(ex.supersetGroupId) || 0) + 1);
    });
    updatedExercises = updatedExercises.map((ex) =>
      ex.supersetGroupId && (groupCounts.get(ex.supersetGroupId) || 0) < 2
        ? { ...ex, supersetGroupId: undefined }
        : ex
    );

    setCurrentExerciseIndex((prev) => {
      if (updatedExercises.length === 0) return 0;
      if (index < prev) return prev - 1;
      if (index === prev) return Math.min(prev, updatedExercises.length - 1);
      return prev;
    });

    setOpenSwipeIdx(null);
    setSwipeState(null);
    triggerHaptic([40, 30, 60]);

    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });
  };

  // סלייד-למחיקה: כפתור המחיקה יושב בקצה השמאלי של השורה, ולכן גוררים ימינה כדי לחשוף אותו
  // (בדיוק כמו שקורה בממשקי RTL סטנדרטיים - מזיזים את תוכן השורה בכיוון הגרירה, וזה חושף את מה שמתחתיו בצד השני)
  const handleSwipePointerDown = (idx: number, clientX: number) => {
    if (isReorderingMidWorkout || isSupersetModeMidWorkout) return;
    suppressRowClickRef.current = false;
    const baseX = openSwipeIdx === idx ? SWIPE_DELETE_WIDTH : 0;
    setSwipeState({ idx, startX: clientX, baseX, deltaX: baseX });
  };

  const handleSwipePointerMove = (clientX: number) => {
    setSwipeState((prev) => {
      if (!prev) return prev;
      const raw = prev.baseX + (clientX - prev.startX);
      const next = Math.max(0, Math.min(SWIPE_DELETE_WIDTH, raw));
      if (Math.abs(next - prev.baseX) > 6) suppressRowClickRef.current = true;
      return { ...prev, deltaX: next };
    });
  };

  const handleSwipePointerUp = () => {
    setSwipeState((prev) => {
      if (!prev) return null;
      const shouldOpen = prev.deltaX > SWIPE_OPEN_THRESHOLD;
      setOpenSwipeIdx(shouldOpen ? prev.idx : null);
      return null;
    });
  };

  const closeOverviewSheet = () => {
    setShowOverviewSheet(false);
    setOpenSwipeIdx(null);
    setSwipeState(null);
  };

  // Touch Handlers for mobile sheet
  const onTouchStart = (idx: number) => {
    activeTouchIndex.current = idx;
    setDraggedIdx(idx);
    triggerHaptic(30);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (activeTouchIndex.current === null) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemElement = targetElement?.closest('[data-overview-idx]');
    if (itemElement) {
      const overIndex = parseInt(itemElement.getAttribute('data-overview-idx') || '-1', 10);
      if (overIndex >= 0 && overIndex !== dragOverIdx) {
        setDragOverIdx(overIndex);
      }
    }
  };

  const onTouchEnd = () => {
    if (activeTouchIndex.current !== null && dragOverIdx !== null && activeTouchIndex.current !== dragOverIdx) {
      handleReorderExercises(activeTouchIndex.current, dragOverIdx);
    }
    activeTouchIndex.current = null;
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Toggle selection for Superset in overview sheet
  const toggleSelectForSuperset = (index: number) => {
    triggerHaptic(30);
    if (selectedForSuperset.includes(index)) {
      setSelectedForSuperset(selectedForSuperset.filter((i) => i !== index));
    } else {
      setSelectedForSuperset([...selectedForSuperset, index]);
    }
  };

  // Apply or Remove Superset mid-workout
  const handleApplySupersetMidWorkout = () => {
    if (selectedForSuperset.length < 2) return;

    const updated = [...workout.exercises];
    const existingGroupId = updated[selectedForSuperset[0]].supersetGroupId;
    const allInSameGroup =
      existingGroupId && selectedForSuperset.every((idx) => updated[idx].supersetGroupId === existingGroupId);

    if (allInSameGroup) {
      selectedForSuperset.forEach((idx) => {
        updated[idx] = { ...updated[idx], supersetGroupId: undefined };
      });
    } else {
      const newGroupId = `ss-${Date.now()}`;
      selectedForSuperset.forEach((idx) => {
        updated[idx] = { ...updated[idx], supersetGroupId: newGroupId };
      });
    }

    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updated,
    });
    setSelectedForSuperset([]);
    setIsSupersetModeMidWorkout(false);
    triggerHaptic([50, 50, 100]);
  };

  // Perform Smart Swap of an exercise
  const handleSwapExercise = (newExercise: Exercise) => {
    if (!swapModalExercise) return;
    const idx = swapModalExercise.index;
    const oldExId = swapModalExercise.exercise.id;

    const newExPerf = StorageService.getLastExercisePerformance(newExercise.id);
    const newExNote = StorageService.getNoteForExercise(newExercise.id);
    const updatedExercises = [...workout.exercises];
    const targetSetsCount =
      newExPerf && newExPerf.sets && newExPerf.sets.length > 0
        ? newExPerf.sets.length
        : updatedExercises[idx].sets.length || newExercise.defaultSets || 3;

    const currentExerciseSets: WorkoutSet[] = Array.from({ length: targetSetsCount }).map((_, setIdx) => {
      const setPerf = newExPerf?.sets[setIdx] || newExPerf?.sets[0];
      return {
        id: `set-${Date.now()}-${setIdx}-${Math.random().toString(36).substr(2, 4)}`,
        setNumber: setIdx + 1,
        type: 'normal' as const,
        weightKg: setPerf ? setPerf.weightKg : (newExPerf ? newExPerf.bestWeight : 0),
        reps: setPerf ? setPerf.reps : (newExPerf ? newExPerf.bestReps : newExercise.defaultReps || 10),
        completed: false, // Reset completed status when swapping
        completedAt: undefined,
        previousWeight: newExPerf ? newExPerf.bestWeight : undefined,
        previousReps: newExPerf ? newExPerf.bestReps : undefined,
      };
    });

    updatedExercises[idx] = {
      ...updatedExercises[idx],
      exerciseId: newExercise.id,
      swappedFromId: oldExId,
      notes: newExNote || '', // Switch note to new exercise's note (or blank if none)
      sets: currentExerciseSets,
    };

    onUpdateWorkout({
      ...workout,
      durationSec: elapsedSec,
      exercises: updatedExercises,
    });

    setSwapModalExercise(null);
    triggerHaptic(60);
  };

  // Finish and compute workout summary
  const handleFinish = () => {
    let totalVolume = 0;
    let completedSets = 0;
    const newPRs: PersonalRecord[] = [];

    const existingPRs = StorageService.getPersonalRecords();

    workout.exercises.forEach((ex) => {
      const exData = exerciseMap.get(ex.exerciseId);
      const exName = exData?.nameHe || 'תרגיל';

      // מספר הסטים שהמשתמש בפועל סימן כהושלמו - כולל סטים במשקל גוף (0 ק"ג), לא רק סטים שתורמים לנפח/שיא
      completedSets += ex.sets.filter((s) => s.completed).length;

      const completedSetsInEx = ex.sets.filter((s) => s.completed && s.weightKg > 0 && s.reps > 0);

      if (completedSetsInEx.length > 0) {
        let exerciseVolume = 0;
        let exerciseTotalWeight = 0;
        let exerciseTotalReps = 0;
        let exerciseMaxWeight = 0;
        let exerciseRepsAtMax = 0;
        let exerciseBest1RM = 0;

        completedSetsInEx.forEach((s) => {
          exerciseVolume += s.weightKg * s.reps;
          exerciseTotalWeight += s.weightKg;
          exerciseTotalReps += s.reps;

          const e1rm = calculateEstimated1RM(s.weightKg, s.reps);
          if (s.weightKg > exerciseMaxWeight) {
            exerciseMaxWeight = s.weightKg;
            exerciseRepsAtMax = s.reps;
          }
          if (e1rm > exerciseBest1RM) {
            exerciseBest1RM = e1rm;
          }
        });

        totalVolume += exerciseVolume;

        const currentPr = existingPRs[ex.exerciseId];
        if (!currentPr || exerciseMaxWeight > currentPr.maxWeight || exerciseBest1RM > currentPr.estimated1RM) {
          newPRs.push({
            exerciseId: ex.exerciseId,
            exerciseNameHe: exName,
            maxWeight: exerciseMaxWeight,
            repsAtMaxWeight: exerciseRepsAtMax,
            totalExerciseWeight: exerciseTotalWeight,
            totalExerciseReps: exerciseTotalReps,
            totalSetsCount: completedSetsInEx.length,
            estimated1RM: exerciseBest1RM,
            date: Date.now(),
            workoutId: workout.id,
            isNew: true,
          });
        }
      }
    });

    const finishedSession: WorkoutSession = {
      ...workout,
      endTime: Date.now(),
      durationSec: elapsedSec,
      isCompleted: true,
      totalVolumeKg: totalVolume,
      completedSetsCount: completedSets,
      newPRs,
    };

    onFinishWorkout(finishedSession);
  };

  // Guard if no exercises
  if (workout.exercises.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'calc(var(--safe-top) + 8px) 6px 8px 6px',
          }}
        >
          <button
            onClick={onCancelWorkout}
            aria-label="ביטול אימון"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              cursor: 'pointer',
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={24} />
          </button>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{workout.title}</h2>
          <div style={{ width: 44 }} />
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 14 }}>אין תרגילים באימון זה.</p>
          <button className="btn-primary" onClick={onAddExerciseClick}>
            <Plus size={18} />
            הוסף תרגיל
          </button>
        </div>
      </div>
    );
  }

  // Safe current index
  const safeCurrentIndex = Math.min(currentExerciseIndex, workout.exercises.length - 1);
  const currentWorkoutEx = workout.exercises[safeCurrentIndex];
  const currentExData = exerciseMap.get(currentWorkoutEx?.exerciseId);

  const completedExercisesCount = workout.exercises.filter((e) => isExerciseFullyCompleted(e)).length;

  // הסט ה"פתוח" = הסט הראשון שלא סומן בתרגיל הנוכחי - עליו פועל הכפתור הגדול "סמן כבוצע".
  // המעבר לסט הבא הוא טבעי (הסט שאחריו הופך לפתוח), והמעבר לתרגיל הבא כשהתרגיל
  // הושלם כבר קורה בתוך handleToggleSetComplete (כולל סופרסטים).
  const currentOpenSetIdx = currentWorkoutEx ? currentWorkoutEx.sets.findIndex((s) => !s.completed) : -1;
  const nextIncompleteExerciseIdx = (() => {
    const n = workout.exercises.length;
    for (let i = 1; i < n; i++) {
      const idx = (safeCurrentIndex + i) % n;
      if (workout.exercises[idx].sets.some((s) => !s.completed)) return idx;
    }
    return -1;
  })();
  const primaryAction: { label: string; onClick: () => void } =
    currentOpenSetIdx !== -1
      ? {
          label: `סמן סט ${currentWorkoutEx.sets[currentOpenSetIdx].setNumber} כבוצע`,
          onClick: () => handleToggleSetComplete(safeCurrentIndex, currentOpenSetIdx),
        }
      : nextIncompleteExerciseIdx !== -1
        ? { label: 'לתרגיל הבא שלא הושלם', onClick: () => setCurrentExerciseIndex(nextIncompleteExerciseIdx) }
        : { label: 'כל הסטים הושלמו - סיים אימון', onClick: () => handleFinish() };

  // Superset partner lookup for current exercise
  const currentSupersetGroupId = currentWorkoutEx?.supersetGroupId;
  const supersetPartnerExercises = currentSupersetGroupId
    ? workout.exercises
        .map((ex, idx) => ({ ex, idx }))
        .filter((item) => item.ex.supersetGroupId === currentSupersetGroupId && item.idx !== safeCurrentIndex)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Header Bar */}
      <div
        style={{
          background: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(20px)',
          padding: 'calc(var(--safe-top) + 12px) 16px 8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: currentSupersetGroupId ? 'var(--color-blue)' : 'var(--color-blue)',
                display: 'inline-block',
                boxShadow: currentSupersetGroupId ? '0 0 8px var(--color-blue)' : '0 0 8px var(--color-blue)',
              }}
            />
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                color: currentSupersetGroupId ? 'var(--color-blue)' : 'var(--color-blue)',
              }}
            >
              {currentSupersetGroupId ? 'סופרסט • ' : ''}תרגיל {safeCurrentIndex + 1} מתוך {workout.exercises.length}
            </span>
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{workout.title}</h2>
        </div>

        {/* Live Timer & Overview Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setShowOverviewSheet(true)}
            style={{
              background: 'var(--bg-surface-3)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="רשימת כל התרגילים ושינוי סדר"
          >
            <ListOrdered size={15} color="var(--color-blue)" />
            <span>רשימה ({workout.exercises.length})</span>
          </button>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Clock size={13} color="var(--text-muted)" />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                fontSize: '0.85rem',
                color: isTimerPaused ? 'var(--color-orange)' : undefined,
              }}
            >
              {formatTime(elapsedSec)}
            </span>
            <button
              onClick={handleToggleTimerPause}
              title={isTimerPaused ? 'המשך שעון' : 'השהה שעון'}
              aria-label={isTimerPaused ? 'המשך שעון' : 'השהה שעון'}
              style={{
                width: 24,
                height: 24,
                marginInlineStart: 2,
                borderRadius: '50%',
                border: 'none',
                background: isTimerPaused ? 'var(--color-blue)' : 'var(--bg-surface-3)',
                color: isTimerPaused ? '#fff' : 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {isTimerPaused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
            </button>
          </div>
        </div>
      </div>

      {/* Progress Dots Bar (Exercise 1..N) */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 16px',
          overflowX: 'auto',
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid var(--border-subtle)',
          scrollbarWidth: 'none',
        }}
      >
        {workout.exercises.map((exItem, idx) => {
          const isDone = isExerciseFullyCompleted(exItem);
          const isCurrent = idx === safeCurrentIndex;
          const exInfo = exerciseMap.get(exItem.exerciseId);
          const isItemSuperset = Boolean(exItem.supersetGroupId);

          return (
            <button
              key={idx}
              onClick={() => setCurrentExerciseIndex(idx)}
              style={{
                flex: '0 0 auto',
                padding: '5px 10px',
                borderRadius: 10,
                border: isCurrent
                  ? isItemSuperset
                    ? '1.5px solid var(--color-blue)'
                    : '1.5px solid var(--color-blue)'
                  : '1px solid var(--border-subtle)',
                background: isCurrent
                  ? isItemSuperset
                    ? 'rgba(110, 124, 245, 0.2)'
                    : 'rgba(110, 124, 245, 0.15)'
                  : isDone
                  ? 'rgba(47, 217, 180, 0.12)'
                  : 'var(--bg-surface-2)',
                color: isCurrent
                  ? isItemSuperset
                    ? 'var(--color-blue)'
                    : 'var(--color-blue)'
                  : isDone
                  ? 'var(--color-green)'
                  : 'var(--text-muted)',
                fontSize: '0.74rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
            >
              {isDone ? (
                <CheckCircle2 size={12} color="var(--color-green)" />
              ) : isItemSuperset ? (
                <Link2 size={11} color="var(--color-blue)" />
              ) : (
                <span>{idx + 1}.</span>
              )}
              <span>{exInfo?.nameHe.split(' ')[0] || `תרגיל ${idx + 1}`}</span>
            </button>
          );
        })}
      </div>

      {/* Main Single Focused Exercise Scrollable Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 100px 14px' }}>
        {/* Active Superset Info Notice Banner */}
        {currentSupersetGroupId && supersetPartnerExercises.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(110, 124, 245, 0.15), rgba(110, 124, 245, 0.05))',
              border: '1px solid rgba(110, 124, 245, 0.35)',
              borderRadius: 14,
              padding: '10px 14px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  background: 'var(--color-blue)',
                  borderRadius: 8,
                  padding: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Link2 size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  סופרסט פעיל 🔗
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  מעבר אוטומטי ל-
                  <strong style={{ color: 'var(--color-blue)' }}>
                    {exerciseMap.get(supersetPartnerExercises[0].ex.exerciseId)?.nameHe}
                  </strong>{' '}
                  בכל סיום סט!
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrentExerciseIndex(supersetPartnerExercises[0].idx)}
              style={{
                background: 'rgba(110, 124, 245, 0.2)',
                border: '1px solid rgba(110, 124, 245, 0.4)',
                color: 'var(--color-blue)',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              עבור אליו ›
            </button>
          </div>
        )}

        {currentExData && (
          <div className="ios-card" style={{ padding: '16px 14px', marginBottom: 16 }}>
            {/* Exercise Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <ExerciseThumbnail
                  exerciseId={currentExData.id}
                  muscle={currentExData.muscle}
                  nameEn={currentExData.nameEn}
                  image={currentExData.image}
                  size={58}
                  onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(currentExData.id) : undefined}
                />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span className="pill-badge pill-blue">
                      {MUSCLE_GROUP_LABELS[currentExData.muscle]?.he || currentExData.muscle}
                    </span>
                    <span className="pill-badge pill-gray">
                      {EQUIPMENT_LABELS[currentExData.equipment]?.he || currentExData.equipment}
                    </span>
                    {currentWorkoutEx.swappedFromId && (
                      <span className="pill-badge pill-orange">הוחלף באימון זה</span>
                    )}
                    {currentExData.isWarmup && <span className="pill-badge pill-orange">חימום</span>}
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {currentExData.nameHe}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-block' }}>
                    {currentExData.nameEn}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {/* Smart Swap Button */}
                <button
                  className="btn-swap-exercise"
                  onClick={() =>
                    setSwapModalExercise({
                      exercise: currentExData,
                      index: safeCurrentIndex,
                    })
                  }
                  title="מכשיר תפוס? לחץ להחלפת תרגיל"
                >
                  <Shuffle size={13} />
                  החלף תרגיל
                </button>

                {/* Remove From Current Workout Button */}
                <button
                  className="btn-remove-exercise"
                  onClick={() => setRemoveExerciseIdx(safeCurrentIndex)}
                  title="הסרת התרגיל מהאימון הנוכחי"
                >
                  <Trash2 size={13} />
                  הסר מהאימון
                </button>
              </div>
            </div>

            {/* הצעת "קל מדי" - לא חוסמת, רק לתרגיל שמוצג כרגע */}
            {easyNudge && easyNudge.exerciseIndex === safeCurrentIndex && (
              <div
                style={{
                  background: 'var(--color-blue-bg)',
                  border: '1px solid var(--color-blue)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: '0.85rem',
                  color: 'var(--text-main)',
                }}
              >
                <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
                  הסט הזה יצא קל - להעלות ל-{easyNudge.suggestedWeight} ק"ג בסטים הנותרים?
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={applyEasyNudge} className="btn-primary" style={{ flex: 1, padding: 8, fontSize: '0.82rem' }}>
                    כן, עדכן
                  </button>
                  <button onClick={() => setEasyNudge(null)} className="btn-secondary" style={{ flex: 1, padding: 8, fontSize: '0.82rem' }}>
                    לא
                  </button>
                </div>
              </div>
            )}

            {/* Exercise Notes Input Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '7px 10px',
                marginBottom: 14,
              }}
            >
              <FileText size={15} color="#8E95A5" style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={
                  currentWorkoutEx.notes !== undefined
                    ? currentWorkoutEx.notes
                    : StorageService.getNoteForExercise(currentExData.id)
                }
                onChange={(e) => handleUpdateExerciseNotes(safeCurrentIndex, e.target.value)}
                placeholder="הוסף הערות לתרגיל (למשל: כיוון מושב 4, אחיזה רחבה...)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                  width: '100%',
                  outline: 'none',
                }}
              />
            </div>

            {/* Sets Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 1fr 44px',
                gap: 8,
                fontSize: '0.74rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '0 6px 8px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div>סט</div>
              <div>משקל (ק״ג)</div>
              <div>חזרות</div>
              <div>✓</div>
            </div>

            {/* Sets List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {currentWorkoutEx.sets.map((s, setIdx) => (
                <div
                  key={s.id || setIdx}
                  className={`set-row ${s.completed ? 'completed' : ''} ${setIdx === currentOpenSetIdx ? 'current' : ''}`}
                  style={{ gridTemplateColumns: '36px 1fr 1fr 44px' }}
                >
                  {/* Set # */}
                  <div className="set-number-badge">{s.setNumber}</div>

                  {/* Weight Input */}
                  <div style={{ position: 'relative' }}>
                    {!!s.autoFilledFromWeight && (
                      <div style={setInputHintStyle}>קודם: {s.autoFilledFromWeight}</div>
                    )}
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="500"
                      inputMode="decimal"
                      className="gym-input-box"
                      style={setInputStyle}
                      onFocus={selectAllOnFocus}
                      value={s.weightKg === 0 ? '' : s.weightKg}
                      placeholder={s.previousWeight ? `${s.previousWeight}` : '0'}
                      onChange={(e) =>
                        handleUpdateSet(
                          safeCurrentIndex,
                          setIdx,
                          'weightKg',
                          Math.min(500, Math.max(0, parseFloat(e.target.value) || 0))
                        )
                      }
                    />
                  </div>

                  {/* Reps Input */}
                  <div style={{ position: 'relative' }}>
                    {!!s.autoFilledFromReps && (
                      <div style={setInputHintStyle}>קודם: {s.autoFilledFromReps}</div>
                    )}
                    <input
                      type="number"
                      min="0"
                      max="999"
                      inputMode="numeric"
                      className="gym-input-box"
                      style={setInputStyle}
                      onFocus={selectAllOnFocus}
                      value={s.reps === 0 ? '' : s.reps}
                      placeholder={s.previousReps ? `${s.previousReps}` : '0'}
                      onChange={(e) =>
                        handleUpdateSet(
                          safeCurrentIndex,
                          setIdx,
                          'reps',
                          Math.min(999, Math.max(0, parseInt(e.target.value, 10) || 0))
                        )
                      }
                    />
                  </div>

                  {/* Checkmark Button */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      className={`btn-check-set ${s.completed ? 'checked' : ''}`}
                      onClick={() => handleToggleSetComplete(safeCurrentIndex, setIdx)}
                      title="סמן כהושלם"
                    >
                      <Check size={18} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Set / Remove Set Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <button
                className="btn-secondary"
                style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                onClick={() => handleAddSet(safeCurrentIndex)}
              >
                <Plus size={14} />
                הוסף
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                {currentWorkoutEx.sets.length > 1 && (
                  <button
                    className="btn-secondary"
                    style={{
                      padding: '7px 10px',
                      fontSize: '0.78rem',
                      color: 'var(--color-red)',
                    }}
                    onClick={() => handleRemoveSet(safeCurrentIndex, currentWorkoutEx.sets.length - 1)}
                    title="הסר סט אחרון"
                  >
                    הסר
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step-by-Step Flow Navigation Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            className="btn-secondary"
            disabled={safeCurrentIndex === 0}
            onClick={() => setCurrentExerciseIndex(Math.max(0, safeCurrentIndex - 1))}
            style={{
              flex: 1,
              padding: '12px',
              opacity: safeCurrentIndex === 0 ? 0.4 : 1,
              cursor: safeCurrentIndex === 0 ? 'default' : 'pointer',
            }}
          >
            <ChevronRight size={16} />
            תרגיל קודם
          </button>

          {safeCurrentIndex < workout.exercises.length - 1 ? (
            <button
              onClick={() => setCurrentExerciseIndex(safeCurrentIndex + 1)}
              style={{
                flex: 1.5,
                background: isExerciseFullyCompleted(currentWorkoutEx) ? 'var(--color-blue)' : 'var(--bg-surface-2)',
                color: isExerciseFullyCompleted(currentWorkoutEx) ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 800,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
                boxShadow: isExerciseFullyCompleted(currentWorkoutEx) ? '0 4px 16px rgba(110, 124, 245, 0.3)' : 'none',
              }}
            >
              <span>לתרגיל הבא</span>
              <ChevronLeft size={16} />
            </button>
          ) : (
            <button
              onClick={() => setShowOverviewSheet(true)}
              style={{
                flex: 1.5,
                background: 'var(--bg-surface-3)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              סקירת כל התרגילים
            </button>
          )}
        </div>

        {/* Primary action (mark the open set done) + Finish/Cancel side by side */}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={primaryAction.onClick}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'transform 150ms ease',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {currentOpenSetIdx !== -1 && <Check size={20} strokeWidth={3} />}
            {primaryAction.label}
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1, padding: '12px', color: 'var(--color-blue)', fontWeight: 800 }}
              onClick={handleFinish}
            >
              סיים אימון
            </button>
            <button
              className="btn-secondary"
              style={{ flex: 1, padding: '12px', color: 'var(--color-red)', fontWeight: 700 }}
              onClick={() => setShowCancelConfirm(true)}
            >
              בטל אימון
            </button>
          </div>
        </div>
      </div>

      {/* Mid-Workout Overview & Reorder Sheet (≡ רשימת תרגילים) */}
      {showOverviewSheet && (
        <div className="modal-overlay" onClick={closeOverviewSheet}>
          <div
            className="action-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ height: 'calc(var(--app-vh, 1vh) * 88)', display: 'flex', flexDirection: 'column' }}
          >
            <div className="sheet-handle" />

            {/* Sheet Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>תרגילי האימון הנוכחי</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {completedExercisesCount} מתוך {workout.exercises.length} תרגילים הושלמו
                </p>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {/* Reorder Button */}
                <button
                  onClick={() => {
                    setIsReorderingMidWorkout(!isReorderingMidWorkout);
                    if (isSupersetModeMidWorkout) setIsSupersetModeMidWorkout(false);
                    setOpenSwipeIdx(null);
                    setSwipeState(null);
                    triggerHaptic(40);
                  }}
                  style={{
                    background: isReorderingMidWorkout ? 'var(--color-blue)' : 'var(--bg-surface-3)',
                    color: isReorderingMidWorkout ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
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
                  <ArrowUpDown size={13} />
                  {isReorderingMidWorkout ? 'סיים סידור ✓' : 'שנה סדר'}
                </button>

                {/* Superset Button */}
                <button
                  onClick={() => {
                    setIsSupersetModeMidWorkout(!isSupersetModeMidWorkout);
                    if (isReorderingMidWorkout) setIsReorderingMidWorkout(false);
                    setSelectedForSuperset([]);
                    setOpenSwipeIdx(null);
                    setSwipeState(null);
                    triggerHaptic(40);
                  }}
                  style={{
                    background: isSupersetModeMidWorkout ? 'var(--color-blue)' : 'var(--bg-surface-3)',
                    color: isSupersetModeMidWorkout ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
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
                  <Link2 size={13} />
                  {isSupersetModeMidWorkout ? 'ביטול' : 'סופרסט'}
                </button>

                <button
                  onClick={closeOverviewSheet}
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
            </div>

            {/* Superset Action Banner in Overview */}
            {isSupersetModeMidWorkout && (
              <div
                style={{
                  background: 'rgba(110, 124, 245, 0.12)',
                  border: '1px solid rgba(110, 124, 245, 0.3)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: '0.8rem', color: 'var(--color-blue)', fontWeight: 700 }}>
                  בחר 2 תרגילים לחיבור/פירוק סופרסט ({selectedForSuperset.length} נבחרו)
                </div>
                {selectedForSuperset.length >= 2 && (
                  <button
                    onClick={handleApplySupersetMidWorkout}
                    style={{
                      background: 'var(--color-blue)',
                      color: '#fff',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    קשר כסופרסט 🔗
                  </button>
                )}
              </div>
            )}

            {/* All Exercises List in Overview with Drag & Drop & Superset */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {workout.exercises.map((item, idx) => {
                const ex = exerciseMap.get(item.exerciseId);
                if (!ex) return null;

                const isDone = isExerciseFullyCompleted(item);
                const isCurrent = idx === safeCurrentIndex;
                const completedSetsCount = item.sets.filter((s) => s.completed).length;

                const isBeingDragged = draggedIdx === idx;
                const isDragTarget = dragOverIdx === idx && draggedIdx !== idx;
                const isSelectedSuperset = selectedForSuperset.includes(idx);
                const hasSuperset = Boolean(item.supersetGroupId);

                const swipeTranslate =
                  swipeState?.idx === idx ? swipeState.deltaX : openSwipeIdx === idx ? SWIPE_DELETE_WIDTH : 0;

                return (
                  <div key={item.exerciseId + '-' + idx} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
                    {/* פעולת מחיקה שנחשפת בסלייד - מוצגת בצד השמאלי הפיזי (הקצה שנחשף בגרירה שמאלה) */}
                    {/* מוצג רק כשהשורה בגרירה/פתוחה, כדי שלא "יבליח" מבעד לרקעים שקופים-חלקית של שורות מודגשות */}
                    {swipeTranslate !== 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveExerciseIdx(idx);
                      }}
                      title="מחיקת התרגיל מהאימון הנוכחי"
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: SWIPE_DELETE_WIDTH,
                        border: 'none',
                        background: 'var(--color-red)',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={18} />
                      מחק
                    </button>
                    )}

                    <div
                    data-overview-idx={idx}
                    draggable={isReorderingMidWorkout}
                    onDragStart={() => setDraggedIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDrop={() => {
                      if (draggedIdx !== null) handleReorderExercises(draggedIdx, idx);
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onPointerDown={(e) => {
                      if (isReorderingMidWorkout || isSupersetModeMidWorkout) return;
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      handleSwipePointerDown(idx, e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (swipeState?.idx === idx) handleSwipePointerMove(e.clientX);
                    }}
                    onPointerUp={() => {
                      if (swipeState?.idx === idx) handleSwipePointerUp();
                    }}
                    onPointerCancel={() => {
                      if (swipeState?.idx === idx) handleSwipePointerUp();
                    }}
                    onClick={() => {
                      if (suppressRowClickRef.current) {
                        suppressRowClickRef.current = false;
                        return;
                      }
                      if (openSwipeIdx === idx) {
                        setOpenSwipeIdx(null);
                        return;
                      }
                      if (isSupersetModeMidWorkout) {
                        toggleSelectForSuperset(idx);
                      } else if (!isReorderingMidWorkout) {
                        setCurrentExerciseIndex(idx);
                        closeOverviewSheet();
                      }
                    }}
                    style={{
                      background: isSelectedSuperset
                        ? 'rgba(110, 124, 245, 0.2)'
                        : isBeingDragged
                        ? 'rgba(110, 124, 245, 0.15)'
                        : isDragTarget
                        ? 'rgba(110, 124, 245, 0.08)'
                        : isCurrent
                        ? 'rgba(110, 124, 245, 0.12)'
                        : hasSuperset
                        ? 'rgba(110, 124, 245, 0.06)'
                        : 'var(--bg-surface-2)',
                      border: isSelectedSuperset
                        ? '1.5px solid var(--color-blue)'
                        : isDragTarget
                        ? '2px dashed var(--color-blue)'
                        : isBeingDragged
                        ? '1.5px solid var(--color-blue)'
                        : isCurrent
                        ? '1.5px solid var(--color-blue)'
                        : hasSuperset
                        ? '1px solid rgba(110, 124, 245, 0.3)'
                        : '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: isReorderingMidWorkout ? 'grab' : isSupersetModeMidWorkout ? 'pointer' : 'pointer',
                      opacity: isBeingDragged ? 0.6 : 1,
                      transform: isBeingDragged ? 'scale(1.02)' : `translateX(${swipeTranslate}px)`,
                      transition:
                        swipeState?.idx === idx
                          ? 'background-color 150ms ease'
                          : 'transform 200ms ease, background-color 150ms ease',
                      touchAction: 'pan-y',
                      position: 'relative',
                      zIndex: 1,
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      {isSupersetModeMidWorkout && (
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: isSelectedSuperset ? '2px solid var(--color-blue)' : '2px solid var(--border-strong)',
                            background: isSelectedSuperset ? 'var(--color-blue)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelectedSuperset && <Check size={14} color="#fff" strokeWidth={3} />}
                        </div>
                      )}

                      <ExerciseThumbnail
                        exerciseId={ex.id}
                        muscle={ex.muscle}
                        nameEn={ex.nameEn}
                        image={ex.image}
                        size={46}
                        onClick={onOpenExerciseProfile ? () => onOpenExerciseProfile(ex.id) : undefined}
                      />

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {isCurrent && <span className="pill-badge pill-blue">פעיל כעת ⚡</span>}
                          {isDone && <span className="pill-badge pill-green">✓ הושלם</span>}
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
                        <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: isCurrent ? 'var(--color-blue)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {idx + 1}. {ex.nameHe}
                          {ex.isWarmup && <span className="pill-badge pill-orange">חימום</span>}
                        </h4>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          {completedSetsCount}/{item.sets.length} סטים הושלמו</span>
                      </div>
                    </div>

                    {/* Drag Grip Handle or Swap Action */}
                    {isReorderingMidWorkout ? (
                      <div
                        onTouchStart={() => onTouchStart(idx)}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: 'var(--bg-surface-3)',
                          color: 'var(--color-blue)',
                          cursor: 'grab',
                          touchAction: 'none',
                        }}
                        title="גרור כדי להזיז"
                      >
                        <GripVertical size={22} />
                      </div>
                    ) : isSupersetModeMidWorkout ? null : (
                      <button
                        className="btn-swap-exercise"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSwapModalExercise({ exercise: ex, index: idx });
                        }}
                        style={{ padding: '5px 10px', fontSize: '0.72rem' }}
                      >
                        <Shuffle size={12} />
                        החלף
                      </button>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions inside Overview */}
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowOverviewSheet(false);
                  onAddExerciseClick();
                }}
              >
                <Plus size={16} />
                הוסף תרגיל נוסף
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="modal-overlay" onClick={() => setShowCancelConfirm(false)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <AlertTriangle size={40} color="var(--color-red)" style={{ marginBottom: 8 }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>לבטל את האימון?</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                הנתונים של האימון הנוכחי לא יישמרו בהיסטוריה.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn-primary"
                style={{ background: 'var(--color-red)' }}
                onClick={() => {
                  setShowCancelConfirm(false);
                  onCancelWorkout();
                }}
              >
                כן, בטל אימון
              </button>
              <button className="btn-secondary" onClick={() => setShowCancelConfirm(false)}>
                המשך להתאמן
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Exercise From Current Workout - Confirmation Modal */}
      {removeExerciseIdx !== null && (() => {
        const workoutExToRemove = workout.exercises[removeExerciseIdx];
        const exToRemove = workoutExToRemove ? exerciseMap.get(workoutExToRemove.exerciseId) : undefined;
        return (
          <div className="modal-overlay" onClick={() => setRemoveExerciseIdx(null)}>
            <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Trash2 size={40} color="var(--color-red)" style={{ marginBottom: 8 }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  להסיר את {exToRemove ? `"${exToRemove.nameHe}"` : 'התרגיל'} מהאימון הנוכחי?
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  התרגיל יימחק רק מהאימון שאתה מבצע עכשיו - הוא יישאר במאגר התרגילים ואפשר להוסיף אותו שוב בכל עת.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--color-red)' }}
                  onClick={() => {
                    handleRemoveExercise(removeExerciseIdx);
                    setRemoveExerciseIdx(null);
                  }}
                >
                  כן, הסר מהאימון
                </button>
                <button className="btn-secondary" onClick={() => setRemoveExerciseIdx(null)}>
                  ביטול
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rest Timer Modal */}
      <RestTimerModal
        isOpen={restTimerState.isOpen}
        initialSeconds={restTimerState.seconds}
        onClose={() => setRestTimerState({ isOpen: false, seconds: defaultRestSec })}
        onDisableAutoTimer={onDisableAutoTimer}
      />

      {/* Smart Exercise Swap Modal */}
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
