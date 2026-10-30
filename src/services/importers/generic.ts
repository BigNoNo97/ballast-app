// מודל ביניים משותף לייבוא מאפליקציות אחרות (Strong, Hevy) ומצילום/טקסט בעזרת AI:
// כל מקור מפענח את הקובץ שלו ל-RawWorkout, ומכאן הכול זהה - זיהוי התרגיל במאגר לפי השם
// באנגלית, תרגילים אישיים למה שלא זוהה, קרדיו להערת האימון, וסטי חימום ל-warmupSets.
import { EquipmentType, Exercise, MuscleGroup, WarmupSet, WorkoutExercise, WorkoutSession, WorkoutSet } from '../../types';

export interface RawSet {
  weightKg: number;
  reps: number;
  seconds?: number;
  distanceM?: number;
  kind?: 'normal' | 'warmup' | 'drop' | 'failure';
  rpe?: number;
}

export interface RawExercise {
  name: string;
  /** השם כפי שנכתב במקור (למשל בעברית במחברת) - לתרגיל אישי כשאין התאמה במאגר */
  displayName?: string;
  notes?: string;
  sets: RawSet[];
}

export interface RawWorkout {
  /** מזהה יציב לאימון במקור - ייבוא חוזר של אותו קובץ לא משכפל */
  key: string;
  title: string;
  start: Date;
  durationSec: number;
  notes?: string;
  exercises: RawExercise[];
}

export interface ImportReport {
  workouts: number;
  exerciseEntries: number;
  sets: number;
  cardioEntries: number;
  mappedExerciseNames: number;
  customExercisesCreated: string[];
  unknownExercisesAutoCreated: string[];
  skippedFiles: string[];
}

export interface ImportResult {
  workouts: WorkoutSession[];
  customExercises: Exercise[];
  report: ImportReport;
}

// ===== זיהוי תרגיל לפי שם =====

/** מנרמל שם תרגיל באנגלית: אותיות קטנות, יחיד, וכתיבים נפוצים לצורה אחת */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pull|chin|push|sit|step)[\s-]+ups?\b/g, '$1up')
    .replace(/\bskull\s*crushers?\b/g, 'skullcrusher')
    .replace(/\bez[\s-]*bar\b/g, 'ezbar')
    .replace(/\bt[\s-]*bar\b/g, 'tbar')
    .replace(/\bv[\s-]*(bar|grip)\b/g, 'vgrip')
    .replace(/\btriceps?\b/g, 'tricep')
    .replace(/\bbiceps?\b/g, 'bicep')
    .replace(/\bflyes?\b|\bflies\b/g, 'fly')
    .replace(/\brdl\b/g, 'romanian deadlift')
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .join(' ');
}

// שמות של Strong ו-Hevy (אותה שיטת שמות: "Bench Press (Barbell)") -> התרגיל במאגר.
// המפתח עובר normalizeExerciseName, כך שוריאציות כתיב קטנות נתפסות גם הן.
const KNOWN_NAMES: Record<string, string> = {
  'Bench Press (Barbell)': 'bench-press-barbell',
  'Bench Press (Dumbbell)': 'bench-press-dumbbell',
  'Bench Press (Smith Machine)': 'bench-press-smith',
  'Incline Bench Press (Barbell)': 'incline-bench-barbell',
  'Incline Bench Press (Dumbbell)': 'incline-bench-dumbbell',
  'Incline Bench Press (Smith Machine)': 'incline-smith-press',
  'Decline Bench Press (Barbell)': 'decline-bench-press-barbell',
  'Decline Bench Press (Dumbbell)': 'decline-bench-press-dumbbell',
  'Close Grip Bench Press (Barbell)': 'close-grip-bench-press-barbell',
  'Bench Press - Close Grip (Barbell)': 'close-grip-bench-press-barbell',
  'Chest Press (Machine)': 'chest-press-machine',
  'Incline Chest Press (Machine)': 'incline-chest-machine',
  'Chest Fly (Dumbbell)': 'dumbbell-fly',
  'Chest Fly (Machine)': 'pec-deck-machine',
  'Butterfly (Pec Deck)': 'pec-deck-machine',
  'Pec Deck': 'pec-deck-machine',
  'Cable Crossover': 'cable-crossover',
  'Cable Fly Crossovers': 'cable-crossover',
  'Chest Fly (Cable)': 'cable-chest-fly',
  'Push Up': 'pushups',
  'Chest Dip': 'dips-chest',
  'Triceps Dip': 'triceps-dips-bodyweight',
  'Squat (Barbell)': 'barbell-back-squat',
  'Back Squat (Barbell)': 'barbell-back-squat',
  'Front Squat (Barbell)': 'front-squat-barbell',
  'Front Squat': 'front-squat-barbell',
  'Squat (Smith Machine)': 'smith-squat',
  'Goblet Squat (Kettlebell)': 'goblet-squat-dumbbell',
  'Goblet Squat (Dumbbell)': 'goblet-squat-dumbbell',
  'Goblet Squat': 'goblet-squat-dumbbell',
  'Hack Squat (Machine)': 'hack-squat-machine',
  'Hack Squat': 'hack-squat-machine',
  'Leg Press': 'leg-press-machine',
  'Leg Press (Machine)': 'leg-press-machine',
  'Leg Extension (Machine)': 'leg-extension-machine',
  'Lying Leg Curl (Machine)': 'lying-leg-curl-machine',
  'Seated Leg Curl (Machine)': 'seated-leg-curl-machine',
  'Deadlift (Barbell)': 'deadlift-conventional',
  'Deadlift': 'deadlift-conventional',
  'Romanian Deadlift (Barbell)': 'romanian-deadlift-barbell',
  'Romanian Deadlift (Dumbbell)': 'romanian-deadlift-dumbbell',
  'Stiff Leg Deadlift (Barbell)': 'stiff-leg-deadlift-barbell',
  'Sumo Deadlift (Barbell)': 'sumo-deadlift',
  'Trap Bar Deadlift': 'deadlift-trap-bar',
  'Deadlift (Trap Bar)': 'deadlift-trap-bar',
  'Hip Thrust (Barbell)': 'hip-thrust-barbell',
  'Hip Thrust (Machine)': 'hip-thrust-machine',
  'Hip Thrust (Smith Machine)': 'smith-hip-thrust',
  'Glute Bridge': 'glute-bridge-bodyweight',
  'Glute Kickback (Cable)': 'cable-glute-kickback',
  'Bulgarian Split Squat': 'bulgarian-split-squat',
  'Bulgarian Split Squat (Dumbbell)': 'bulgarian-split-squat',
  'Lunge (Dumbbell)': 'walking-lunges-dumbbell',
  'Walking Lunge (Dumbbell)': 'walking-lunges-dumbbell',
  'Lunge (Barbell)': 'lunge-barbell',
  'Standing Calf Raise (Machine)': 'standing-calf-raise-machine',
  'Standing Calf Raise': 'standing-calf-raise-machine',
  'Seated Calf Raise (Machine)': 'seated-calf-raise-machine',
  'Seated Calf Raise': 'seated-calf-raise-machine',
  'Calf Press on Leg Press': 'leg-press-calf-raise',
  'Hip Adduction (Machine)': 'hip-adduction-machine',
  'Hip Abduction (Machine)': 'hip-abduction-machine',
  'Lat Pulldown (Cable)': 'lat-pulldown-cable',
  'Lat Pulldown (Machine)': 'lat-pulldown-machine',
  'Lat Pulldown - Close Grip (Cable)': 'lat-pulldown-close-grip',
  'Lat Pulldown - Underhand (Cable)': 'lat-pulldown-underhand',
  'Pull Up': 'pullups',
  'Pull Up (Weighted)': 'pullups',
  'Chin Up': 'chin-up',
  'Seated Row (Cable)': 'seated-cable-row',
  'Seated Cable Row - V Grip (Cable)': 'seated-cable-row',
  'Seated Cable Row': 'seated-cable-row',
  'Seated Row (Machine)': 'chest-supported-row-machine',
  'Chest Supported Row (Machine)': 'chest-supported-row-machine',
  'Bent Over Row (Barbell)': 'barbell-row',
  'Bent Over Row (Dumbbell)': 'bent-over-row-dumbbell-both-arms',
  'Dumbbell Row': 'dumbbell-row-single-arm',
  'Single Arm Dumbbell Row': 'dumbbell-row-single-arm',
  'T Bar Row': 't-bar-row',
  'Straight Arm Lat Pulldown (Cable)': 'straight-arm-pulldown-cable',
  'Face Pull (Cable)': 'face-pull-cable',
  'Face Pull': 'face-pull-cable',
  'Overhead Press (Barbell)': 'overhead-press-barbell',
  'Overhead Press (Dumbbell)': 'overhead-press-dumbbell',
  'Seated Overhead Press (Dumbbell)': 'overhead-press-dumbbell',
  'Shoulder Press (Dumbbell)': 'overhead-press-dumbbell',
  'Shoulder Press (Machine)': 'shoulder-press-machine',
  'Overhead Press (Smith Machine)': 'overhead-press-smith',
  'Arnold Press (Dumbbell)': 'arnold-press-dumbbell',
  'Push Press': 'push-press-barbell',
  'Lateral Raise (Dumbbell)': 'lateral-raise-dumbbell',
  'Lateral Raise (Cable)': 'lateral-raise-cable',
  'Lateral Raise (Machine)': 'lateral-raise-machine',
  'Front Raise (Dumbbell)': 'front-raise-dumbbell',
  'Front Raise (Cable)': 'front-raise-cable',
  'Rear Delt Reverse Fly (Machine)': 'rear-delt-fly-machine',
  'Rear Delt Reverse Fly (Dumbbell)': 'rear-delt-fly-dumbbell',
  'Rear Delt Reverse Fly (Cable)': 'rear-delt-fly-cable',
  'Reverse Fly (Machine)': 'rear-delt-fly-machine',
  'Upright Row (Barbell)': 'upright-row-barbell',
  'Shrug (Barbell)': 'barbell-shrug',
  'Shrug (Dumbbell)': 'dumbbell-shrug',
  'Shrug (Cable)': 'cable-shrug',
  'Bicep Curl (Barbell)': 'bicep-curl-straight-barbell',
  'Bicep Curl (Dumbbell)': 'bicep-curl-dumbbell',
  'Bicep Curl (Cable)': 'bicep-curl-cable',
  'Bicep Curl (EZ Bar)': 'bicep-curl-barbell',
  'EZ Bar Biceps Curl': 'bicep-curl-barbell',
  'Hammer Curl (Dumbbell)': 'hammer-curl-dumbbell',
  'Hammer Curl (Cable)': 'hammer-curl-cable-rope',
  'Rope Cable Curl': 'hammer-curl-cable-rope',
  'Preacher Curl (Barbell)': 'preacher-curl-barbell',
  'Preacher Curl (EZ Bar)': 'preacher-curl-barbell',
  'Preacher Curl (Machine)': 'preacher-curl-machine',
  'Concentration Curl': 'concentration-curl-dumbbell',
  'Incline Curl (Dumbbell)': 'incline-curl-dumbbell',
  'Reverse Curl (Barbell)': 'reverse-curl-barbell',
  'Triceps Pushdown': 'tricep-pushdown-bar',
  'Triceps Pushdown (Cable - Straight Bar)': 'tricep-pushdown-bar',
  'Triceps Rope Pushdown': 'tricep-pushdown-cable-rope',
  'Triceps Pushdown (Rope)': 'tricep-pushdown-cable-rope',
  'Triceps Extension (Cable)': 'overhead-tricep-cable',
  'Overhead Triceps Extension (Cable)': 'overhead-tricep-cable',
  'Triceps Extension (Dumbbell)': 'standing-overhead-triceps-extension-dumbbell',
  'Overhead Triceps Extension (Dumbbell)': 'standing-overhead-triceps-extension-dumbbell',
  'Skullcrusher (Barbell)': 'skull-crushers-barbell',
  'Skullcrusher (EZ Bar)': 'skull-crushers-barbell',
  'Lying Triceps Extension (Barbell)': 'skull-crushers-barbell',
  'Crunch': 'crunches',
  'Cable Crunch': 'cable-crunch',
  'Hanging Leg Raise': 'hanging-leg-raise',
  'Lying Leg Raise': 'lying-leg-raise-bench',
  'Leg Raise (Lying)': 'lying-leg-raise-bench',
  'Plank': 'plank',
  'Side Plank': 'side-plank',
  'Russian Twist': 'russian-twist',
  'Sit Up': 'sit-up',
  'Ab Wheel': 'ab-wheel-rollout',
  'Good Morning (Barbell)': 'good-morning-barbell',
  'Back Extension': 'back-extension-bench',
  'Hyperextension': 'back-extension-bench',
};
const KNOWN_BY_NORMALIZED = new Map(Object.entries(KNOWN_NAMES).map(([k, v]) => [normalizeExerciseName(k), v]));

const EQUIPMENT_WORDS: [RegExp, EquipmentType][] = [
  [/smith/, 'smith'],
  [/barbell|ezbar|tbar|trap bar/, 'barbell'],
  [/dumbbell|kettlebell/, 'dumbbell'],
  [/cable|rope|pulley/, 'cable'],
  [/machine|lever|leverage|pec deck/, 'machine'],
  [/bodyweight|body weight|pushup|pullup|chinup|plank|dip\b|crunch|sit ?up/, 'bodyweight'],
];

export function guessEquipmentFromName(name: string): EquipmentType {
  const n = normalizeExerciseName(name);
  return EQUIPMENT_WORDS.find(([re]) => re.test(n))?.[1] ?? 'other';
}

// הסדר חשוב: "leg curl" לפני "curl", "romanian deadlift" לפני "deadlift", "tricep kickback" לפני "kickback"
const MUSCLE_WORDS: [RegExp, MuscleGroup][] = [
  [/calf|calve/, 'calves'],
  [/leg curl|hamstring|romanian|stiff leg|good morning|nordic/, 'hamstrings'],
  [/tricep|pushdown|skullcrusher|close grip bench|dip\b/, 'triceps'],
  [/hip thrust|glute|bridge|kickback|abduct/, 'glutes'],
  [/back extension|hyperextension|superman/, 'lower_back'],
  [/squat|leg press|leg extension|lunge|stepup|adduct/, 'quads'],
  [/shrug/, 'traps'],
  [/curl/, 'biceps'],
  [/crunch|plank|ab wheel|situp|leg raise|twist|woodchop|pallof|hollow/, 'core'],
  [/bench|chest|fly|pec|pushup/, 'chest'],
  [/row|pulldown|pullup|chinup|lat\b|pullover|deadlift/, 'back'],
  [/press|raise|delt|shoulder|face pull/, 'shoulders'],
];

export function guessMuscleFromName(name: string): MuscleGroup {
  const n = normalizeExerciseName(name);
  return MUSCLE_WORDS.find(([re]) => re.test(n))?.[1] ?? 'core';
}

const tokens = (s: string) => new Set(normalizeExerciseName(s).split(' ').filter((t) => t.length > 1));

/**
 * מוצא את התרגיל במאגר: קודם טבלת השמות הידועים, אחר כך שם זהה, ובסוף דמיון מילים
 * (Jaccard) עם בונוס לציוד תואם. סף גבוה - עדיף ליצור תרגיל אישי מאשר לשייך לתרגיל לא נכון.
 */
export function matchExercise(name: string, library: Exercise[]): Exercise | null {
  const byId = new Map(library.map((e) => [e.id, e]));
  const norm = normalizeExerciseName(name);
  const known = KNOWN_BY_NORMALIZED.get(norm);
  if (known && byId.has(known)) return byId.get(known)!;
  const exact = library.find((e) => normalizeExerciseName(e.nameEn) === norm);
  if (exact) return exact;

  const want = tokens(name);
  const wantEquipment = guessEquipmentFromName(name);
  if (want.size === 0) return null;
  let best: { ex: Exercise; score: number } | null = null;
  for (const ex of library) {
    if (ex.isWarmup) continue;
    const have = tokens(`${ex.nameEn} ${ex.equipment}`);
    let inter = 0;
    want.forEach((t) => have.has(t) && inter++);
    if (!inter) continue;
    let score = inter / (want.size + have.size - inter);
    if (wantEquipment !== 'other' && ex.equipment === wantEquipment) score += 0.15;
    if (!ex.id.startsWith('ext-')) score += 0.05; // מאגר הליבה - עם תמונה והסבר
    if (!best || score > best.score) best = { ex, score };
  }
  return best && best.score >= 0.6 ? best.ex : null;
}

// ===== בניית האימונים =====

const CARDIO = /run|treadmill|walk|bike|cycling|elliptical|stair|row(ing)? machine|rower|swim|jump rope|skipping|hiking|cardio/;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

function formatSeconds(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return s ? `${m}:${String(s).padStart(2, '0')} דק׳` : `${m} דק׳`;
}

/** source - שם המקור לתצוגה ולמזהים (Strong / Hevy / AI) */
export function buildImport(source: string, raw: RawWorkout[], library: Exercise[]): ImportResult {
  const prefix = slug(source);
  const customExercises = new Map<string, Exercise>();
  const unknownNames: string[] = [];
  const mappedNames = new Set<string>();
  let setCount = 0;
  let cardioCount = 0;
  let entryCount = 0;

  const resolve = (name: string, displayName?: string): string => {
    const hit = matchExercise(name, library);
    if (hit) {
      mappedNames.add(name);
      return hit.id;
    }
    const id = `${prefix}-${slug(name)}`;
    if (!customExercises.has(id)) {
      unknownNames.push(name);
      customExercises.set(id, {
        id,
        nameHe: displayName || name,
        nameEn: name,
        muscle: guessMuscleFromName(name),
        equipment: guessEquipmentFromName(name),
        alternatives: [],
        defaultSets: 3,
        defaultReps: 10,
        defaultRestSec: 90,
        isCustom: true,
      });
    }
    return id;
  };

  const workouts: WorkoutSession[] = raw.map((w) => {
    const exercises: WorkoutExercise[] = [];
    const cardioNotes: string[] = [];
    let volume = 0;
    let completed = 0;

    w.exercises.forEach((rx, exIdx) => {
      entryCount++;
      const sets = rx.sets.filter((s) => s.weightKg > 0 || s.reps > 0 || (s.seconds ?? 0) > 0 || (s.distanceM ?? 0) > 0);
      if (!sets.length) return;
      const timedOnly = sets.every((s) => !s.reps && !s.weightKg);
      if (timedOnly && CARDIO.test(normalizeExerciseName(rx.name))) {
        cardioCount++;
        const sec = sets.reduce((a, s) => a + (s.seconds ?? 0), 0);
        const km = sets.reduce((a, s) => a + (s.distanceM ?? 0), 0) / 1000;
        cardioNotes.push([rx.name, sec ? formatSeconds(sec) : '', km ? `${Math.round(km * 100) / 100} ק״מ` : ''].filter(Boolean).join(' '));
        return;
      }
      const exerciseId = resolve(rx.name, rx.displayName);
      const warm = sets.filter((s) => s.kind === 'warmup');
      const work = sets.filter((s) => s.kind !== 'warmup');
      const base = `${prefix}-${w.key}-${exIdx}`;
      const workSets: WorkoutSet[] = work.map((s, i) => {
        const reps = timedOnly ? Math.round(s.seconds ?? 0) : Math.round(s.reps);
        volume += s.weightKg * reps;
        completed++;
        setCount++;
        return {
          id: `${base}-${i}`,
          setNumber: i + 1,
          type: s.kind === 'drop' ? 'drop' : s.kind === 'failure' ? 'failure' : 'normal',
          weightKg: Math.round(s.weightKg * 100) / 100,
          reps,
          rpe: s.rpe,
          completed: true,
        };
      });
      const warmupSets: WarmupSet[] = warm.map((s, i) => ({
        id: `${base}-w${i}`,
        weightKg: Math.round(s.weightKg * 100) / 100,
        reps: Math.round(s.reps),
        completed: true,
      }));
      if (!workSets.length && !warmupSets.length) return;
      exercises.push({
        exerciseId,
        sets: workSets,
        warmupSets: warmupSets.length ? warmupSets : undefined,
        notes: [timedOnly ? 'חזרות = שניות החזקה' : '', rx.notes].filter(Boolean).join(' · ') || undefined,
      });
    });

    return {
      id: `${prefix}-${w.key}`,
      title: w.title ? `${source} · ${w.title}` : `אימון מ-${source}`,
      startTime: w.start.getTime(),
      endTime: w.start.getTime() + w.durationSec * 1000,
      durationSec: w.durationSec,
      exercises,
      notes: [`יובא מ-${source}`, cardioNotes.length ? `קרדיו: ${cardioNotes.join(', ')}` : '', w.notes].filter(Boolean).join(' · '),
      isCompleted: true,
      totalVolumeKg: Math.round(volume * 10) / 10,
      completedSetsCount: completed,
    };
  });

  return {
    workouts: workouts.filter((w) => w.exercises.length > 0 || w.notes).sort((a, b) => b.startTime - a.startTime),
    customExercises: Array.from(customExercises.values()),
    report: {
      workouts: workouts.length,
      exerciseEntries: entryCount,
      sets: setCount,
      cardioEntries: cardioCount,
      mappedExerciseNames: mappedNames.size,
      customExercisesCreated: [],
      unknownExercisesAutoCreated: unknownNames,
      skippedFiles: [],
    },
  };
}

/** מזהה קצר ויציב ממחרוזת (FNV-1a) - למזהי אימונים מקבצים שאין בהם מזהה */
export function stableKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
