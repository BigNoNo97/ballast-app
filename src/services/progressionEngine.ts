import { Exercise, ExerciseProgressState, ExperienceLevel, RoutineTemplate, UserSettings, WorkoutSession } from '../types';
import { MUSCLE_SIZE_CATEGORY } from '../data/exerciseClassification';
import { StorageService } from './storage';
import { applyWeeklyVolume, pickRepRange, regenerateForNewCycle } from './programGenerator';

const round025 = (kg: number) => Math.round(kg * 4) / 4;

export interface ProcessWorkoutResult {
  updatedRoutine: RoutineTemplate;
  stalledExerciseIds: string[];
  didRollover: boolean;
}

// עוזר קריאה למסך התצוגה המקדימה (WorkoutDetailPreview) - מה המשקל/חזרות שהמערכת מציעה
// כרגע לתרגיל הזה, לפי ה"זיכרון" שהמנוע צבר, ולא לפי האימון האחרון בלבד.
export function getExerciseState(routineId: string, exerciseId: string): ExerciseProgressState | null {
  return StorageService.getExerciseProgressStates(routineId).find((s) => s.exerciseId === exerciseId) || null;
}

// נקרא מ-handleFinishWorkout רק לתוכניות isGenerated - מעדכן את "הזיכרון" של כל תרגיל
// שתועד באימון הזה, ומתקדם שבוע/מחזור במחזור האימון כשמגיע הזמן.
export function processFinishedWorkout(
  session: WorkoutSession,
  routine: RoutineTemplate,
  settings: UserSettings,
  library: Exercise[]
): ProcessWorkoutResult {
  if (!routine.isGenerated || !routine.mesocycle) {
    return { updatedRoutine: routine, stalledExerciseIds: [], didRollover: false };
  }

  const level: ExperienceLevel = settings.experienceLevel || 'beginner';
  const muscleById = new Map(library.map((e) => [e.id, e.muscle]));
  const stalledExerciseIds: string[] = [];
  const statesToSave: ExerciseProgressState[] = []; // כתיבה אחת בסוף, לא קריאת סנכרון-ענן לכל תרגיל בלולאה

  session.exercises.forEach((workoutExercise) => {
    let state = getExerciseState(routine.id, workoutExercise.exerciseId);
    if (!state) {
      // "מתאושש" ממצב שבו ה-state אבד (למשל תקלת סנכרון) אבל התרגיל עדיין חלק מהתוכנית -
      // בלי זה, אובדן state חד-פעמי היה משבית את ההתקדמות על התרגיל הזה לצמיתות בלי דרך חזרה.
      const isPartOfRoutine = routine.days.some((d) => d.exercises.some((e) => e.exerciseId === workoutExercise.exerciseId));
      if (!isPartOfRoutine) return; // תרגיל שנוסף ידנית לאימון, לא חלק מהתוכנית שנבנתה - לא במעקב
      const repRange = pickRepRange(settings.goals);
      state = {
        id: `${routine.id}:${workoutExercise.exerciseId}`,
        routineId: routine.id,
        exerciseId: workoutExercise.exerciseId,
        currentWeightKg: 0,
        repRangeMin: repRange.min,
        repRangeMax: repRange.max,
        currentTargetReps: repRange.min,
        consecutiveStalls: 0,
      };
    }

    const sets = workoutExercise.sets;
    const completedSets = sets.filter((s) => s.completed);
    const allCompleted = sets.length > 0 && completedSets.length === sets.length;

    // אימון ראשון על התרגיל הזה - קולטים את המשקל שהמשתמש בפועל השתמש בו כנקודת פתיחה,
    // לא מוסיפים "עוד תוספת" מעל אפס.
    if (state.currentWeightKg === 0) {
      const actualMaxWeight = completedSets.reduce((max, s) => Math.max(max, s.weightKg), 0);
      statesToSave.push({
        ...state,
        currentWeightKg: actualMaxWeight || state.currentWeightKg,
        consecutiveStalls: 0,
        lastSessionResult: 'progressed',
      });
      return;
    }

    const metTarget =
      allCompleted &&
      sets.every((s) => s.reps >= state.currentTargetReps && s.weightKg >= state.currentWeightKg);

    if (metTarget) {
      const muscle = muscleById.get(workoutExercise.exerciseId);
      const increment = muscle && MUSCLE_SIZE_CATEGORY[muscle] === 'large' ? 2.5 : 1.25;
      const next: ExerciseProgressState = { ...state, consecutiveStalls: 0, lastSessionResult: 'progressed' };
      if (level === 'beginner') {
        next.currentWeightKg = round025(state.currentWeightKg + increment);
      } else if (state.currentTargetReps < state.repRangeMax) {
        next.currentTargetReps = state.currentTargetReps + 1;
      } else {
        next.currentWeightKg = round025(state.currentWeightKg + increment);
        next.currentTargetReps = state.repRangeMin;
      }
      statesToSave.push(next);
    } else {
      const consecutiveStalls = state.consecutiveStalls + 1;
      statesToSave.push({ ...state, consecutiveStalls, lastSessionResult: 'held' });
      if (consecutiveStalls >= 2) stalledExerciseIds.push(workoutExercise.exerciseId);
    }
  });

  StorageService.saveExerciseProgressStates(statesToSave);

  // התקדמות שבוע/מחזור - נספר לפי אימונים שהושלמו בתוכנית הזו, לא לפי לוח שנה
  // (כדי לא "להעניש" משתמש שהחמיץ יום ולהתאים את הקצב לקצב האמיתי שלו).
  const mesocycle = routine.mesocycle;
  const trainingDaysPerWeek = Math.max(1, settings.trainingDaysPerWeek || routine.days.length || 1);
  const sessionsCompletedThisWeek = mesocycle.sessionsCompletedThisWeek + 1;

  if (sessionsCompletedThisWeek < trainingDaysPerWeek) {
    const updatedRoutine: RoutineTemplate = { ...routine, mesocycle: { ...mesocycle, sessionsCompletedThisWeek } };
    return { updatedRoutine, stalledExerciseIds, didRollover: false };
  }

  const nextWeek = mesocycle.currentWeek + 1;
  if (nextWeek > mesocycle.lengthWeeks) {
    // סוף שבוע הדילול - גלגול למחזור הבא (נפח פתיחה גבוה מעט, ואולי תרגילים מעט אחרים לגיוון).
    const { routine: rolledRoutine, progressStates } = regenerateForNewCycle(routine, settings, library);
    StorageService.saveExerciseProgressStates(progressStates);
    return { updatedRoutine: rolledRoutine, stalledExerciseIds, didRollover: true };
  }

  // עוברים לשבוע הבא באותו מחזור - מרעננים את יעדי הנפח (סטים) בלי לשנות את בחירת התרגילים.
  const withNewWeek: RoutineTemplate = {
    ...routine,
    mesocycle: { ...mesocycle, currentWeek: nextWeek, sessionsCompletedThisWeek: 0 },
  };
  const updatedRoutine = applyWeeklyVolume(withNewWeek, nextWeek, library);
  return { updatedRoutine, stalledExerciseIds, didRollover: false };
}
