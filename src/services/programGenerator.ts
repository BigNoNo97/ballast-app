import {
  Exercise,
  ExerciseProgressState,
  ExperienceLevel,
  MuscleGroup,
  OnboardingGoal,
  RoutineDay,
  RoutineDayExercise,
  RoutineTemplate,
  SplitType,
  UserSettings,
} from '../types';
import { MUSCLE_GROUP_LABELS } from '../data/exercises';
import { COMPOUND_EXERCISE_IDS, MUSCLE_SIZE_CATEGORY, VOLUME_LANDMARKS } from '../data/exerciseClassification';
import { WARMUP_EXERCISES } from '../data/warmupExercises';

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

// מחזור בן 5 שבועות למתחילים (הסתגלות איטית יותר), 4 לבינוניים, 3 למתקדמים
// (בלוקים קצרים יותר לפני שמתרגלים לגירוי, לפי המחקר על אקומודציה).
const MESOCYCLE_LENGTH_BY_LEVEL: Record<ExperienceLevel, number> = {
  beginner: 5,
  intermediate: 4,
  advanced: 3,
};

// טווח חזרות לפי מטרה - סדר עדיפות כשנבחרו כמה מטרות: כוח > עלייה בשריר > הרדורת שומן > שמירה.
const REP_RANGE_BY_GOAL: Record<OnboardingGoal, { min: number; max: number }> = {
  strength: { min: 4, max: 6 },
  gain_muscle: { min: 8, max: 12 },
  lose_weight: { min: 10, max: 15 },
  maintain: { min: 10, max: 15 },
};
const GOAL_PRIORITY: OnboardingGoal[] = ['strength', 'gain_muscle', 'lose_weight', 'maintain'];

export function pickRepRange(goals: OnboardingGoal[] | undefined): { min: number; max: number } {
  const primary = GOAL_PRIORITY.find((g) => goals?.includes(g)) || 'maintain';
  return REP_RANGE_BY_GOAL[primary];
}

function equipmentSetFromSettings(settings: UserSettings): Set<string> | null {
  if (!settings.availableEquipment) return null; // לא נשאל מעולם (חשבון ישן) - כל הציוד, ברירת מחדל היסטורית
  // בחר "בבית" ולא סימן שום ציוד - משקל גוף תמיד קיים בפועל, לא הופך את זה ל"כל הציוד"
  if (settings.availableEquipment.length === 0) return new Set<string>(['bodyweight']);
  return new Set<string>(settings.availableEquipment);
}

const SPLIT_LABELS: Record<SplitType, string> = {
  full_body: 'Full Body',
  upper_lower: 'UL',
  push_pull_legs: 'PPL',
  ulppl: 'ULPPL',
};

function composeTitle(split: SplitType): string {
  return `תוכנית אימונים ${SPLIT_LABELS[split]}`;
}

function composeDescription(
  split: SplitType,
  daysPerWeek: number,
  level: ExperienceLevel,
  goals: OnboardingGoal[] | undefined,
  lengthWeeks: number
): string {
  const goalLabel = GOAL_LABELS_HE[goals && goals.length > 0 ? goals[0] : 'maintain'];
  return (
    `תוכנית ${SPLIT_LABELS[split]} בת ${daysPerWeek} ימים בשבוע, מותאמת לרמת ניסיון ${LEVEL_LABELS_HE[level]} ` +
    `ולמטרת ${goalLabel}. עומס עולה בהדרגה במחזור בן ${lengthWeeks} שבועות (כולל שבוע דילול), ומתחדש אוטומטית בכל מחזור.`
  );
}

// כמה תרגילים ליום בהתאם למשך האימון המועדף - נגזר מהיחס הקיים כבר בקוד
// (estimatedMinutes = מספר תרגילים * 8), כך ש-60 דק' (ברירת המחדל הישנה) נותן בדיוק 8 כמו קודם.
function computeMaxExercisesPerDay(sessionDurationMinutes: number | undefined): number {
  const minutes = sessionDurationMinutes || 60;
  return Math.max(3, Math.round(minutes / 8));
}

// שני תרגילי חימום כלליים (לא ספציפיים לשריר) שנוספים בתחילת כל יום כשהמשתמש בחר בכך.
// לא נכנסים למעקב ההתקדמות (ExerciseProgressState) - אין להם מושג "עומס הדרגתי".
function buildWarmupExercises(): RoutineDayExercise[] {
  return WARMUP_EXERCISES.map((ex) => ({ exerciseId: ex.id, targetSets: 1, targetReps: ex.defaultReps }));
}

export function chooseSplit(daysPerWeek: number, level: ExperienceLevel): SplitType {
  if (daysPerWeek <= 2) return 'full_body';
  if (daysPerWeek === 3) return level === 'beginner' ? 'full_body' : 'push_pull_legs';
  if (daysPerWeek === 4) return 'upper_lower';
  if (daysPerWeek === 5) return 'ulppl';
  return 'push_pull_legs'; // 6 ימים - PPL פעמיים בשבוע
}

function tileDays(split: SplitType, daysPerWeek: number): DayTemplate[] {
  const template = SPLIT_DAY_TEMPLATES[split];
  const days: DayTemplate[] = [];
  for (let i = 0; i < daysPerWeek; i++) days.push(template[i % template.length]);
  return days;
}

// כמה פעמים בשבוע כל שריר מתאמן בפועל, לפי הרשימה המרוצפת של הימים - נדרש כדי לחלק
// את יעד הנפח השבועי שלו בין ימי האימון בלי לספור אותו כפול.
function muscleFrequency(days: DayTemplate[]): Map<MuscleGroup, number> {
  const freq = new Map<MuscleGroup, number>();
  days.forEach((d) => d.muscles.forEach((m) => freq.set(m, (freq.get(m) || 0) + 1)));
  return freq;
}

// רמפה לינארית מ-MEV לכיוון MAV על פני שבועות העומס במחזור (לא כולל שבוע הדילול),
// עם bonus קטן ומוגבל בין מחזורים (עומס הדרגתי אמיתי, לא רק תוך-מחזור).
function weeklyVolumeForMuscle(muscle: MuscleGroup, week: number, lengthWeeks: number, cycleNumber: number): number {
  const { mev, mav } = VOLUME_LANDMARKS[MUSCLE_SIZE_CATEGORY[muscle]];
  const cycleBonus = Math.min(cycleNumber - 1, 3); // נעצר אחרי 3 מחזורים - התקדמות לינארית אינסופית אינה ריאלית
  const loadWeeks = Math.max(1, lengthWeeks - 1); // שבוע אחרון = דילול, לא חלק מהרמפה
  const isDeload = week >= lengthWeeks;
  if (isDeload) return Math.round((mev + cycleBonus) * 0.5);
  const progress = loadWeeks === 1 ? 1 : (week - 1) / (loadWeeks - 1);
  return Math.round(mev + cycleBonus + progress * (mav - mev));
}

// שרירי תמיכה קטנים - תמיד תרגיל אחד בלבד, בלי "בונוס" בידוד (אין באמת הבדל
// משמעותי בין תרגיל מורכב/בידוד לתאומים או גב תחתון, ולרוב הם לא המטרה המרכזית של היום).
const LOW_PRIORITY_MUSCLES = new Set<MuscleGroup>(['calves', 'traps', 'lower_back']);

function pickOneExercise(
  muscle: MuscleGroup,
  library: Exercise[],
  equipment: Set<string> | null,
  preferCompound: boolean,
  usedIds: Set<string>,
  excludeId?: string
): Exercise | null {
  const candidates = library.filter(
    (e) => e.muscle === muscle && e.id !== excludeId && !e.isWarmup && (!equipment || equipment.has(e.equipment))
  );
  if (candidates.length === 0) return null;
  const filtered = candidates.filter((e) => COMPOUND_EXERCISE_IDS.has(e.id) === preferCompound);
  const pool = filtered.length > 0 ? filtered : candidates;
  const chosen = pool.find((e) => !usedIds.has(e.id)) || pool[0];
  if (chosen) usedIds.add(chosen.id);
  return chosen;
}

// לכל שריר ביום: תרגיל מורכב אחד תמיד (מבטיח כיסוי), ואז "בונוס" תרגיל בידוד רק אם יש
// עדיין תקציב ביום (MAX_EXERCISES_PER_DAY), בעדיפות לשרירים גדולים - כדי שימים עם הרבה
// שרירים (גוף מלא, רגליים) לא יתפוצצו ל-10+ תרגילים.
function buildDayExercises(
  day: DayTemplate,
  library: Exercise[],
  equipment: Set<string> | null,
  freq: Map<MuscleGroup, number>,
  week: number,
  lengthWeeks: number,
  cycleNumber: number,
  usedIds: Set<string>,
  maxExercisesPerDay: number
): RoutineDayExercise[] {
  const picks = new Map<MuscleGroup, Exercise[]>();
  day.muscles.forEach((muscle) => {
    const compound = pickOneExercise(muscle, library, equipment, true, usedIds);
    if (compound) picks.set(muscle, [compound]);
  });

  let budget = Math.max(0, maxExercisesPerDay - day.muscles.length);
  const rank = (m: MuscleGroup) => (LOW_PRIORITY_MUSCLES.has(m) ? 2 : MUSCLE_SIZE_CATEGORY[m] === 'large' ? 0 : 1);
  const priorityOrder = [...day.muscles].sort((a, b) => rank(a) - rank(b));
  for (const muscle of priorityOrder) {
    if (budget <= 0) break;
    if (LOW_PRIORITY_MUSCLES.has(muscle)) continue;
    const existing = picks.get(muscle);
    if (!existing || existing.length === 0) continue;
    const iso = pickOneExercise(muscle, library, equipment, false, usedIds, existing[0].id);
    if (iso) {
      existing.push(iso);
      budget -= 1;
    }
  }

  const exercises: RoutineDayExercise[] = [];
  day.muscles.forEach((muscle) => {
    const picked = picks.get(muscle);
    if (!picked || picked.length === 0) return;
    const weeklySets = weeklyVolumeForMuscle(muscle, week, lengthWeeks, cycleNumber);
    const timesPerWeek = freq.get(muscle) || 1;
    const setsForThisDay = Math.max(picked.length * 2, Math.round(weeklySets / timesPerWeek));
    const setsPerExercise = Math.max(2, Math.round(setsForThisDay / picked.length));
    picked.forEach((ex) => {
      exercises.push({ exerciseId: ex.id, targetSets: setsPerExercise, targetReps: 0 }); // targetReps מוגדר בשלב 2
    });
  });
  return exercises;
}

export interface GeneratedProgram {
  routine: RoutineTemplate;
  progressStates: ExerciseProgressState[];
}

export function buildRoutine(settings: UserSettings, library: Exercise[]): GeneratedProgram {
  const level: ExperienceLevel = settings.experienceLevel || 'beginner';
  const daysPerWeek = Math.min(6, Math.max(2, settings.trainingDaysPerWeek || 3));
  const equipment = equipmentSetFromSettings(settings);
  const split = chooseSplit(daysPerWeek, level);
  const dayTemplates = tileDays(split, daysPerWeek);
  const freq = muscleFrequency(dayTemplates);
  const lengthWeeks = MESOCYCLE_LENGTH_BY_LEVEL[level];
  const repRange = pickRepRange(settings.goals);
  const usedIds = new Set<string>();
  const maxExercisesPerDay = computeMaxExercisesPerDay(settings.sessionDurationMinutes);
  const warmup = settings.includeWarmup ? buildWarmupExercises() : [];

  const days: RoutineDay[] = dayTemplates.map((template, idx) => {
    const mainExercises = buildDayExercises(template, library, equipment, freq, 1, lengthWeeks, 1, usedIds, maxExercisesPerDay).map((e) => ({
      ...e,
      targetReps: repRange.min,
    }));
    const exercises = [...warmup, ...mainExercises];
    const muscleLabels = template.muscles.map((m) => MUSCLE_GROUP_LABELS[m]?.he).filter(Boolean);
    return {
      dayNumber: idx + 1,
      dayTitle: `יום ${idx + 1} (${template.title})`,
      targetMuscles: muscleLabels.join(', '),
      estimatedCalories: mainExercises.length * 45,
      estimatedMinutes: exercises.length * 8,
      exercises,
    };
  });

  const routine: RoutineTemplate = {
    id: `generated-${Date.now()}`,
    title: composeTitle(split),
    description: composeDescription(split, daysPerWeek, level, settings.goals, lengthWeeks),
    category: split === 'full_body' ? 'fullbody' : split === 'upper_lower' ? 'upper_lower' : 'ppl',
    days,
    exercises: days.flatMap((d) => d.exercises),
    isCustom: false,
    isGenerated: true,
    splitType: split,
    createdAt: Date.now(),
    mesocycle: {
      lengthWeeks,
      currentWeek: 1,
      cycleNumber: 1,
      deloadWeekIndex: lengthWeeks,
      sessionsCompletedThisWeek: 0,
    },
  };

  // תרגילי חימום לא נכנסים למעקב ההתקדמות - אין להם משמעות של עומס הדרגתי.
  const progressStates: ExerciseProgressState[] = days
    .flatMap((d) => d.exercises)
    .filter((e) => !warmup.some((w) => w.exerciseId === e.exerciseId))
    .reduce<ExerciseProgressState[]>((acc, e) => {
      if (acc.some((s) => s.exerciseId === e.exerciseId)) return acc; // אותו תרגיל יכול לחזור בכמה ימים (תדירות 2x)
      acc.push({
        id: `${routine.id}:${e.exerciseId}`,
        routineId: routine.id,
        exerciseId: e.exerciseId,
        currentWeightKg: 0,
        repRangeMin: repRange.min,
        repRangeMax: repRange.max,
        currentTargetReps: repRange.min,
        consecutiveStalls: 0,
      });
      return acc;
    }, []);

  return { routine, progressStates };
}

// מעדכן רק את נפח הסטים לכל תרגיל לפי שבוע נתון במחזור - לא נוגע בבחירת התרגילים עצמם
// (הבחירה משתנה רק ב-rollover למחזור חדש, לא באמצע מחזור). דורש את מאגר התרגילים כדי
// לשחזר איזה שריר כל exerciseId מייצג (לא נשמר ישירות על RoutineDayExercise).
export function applyWeeklyVolume(routine: RoutineTemplate, week: number, library: Exercise[]): RoutineTemplate {
  if (!routine.mesocycle) return routine;
  const { cycleNumber } = routine.mesocycle;
  const muscleById = new Map<string, MuscleGroup>();
  const warmupIds = new Set(library.filter((e) => e.isWarmup).map((e) => e.id));
  library.forEach((e) => muscleById.set(e.id, e.muscle));

  // תדירות שבועית לכל שריר - כמה ימים באותו שבוע כוללים אותו שריר. תרגילי חימום לא נספרים -
  // הם לא חלק מנפח האימון "האמיתי" ולא צריכים להשפיע על חלוקת הסטים.
  const freq = new Map<MuscleGroup, number>();
  routine.days.forEach((day) => {
    const musclesToday = new Set(
      day.exercises.filter((e) => !warmupIds.has(e.exerciseId)).map((e) => muscleById.get(e.exerciseId)).filter(Boolean) as MuscleGroup[]
    );
    musclesToday.forEach((m) => freq.set(m, (freq.get(m) || 0) + 1));
  });

  const days: RoutineDay[] = routine.days.map((day) => {
    // כמה תרגילים ביום הזה משותפים לאותו שריר - כדי לחלק את הנפח היומי ביניהם.
    const exercisesByMuscle = new Map<MuscleGroup, number>();
    day.exercises.forEach((e) => {
      if (warmupIds.has(e.exerciseId)) return;
      const m = muscleById.get(e.exerciseId);
      if (m) exercisesByMuscle.set(m, (exercisesByMuscle.get(m) || 0) + 1);
    });
    const exercises = day.exercises.map((e) => {
      if (warmupIds.has(e.exerciseId)) return e; // תרגילי חימום נשארים תמיד סט 1 קבוע
      const muscle = muscleById.get(e.exerciseId);
      if (!muscle) return e;
      const weeklySets = weeklyVolumeForMuscle(muscle, week, routine.mesocycle!.lengthWeeks, cycleNumber);
      const timesPerWeek = freq.get(muscle) || 1;
      const exercisesForMuscleToday = exercisesByMuscle.get(muscle) || 1;
      const setsForThisDay = Math.round(weeklySets / timesPerWeek);
      const targetSets = Math.max(2, Math.round(setsForThisDay / exercisesForMuscleToday));
      return { ...e, targetSets };
    });
    return { ...day, exercises };
  });

  return { ...routine, days };
}

// נקרא ב-rollover לסוף שבוע הדילול: אותו split, בחירת תרגילים מחודשת (עדיפות לגיוון מהמחזור
// הקודם), ומחזור חדש שמתחיל שוב משבוע 1 - אבל בנקודת נפח פתיחה גבוהה מעט (weeklyVolumeForMuscle
// כולל cycleBonus). state של תרגילים שנשארים ממשיך כרגיל; תרגילים חדשים מקבלים state התחלתי.
export function regenerateForNewCycle(routine: RoutineTemplate, settings: UserSettings, library: Exercise[]): GeneratedProgram {
  const level: ExperienceLevel = settings.experienceLevel || 'beginner';
  const daysPerWeek = Math.min(6, Math.max(2, settings.trainingDaysPerWeek || 3));
  const equipment = equipmentSetFromSettings(settings);
  const split = routine.splitType || chooseSplit(daysPerWeek, level);
  const dayTemplates = tileDays(split, daysPerWeek);
  const freq = muscleFrequency(dayTemplates);
  const lengthWeeks = routine.mesocycle?.lengthWeeks || MESOCYCLE_LENGTH_BY_LEVEL[level];
  const nextCycleNumber = (routine.mesocycle?.cycleNumber || 1) + 1;
  const repRange = pickRepRange(settings.goals);
  const existingIds = new Set(routine.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const usedIds = new Set(existingIds); // מעדיף תרגילים אחרים מהמחזור הקודם, לגיוון
  const maxExercisesPerDay = computeMaxExercisesPerDay(settings.sessionDurationMinutes);
  const warmup = settings.includeWarmup ? buildWarmupExercises() : [];

  const days: RoutineDay[] = dayTemplates.map((template, idx) => {
    const mainExercises = buildDayExercises(template, library, equipment, freq, 1, lengthWeeks, nextCycleNumber, usedIds, maxExercisesPerDay).map((e) => ({
      ...e,
      targetReps: repRange.min,
    }));
    const exercises = [...warmup, ...mainExercises];
    const muscleLabels = template.muscles.map((m) => MUSCLE_GROUP_LABELS[m]?.he).filter(Boolean);
    return {
      dayNumber: idx + 1,
      dayTitle: `יום ${idx + 1} (${template.title})`,
      targetMuscles: muscleLabels.join(', '),
      estimatedCalories: mainExercises.length * 45,
      estimatedMinutes: exercises.length * 8,
      exercises,
    };
  });

  const newRoutine: RoutineTemplate = {
    ...routine,
    title: composeTitle(split),
    description: composeDescription(split, daysPerWeek, level, settings.goals, lengthWeeks),
    days,
    exercises: days.flatMap((d) => d.exercises),
    mesocycle: {
      lengthWeeks,
      currentWeek: 1,
      cycleNumber: nextCycleNumber,
      deloadWeekIndex: lengthWeeks,
      sessionsCompletedThisWeek: 0,
    },
  };

  const warmupIds = new Set(warmup.map((w) => w.exerciseId));
  const newIds = new Set(days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const progressStates: ExerciseProgressState[] = [];
  newIds.forEach((exerciseId) => {
    if (!existingIds.has(exerciseId) && !warmupIds.has(exerciseId)) {
      progressStates.push({
        id: `${routine.id}:${exerciseId}`,
        routineId: routine.id,
        exerciseId,
        currentWeightKg: 0,
        repRangeMin: repRange.min,
        repRangeMax: repRange.max,
        currentTargetReps: repRange.min,
        consecutiveStalls: 0,
      });
    }
  });

  return { routine: newRoutine, progressStates };
}
