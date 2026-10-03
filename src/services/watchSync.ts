import { Capacitor } from '@capacitor/core';
import { Exercise, UserSettings, WorkoutSession } from '../types';
import { getWeightIncrement } from '../data/exerciseClassification';
import { applySetFieldEdit, toggleWorkoutPause } from './workoutEdits';

/**
 * סנכרון "שלט לאימון" עם השעון. האייפון הוא מקור האמת: הוא שולח לשעון את מצב האימון,
 * השעון שולח פקודות. כל פקודה נושאת seq עולה (לכל אימון), והאייפון מחזיר בתוך המצב את
 * ackSeq האחרון שיישם - כך השעון יודע אילו מהפקודות שהציג מראש כבר נקלטו.
 */
export interface WatchCommand {
  seq: number;
  workoutId: string;
  type: 'completeSet' | 'uncompleteSet' | 'updateSet' | 'pause' | 'resume' | 'watchSessionStarted' | 'finishWorkout';
  exerciseIndex?: number;
  exerciseId?: string;
  setIndex?: number;
  field?: 'weightKg' | 'reps';
  value?: number;
  at: number;
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

export function buildWatchState(workout: WorkoutSession | null, exercises: Exercise[], settings: UserSettings) {
  const healthSync = Boolean(settings.appleHealthSyncEnabled);
  if (!workout) return { v: 1, active: false, healthSync, lastEnded: getLastEndedWorkout() };
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
