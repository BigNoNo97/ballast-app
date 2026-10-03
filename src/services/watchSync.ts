import { Capacitor } from '@capacitor/core';
import { Exercise, RoutineTemplate, UserSettings, WorkoutSession } from '../types';
import { getWeightIncrement } from '../data/exerciseClassification';
import { applySetFieldEdit, toggleWorkoutPause } from './workoutEdits';
import { buildWorkoutExercisesForDay, configureDayExercises } from './workoutBuilder';
import { StorageService } from './storage';

/**
 * סנכרון "שלט לאימון" עם השעון. האייפון הוא מקור האמת: הוא שולח לשעון את מצב האימון,
 * השעון שולח פקודות. כל פקודה נושאת seq עולה (לכל אימון), והאייפון מחזיר בתוך המצב את
 * ackSeq האחרון שיישם - כך השעון יודע אילו מהפקודות שהציג מראש כבר נקלטו.
 */
export interface WatchCommand {
  seq: number;
  workoutId: string;
  type:
    | 'startWorkout'
    | 'completeSet'
    | 'uncompleteSet'
    | 'updateSet'
    | 'pause'
    | 'resume'
    | 'watchSessionStarted'
    | 'finishWorkout';
  exerciseIndex?: number;
  exerciseId?: string;
  setIndex?: number;
  field?: 'weightKg' | 'reps';
  value?: number;
  at: number;
  // רק ב-startWorkout: האימון כפי שהשעון התחיל אותו (מהתוכנית שקיבל מהאייפון)
  start?: {
    routineId?: string;
    dayNumber?: number;
    title: string;
    exercises: { exerciseId: string; sets: { weightKg: number; reps: number }[] }[];
  };
}

/** התוכנית הפעילה כפי שהשעון צריך אותה כדי להתחיל אימון לבד - כל יום עם הסטים שהאייפון היה מציע */
export function buildWatchCatalog(
  routine: RoutineTemplate | null,
  nextDayNumber: number,
  exercises: Exercise[],
  settings: UserSettings
) {
  if (!routine || !routine.days?.length) return null;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    routineId: routine.id,
    routineTitle: routine.title,
    nextDayNumber,
    days: routine.days.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.dayTitle || `יום ${day.dayNumber}`,
      subtitle: day.targetMuscles || '',
      exercises: buildWorkoutExercisesForDay(configureDayExercises(routine, day)).map((ex) => {
        const data = byId.get(ex.exerciseId);
        return {
          exerciseId: ex.exerciseId,
          name: data?.nameHe || 'תרגיל',
          restSec: data?.defaultRestSec || settings.defaultRestSeconds,
          weightStep: data ? getWeightIncrement(data.muscle) : 2.5,
          sets: ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        };
      }),
    })),
  };
}

/** אימון שהתחיל בשעון -> WorkoutSession אמיתי באייפון, עם אותו מזהה ושעת התחלה */
export function sessionFromWatchStart(cmd: WatchCommand, routines: RoutineTemplate[]): WorkoutSession | null {
  if (cmd.type !== 'startWorkout' || !cmd.start) return null;
  const routine = cmd.start.routineId ? routines.find((r) => r.id === cmd.start!.routineId) : undefined;
  const day = routine?.days.find((d) => d.dayNumber === cmd.start!.dayNumber);
  return {
    id: cmd.workoutId,
    title: cmd.start.title,
    routineId: routine?.id,
    dayNumber: routine ? cmd.start.dayNumber : undefined,
    targetMuscles: day?.targetMuscles,
    startTime: cmd.at,
    durationSec: 0,
    isCompleted: false,
    totalVolumeKg: 0,
    completedSetsCount: 0,
    startedOnWatch: true,
    exercises: cmd.start.exercises.map((ex) => {
      const lastPerf = StorageService.getLastExercisePerformance(ex.exerciseId);
      const dayItem = day?.exercises.find((i) => i.exerciseId === ex.exerciseId);
      return {
        exerciseId: ex.exerciseId,
        supersetGroupId: dayItem?.supersetGroupId,
        notes: StorageService.getNoteForExercise(ex.exerciseId),
        sets: ex.sets.map((s, idx) => {
          const lastSet = lastPerf?.sets[idx] || lastPerf?.sets[0];
          return {
            id: `set-${cmd.at}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
            setNumber: idx + 1,
            type: 'normal' as const,
            weightKg: s.weightKg,
            reps: s.reps,
            completed: false,
            previousWeight: lastSet?.weightKg,
            previousReps: lastSet?.reps,
          };
        }),
      };
    }),
  };
}

const ORPHANS_KEY = 'ballast_watch_orphan_commands_v1';
const ORPHAN_MAX_AGE_MS = 3 * 24 * 3600 * 1000;

/**
 * פקודות של אימון שעוד לא קיים באייפון (למשל ה-startWorkout שלו עוד בדרך, או שהאייפון היה
 * באמצע אימון אחר) - נשמרות ומעובדות שוב בפעם הבאה, במקום ללכת לאיבוד.
 */
export function loadOrphanCommands(): WatchCommand[] {
  try {
    const raw = localStorage.getItem(ORPHANS_KEY);
    const list: WatchCommand[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
    return list.filter((c) => c.at >= cutoff);
  } catch {
    return [];
  }
}

export function saveOrphanCommands(commands: WatchCommand[]): void {
  try {
    if (commands.length) localStorage.setItem(ORPHANS_KEY, JSON.stringify(commands));
    else localStorage.removeItem(ORPHANS_KEY);
  } catch {
    // אחסון חסום - הפקודות יאבדו, אין מה לעשות
  }
}

const ACK_KEY = 'ballast_watch_ack_v1';
const LAST_ENDED_KEY = 'ballast_watch_last_ended_v1';

/**
 * איך הסתיים האימון האחרון - נשלח לשעון כדי שיסגור את סשן האימון של Apple בשעת הסיום
 * האמיתית: 'finished' = לשמור ב-Health (אלא אם האייפון כבר שמר בעצמו), 'cancelled' = לזרוק.
 */
export interface LastEndedWorkout {
  workoutId: string;
  endTime: number;
  outcome: 'finished' | 'cancelled';
  phoneSaved: boolean;
}

export function setLastEndedWorkout(ended: LastEndedWorkout): void {
  try {
    localStorage.setItem(LAST_ENDED_KEY, JSON.stringify(ended));
  } catch {
    // אחסון חסום - השעון פשוט לא יקבל את הסיום עד העדכון הבא
  }
}

function getLastEndedWorkout(): LastEndedWorkout | null {
  try {
    const raw = localStorage.getItem(LAST_ENDED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const isWatchSyncSupported = (): boolean => Capacitor.getPlatform() === 'ios';

export function getWatchAck(workoutId: string): number {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    const ack = raw ? JSON.parse(raw) : null;
    return ack && ack.workoutId === workoutId ? ack.seq : 0;
  } catch {
    return 0;
  }
}

export function setWatchAck(workoutId: string, seq: number): void {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify({ workoutId, seq }));
  } catch {
    // אחסון חסום - במקרה הגרוע פקודה תיושם פעמיים, וכל הפקודות כאן אידמפוטנטיות
  }
}

export function buildWatchState(
  workout: WorkoutSession | null,
  exercises: Exercise[],
  settings: UserSettings,
  catalogSource?: { routine: RoutineTemplate | null; nextDayNumber: number }
) {
  const healthSync = Boolean(settings.appleHealthSyncEnabled);
  // התוכנית נשלחת רק כשאין אימון פעיל - רק אז השעון מציג "התחל אימון", והוא שומר את האחרונה שקיבל
  if (!workout) {
    const catalog = catalogSource
      ? buildWatchCatalog(catalogSource.routine, catalogSource.nextDayNumber, exercises, settings)
      : null;
    return {
      v: 1,
      active: false,
      healthSync,
      autoRest: settings.autoRestTimerEnabled,
      lastEnded: getLastEndedWorkout(),
      catalog,
    };
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return {
    v: 1,
    active: true,
    healthSync,
    workoutId: workout.id,
    title: workout.title,
    startTime: workout.startTime,
    pausedAt: workout.pausedAt ?? null,
    pausedTotalMs: workout.pausedTotalMs || 0,
    autoRest: settings.autoRestTimerEnabled,
    ackSeq: getWatchAck(workout.id),
    exercises: workout.exercises.map((ex) => {
      const data = byId.get(ex.exerciseId);
      return {
        exerciseId: ex.exerciseId,
        name: data?.nameHe || 'תרגיל',
        restSec: data?.defaultRestSec || settings.defaultRestSeconds,
        weightStep: data ? getWeightIncrement(data.muscle) : 2.5,
        sets: ex.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, completed: s.completed })),
      };
    }),
  };
}

/** מיישם פקודה מהשעון. פקודה שלא מתאימה למצב הנוכחי (תרגיל שהוחלף/נמחק) פשוט מתעלמים ממנה. */
export function applyWatchCommand(workout: WorkoutSession, cmd: WatchCommand): WorkoutSession {
  if (cmd.type === 'pause') return workout.pausedAt != null ? workout : { ...workout, pausedAt: cmd.at };
  if (cmd.type === 'resume') return workout.pausedAt == null ? workout : toggleWorkoutPause(workout, cmd.at);
  if (cmd.type === 'watchSessionStarted') {
    return workout.healthRecordedByWatch ? workout : { ...workout, healthRecordedByWatch: true };
  }

  const exIdx = cmd.exerciseIndex;
  const ex = exIdx != null ? workout.exercises[exIdx] : undefined;
  if (!ex || ex.exerciseId !== cmd.exerciseId || cmd.setIndex == null || !ex.sets[cmd.setIndex]) return workout;

  let sets = ex.sets;
  if (cmd.type === 'completeSet') {
    sets = sets.map((s, i) => (i === cmd.setIndex ? { ...s, completed: true, completedAt: cmd.at } : s));
  } else if (cmd.type === 'uncompleteSet') {
    sets = sets.map((s, i) => (i === cmd.setIndex ? { ...s, completed: false, completedAt: undefined } : s));
  } else if (cmd.type === 'updateSet' && cmd.field && typeof cmd.value === 'number') {
    sets = applySetFieldEdit(sets, cmd.setIndex, cmd.field, cmd.value);
  } else {
    return workout;
  }
  return { ...workout, exercises: workout.exercises.map((e, i) => (i === exIdx ? { ...e, sets } : e)) };
}

/**
 * מסדר פקודות לעיבוד: לפי אימון (האימון שהתחיל קודם - קודם), ובתוך כל אימון לפי seq.
 * כפילויות (אותה פקודה שהגיעה פעמיים, או נשמרה כיתומה וגם הגיעה שוב) מוסרות.
 */
export function orderWatchCommands(commands: WatchCommand[]): WatchCommand[] {
  const unique = new Map<string, WatchCommand>();
  commands.forEach((c) => unique.set(`${c.workoutId}#${c.seq}`, c));
  const list = [...unique.values()];
  const firstAt = new Map<string, number>();
  list.forEach((c) => firstAt.set(c.workoutId, Math.min(firstAt.get(c.workoutId) ?? Infinity, c.at)));
  return list.sort(
    (a, b) =>
      firstAt.get(a.workoutId)! - firstAt.get(b.workoutId)! ||
      a.workoutId.localeCompare(b.workoutId) ||
      a.seq - b.seq
  );
}

export function parseWatchCommands(raw: string[]): WatchCommand[] {
  const parsed: WatchCommand[] = [];
  for (const item of raw) {
    try {
      const cmd = JSON.parse(item);
      if (cmd && typeof cmd.seq === 'number' && typeof cmd.workoutId === 'string' && typeof cmd.type === 'string') {
        parsed.push(cmd);
      }
    } catch {
      // פקודה פגומה - מדלגים
    }
  }
  return parsed.sort((a, b) => a.seq - b.seq);
}
