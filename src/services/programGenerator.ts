// "מוח האימונים": בונה תוכנית אישית מכל מה שהמשתמש הזין - מטרה, ניסיון, ימים, זמן, ציוד,
// חימום, גיל, משקל/גובה, מין, פציעות ואזורי מיקוד. כל החלטה נרשמת ב-planRationale עם המקור
// שלה (services/training/evidence.ts), כדי שאפשר יהיה להסביר אותה למשתמש (ובעתיד - בצ'אט AI).
//
// עקרונות (ACSM 2026, Pelland 2026 ועוד - ראו evidence.ts):
// - נפח: 10+ סטים לשריר בשבוע לבניית שריר, עולה בהדרגה; סט כשריר משני = חצי סט.
// - תדירות: כל שריר פעמיים בשבוע כשאפשר (חשוב בעיקר לכוח).
// - עומס: כוח = מעט חזרות כבדות בתרגילים מורכבים; שריר = טווח רחב קרוב לכשל.
// - סדר: אזורי המיקוד והתרגילים המורכבים בתחילת האימון.
// - סוג הציוד לא משנה את התוצאות - לכן בוחרים את הבטוח והמתאים ביותר לכל משתמש.

import {
  Exercise,
  ExerciseProgressState,
  ExperienceLevel,
  InjuryArea,
  MuscleGroup,
  OnboardingGoal,
  PlanDecision,
  RoutineDay,
  RoutineDayExercise,
  RoutineTemplate,
  SplitType,
  UserSettings,
} from '../types';
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from '../data/exercises';
import { COMPOUND_EXERCISE_IDS, MUSCLE_SIZE_CATEGORY, MuscleSizeCategory } from '../data/exerciseClassification';
import { WARMUP_EXERCISES } from '../data/warmupExercises';
import { HIGH_IMPACT, injuryExplanation, injuryLabel, isJointArea, isSafeFor } from './training/injuries';

const LEVEL_LABELS_HE: Record<ExperienceLevel, string> = {
  beginner: 'מתחילים',
  intermediate: 'בינונית',
  advanced: 'מתקדמת',
};
const GOAL_LABELS_HE: Record<OnboardingGoal, string> = {
  lose_weight: 'ירידה במשקל',
  gain_muscle: 'עלייה בשריר',
  strength: 'שיפור כוח',
  maintain: 'שמירה על כושר',
};
const muscleHe = (m: MuscleGroup) => MUSCLE_GROUP_LABELS[m]?.he ?? m;

const UPPER: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'traps'];
const LOWER: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core', 'lower_back'];
const PUSH: MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
const PULL: MuscleGroup[] = ['back', 'biceps', 'traps'];
const LEGS: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core', 'lower_back'];
const FULL_BODY: MuscleGroup[] = ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders', 'biceps', 'triceps', 'core'];

interface DayTemplate {
  title: string;
  muscles: MuscleGroup[];
}

const SPLIT_DAY_TEMPLATES: Record<SplitType, DayTemplate[]> = {
  full_body: [{ title: 'גוף מלא', muscles: FULL_BODY }],
  upper_lower: [
    { title: 'פלג גוף עליון', muscles: UPPER },
    { title: 'פלג גוף תחתון', muscles: LOWER },
  ],
  push_pull_legs: [
    { title: 'דחיפה (Push)', muscles: PUSH },
    { title: 'משיכה (Pull)', muscles: PULL },
    { title: 'רגליים (Legs)', muscles: LEGS },
  ],
  ulppl: [
    { title: 'פלג גוף עליון', muscles: UPPER },
    { title: 'פלג גוף תחתון', muscles: LOWER },
    { title: 'דחיפה (Push)', muscles: PUSH },
    { title: 'משיכה (Pull)', muscles: PULL },
    { title: 'רגליים (Legs)', muscles: LEGS },
  ],
};

// מחזור בן 5 שבועות למתחילים, 4 לבינוניים, 3 למתקדמים - השבוע האחרון הוא שבוע הקלה
const MESOCYCLE_LENGTH_BY_LEVEL: Record<ExperienceLevel, number> = {
  beginner: 5,
  intermediate: 4,
  advanced: 3,
};

// ===== פרופיל האימון: כל מה שהמשתמש הזין, מנורמל =====

type PrimaryGoal = 'strength' | 'hypertrophy' | 'fat_loss' | 'maintain';

interface TrainingProfile {
  level: ExperienceLevel;
  goals: OnboardingGoal[];
  primary: PrimaryGoal;
  daysPerWeek: number;
  minutes: number;
  warmup: boolean;
  equipment: Set<string> | null;
  injuries: InjuryArea[];
  focus: MuscleGroup[];
  age?: number;
  bmi?: number;
  older: boolean; // 60+
  joinFriendly: boolean; // בלי קפיצות (60+ או BMI 35+)
}

function primaryGoal(goals: OnboardingGoal[]): PrimaryGoal {
  if (goals.includes('strength')) return 'strength';
  if (goals.includes('gain_muscle')) return 'hypertrophy'; // כולל "גם לרדת וגם לבנות" - רה-קומפוזיציה
  if (goals.includes('lose_weight')) return 'fat_loss';
  return 'maintain';
}

function equipmentSetFromSettings(settings: UserSettings): Set<string> | null {
  if (!settings.availableEquipment) return null; // לא נשאל מעולם (חשבון ישן) - כל הציוד
  if (settings.availableEquipment.length === 0) return new Set<string>(['bodyweight']);
  return new Set<string>(settings.availableEquipment);
}

function buildTrainingProfile(settings: UserSettings, bodyWeightKg?: number): TrainingProfile {
  const goals = settings.goals && settings.goals.length ? settings.goals : (['maintain'] as OnboardingGoal[]);
  const age = settings.ageYears;
  const bmi = bodyWeightKg && settings.heightCm ? bodyWeightKg / (settings.heightCm / 100) ** 2 : undefined;
  const older = !!age && age >= 60;
  return {
    level: settings.experienceLevel || 'beginner',
    goals,
    primary: primaryGoal(goals),
    daysPerWeek: Math.min(6, Math.max(2, settings.trainingDaysPerWeek || 3)),
    minutes: settings.sessionDurationMinutes || 60,
    warmup: !!settings.includeWarmup,
    equipment: equipmentSetFromSettings(settings),
    injuries: settings.injuries || [],
    focus: (settings.focusMuscles || []).filter((m) => !(settings.injuries || []).includes(m)).slice(0, 3),
    age,
    bmi,
    older,
    joinFriendly: older || (bmi !== undefined && bmi >= 35),
  };
}

// ===== טווחי חזרות ומנוחה לפי תפקיד התרגיל (מורכב/בידוד), מטרה, ניסיון וגיל =====

type Role = 'compound' | 'isolation';

/** [loadRange] [acsm2026] [olderAdults] */
function repRangeFor(p: TrainingProfile, role: Role): { min: number; max: number } {
  let r: { min: number; max: number };
  switch (p.primary) {
    case 'strength':
      r = role === 'compound' ? { min: 3, max: 6 } : { min: 8, max: 12 };
      break;
    case 'hypertrophy':
      r = role === 'compound' ? { min: 6, max: 10 } : { min: 10, max: 15 };
      break;
    default:
      r = role === 'compound' ? { min: 8, max: 12 } : { min: 12, max: 15 };
  }
  // מתחילים לומדים טכניקה - לא יורדים מתחת ל-5 חזרות; 60+ - עומס מתון (לא מתחת ל-8)
  if (p.level === 'beginner' && r.min < 5) r = { min: 5, max: 8 };
  if (p.older && r.min < 8) r = { min: 8, max: Math.max(12, r.max) };
  return r;
}

/** [rest] מורכב: 2-3 דקות; בידוד: כדקה וחצי */
function restFor(p: TrainingProfile, role: Role): number {
  if (role === 'isolation') return p.primary === 'strength' ? 90 : 75;
  if (p.primary === 'strength') return 180;
  return p.level === 'beginner' || p.primary === 'maintain' ? 120 : 150;
}

/** תאימות לאחור: טווח החזרות של תרגיל מורכב לפי המטרות (נצרך ע"י מנוע ההתקדמות) */
export function pickRepRange(goals: OnboardingGoal[] | undefined): { min: number; max: number } {
  const p = { level: 'intermediate', primary: primaryGoal(goals || []), older: false } as TrainingProfile;
  return repRangeFor(p, 'compound');
}

// ===== נפח שבועי לכל שריר =====

/** [volumeDose] [acsm2026] [maintenance] [olderAdults] - סטים ישירים בשבוע: התחלה -> שיא המחזור */
const BASE_VOLUME: Record<'growth' | 'strength', Record<ExperienceLevel, Record<MuscleSizeCategory, [number, number]>>> = {
  growth: {
    beginner: { large: [8, 12], medium: [6, 10], small: [4, 8] },
    intermediate: { large: [10, 16], medium: [8, 14], small: [6, 10] },
    advanced: { large: [12, 20], medium: [10, 16], small: [6, 12] },
  },
  strength: {
    beginner: { large: [6, 10], medium: [4, 8], small: [4, 6] },
    intermediate: { large: [8, 12], medium: [6, 10], small: [4, 8] },
    advanced: { large: [10, 14], medium: [6, 12], small: [4, 8] },
  },
};
const MAINTAIN_VOLUME: Record<MuscleSizeCategory, number> = { large: 6, medium: 4, small: 3 };
const FOCUS_MULTIPLIER = 1.4;
const VOLUME_CAP: Record<MuscleSizeCategory, number> = { large: 22, medium: 18, small: 14 };

function volumeTargetFor(p: TrainingProfile, muscle: MuscleGroup): { start: number; peak: number } {
  const size = MUSCLE_SIZE_CATEGORY[muscle];
  let start: number;
  let peak: number;
  if (p.primary === 'maintain') {
    start = peak = MAINTAIN_VOLUME[size];
  } else {
    [start, peak] = BASE_VOLUME[p.primary === 'strength' ? 'strength' : 'growth'][p.level][size];
    // בגירעון קלורי ההתאוששות איטית יותר - שיא נמוך מעט, המטרה היא לשמור על השריר
    if (p.primary === 'fat_loss') peak = Math.round(peak * 0.85);
  }
  if (p.older) peak = Math.max(start, Math.round(peak * 0.8));
  if (p.focus.includes(muscle)) {
    start = Math.min(VOLUME_CAP[size], Math.round(start * FOCUS_MULTIPLIER));
    peak = Math.min(VOLUME_CAP[size], Math.round(peak * FOCUS_MULTIPLIER));
  }
  return { start, peak };
}

function weeklySetsFor(target: { start: number; peak: number }, week: number, lengthWeeks: number, cycleNumber: number): number {
  const cycleBonus = target.start === target.peak ? 0 : Math.min(cycleNumber - 1, 3); // שמירה - בלי עלייה
  const loadWeeks = Math.max(1, lengthWeeks - 1);
  if (week >= lengthWeeks) return Math.max(2, Math.round((target.start + cycleBonus) * 0.5)); // שבוע הקלה
  const progress = loadWeeks === 1 ? 1 : (week - 1) / (loadWeeks - 1);
  const linear = progress * (target.peak - target.start);
  // לא יותר מ-3 סטים נוספים לשריר בכל שבוע - קפיצה חדה בנפח קשה להתאושש ממנה
  return Math.round(target.start + cycleBonus + Math.min(linear, (week - 1) * 3));
}

/**
 * יעד הסטים האישי לכל שריר בשבוע הנוכחי (לעומס השרירים). תוכנית שהמנוע בנה - לפי היעדים
 * שנשמרו בה והשבוע במחזור (כולל שבוע הקלה). שריר שלא בתוכנית, או בלי תוכנית בכלל - לפי
 * הפרופיל (רמה, מטרה, גיל, מיקוד). שרירים בעדיפות נמוכה שלא במיקוד - בלי יעד (מקבלים נפח עקיף).
 */
export function weeklyMuscleTargets(
  settings: UserSettings,
  routine: RoutineTemplate | null | undefined,
  bodyWeightKg?: number
): Partial<Record<MuscleGroup, number>> {
  const p = buildTrainingProfile(settings, bodyWeightKg);
  const meso = routine?.mesocycle;
  const out: Partial<Record<MuscleGroup, number>> = {};
  (Object.keys(MUSCLE_SIZE_CATEGORY) as MuscleGroup[]).forEach((m) => {
    const planned = routine?.volumeTargets?.[m];
    if (planned && meso) {
      out[m] = weeklySetsFor(planned, meso.currentWeek, meso.lengthWeeks, meso.cycleNumber);
    } else if (!LOW_PRIORITY_MUSCLES.has(m) || p.focus.includes(m)) {
      out[m] = volumeTargetFor(p, m).start;
    }
  });
  return out;
}

// ===== ימים ושרירים =====

export function chooseSplit(daysPerWeek: number, level: ExperienceLevel): SplitType {
  if (daysPerWeek <= 2) return 'full_body';
  if (daysPerWeek === 3) return level === 'beginner' ? 'full_body' : 'push_pull_legs';
  if (daysPerWeek === 4) return 'upper_lower';
  if (daysPerWeek === 5) return 'ulppl';
  return 'push_pull_legs'; // 6 ימים - PPL פעמיים בשבוע
}

// זמן משוער לתרגיל עבודה (סטים + מנוחה) ולתרגיל חימום
const MINUTES_PER_MAIN_EXERCISE = 8;
const MINUTES_PER_WARMUP_EXERCISE = 4;

function computeMaxExercisesPerDay(minutes: number, warmup: boolean): number {
  const warmupMinutes = warmup ? WARMUP_EXERCISES.length * MINUTES_PER_WARMUP_EXERCISE : 0;
  const mainMinutes = Math.max(minutes - warmupMinutes, MINUTES_PER_MAIN_EXERCISE * 2);
  return Math.max(2, Math.round(mainMinutes / MINUTES_PER_MAIN_EXERCISE));
}

const LOW_PRIORITY_MUSCLES = new Set<MuscleGroup>(['calves', 'traps', 'lower_back']);

function musclePriority(p: TrainingProfile, m: MuscleGroup): number {
  if (p.focus.includes(m)) return -1; // מיקוד - תמיד ראשון
  if (LOW_PRIORITY_MUSCLES.has(m)) return 2;
  return MUSCLE_SIZE_CATEGORY[m] === 'large' ? 0 : 1;
}

function tileDays(split: SplitType, daysPerWeek: number): DayTemplate[] {
  const template = SPLIT_DAY_TEMPLATES[split];
  return Array.from({ length: daysPerWeek }, (_, i) => ({ ...template[i % template.length] }));
}

/**
 * מתאים את רשימת השרירים בכל יום למשתמש: מוציא שרירים פצועים, מבטיח שאזור מיקוד יופיע לפחות
 * פעמיים בשבוע [frequency], ומקצץ לפי הזמן - אף פעם לא את אזורי המיקוד.
 */
function personalizeDays(p: TrainingProfile, base: DayTemplate[], maxPerDay: number): DayTemplate[] {
  const injuredMuscles = new Set(p.injuries.filter((a) => !isJointArea(a)) as MuscleGroup[]);
  // מפרק רגיש = גם בלי אימון ישיר של השרירים שצמודים אליו (גב תחתון -> שרירי הגב התחתון,
  // צוואר -> טרפזים). הם עדיין עובדים כשרירים משניים בתרגילים אחרים.
  if (p.injuries.includes('lower_back')) injuredMuscles.add('lower_back');
  if (p.injuries.includes('neck')) injuredMuscles.add('traps');
  const days = base.map((d) => ({ ...d, muscles: d.muscles.filter((m) => !injuredMuscles.has(m)) }));

  for (const m of p.focus) {
    let count = days.filter((d) => d.muscles.includes(m)).length;
    // מוסיפים לימים שהשריר לא נמצא בהם, קודם לימים הקצרים ביותר
    const candidates = days.filter((d) => !d.muscles.includes(m)).sort((a, b) => a.muscles.length - b.muscles.length);
    for (const d of candidates) {
      if (count >= 2) break;
      d.muscles = [...d.muscles, m];
      count += 1;
    }
  }

  return days.map((d) => {
    const sorted = [...d.muscles].sort((a, b) => musclePriority(p, a) - musclePriority(p, b));
    return { ...d, muscles: sorted.slice(0, Math.max(1, Math.max(maxPerDay, sorted.filter((m) => p.focus.includes(m)).length))) };
  });
}

function muscleFrequency(days: DayTemplate[]): Map<MuscleGroup, number> {
  const freq = new Map<MuscleGroup, number>();
  days.forEach((d) => d.muscles.forEach((m) => freq.set(m, (freq.get(m) || 0) + 1)));
  return freq;
}

// ===== בחירת תרגילים =====

const OLYMPIC = /\bclean\b|clean-|snatch|jerk/i;

// תרגילי "בסיס" מוכרים לכל שריר - מקבלים עדיפות, כדי שהתוכנית תהיה מורכבת מתרגילים
// שמוכרים בכל חדר כושר ושיש עליהם הכי הרבה מחקר; וריאציות נדירות נכנסות רק לגיוון.
const STAPLES = new Set<string>([
  'bench-press-barbell', 'bench-press-dumbbell', 'incline-bench-dumbbell', 'incline-bench-barbell', 'chest-press-machine',
  'incline-chest-machine', 'cable-crossover', 'pec-deck-machine', 'dumbbell-fly', 'cable-chest-fly', 'pushups',
  'lat-pulldown-cable', 'lat-pulldown-close-grip', 'seated-cable-row', 'barbell-row', 'dumbbell-row-single-arm',
  'chest-supported-row-machine', 'pullups', 'chin-up', 't-bar-row', 'straight-arm-pulldown-cable',
  'barbell-back-squat', 'leg-press-machine', 'hack-squat-machine', 'leg-extension-machine', 'goblet-squat-dumbbell',
  'bulgarian-split-squat', 'smith-squat', 'walking-lunges-dumbbell',
  'romanian-deadlift-barbell', 'romanian-deadlift-dumbbell', 'seated-leg-curl-machine', 'lying-leg-curl-machine',
  'deadlift-conventional',
  'hip-thrust-barbell', 'hip-thrust-machine', 'smith-hip-thrust', 'cable-glute-kickback', 'hip-abduction-machine',
  'glute-bridge-single-leg',
  'overhead-press-dumbbell', 'overhead-press-barbell', 'shoulder-press-machine', 'lateral-raise-dumbbell',
  'lateral-raise-cable', 'lateral-raise-machine', 'rear-delt-fly-machine', 'rear-delt-fly-dumbbell', 'face-pull-cable',
  'bicep-curl-dumbbell', 'hammer-curl-dumbbell', 'bicep-curl-cable', 'incline-curl-dumbbell', 'preacher-curl-machine',
  'bicep-curl-barbell',
  'tricep-pushdown-cable-rope', 'tricep-pushdown-bar', 'overhead-tricep-cable', 'skull-crushers-barbell',
  'standing-overhead-triceps-extension-dumbbell', 'close-grip-bench-press-barbell',
  'cable-crunch', 'plank', 'hanging-leg-raise', 'crunches', 'pallof-press-cable', 'lying-leg-raise-bench',
  'standing-calf-raise-machine', 'seated-calf-raise-machine', 'leg-press-calf-raise', 'standing-calf-raise-dumbbell',
  'dumbbell-shrug', 'barbell-shrug', 'cable-shrug',
  'back-extension-bench', 'reverse-hyperextension-machine',
]);

// וריאציות שדורשות שליטה טכנית גבוהה או מעמיסות חריג - רק למתקדמים
const COMPLEX_VARIATION = /sissy|landmine|pistol|nordic|dragon|planche|muscle[- ]up|handstand|jefferson|good[- ]morning|pullover|single[- ]leg[- ]squat|zercher|deficit|windmill|turkish|stability[- ]ball|exercise[- ]ball|bosu|jm[- ]press|diamond/i;

function isEligible(e: Exercise, p: TrainingProfile, muscle: MuscleGroup, ignoreEquipment: boolean): boolean {
  if (e.muscle !== muscle || e.isWarmup) return false;
  if (!ignoreEquipment && p.equipment && !p.equipment.has(e.equipment)) return false;
  if (!isSafeFor(e, p.injuries)) return false; // פציעות - גם כשמתעלמים מהציוד
  const text = `${e.id} ${e.nameEn}`;
  if (p.joinFriendly && HIGH_IMPACT.test(text)) return false;
  if (p.level === 'beginner' && OLYMPIC.test(text)) return false; // הרמות אולימפיות דורשות הדרכה צמודה
  return true;
}

/** ציון התאמה: מאגר הליבה (תמונות והסברים בעברית), ציוד לפי ניסיון וגיל, גיוון בין מחזורים */
function scoreExercise(e: Exercise, p: TrainingProfile, role: Role, previousCycleIds: Set<string>): number {
  let s = 0;
  if (!e.id.startsWith('ext-')) s += 3;
  if (STAPLES.has(e.id)) s += 4;
  if (p.level !== 'advanced' && COMPLEX_VARIATION.test(`${e.id} ${e.nameEn}`)) s -= 6;
  const isCompound = COMPOUND_EXERCISE_IDS.has(e.id);
  if (role === 'compound' ? isCompound : !isCompound) s += 4;
  const eq = e.equipment;
  if (p.level === 'beginner' || p.older) {
    // יציבות ופשטות טכנית - [acsm2026]: סוג הציוד לא משנה את התוצאה, אז בוחרים את הבטוח
    if (eq === 'machine' || eq === 'cable') s += 2;
    else if (eq === 'dumbbell' || eq === 'smith') s += 1;
  } else if (p.level === 'advanced' || p.primary === 'strength') {
    if (eq === 'barbell') s += 2;
    else if (eq === 'dumbbell') s += 1;
  } else {
    if (eq === 'barbell' || eq === 'dumbbell' || eq === 'machine' || eq === 'cable') s += 1;
  }
  if (previousCycleIds.has(e.id)) s -= 3; // מחזור חדש - עדיף גיוון
  return s;
}

function pickExercise(
  muscle: MuscleGroup,
  role: Role,
  p: TrainingProfile,
  library: Exercise[],
  usedIds: Set<string>,
  previousCycleIds: Set<string>,
  excludeId?: string
): Exercise | null {
  for (const ignoreEquipment of [false, true]) {
    if (ignoreEquipment && !p.equipment) break;
    const pool = library.filter((e) => e.id !== excludeId && isEligible(e, p, muscle, ignoreEquipment));
    if (pool.length === 0) continue;
    const ranked = pool
      .map((e, i) => ({ e, i, score: scoreExercise(e, p, role, previousCycleIds) - (usedIds.has(e.id) ? 10 : 0) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const chosen = ranked[0].e;
    usedIds.add(chosen.id);
    return chosen;
  }
  return null;
}

interface PlannedExercise {
  exercise: Exercise;
  muscle: MuscleGroup;
  role: Role;
}

function planDay(
  day: DayTemplate,
  p: TrainingProfile,
  library: Exercise[],
  maxPerDay: number,
  usedIds: Set<string>,
  previousCycleIds: Set<string>
): PlannedExercise[] {
  const planned: PlannedExercise[] = [];
  day.muscles.forEach((muscle) => {
    const ex = pickExercise(muscle, 'compound', p, library, usedIds, previousCycleIds);
    if (ex) planned.push({ exercise: ex, muscle, role: COMPOUND_EXERCISE_IDS.has(ex.id) ? 'compound' : 'isolation' });
  });
  // תרגיל שני (בידוד) לשרירים לפי עדיפות, כל עוד יש זמן
  let budget = maxPerDay - planned.length;
  const order = [...day.muscles].sort((a, b) => musclePriority(p, a) - musclePriority(p, b));
  for (const muscle of order) {
    if (budget <= 0) break;
    if (LOW_PRIORITY_MUSCLES.has(muscle) && !p.focus.includes(muscle)) continue;
    const first = planned.find((x) => x.muscle === muscle);
    if (!first) continue;
    const iso = pickExercise(muscle, 'isolation', p, library, usedIds, previousCycleIds, first.exercise.id);
    if (iso) {
      planned.push({ exercise: iso, muscle, role: 'isolation' });
      budget -= 1;
    }
  }
  // [order] [acsm2026]: אזורי מיקוד קודם, אחר כך מורכבים (שרירים גדולים קודם), בסוף בידוד
  const rank = (x: PlannedExercise) =>
    (p.focus.includes(x.muscle) ? 0 : 10) + (x.role === 'compound' ? 0 : 5) + musclePriority(p, x.muscle);
  return planned.sort((a, b) => rank(a) - rank(b));
}

/**
 * סטים לכל תרגיל ביום: יעד השבוע של השריר מתחלק בין הימים שבהם הוא מתאמן ובין התרגילים שלו
 * ביום. [volumeDose] סטים של תרגילים אחרים שבהם השריר הוא משני נספרים כחצי סט ומפחיתים את
 * הנפח הישיר שלו (אבל לא פחות מ-2 סטים לתרגיל).
 */
function assignSets(
  planned: PlannedExercise[],
  targets: Partial<Record<MuscleGroup, { start: number; peak: number }>>,
  freq: Map<MuscleGroup, number>,
  week: number,
  lengthWeeks: number,
  cycleNumber: number
): number[] {
  const byMuscle = new Map<MuscleGroup, number[]>();
  planned.forEach((x, i) => byMuscle.set(x.muscle, [...(byMuscle.get(x.muscle) || []), i]));
  const sets = planned.map(() => 2);
  const dailyTarget = (m: MuscleGroup) => {
    const t = targets[m];
    return t ? weeklySetsFor(t, week, lengthWeeks, cycleNumber) / (freq.get(m) || 1) : 4;
  };

  // שלב 1: מורכבים וכל השרירים הגדולים - לפי היעד הישיר
  byMuscle.forEach((idxs, m) => {
    const per = Math.max(2, Math.min(5, Math.round(dailyTarget(m) / idxs.length)));
    idxs.forEach((i) => (sets[i] = per));
  });
  // שלב 2: נפח עקיף (חצי סט) מתרגילים אחרים, מקטין את הנפח הישיר של שרירים בינוניים/קטנים
  byMuscle.forEach((idxs, m) => {
    if (MUSCLE_SIZE_CATEGORY[m] === 'large') return;
    const indirect = planned.reduce(
      (sum, x, i) => (x.muscle !== m && (x.exercise.secondaryMuscles || []).includes(m) ? sum + sets[i] * 0.5 : sum),
      0
    );
    const direct = Math.max(0, dailyTarget(m) - indirect);
    const per = Math.max(2, Math.min(5, Math.round(direct / idxs.length)));
    idxs.forEach((i) => (sets[i] = per));
  });
  return sets;
}

// ===== "למה התוכנית ככה" =====

const SPLIT_LABELS: Record<SplitType, string> = {
  full_body: 'Full Body',
  upper_lower: 'UL',
  push_pull_legs: 'PPL',
  ulppl: 'ULPPL',
};

function buildRationale(p: TrainingProfile, split: SplitType, maxPerDay: number, lengthWeeks: number, settings: UserSettings): PlanDecision[] {
  const d: PlanDecision[] = [];
  const largeVol = volumeTargetFor({ ...p, focus: [] }, 'chest');
  d.push({
    id: 'split',
    text: `${p.daysPerWeek} ימים בשבוע → חלוקת ${SPLIT_LABELS[split]}${split === 'full_body' ? ' (גוף מלא)' : ''}, כך שכל שריר מתאמן בערך פעמיים בשבוע.`,
    evidence: ['frequency', 'acsm2026'],
  });
  d.push({
    id: 'volume',
    text:
      p.primary === 'maintain'
        ? `שמירה: כ-${largeVol.start} סטים בשבוע לשריר גדול - בערך שליש מנפח בנייה, ומספיק כדי לשמור על כוח ומסה.`
        : `נפח: ${largeVol.start} סטים בשבוע לשריר גדול בתחילת המחזור, עולה בהדרגה עד ${largeVol.peak}${p.primary === 'fat_loss' ? ' (מעט פחות מבנייה - בגירעון ההתאוששות איטית יותר)' : ''}. סט שבו השריר עובד כמשני נספר כחצי סט.`,
    evidence: p.primary === 'maintain' ? ['maintenance'] : ['volumeDose', 'acsm2026'],
  });
  const c = repRangeFor(p, 'compound');
  const i = repRangeFor(p, 'isolation');
  d.push({
    id: 'reps',
    text: `${GOAL_LABELS_HE[p.goals[0]]}: ${c.min}-${c.max} חזרות בתרגילים מורכבים, ${i.min}-${i.max} בתרגילי בידוד. לעצור 1-3 חזרות לפני כשל.`,
    evidence: p.primary === 'strength' ? ['acsm2026', 'loadRange', 'proximity'] : ['loadRange', 'proximity'],
  });
  d.push({
    id: 'rest',
    text: `מנוחה: ${Math.round(restFor(p, 'compound') / 30) / 2} דקות בתרגילים מורכבים, ${restFor(p, 'isolation')} שניות בבידוד.`,
    evidence: ['rest'],
  });
  d.push({
    id: 'order',
    text: 'סדר: תרגילים מורכבים ושרירים גדולים בתחילת האימון, בידוד בסוף.',
    evidence: ['order', 'acsm2026'],
  });
  if (p.focus.length) {
    d.push({
      id: 'focus',
      text: `אזורי מיקוד (${p.focus.map(muscleHe).join(', ')}): כ-40% יותר סטים, לפחות פעמיים בשבוע, ובתחילת האימון.`,
      evidence: ['volumeDose', 'order', 'frequency'],
    });
  }
  p.injuries.forEach((a) => {
    const ex = injuryExplanation(a);
    d.push({ id: `injury-${a}`, text: ex.text, evidence: ex.evidence });
  });
  if (p.injuries.length) {
    d.push({
      id: 'pain-rule',
      text: 'כלל הכאב: כאב עד 5 מתוך 10 שחולף עד למחרת - מותר. כאב חד, או כאב שמחמיר - לעצור, להחליף תרגיל, ולהתייעץ עם פיזיותרפיסט/ית.',
      evidence: ['painMonitoring'],
    });
  }
  d.push({
    id: 'experience',
    text:
      p.level === 'beginner'
        ? 'רמת מתחילים: נפח התחלתי נמוך יותר, עדיפות למכונות ופולי (יציבים וקלים ללמידה), בלי הרמות אולימפיות, ומחזור ארוך יותר (5 שבועות).'
        : p.level === 'advanced'
        ? 'רמה מתקדמת: נפח גבוה יותר, עדיפות למשקולות חופשיות, ומחזורים קצרים (3 שבועות) עם שבוע הקלה.'
        : 'רמה בינונית: נפח בינוני-גבוה ומחזור של 4 שבועות כולל שבוע הקלה.',
    evidence: ['volumeDose', 'acsm2026'],
  });
  if (p.older) {
    d.push({
      id: 'age',
      text: 'גיל 60+: עומס מתון (לפחות 8 חזרות), עדיפות למכונות, שיא נפח נמוך מעט, ובלי קפיצות.',
      evidence: ['olderAdults'],
    });
  } else if (p.joinFriendly) {
    d.push({ id: 'joints', text: 'בלי תרגילי קפיצה - פחות עומס על הברכיים והקרסוליים.', evidence: ['kneeOA'] });
  }
  if (settings.gender) {
    d.push({ id: 'sex', text: 'המבנה זהה לגברים ולנשים - ההבדל בתגובה לאימון זניח. המין משפיע על יעדי התזונה.', evidence: ['sex'] });
  }
  d.push({
    id: 'time',
    text: `${p.minutes} דקות לאימון${p.warmup ? ' כולל חימום' : ''} → עד ${maxPerDay} תרגילים ביום. כשאין זמן לכל השרירים - מוותרים קודם על שרירים קטנים, אף פעם לא על אזורי המיקוד.`,
    evidence: [],
  });
  if (p.equipment) {
    const labels = [...p.equipment].map((e) => EQUIPMENT_LABELS[e as keyof typeof EQUIPMENT_LABELS]?.he || e);
    d.push({ id: 'equipment', text: `ציוד: רק תרגילים ל${labels.join(', ')}.`, evidence: [] });
  }
  d.push({
    id: 'cycle',
    text: `מחזור של ${lengthWeeks} שבועות: הנפח עולה כל שבוע, השבוע האחרון קל (חצי נפח) להתאוששות, ואז מחזור חדש עם גיוון בתרגילים.`,
    evidence: [],
  });
  return d;
}

// ===== בניית התוכנית =====

export interface GeneratedProgram {
  routine: RoutineTemplate;
  progressStates: ExerciseProgressState[];
}

function composeTitle(split: SplitType): string {
  return `תוכנית אימונים ${SPLIT_LABELS[split]}`;
}

function composeDescription(p: TrainingProfile, split: SplitType, lengthWeeks: number): string {
  const extras = [
    p.focus.length ? `מיקוד ב${p.focus.map(muscleHe).join(', ')}` : '',
    p.injuries.length ? `מותאמת ל${p.injuries.map(injuryLabel).join(', ')}` : '',
  ].filter(Boolean);
  return (
    `תוכנית ${SPLIT_LABELS[split]} בת ${p.daysPerWeek} ימים בשבוע, לרמת ניסיון ${LEVEL_LABELS_HE[p.level]} ולמטרת ${GOAL_LABELS_HE[p.goals[0]]}` +
    (extras.length ? ` (${extras.join(', ')})` : '') +
    `. עומס עולה בהדרגה במחזור בן ${lengthWeeks} שבועות (כולל שבוע הקלה), ומתחדש אוטומטית בכל מחזור.`
  );
}

function buildWarmupExercises(): RoutineDayExercise[] {
  return WARMUP_EXERCISES.map((ex) => ({ exerciseId: ex.id, targetSets: 1, targetReps: ex.defaultReps }));
}

interface PlanOptions {
  split: SplitType;
  lengthWeeks: number;
  cycleNumber: number;
  previousCycleIds: Set<string>;
  bodyWeightKg?: number;
}

function planProgram(settings: UserSettings, library: Exercise[], opts: PlanOptions) {
  const p = buildTrainingProfile(settings, opts.bodyWeightKg);
  const maxPerDay = computeMaxExercisesPerDay(p.minutes, p.warmup);
  const dayTemplates = personalizeDays(p, tileDays(opts.split, p.daysPerWeek), maxPerDay);
  const freq = muscleFrequency(dayTemplates);
  const allMuscles = [...new Set(dayTemplates.flatMap((d) => d.muscles))];
  const volumeTargets: Partial<Record<MuscleGroup, { start: number; peak: number }>> = {};
  allMuscles.forEach((m) => (volumeTargets[m] = volumeTargetFor(p, m)));
  const usedIds = new Set<string>();
  const warmup = p.warmup ? buildWarmupExercises() : [];
  const ranges = new Map<string, { min: number; max: number }>();

  const days: RoutineDay[] = dayTemplates.map((template, idx) => {
    const planned = planDay(template, p, library, maxPerDay, usedIds, opts.previousCycleIds);
    const sets = assignSets(planned, volumeTargets, freq, 1, opts.lengthWeeks, opts.cycleNumber);
    const main: RoutineDayExercise[] = planned.map((x, i) => {
      const range = repRangeFor(p, x.role);
      if (!ranges.has(x.exercise.id)) ranges.set(x.exercise.id, range);
      return {
        exerciseId: x.exercise.id,
        targetSets: sets[i],
        targetReps: range.min,
        repRangeMax: range.max,
        restSec: restFor(p, x.role),
      };
    });
    const muscles = [...new Set(planned.map((x) => x.muscle))];
    return {
      dayNumber: idx + 1,
      dayTitle: `יום ${idx + 1} (${template.title})`,
      targetMuscles: muscles.map(muscleHe).join(', '),
      estimatedCalories: main.length * 45,
      estimatedMinutes: main.length * MINUTES_PER_MAIN_EXERCISE + warmup.length * MINUTES_PER_WARMUP_EXERCISE,
      exercises: [...warmup, ...main],
    };
  });

  return { p, days, volumeTargets, ranges, rationale: buildRationale(p, opts.split, maxPerDay, opts.lengthWeeks, settings) };
}

function progressStatesFor(routineId: string, ranges: Map<string, { min: number; max: number }>, skip: Set<string>): ExerciseProgressState[] {
  const out: ExerciseProgressState[] = [];
  ranges.forEach((range, exerciseId) => {
    if (skip.has(exerciseId)) return;
    out.push({
      id: `${routineId}:${exerciseId}`,
      routineId,
      exerciseId,
      currentWeightKg: 0,
      repRangeMin: range.min,
      repRangeMax: range.max,
      currentTargetReps: range.min,
      consecutiveStalls: 0,
    });
  });
  return out;
}

export function buildRoutine(settings: UserSettings, library: Exercise[], bodyWeightKg?: number): GeneratedProgram {
  const level: ExperienceLevel = settings.experienceLevel || 'beginner';
  const daysPerWeek = Math.min(6, Math.max(2, settings.trainingDaysPerWeek || 3));
  const split = chooseSplit(daysPerWeek, level);
  const lengthWeeks = MESOCYCLE_LENGTH_BY_LEVEL[level];
  const { p, days, volumeTargets, ranges, rationale } = planProgram(settings, library, {
    split,
    lengthWeeks,
    cycleNumber: 1,
    previousCycleIds: new Set(),
    bodyWeightKg,
  });

  const routine: RoutineTemplate = {
    id: `generated-${Date.now()}`,
    title: composeTitle(split),
    description: composeDescription(p, split, lengthWeeks),
    category: split === 'full_body' ? 'fullbody' : split === 'upper_lower' ? 'upper_lower' : 'ppl',
    days,
    exercises: days.flatMap((d) => d.exercises),
    isCustom: false,
    isGenerated: true,
    splitType: split,
    createdAt: Date.now(),
    mesocycle: { lengthWeeks, currentWeek: 1, cycleNumber: 1, deloadWeekIndex: lengthWeeks, sessionsCompletedThisWeek: 0 },
    planRationale: rationale,
    volumeTargets,
  };
  return { routine, progressStates: progressStatesFor(routine.id, ranges, new Set()) };
}

// מעדכן את מספר הסטים לפי השבוע במחזור, בלי לשנות את בחירת התרגילים. משתמש ביעדי הנפח
// האישיים שנשמרו בתוכנית (volumeTargets) - כולל מיקוד, גיל ומטרה.
export function applyWeeklyVolume(routine: RoutineTemplate, week: number, library: Exercise[]): RoutineTemplate {
  if (!routine.mesocycle || routine.manuallyEditedAt) return routine;
  const { cycleNumber, lengthWeeks } = routine.mesocycle;
  const byId = new Map(library.map((e) => [e.id, e]));
  const warmupIds = new Set(library.filter((e) => e.isWarmup).map((e) => e.id));

  // תוכנית ישנה (לפני יעדים אישיים) - יעדי ברירת המחדל של רמה בינונית
  const targets: Partial<Record<MuscleGroup, { start: number; peak: number }>> = { ...(routine.volumeTargets || {}) };
  const legacyProfile = { level: 'intermediate', primary: 'hypertrophy', focus: [], older: false } as unknown as TrainingProfile;

  const freq = new Map<MuscleGroup, number>();
  routine.days.forEach((day) => {
    const muscles = new Set(
      day.exercises.filter((e) => !warmupIds.has(e.exerciseId)).map((e) => byId.get(e.exerciseId)?.muscle).filter(Boolean) as MuscleGroup[]
    );
    muscles.forEach((m) => {
      freq.set(m, (freq.get(m) || 0) + 1);
      if (!targets[m]) targets[m] = volumeTargetFor(legacyProfile, m);
    });
  });

  const days: RoutineDay[] = routine.days.map((day) => {
    const main = day.exercises.filter((e) => !warmupIds.has(e.exerciseId) && byId.get(e.exerciseId));
    const planned: PlannedExercise[] = main.map((e) => {
      const ex = byId.get(e.exerciseId)!;
      return { exercise: ex, muscle: ex.muscle, role: COMPOUND_EXERCISE_IDS.has(ex.id) ? 'compound' : 'isolation' };
    });
    const sets = assignSets(planned, targets, freq, week, lengthWeeks, cycleNumber);
    let k = 0;
    const exercises = day.exercises.map((e) => {
      if (warmupIds.has(e.exerciseId) || !byId.get(e.exerciseId)) return e;
      return { ...e, targetSets: sets[k++] };
    });
    return { ...day, exercises };
  });
  return { ...routine, days };
}

// מחזור חדש אחרי שבוע ההקלה: אותה חלוקה, בחירת תרגילים מחודשת (עדיפות לגיוון), והגדרות
// עדכניות של המשתמש (אם שינה פציעות/מיקוד/ציוד - המחזור החדש כבר מתחשב בהן).
export function regenerateForNewCycle(routine: RoutineTemplate, settings: UserSettings, library: Exercise[], bodyWeightKg?: number): GeneratedProgram {
  const level: ExperienceLevel = settings.experienceLevel || 'beginner';
  const lengthWeeks = routine.mesocycle?.lengthWeeks || MESOCYCLE_LENGTH_BY_LEVEL[level];
  const nextCycleNumber = (routine.mesocycle?.cycleNumber || 1) + 1;
  const mesocycle = { lengthWeeks, currentWeek: 1, cycleNumber: nextCycleNumber, deloadWeekIndex: lengthWeeks, sessionsCompletedThisWeek: 0 };

  // המשתמש ערך ידנית את התוכנית - לא דורסים, רק מגלגלים את המחזור
  if (routine.manuallyEditedAt) return { routine: { ...routine, mesocycle }, progressStates: [] };

  const daysPerWeek = Math.min(6, Math.max(2, settings.trainingDaysPerWeek || 3));
  const split = routine.splitType || chooseSplit(daysPerWeek, level);
  const existingIds = new Set(routine.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const { p, days, volumeTargets, ranges, rationale } = planProgram(settings, library, {
    split,
    lengthWeeks,
    cycleNumber: nextCycleNumber,
    previousCycleIds: existingIds,
    bodyWeightKg,
  });

  const newRoutine: RoutineTemplate = {
    ...routine,
    title: composeTitle(split),
    description: composeDescription(p, split, lengthWeeks),
    days,
    exercises: days.flatMap((d) => d.exercises),
    mesocycle,
    planRationale: rationale,
    volumeTargets,
  };
  // תרגיל שנשאר מהמחזור הקודם ממשיך עם ה"זיכרון" שלו; חדש מקבל state התחלתי
  return { routine: newRoutine, progressStates: progressStatesFor(routine.id, ranges, existingIds) };
}
