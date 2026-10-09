// ייבוא היסטוריית אימונים מקובץ הייצוא של Planfit (ZIP עם קובצי CSV, או קובצי ה-CSV עצמם).
//
// מבנה הייצוא (נבדק מול ייצוא אמיתי):
//   1_workout_sessions.csv       - אימון: workout_id, date, started_at, done_at, name, routine_name,
//                                  workout_minutes, calorie, memo, comment
//   2_exercises_per_session.csv  - תרגיל באימון: exercise_entry_id, workout_id, exercise_name,
//                                  training_model_id, type (normal / body_weight / time)
//   3_sets.csv                   - סט: set_id, exercise_entry_id, weight, weight_unit, value1-3
//   4_exercise_records_by_date   - סיכומים נגזרים (שיא/נפח לפי יום) - לא נדרש, Ballast מחשבת לבד
//   5_daily_steps / 6_profile    - צעדים ופרופיל - אין להם מקום ב-Ballast, מדווחים כ"לא יובאו"
//
// משמעות value1-3 לפי סוג התרגיל:
//   normal      - value1 = משקל (ק"ג), value2 = חזרות
//   body_weight - value1 = חזרות
//   time        - value1 = שעות, value2 = דקות, value3 = שניות
// אימוני קרדיו (הליכון, אופניים...) נרשמים בהערת האימון עם משך הזמן, כי ב-Ballast סט הוא
// משקל × חזרות. פלאנק נרשם כתרגיל, עם שניות ההחזקה בשדה החזרות.

import { Exercise, EquipmentType, MuscleGroup, WorkoutExercise, WorkoutSession, WorkoutSet } from '../../types';
import { parseCsv } from './csv';

type Row = Record<string, string>;

/** שם התרגיל ב-Planfit -> מזהה התרגיל המקביל במאגר של Ballast */
const EXERCISE_MAP: Record<string, string> = {
  'Lat Pulldown': 'lat-pulldown-cable',
  'Incline Dumbbell Bench Press': 'incline-bench-dumbbell',
  'Dumbbell Bench Press': 'bench-press-dumbbell',
  'Cable Lateral Raise': 'lateral-raise-cable',
  'Cable Crossover': 'cable-crossover',
  'Face Pull': 'face-pull-cable',
  'Dumbbell Hammer Curl': 'hammer-curl-dumbbell',
  'Cable Rope Tricep Extension': 'tricep-pushdown-cable-rope',
  'Seated Leg Curl': 'seated-leg-curl-machine',
  'Dumbbell Shoulder Press': 'overhead-press-dumbbell',
  'Cable Crunch': 'cable-crunch',
  'Seated Cable Row': 'seated-cable-row',
  'Overhead Cable Tricep Extension': 'overhead-tricep-cable',
  'Neutral Grip Lat Pulldown': 'lat-pulldown-v-bar',
  'Smith Machine Calf Raise': 'standing-calf-raise-smith',
  'Barbell Squat': 'barbell-back-squat',
  'Dumbbell Shrug': 'dumbbell-shrug',
  'Hip Adduction Machine': 'hip-adduction-machine',
  'Hip Abduction Machine': 'hip-abduction-machine',
  'One Arm Cable KickBack': 'ext-cable-kickback',
  'Hip Thrust Machine': 'hip-thrust-machine',
  'One Arm Dumbbell Row': 'dumbbell-row-single-arm',
  'Lying Barbell Tricep Extension': 'skull-crushers-barbell',
  'One Leg Extension': 'leg-extension-single-leg-machine',
  'Cable Shrug': 'cable-shrug',
  'Lu Raise': 'lu-raise',
  'Dumbbell Lateral Raise': 'lateral-raise-dumbbell',
  'Cable Tricep Pushdown': 'tricep-pushdown-bar',
  'Preacher Curl Machine': 'preacher-curl-machine',
  'Leg Extension': 'leg-extension-machine',
  'Assisted Pull Up': 'ext-assisted-pull-up',
  'Bench Cable Fly': 'cable-chest-fly',
  'Dumbbell Fly': 'dumbbell-fly',
  'Low Cable Crossover': 'ext-cable-low-fly',
  'Romanian Deadlift': 'romanian-deadlift-barbell',
  'Dumbbell Romanian Deadlift': 'romanian-deadlift-dumbbell',
  'One Arm Cable Bicep Curl': 'single-arm-cable-curl',
  Deadlift: 'deadlift-conventional',
  'Bench Press': 'bench-press-barbell',
  'Barbell Row': 'barbell-row',
  'Pec Deck Rear Delt': 'rear-delt-fly-machine',
  'Leg Press': 'leg-press-machine',
  'Dumbbell Wrist Curl': 'ext-dumbbell-over-bench-wrist-curl',
  'Arm Pulldown': 'straight-arm-pulldown-cable',
  'Overhead Press': 'overhead-press-barbell',
  'EZ-Bar Bicep Curl': 'bicep-curl-barbell',
  'One Arm Dumbbell Preacher Curl': 'ext-dumbbell-preacher-curl',
  'Pec Deck Fly': 'pec-deck-machine',
  'Shoulder Press Machine': 'shoulder-press-machine',
  'Reverse Cable Fly': 'rear-delt-fly-cable',
  'One Arm Machine Seated Row': 'iso-row-machine',
  'Incline Chest Press Machine': 'incline-chest-machine',
  'Chest Press Machine': 'chest-press-machine',
  'Cable Hammer Curl': 'hammer-curl-cable-rope',
  'One Arm Seated Cable Row': 'ext-cable-seated-one-arm-alternate-row',
  'Calf Raise on Seated Leg Press Machine': 'leg-press-calf-raise',
  'Captains Chair Leg Raise': 'ext-captains-chair-straight-leg-raise',
  'One Arm Cable Front Raise': 'front-raise-cable',
  'Dumbbell Bulgarian Split Squat': 'bulgarian-split-squat',
  'Hack Squat Machine': 'hack-squat-machine',
  'Dumbbell Bent Over Lateral Raise': 'rear-delt-fly-dumbbell',
  'Heel Touch Crunch': 'heel-touchers',
  'Leg Raise': 'lying-leg-raise-bench',
  Plank: 'plank',
  'Dumbbell Walking Lunge': 'walking-lunges-dumbbell',
  Crunch: 'crunches',
  'Incline Dumbbell Curl': 'incline-curl-dumbbell',
  'Dumbbell Preacher Curl': 'ext-dumbbell-preacher-curl',
  'Russian Twist': 'russian-twist',
  'Dumbbell Tricep Extension': 'standing-overhead-triceps-extension-dumbbell',
  'Cable Bicep Curl': 'bicep-curl-cable',
  'Standing Leg Curl': 'standing-leg-curl-machine',
  'Smith Machine Deadlift': 'ext-smith-deadlift',
  'Goblet Squat': 'goblet-squat-dumbbell',
  'Smith Machine Squat': 'smith-squat',
  'Dumbbell Lunge': 'ext-dumbbell-lunge',
  'One Arm Lat Pulldown': 'ext-cable-one-arm-pulldown',
  'Incline Smith Machine Bench Press': 'incline-smith-press',
  'Smith Machine Bench Press': 'bench-press-smith',
  'Cable Front Raise': 'front-raise-cable',
  'Incline Bench Press': 'incline-bench-barbell',
  'Smith Machine Barbell Row': 'ext-smith-bent-over-row',
  'Close Grip T-bar Row': 't-bar-row',
  'Decline Bench Press Machine': 'ext-lever-decline-chest-press',
  'Dumbbell Front Raise': 'front-raise-dumbbell',
  'Seated Leg Press': 'leg-press-machine',
  'Dumbbell Bicep Curl': 'bicep-curl-dumbbell',
  'Back Extension': 'back-extension-bench',
  'Seated Lateral Raise Machine': 'lateral-raise-machine',
  'Triceps Extension Machine': 'ext-lever-triceps-extension',
  'Cable Drag Curl': 'ext-cable-drag-curl',
  'Lying Dumbbell Tricep Extension': 'ext-dumbbell-lying-triceps-extension',
  'Seated Dips Machine': 'dip-machine',
  'T-Bar Row': 't-bar-row',
  'Hanging Leg Raise': 'hanging-leg-raise',
  'One Arm Lat Pulldown Machine': 'ext-lever-one-arm-lateral-wide-pulldown',
  'Seated Row Machine': 'ext-lever-seated-row',
  'Cable Side Bend': 'ext-cable-side-bend',
  'Low Row Machine': 'ext-lever-seated-row',
  'Hammer Bench Press': 'chest-press-machine-plate-loaded',
  'Wide Grip Seated Cable Row': 'ext-cable-seated-wide-grip-row',
  'Abdominal Machine': 'ext-lever-seated-crunch',
  'Kettlebell Goblet Squat': 'ext-kettlebell-goblet-squat',
  'Cable High Row': 'ext-cable-high-row-kneeling',
  'Leg Curl': 'lying-leg-curl-machine',
  'Seated Calf Raise Machine': 'seated-calf-raise-machine',
  'One Arm Cable Tricep Pushdown': 'ext-cable-one-arm-tricep-pushdown',
  'Standing Cable Row': 'ext-cable-standing-row-v-bar',
  'Arm Curl Machine': 'preacher-curl-machine',
  'One Leg Press': 'ext-lever-horizontal-one-leg-press',
  'Incline Dumbbell Fly': 'ext-dumbbell-incline-fly',
};

/** תרגילים בלי מקבילה במאגר - נוצרים כתרגילים מותאמים אישית (עם שם בעברית) */
const CUSTOM_EXERCISES: Record<string, { nameHe: string; muscle: MuscleGroup; equipment: EquipmentType }> = {
  'Dumbbell Seal Row': { nameHe: 'חתירת סיל במשקולות (שכיבה על ספסל)', muscle: 'back', equipment: 'dumbbell' },
  'Hammer Strength Plate-Loaded Squat Lunge - Romanian Deadlift': {
    nameHe: 'דדליפט רומני במכונת Hammer Strength',
    muscle: 'hamstrings',
    equipment: 'machine',
  },
  'Torso Rotation': { nameHe: 'סיבובי גו במכונה', muscle: 'core', equipment: 'machine' },
  'Box Jump': { nameHe: 'קפיצה לקופסה', muscle: 'quads', equipment: 'bodyweight' },
  Lunge: { nameHe: "לאנג' במשקל גוף", muscle: 'quads', equipment: 'bodyweight' },
  'Calf Raise': { nameHe: 'הרמת עקבים במשקל גוף', muscle: 'calves', equipment: 'bodyweight' },
};

/** קרדיו - נרשם בהערת האימון עם משך הזמן */
const CARDIO_NAMES_HE: Record<string, string> = {
  'Treadmill Running': 'ריצה על הליכון',
  Walking: 'הליכה',
  'Stationary Bike': 'אופני כושר',
  'Bicycle Recline Walk': 'אופניים שכובים',
  'Step Mill': 'מכונת מדרגות',
  'Assault Bike': 'אופני Assault',
  'Elliptical Machine': 'אליפטיקל',
  Spinning: 'ספינינג',
  'Other Sports': 'ספורט אחר',
};

// סימנים שנכנסו לשמות ב-Planfit (למשל "Overhead Cable Tricep Extension Ⅰ") ורווחים כפולים
const cleanName = (name: string) =>
  name
    .replace(/[Ⅰ-ⅿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// תרגיל שלא מוכר לנו (ייצוא של משתמש אחר): מנחשים קבוצת שריר לפי הקידומת של training_model_id
// ב-Planfit (1xxx גב, 2xxx חזה, 3xxx כתפיים, 4xxx רגליים, 5xxx בטן, 6xxx יד אחורית, 7-8xxx יד קדמית)
function guessMuscle(modelId: string): MuscleGroup {
  const group = Math.floor(Number(modelId) / 1000);
  const byGroup: Record<number, MuscleGroup> = {
    1: 'back',
    2: 'chest',
    3: 'shoulders',
    4: 'quads',
    5: 'core',
    6: 'triceps',
    7: 'biceps',
    8: 'biceps',
  };
  return byGroup[group] ?? 'core';
}

function guessEquipment(name: string): EquipmentType {
  const n = name.toLowerCase();
  if (n.includes('smith')) return 'smith';
  if (n.includes('barbell') || n.includes('ez-bar')) return 'barbell';
  if (n.includes('dumbbell') || n.includes('kettlebell')) return 'dumbbell';
  if (n.includes('cable')) return 'cable';
  if (n.includes('machine')) return 'machine';
  return 'other';
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// "2023-09-01 12:11:25.766000" - שעון מקומי (Planfit שומרת לפי אזור הזמן של המשתמש)
function parseLocalDateTime(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0'] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s, Math.round(Number(`0.${frac}`) * 1000));
}

const num = (v: string | undefined) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

function formatDuration(totalSec: number): string {
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} שע׳`;
  if (s === 0) return `${m} דק׳`;
  return `${m}:${String(s).padStart(2, '0')} דק׳`;
}

export interface PlanfitImportReport {
  workouts: number;
  exerciseEntries: number;
  sets: number;
  cardioEntries: number;
  mappedExerciseNames: number;
  customExercisesCreated: string[];
  unknownExercisesAutoCreated: string[];
  skippedFiles: string[];
}

export interface PlanfitImportResult {
  workouts: WorkoutSession[];
  customExercises: Exercise[];
  report: PlanfitImportReport;
}

/** מזהה אם קבוצת קבצים היא ייצוא של Planfit */
export function isPlanfitExport(files: Record<string, string>): boolean {
  const names = Object.keys(files).map((n) => n.split('/').pop() || n);
  return names.some((n) => /workout_sessions\.csv$/i.test(n)) && names.some((n) => /sets\.csv$/i.test(n));
}

/**
 * files - שם קובץ -> תוכן טקסט. knownExerciseIds - מזהי התרגילים שקיימים כרגע ב-Ballast
 * (תרגיל מהמיפוי שלא קיים במאגר מסיבה כלשהי ייווצר כתרגיל מותאם במקום להיעלם).
 */
export function parsePlanfitExport(files: Record<string, string>, knownExerciseIds: Set<string>): PlanfitImportResult {
  const find = (pattern: RegExp) => {
    const key = Object.keys(files).find((k) => pattern.test(k.split('/').pop() || k));
    return key ? parseCsv(files[key]) : [];
  };
  const sessions = find(/workout_sessions\.csv$/i);
  const entries = find(/exercises_per_session\.csv$/i);
  const sets = find(/(^|_)sets\.csv$/i);
  if (sessions.length === 0) throw new Error('לא נמצא קובץ אימונים (workout_sessions.csv) בייצוא.');

  const skippedFiles = Object.keys(files)
    .map((k) => k.split('/').pop() || k)
    .filter((n) => /daily_steps|profile_and_goals/i.test(n));

  const setsByEntry = new Map<string, Row[]>();
  sets.forEach((s) => {
    const list = setsByEntry.get(s.exercise_entry_id) || [];
    list.push(s);
    setsByEntry.set(s.exercise_entry_id, list);
  });
  const entriesByWorkout = new Map<string, Row[]>();
  entries.forEach((e) => {
    const list = entriesByWorkout.get(e.workout_id) || [];
    list.push(e);
    entriesByWorkout.set(e.workout_id, list);
  });
  const byId = (a: Row, b: Row, key: string) => Number(a[key]) - Number(b[key]);

  const customExercises = new Map<string, Exercise>();
  const customNamesFromTable: string[] = [];
  const unknownNames: string[] = [];
  const mappedNames = new Set<string>();

  const resolveExerciseId = (rawName: string, modelId: string): string => {
    const name = cleanName(rawName);
    const mapped = EXERCISE_MAP[name];
    if (mapped && knownExerciseIds.has(mapped)) {
      mappedNames.add(name);
      return mapped;
    }
    const id = `planfit-${slug(name)}`;
    if (!customExercises.has(id)) {
      const def = CUSTOM_EXERCISES[name];
      if (def) customNamesFromTable.push(name);
      else unknownNames.push(name);
      customExercises.set(id, {
        id,
        nameHe: def?.nameHe ?? name,
        nameEn: name,
        muscle: def?.muscle ?? guessMuscle(modelId),
        equipment: def?.equipment ?? guessEquipment(name),
        alternatives: [],
        defaultSets: 3,
        defaultReps: 10,
        defaultRestSec: 90,
        isCustom: true,
      });
    }
    return id;
  };

  let setCount = 0;
  let cardioCount = 0;
  let entryCount = 0;

  const workouts: WorkoutSession[] = sessions.map((w) => {
    const minutes = num(w.workout_minutes) || num(w.elapsed_minutes);
    const durationSec = Math.round(minutes * 60);
    let start = parseLocalDateTime(w.started_at) || parseLocalDateTime(w.date) || new Date();
    // אימונים שנרשמו ידנית מגיעים עם 00:00 כשעת התחלה וסיום - השעה לא ידועה, אז שמים צהריים
    // (כדי שהאימון לא "יגלוש" ליום הקודם באזור זמן אחר)
    const unknownTime = /00:00:00(\.0+)?$/.test(w.started_at) && w.started_at === w.done_at;
    if (unknownTime) start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
    const done = unknownTime ? null : parseLocalDateTime(w.done_at);
    const endTime = done && done.getTime() > start.getTime() ? done.getTime() : start.getTime() + durationSec * 1000;

    const cardioNotes: string[] = [];
    const exercises: WorkoutExercise[] = [];
    let volume = 0;
    let completed = 0;

    const workoutEntries = (entriesByWorkout.get(w.workout_id) || []).sort((a, b) => byId(a, b, 'exercise_entry_id'));
    workoutEntries.forEach((entry) => {
      entryCount++;
      const name = cleanName(entry.exercise_name);
      const entrySets = (setsByEntry.get(entry.exercise_entry_id) || []).sort((a, b) => byId(a, b, 'set_id'));
      const isTime = entry.type === 'time';

      if (isTime && !EXERCISE_MAP[name]) {
        // קרדיו - סך הזמן של כל הסטים, בהערת האימון
        cardioCount++;
        const totalSec = entrySets.reduce((sum, s) => sum + num(s.value1) * 3600 + num(s.value2) * 60 + num(s.value3), 0);
        cardioNotes.push(`${CARDIO_NAMES_HE[name] ?? name}${totalSec > 0 ? ` ${formatDuration(totalSec)}` : ''}`);
        return;
      }

      const exerciseId = resolveExerciseId(entry.exercise_name, entry.training_model_id);
      const workoutSets: WorkoutSet[] = entrySets.map((s, idx) => {
        let weightKg = 0;
        let reps = 0;
        if (isTime) {
          reps = Math.round(num(s.value1) * 3600 + num(s.value2) * 60 + num(s.value3)); // שניות החזקה
        } else if (entry.type === 'body_weight') {
          reps = Math.round(num(s.value1));
        } else {
          weightKg = num(s.value1) || num(s.weight);
          reps = Math.round(num(s.value2));
          if ((s.weight_unit || '').toLowerCase().startsWith('lb')) weightKg = Math.round(weightKg * 0.45359237 * 100) / 100;
        }
        const done = s.is_done !== '0';
        if (done) {
          completed++;
          volume += weightKg * reps;
        }
        setCount++;
        const createdAt = parseLocalDateTime(s.created_at);
        return {
          id: `planfit-set-${s.set_id || `${entry.exercise_entry_id}-${idx}`}`,
          setNumber: idx + 1,
          type: 'normal',
          weightKg,
          reps,
          completed: done,
          completedAt: createdAt && !unknownTime ? createdAt.getTime() : undefined,
        };
      });

      exercises.push({
        exerciseId,
        sets: workoutSets,
        notes: [isTime ? 'חזרות = שניות החזקה' : '', entry.memo].filter(Boolean).join(' · ') || undefined,
      });
    });

    const originalTitle = w.name || w.routine_name.replace(/^\d{4}-\d{2}-\d{2}\s*/, '');
    const notes = [
      'יובא מ-Planfit',
      num(w.calorie) > 0 ? `${Math.round(num(w.calorie))} קלוריות` : '',
      cardioNotes.length ? `קרדיו: ${cardioNotes.join(', ')}` : '',
      w.memo,
      w.comment,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      id: `planfit-${w.workout_id}`,
      title: originalTitle ? `Planfit · ${originalTitle}` : 'אימון מ-Planfit',
      startTime: start.getTime(),
      endTime,
      durationSec,
      exercises,
      notes,
      isCompleted: true,
      totalVolumeKg: Math.round(volume * 10) / 10,
      completedSetsCount: completed,
    };
  });

  return {
    workouts: workouts.sort((a, b) => b.startTime - a.startTime),
    customExercises: Array.from(customExercises.values()),
    report: {
      workouts: workouts.length,
      exerciseEntries: entryCount,
      sets: setCount,
      cardioEntries: cardioCount,
      mappedExerciseNames: mappedNames.size,
      customExercisesCreated: customNamesFromTable,
      unknownExercisesAutoCreated: unknownNames,
      skippedFiles,
    },
  };
}
