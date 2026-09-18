export type MuscleGroup =
  | 'chest'          // חזה
  | 'back'           // גב
  | 'traps'          // טרפזים
  | 'shoulders'      // כתפיים
  | 'biceps'         // יד קדמית
  | 'triceps'        // יד אחורית
  | 'quads'          // ארבע-ראשי
  | 'hamstrings'     // ירך אחורית
  | 'glutes'         // ישבן
  | 'calves'         // תאומים
  | 'core'           // בטן
  | 'lower_back';    // גב תחתון

export type EquipmentType =
  | 'barbell'        // מוט חופשי
  | 'dumbbell'       // משקולות יד
  | 'machine'        // מכונה ייעודית
  | 'cable'          // פולי / כבלים
  | 'bodyweight'     // משקל גוף
  | 'smith'          // סמית׳
  | 'other';

export interface Exercise {
  id: string;
  nameHe: string;
  nameEn: string;
  muscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  alternatives: string[];
  defaultSets: number;
  defaultReps: number;
  defaultRestSec: number;
  tipsHe?: string;
  isCustom?: boolean;
  image?: string; // תמונה אמיתית מהתרגיל (CC-BY-SA, קרדיט בהגדרות)
}

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: SetType;
  weightKg: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  completedAt?: number;
  previousWeight?: number;
  previousReps?: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  sets: WorkoutSet[];
  notes?: string;
  swappedFromId?: string;
  supersetGroupId?: string;
}

export interface WorkoutSession {
  id: string;
  title: string;
  routineId?: string;
  dayNumber?: number;
  targetMuscles?: string;
  startTime: number;
  endTime?: number;
  durationSec: number;
  exercises: WorkoutExercise[];
  notes?: string;
  isCompleted: boolean;
  totalVolumeKg: number;
  completedSetsCount: number;
  newPRs?: PersonalRecord[];
}

export interface ProgressionRule {
  metric: 'weight' | 'reps';
  mode: 'add' | 'percent';
  amount: number; // ק"ג/חזרות (add) או אחוז (percent)
  requireCompletion: boolean; // להעלות רק אם הסט האחרון הושלם בפועל
}

export interface RoutineDayExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  suggestedWeight?: number;
  supersetGroupId?: string;
  progressionRule?: ProgressionRule;
}

export interface RoutineDay {
  dayNumber: number;
  dayTitle: string;
  targetMuscles: string;
  estimatedCalories: number;
  estimatedMinutes: number;
  exercises: RoutineDayExercise[];
}

export type SplitType = 'full_body' | 'upper_lower' | 'push_pull_legs' | 'ulppl';

// מחזור אימון (מסוסייקל) - כמה שבועות של עומס עולה ואז שבוע דילול, לתוכניות שהמערכת בנתה.
export interface MesocyclePlan {
  lengthWeeks: number; // כולל שבוע הדילול (למשל 4 = 3 שבועות עומס + שבוע דילול)
  currentWeek: number; // 1-based, מתאפס ל-1 אחרי שבוע דילול
  cycleNumber: number; // עולה ב-1 בכל פעם שמחזור שלם מסתיים
  deloadWeekIndex: number; // בפועל = lengthWeeks (השבוע האחרון במחזור)
  sessionsCompletedThisWeek: number; // סופר אימונים שהושלמו בשבוע הנוכחי, כדי לדעת מתי לעבור לשבוע הבא
}

// "הזיכרון" של מנוע ההתקדמות לתרגיל בודד בתוכנית שהמערכת בנתה - מתעדכן אחרי כל אימון מתועד.
export interface ExerciseProgressState {
  id: string; // `${routineId}:${exerciseId}` - מזהה יציב לסנכרון ענן (אותו mechanism כמו כל שאר הרשימות)
  exerciseId: string;
  routineId: string;
  currentWeightKg: number;
  repRangeMin: number;
  repRangeMax: number;
  currentTargetReps: number; // המיקום הנוכחי בטווח החזרות (להתקדמות כפולה)
  consecutiveStalls: number; // כמה אימונים רצופים לא עמדו במטרה על התרגיל הזה
  lastSessionResult?: 'progressed' | 'held' | 'deloaded';
}

export interface RoutineTemplate {
  id: string;
  title: string;
  description: string;
  category: 'ppl' | 'upper_lower' | 'fullbody' | 'custom' | 'bro_split' | 'science';
  days: RoutineDay[];
  exercises: {
    exerciseId: string;
    targetSets: number;
    targetReps: number;
  }[]; // Fallback for single-day routines
  isCustom?: boolean;
  createdAt?: number;
  requireLogToAdvance?: boolean; // אל תתקדם ליום הבא אם לא תועד אף סט באימון
  isGenerated?: boolean; // true = נבנתה אוטומטית ע"י מנוע התוכניות, לא ע"י המשתמש
  splitType?: SplitType;
  mesocycle?: MesocyclePlan;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseNameHe: string;
  maxWeight: number;
  repsAtMaxWeight: number;
  totalExerciseWeight?: number;
  totalExerciseReps?: number;
  totalSetsCount?: number;
  estimated1RM: number;
  date: number;
  workoutId: string;
  isNew?: boolean;
}

export type OnboardingGoal = 'lose_weight' | 'gain_muscle' | 'strength' | 'maintain';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserSettings {
  weightUnit: 'kg' | 'lbs';
  defaultRestSeconds: number;
  autoRestTimerEnabled: boolean;
  soundEnabled: boolean;
  hapticEnabled: boolean;
  theme: 'dark' | 'light';
  showIphoneFrameOnDesktop: boolean;
  language: 'he' | 'en';
  scheduledWeekdays: number[]; // 0 = ראשון ... 6 = שבת
  onboardingCompleted?: boolean;
  // undefined = חשבון ישן/עוד לא הוגדר (נופל חזרה על routines[0], ההתנהגות ההיסטורית),
  // null = המשתמש מודע ואין לו תוכנית פעילה בכוונה, string = מזהה התוכנית הפעילה בפועל.
  activeRoutineId?: string | null;
  gender?: 'male' | 'female';
  ageYears?: number;
  heightCm?: number;
  goals?: OnboardingGoal[];
  experienceLevel?: ExperienceLevel;
  appleHealthSyncEnabled?: boolean;
  trainingDaysPerWeek?: number; // 2-6, נאסף באונבורדינג - כמה ימי אימון בשבוע המשתמש יכול לעשות
  availableEquipment?: EquipmentType[]; // undefined = גישה לכל סוגי הציוד (חדר כושר מלא)
  nutritionAutoAdjustEnabled?: boolean; // undefined/true = מופעל, false = המשתמש כיבה
  lastNutritionAdaptationPromptAt?: number; // timestamp - למנוע הצעות חזרתיות תכופות
}

export interface BodyWeightEntry {
  id: string;
  date: number; // timestamp
  weightKg: number;
}

export interface MeasurementCategory {
  id: string;
  name: string; // לדוגמה: "היקף מותן"
  unit: string; // לדוגמה: "ס״מ"
  createdAt: number;
}

export interface MeasurementEntry {
  id: string;
  categoryId: string;
  date: number;
  value: number;
}

export interface ProgressPhoto {
  id: string;
  date: number;
  note?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface NutritionEntry {
  id: string;
  date: number;
  mealType: MealType;
  foodId: string;
  foodName: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface NutritionGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
