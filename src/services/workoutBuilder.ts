import { RoutineDay, RoutineDayExercise, RoutineTemplate, WorkoutExercise, WorkoutSet } from '../types';
import { StorageService } from './storage';
import { computeProgressedTarget } from './progression';
import { getExerciseState } from './progressionEngine';

/**
 * יעדי היום (סטים/חזרות/משקל מוצע) אחרי חישוב ההתקדמות - מה שמסך תצוגת היום מציג לפני
 * "התחל אימון", ומה שהשעון מקבל כשמתחילים ממנו. מקום אחד, כדי ששניהם יראו בדיוק אותו דבר.
 */
export function configureDayExercises(routine: RoutineTemplate, day: RoutineDay): RoutineDayExercise[] {
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
}

/** התרגילים והסטים של אימון חדש לפי יעדי היום (עם משקל/חזרות קודמים לכל סט) */
export function buildWorkoutExercisesForDay(configuredExercises: RoutineDayExercise[]): WorkoutExercise[] {
  return configuredExercises.map((item) => {
    const lastPerf = StorageService.getLastExercisePerformance(item.exerciseId);
    const targetSetsCount = lastPerf && lastPerf.sets && lastPerf.sets.length > 0 ? lastPerf.sets.length : item.targetSets || 3;

    // item.suggestedWeight / item.targetReps כבר עברו חישוב התקדמות (configureDayExercises)
    const sets: WorkoutSet[] = Array.from({ length: targetSetsCount }).map((_, idx) => {
      const lastSet = lastPerf?.sets[idx] || lastPerf?.sets[0];
      return {
        id: `set-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        setNumber: idx + 1,
        type: 'normal',
        weightKg: item.suggestedWeight ?? lastSet?.weightKg ?? 0,
        reps: item.targetReps ?? lastSet?.reps ?? 10,
        completed: false,
        previousWeight: lastSet?.weightKg,
        previousReps: lastSet?.reps,
      };
    });

    return {
      exerciseId: item.exerciseId,
      sets,
      supersetGroupId: item.supersetGroupId,
      notes: StorageService.getNoteForExercise(item.exerciseId),
    };
  });
}
