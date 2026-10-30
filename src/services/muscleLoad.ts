// עומס שרירים: כמה סטים קיבל כל שריר השבוע, מול היעד השבועי האישי שמנוע התוכניות קבע.
// סט נספר רק אם הושלם ואינו סט חימום. שריר עיקרי בתרגיל = סט שלם, שריר משני = חצי סט
// (אותה ספירה שהמנוע משתמש בה כשהוא מחלק סטים - [volumeDose]).
import { Exercise, MuscleGroup, RoutineTemplate, WorkoutSession, WorkoutSet } from '../types';

export const SECONDARY_SET_WEIGHT = 0.5;

/** סדר תצוגה: פלג גוף עליון קדמי, אחורי, רגליים, ואז הקטנים */
export const MUSCLE_ORDER: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'traps', 'lower_back',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** תחילת השבוע (יום ראשון 00:00, שעון מקומי) */
export function weekStartOf(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
}

const countsAsWorkSet = (s: WorkoutSet) => s.completed && s.type !== 'warmup';

export type MuscleSets = Record<MuscleGroup, number>;

const emptySets = (): MuscleSets =>
  Object.fromEntries(MUSCLE_ORDER.map((m) => [m, 0])) as MuscleSets;

/** סטים לכל שריר מתוך אימונים (עיקרי = 1, משני = 0.5) */
export function muscleSetsFrom(sessions: WorkoutSession[], byId: Map<string, Exercise>): MuscleSets {
  const out = emptySets();
  sessions.forEach((w) =>
    w.exercises.forEach((x) => {
      const ex = byId.get(x.exerciseId);
      if (!ex) return;
      const n = x.sets.filter(countsAsWorkSet).length;
      if (!n) return;
      out[ex.muscle] += n;
      (ex.secondaryMuscles || []).forEach((m) => {
        if (m !== ex.muscle) out[m] += n * SECONDARY_SET_WEIGHT;
      });
    })
  );
  return out;
}

export type LoadLevel = 'none' | 'low' | 'building' | 'target' | 'over' | 'extra';

export interface MuscleLoadRow {
  muscle: MuscleGroup;
  sets: number;
  /** יעד הסטים לשבוע; undefined = שריר בלי יעד ישיר (מקבל נפח עקיף) */
  target?: number;
  level: LoadLevel;
}

export function loadLevel(sets: number, target: number | undefined): LoadLevel {
  if (sets <= 0) return 'none';
  if (!target) return 'extra';
  const r = sets / target;
  if (r < 0.5) return 'low';
  if (r < 0.9) return 'building';
  if (r <= 1.3) return 'target';
  return 'over';
}

export function loadRows(sets: MuscleSets, targets: Partial<Record<MuscleGroup, number>>): MuscleLoadRow[] {
  return MUSCLE_ORDER.map((m) => ({ muscle: m, sets: sets[m], target: targets[m], level: loadLevel(sets[m], targets[m]) }));
}

const completedIn = (history: WorkoutSession[], from: number, to: number) =>
  history.filter((w) => w.isCompleted && w.startTime >= from && w.startTime < to);

/** העומס בשבוע שמתחיל ב-weekStart (ברירת מחדל: השבוע הנוכחי) */
export function weeklyLoad(
  history: WorkoutSession[],
  library: Exercise[],
  targets: Partial<Record<MuscleGroup, number>>,
  weekStart = weekStartOf(Date.now())
): MuscleLoadRow[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  return loadRows(muscleSetsFrom(completedIn(history, weekStart, weekStart + 7 * DAY_MS), byId), targets);
}

/** סטים לשריר בכל אחד מ-N השבועות האחרונים (הישן קודם), לגרף מגמה */
export function weeklySetsHistory(
  history: WorkoutSession[],
  library: Exercise[],
  weeks: number,
  now = Date.now()
): { weekStart: number; sets: MuscleSets }[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const current = weekStartOf(now);
  return Array.from({ length: weeks }, (_, i) => {
    // לא מחסירים 7*DAY_MS ישר - מעבר שעון קיץ/חורף מזיז את השעה. בונים מחדש מהתאריך
    const d = new Date(current);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7 * (weeks - 1 - i)).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7 * (weeks - 2 - i)).getTime();
    return { weekStart: start, sets: muscleSetsFrom(completedIn(history, start, end), byId) };
  });
}

/**
 * איזון: לכל שריר עם יעד - ממוצע אחוז העמידה ביעד ב-N השבועות השלמים האחרונים (בלי השבוע
 * הנוכחי, שעוד לא נגמר). שבוע בלי אף אימון לא נספר - חופשה לא אמורה להראות חוסר איזון.
 */
export function muscleBalance(
  history: WorkoutSession[],
  library: Exercise[],
  targets: Partial<Record<MuscleGroup, number>>,
  weeks = 4,
  now = Date.now()
): { muscle: MuscleGroup; percent: number }[] | null {
  const past = weeklySetsHistory(history, library, weeks + 1, now)
    .slice(0, weeks)
    .filter((w) => MUSCLE_ORDER.some((m) => w.sets[m] > 0));
  if (past.length === 0) return null;
  return MUSCLE_ORDER.filter((m) => targets[m]).map((m) => ({
    muscle: m,
    percent: Math.round((past.reduce((s, w) => s + w.sets[m], 0) / past.length / targets[m]!) * 100),
  }));
}

export interface LoadSuggestion {
  muscle: MuscleGroup;
  missingSets: number;
  exercise?: Exercise;
}

/**
 * מה להוסיף כדי להגיע ליעד: שרירים שחסרים להם לפחות 2 סטים, מהחוסר הגדול לקטן. התרגיל
 * המוצע - קודם תרגיל מהתוכנית הפעילה לאותו שריר (מוכר ויש לו משקל עבודה), אחרת מהמאגר.
 */
export function loadSuggestions(
  rows: MuscleLoadRow[],
  library: Exercise[],
  routine?: RoutineTemplate | null,
  max = 3
): LoadSuggestion[] {
  const byId = new Map(library.map((e) => [e.id, e]));
  const inRoutine = (routine?.days || []).flatMap((d) => d.exercises.map((x) => byId.get(x.exerciseId))).filter(Boolean) as Exercise[];
  return rows
    .filter((r) => r.target && r.target - r.sets >= 2)
    .sort((a, b) => b.target! - b.sets - (a.target! - a.sets))
    .slice(0, max)
    .map((r) => ({
      muscle: r.muscle,
      missingSets: Math.ceil(r.target! - r.sets),
      exercise: inRoutine.find((e) => e.muscle === r.muscle && !e.isWarmup) || easyAddOn(library, r.muscle),
    }));
}

// תרגיל שקל להוסיף בסוף אימון: כבל או מכונה (בלי הכנת מוט ופלטות, ופחות עייפות מדדליפט למשל)
function easyAddOn(library: Exercise[], muscle: MuscleGroup): Exercise | undefined {
  const pool = library.filter((e) => e.muscle === muscle && !e.isWarmup && !e.isCustom && !e.id.startsWith('ext-') && e.image);
  return pool.find((e) => e.equipment === 'cable' || e.equipment === 'machine') || pool[0];
}
