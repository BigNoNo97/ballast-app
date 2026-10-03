import { Exercise, PersonalRecord, WorkoutSession, WorkoutSet } from '../types';
import { StorageService, calculateEstimated1RM } from './storage';

export const computeElapsedSec = (w: WorkoutSession, now: number = Date.now()): number => {
  const start = w.startTime || now;
  const end = w.pausedAt ?? now;
  return Math.max(0, Math.floor((end - start - (w.pausedTotalMs || 0)) / 1000));
};

/**
 * סיכום אימון שהסתיים: נפח, סטים שהושלמו, שיאים חדשים, וסגירת הפסקה פתוחה.
 * משותף לסיום מהאייפון ולסיום מהשעון (שם endTime = הרגע שבו לחצו "סיים" בשעון).
 */
export function buildFinishedSession(workout: WorkoutSession, exercises: Exercise[], endTime: number): WorkoutSession {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));
  const existingPRs = StorageService.getPersonalRecords();
  let totalVolume = 0;
  let completedSets = 0;
  const newPRs: PersonalRecord[] = [];

  workout.exercises.forEach((ex) => {
    const exName = exerciseMap.get(ex.exerciseId)?.nameHe || 'תרגיל';

    // מספר הסטים שהמשתמש בפועל סימן כהושלמו - כולל סטים במשקל גוף (0 ק"ג), לא רק סטים שתורמים לנפח/שיא
    completedSets += ex.sets.filter((s) => s.completed).length;

    const completedSetsInEx = ex.sets.filter((s) => s.completed && s.weightKg > 0 && s.reps > 0);
    if (completedSetsInEx.length === 0) return;

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
      if (e1rm > exerciseBest1RM) exerciseBest1RM = e1rm;
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
        date: endTime,
        workoutId: workout.id,
        isNew: true,
      });
    }
  });

  return {
    ...workout,
    endTime,
    // סיום אימון בזמן שהשעון מושהה - סוגרים את ההפסקה הפתוחה בזמן הסיום
    pausedAt: undefined,
    pauses:
      workout.pausedAt != null
        ? [...(workout.pauses || []), { startMs: workout.pausedAt, endMs: endTime }]
        : workout.pauses,
    durationSec: computeElapsedSec(workout, endTime),
    isCompleted: true,
    totalVolumeKg: totalVolume,
    completedSetsCount: completedSets,
    newPRs,
  };
}

/**
 * עריכת שדה בסט אחד. משקל/חזרות מתפשטים לסטים *שאחריו* באותו תרגיל שעדיין לא הושלמו -
 * אף פעם לא לסטים קודמים, בלי לסמן אותם ✓, ובלי לגעת בסטים שכבר אושרו.
 * משותף למסך האימון באייפון ולפקודות שמגיעות מהשעון, כדי ששניהם יתנהגו בדיוק אותו דבר.
 */
export function applySetFieldEdit(
  sets: WorkoutSet[],
  setIndex: number,
  field: keyof WorkoutSet,
  value: any
): WorkoutSet[] {
  const isCascadeField = field === 'weightKg' || field === 'reps';
  return sets.map((s, idx) => {
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
}

/** השהיה/המשך של שעון האימון ברגע `at` (מהשעון זה הרגע שבו לחצו שם, לא כשהפקודה עובדה) */
export function toggleWorkoutPause(workout: WorkoutSession, at: number): WorkoutSession {
  if (workout.pausedAt != null) {
    const pausedFor = Math.max(0, at - workout.pausedAt);
    return {
      ...workout,
      pausedAt: undefined,
      pausedTotalMs: (workout.pausedTotalMs || 0) + pausedFor,
      pauses: [...(workout.pauses || []), { startMs: workout.pausedAt, endMs: workout.pausedAt + pausedFor }],
    };
  }
  return { ...workout, pausedAt: at };
}
