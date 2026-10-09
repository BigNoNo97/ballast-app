import {
  Exercise,
  RoutineTemplate,
  WorkoutSession,
  PersonalRecord,
  UserSettings,
  WorkoutSet,
  BodyWeightEntry,
  MeasurementCategory,
  MeasurementEntry,
  ProgressPhoto,
  FoodItem,
  NutritionEntry,
  NutritionGoals,
  ExerciseProgressState,
} from '../types';
import { INITIAL_EXERCISES } from '../data/exercises';
import { WARMUP_EXERCISES } from '../data/warmupExercises';
import { IMPORTED_EXERCISES } from '../data/importedExercises';
import { DEFAULT_ROUTINES } from '../data/defaultRoutines';
import {
  setCloudUser,
  getCloudUser,
  syncListToCloud,
  pullListFromCloud,
  syncSettingsToCloud,
  pullSettingsFromCloud,
  cloudHasAnyData,
  deleteAllCloudRows,
  getTableShadow,
  setTableShadow,
  clearSyncShadow,
  mergeCloudWithLocal,
  countPendingChanges,
} from './cloudSync';
import { PhotoStorage } from './photoStorage';

interface CloudSettingsBlob {
  settings: UserSettings;
  nutritionGoals: NutritionGoals;
  targetWeight: number | null;
  exerciseNotes: Record<string, string>;
  favoriteExerciseIds: string[];
  selectedDayByRoutine: Record<string, number>;
}

const STORAGE_KEYS = {
  EXERCISES: 'gym_tracker_exercises_v2',
  ROUTINES: 'gym_tracker_routines_v2',
  WORKOUT_HISTORY: 'gym_tracker_history_v2',
  ACTIVE_WORKOUT: 'gym_tracker_active_workout_v2',
  USER_SETTINGS: 'gym_tracker_settings_v2',
  APP_INITIALIZED: 'gym_tracker_initialized_v2',
  EXERCISE_NOTES: 'gym_tracker_exercise_notes_v2',
  BODY_WEIGHT_LOG: 'gym_tracker_bodyweight_v1',
  TARGET_WEIGHT: 'gym_tracker_target_weight_v1',
  MEASUREMENT_CATEGORIES: 'gym_tracker_measurement_categories_v1',
  MEASUREMENT_ENTRIES: 'gym_tracker_measurement_entries_v1',
  PROGRESS_PHOTOS: 'gym_tracker_progress_photos_v1',
  FOOD_ITEMS: 'gym_tracker_food_items_v1',
  NUTRITION_ENTRIES: 'gym_tracker_nutrition_entries_v1',
  NUTRITION_GOALS: 'gym_tracker_nutrition_goals_v1',
  EXERCISE_PROGRESS: 'gym_tracker_exercise_progress_v1',
};

// מטא-דאטה של הסנכרון (לא נתוני משתמש, לכן מחוץ ל-STORAGE_KEYS)
// OWNER - של מי הנתונים שבמכשיר. אם מתחבר משתמש אחר, מנקים קודם, כדי שהנתונים של הקודם
// לא יעלו לחשבון החדש. SETTINGS_DIRTY - ההגדרות השתנו ועוד לא נשמרו בענן.
const SYNC_META_KEYS = {
  OWNER: 'gym_tracker_owner_user_v1',
  SETTINGS_DIRTY: 'gym_tracker_settings_dirty_v1',
};

// כל הטבלאות שמסונכרנות כרשימות: איפה הן במכשיר ואיך שולפים את הגרסה המקומית
type SyncedTable = { table: string; key: string; getLocal: () => { id: string }[] };

// האם כבר ראינו את מה שבענן מאז הכניסה. עד אז לא שולחים הגדרות, כדי שברירות המחדל של
// מכשיר חדש (או תקלת רשת בכניסה) לא ידרסו את ההגדרות האמיתיות של המשתמש.
let hydrated = false;

export const DEFAULT_NUTRITION_GOALS: NutritionGoals = {
  calories: 2200,
  protein: 150,
  carbs: 220,
  fat: 70,
};

export const DEFAULT_SETTINGS: UserSettings = {
  weightUnit: 'kg',
  defaultRestSeconds: 90,
  autoRestTimerEnabled: true,
  soundEnabled: true,
  hapticEnabled: true,
  theme: 'dark',
  showIphoneFrameOnDesktop: true,
  language: 'en',
  scheduledWeekdays: [],
  appleHealthSyncEnabled: false,
};

// Calculate Estimated 1 Rep Max using Brzycki formula
export function calculateEstimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (36 / (37 - Math.min(reps, 30))));
}

// Storage API
export const StorageService = {
  // Initialization check
  init() {
    if (typeof window === 'undefined') return;
    const initialized = localStorage.getItem(STORAGE_KEYS.APP_INITIALIZED);
    if (!initialized) {
      localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(INITIAL_EXERCISES));
      // תוכניות ה-DEFAULT_ROUTINES הן דוגמאות של חשבון הדמו בלבד - משתמש חדש מתחיל
      // בלי תוכניות בכלל (NoRoutineWorkoutView מטפל במסך הריק), לא מקבל אותן אוטומטית.
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      localStorage.setItem(STORAGE_KEYS.APP_INITIALIZED, 'true');
    }
  },

  // Exercises
  getExercises(): Exercise[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISES);
      if (!data) return [...INITIAL_EXERCISES, ...WARMUP_EXERCISES, ...IMPORTED_EXERCISES];
      const list: Exercise[] = JSON.parse(data);
      // תרגילי הליבה תמיד מגיעים מהקוד העדכני (כדי שעדכונים כמו תמונות חדשות יחולו),
      // רק תרגילים מותאמים אישית של המשתמש נשמרים מה-localStorage
      const map = new Map<string, Exercise>();
      INITIAL_EXERCISES.forEach((e) => map.set(e.id, e));
      WARMUP_EXERCISES.forEach((e) => map.set(e.id, e));
      IMPORTED_EXERCISES.forEach((e) => map.set(e.id, e));
      list.filter((e) => e.isCustom).forEach((e) => map.set(e.id, e));
      return Array.from(map.values());
    } catch {
      return [...INITIAL_EXERCISES, ...WARMUP_EXERCISES, ...IMPORTED_EXERCISES];
    }
  },

  saveExercise(exercise: Exercise) {
    const list = this.getExercises();
    const idx = list.findIndex((e) => e.id === exercise.id);
    if (idx >= 0) {
      list[idx] = exercise;
    } else {
      list.unshift(exercise);
    }
    localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(list));
    syncListToCloud('custom_exercises', list.filter((e) => e.isCustom));
  },

  // Routines
  getRoutines(): RoutineTemplate[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUTINES);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed) || parsed.length === 0) return [];
      // מערך ריק הוא מצב לגיטימי (משתמש בלי תוכניות), לא שגיאה. רק אם *אף* רשומה במערך
      // אינה בפורמט תקין (חסר days) זו כנראה צורה ישנה/פגומה לגמרי - נופלים לתוכניות ברירת
      // המחדל. רשומה בודדת פגומה (למשל תקלת סנכרון חד-פעמית) לא צריכה למחוק את כל שאר
      // התוכניות התקינות של המשתמש.
      const valid = parsed.filter((r) => r && Array.isArray(r.days));
      if (valid.length === 0) return DEFAULT_ROUTINES;
      return valid;
    } catch {
      return [];
    }
  },

  saveRoutine(routine: RoutineTemplate) {
    const routines = this.getRoutines();
    const idx = routines.findIndex((r) => r.id === routine.id);
    if (idx >= 0) {
      routines[idx] = routine;
    } else {
      routines.push(routine);
    }
    localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
    syncListToCloud('routines', routines);
  },

  deleteRoutine(routineId: string) {
    const routines = this.getRoutines().filter((r) => r.id !== routineId);
    localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
    syncListToCloud('routines', routines);
  },

  // Active Routine Day Tracker
  getSelectedDayNumber(routineId: string): number {
    try {
      const data = localStorage.getItem(`gym_tracker_active_day_${routineId}`);
      return data ? parseInt(data, 10) || 1 : 1;
    } catch {
      return 1;
    }
  },

  saveSelectedDayNumber(routineId: string, dayNumber: number) {
    try {
      localStorage.setItem(`gym_tracker_active_day_${routineId}`, String(dayNumber));
      this.pushSettingsBlob();
    } catch {}
  },

  // Persistent Exercise Notes
  getExerciseNotes(): Record<string, string> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISE_NOTES);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  getNoteForExercise(exerciseId: string): string {
    const notes = this.getExerciseNotes();
    return notes[exerciseId] || '';
  },

  saveNoteForExercise(exerciseId: string, note: string) {
    const notes = this.getExerciseNotes();
    if (!note.trim()) {
      delete notes[exerciseId];
    } else {
      notes[exerciseId] = note;
    }
    localStorage.setItem(STORAGE_KEYS.EXERCISE_NOTES, JSON.stringify(notes));
    this.pushSettingsBlob();
  },

  // Workout History
  // תמיד מהחדש לישן: הסדר מהענן שרירותי, ואימון שנרשם בדיעבד נכנס לראש הרשימה - ו"הביצוע
  // הקודם" של תרגיל (getLastExercisePerformance) מניח שהראשון ברשימה הוא האחרון בזמן
  getWorkoutHistory(): WorkoutSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY);
      const list: WorkoutSession[] = data ? JSON.parse(data) : [];
      return list.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    } catch {
      return [];
    }
  },

  saveWorkout(session: WorkoutSession) {
    const history = this.getWorkoutHistory();
    const idx = history.findIndex((w) => w.id === session.id);
    if (idx >= 0) {
      history[idx] = session;
    } else {
      history.unshift(session);
    }
    localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(history));
    syncListToCloud('workouts', history);
    this.clearActiveWorkout();
  },

  deleteWorkout(workoutId: string) {
    const history = this.getWorkoutHistory().filter((w) => w.id !== workoutId);
    localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(history));
    syncListToCloud('workouts', history);
  },

  // Active Workout Session
  getActiveWorkout(): WorkoutSession | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveActiveWorkout(session: WorkoutSession) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, JSON.stringify(session));
  },

  clearActiveWorkout() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  },

  // Retrieve Previous Performance for a specific exercise
  getLastExercisePerformance(exerciseId: string): {
    workoutDate: number;
    workoutTitle: string;
    sets: WorkoutSet[];
    bestWeight: number;
    bestReps: number;
  } | null {
    const history = this.getWorkoutHistory();
    for (const workout of history) {
      const found = workout.exercises.find((e) => e.exerciseId === exerciseId);
      if (found && found.sets.length > 0) {
        const validSets = found.sets.filter((s) => s.completed || s.weightKg > 0);
        const actualSets = validSets.length > 0 ? validSets : found.sets;
        let bestWeight = 0;
        let bestReps = 0;
        actualSets.forEach((s) => {
          if (s.weightKg > bestWeight) {
            bestWeight = s.weightKg;
            bestReps = s.reps;
          }
        });
        return {
          workoutDate: workout.startTime,
          workoutTitle: workout.title,
          sets: actualSets,
          bestWeight,
          bestReps,
        };
      }
    }
    return null;
  },

  // Count how many workouts an exercise was performed in
  getExerciseWorkoutCount(exerciseId: string): number {
    const history = this.getWorkoutHistory();
    return history.filter((w) =>
      w.exercises.some(
        (e) => e.exerciseId === exerciseId && e.sets.some((s) => s.completed || s.weightKg > 0)
      )
    ).length;
  },

  // Favorite Exercises
  getFavoriteExerciseIds(): string[] {
    try {
      const data = localStorage.getItem('gym_tracker_favorite_exercises_v2');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  toggleFavoriteExercise(exerciseId: string): boolean {
    const favs = this.getFavoriteExerciseIds();
    const idx = favs.indexOf(exerciseId);
    let isFav = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
      isFav = false;
    } else {
      favs.push(exerciseId);
      isFav = true;
    }
    localStorage.setItem('gym_tracker_favorite_exercises_v2', JSON.stringify(favs));
    this.pushSettingsBlob();
    return isFav;
  },

  // Calculate Personal Records for all exercises
  getPersonalRecords(): Record<string, PersonalRecord> {
    const history = this.getWorkoutHistory();
    const exercises = this.getExercises();
    const exMap = new Map(exercises.map((e) => [e.id, e]));

    const prs: Record<string, PersonalRecord> = {};

    history.forEach((workout) => {
      workout.exercises.forEach((ex) => {
        ex.sets.forEach((set) => {
          if ((set.completed || workout.isCompleted) && set.weightKg > 0 && set.reps > 0) {
            const e1rm = calculateEstimated1RM(set.weightKg, set.reps);
            const currentPr = prs[ex.exerciseId];
            if (!currentPr || set.weightKg > currentPr.maxWeight || e1rm > currentPr.estimated1RM) {
              prs[ex.exerciseId] = {
                exerciseId: ex.exerciseId,
                exerciseNameHe: exMap.get(ex.exerciseId)?.nameHe || 'תרגיל',
                maxWeight: Math.max(set.weightKg, currentPr?.maxWeight || 0),
                repsAtMaxWeight: set.weightKg >= (currentPr?.maxWeight || 0) ? set.reps : (currentPr?.repsAtMaxWeight || set.reps),
                estimated1RM: Math.max(e1rm, currentPr?.estimated1RM || 0),
                date: workout.startTime,
                workoutId: workout.id,
              };
            }
          }
        });
      });
    });

    return prs;
  },

  // Settings
  getSettings(): UserSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: UserSettings) {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings));
    this.pushSettingsBlob();
  },

  // Export / Import Full Database Backup
  exportData(): string {
    const exportObject = {
      version: 2,
      timestamp: Date.now(),
      exercises: this.getExercises(),
      routines: this.getRoutines(),
      history: this.getWorkoutHistory(),
      settings: this.getSettings(),
    };
    return JSON.stringify(exportObject, null, 2);
  },

  // חשוב: אחרי כתיבה מקומית חייבים לדחוף גם לענן - אחרת ברענון הבא (מיד אחרי הייבוא)
  // hydrateFromCloud היה מוריד את הנתונים הישנים מהענן ודורס בחזרה את מה שזה עתה יובא.
  importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.exercises && Array.isArray(data.exercises)) {
        localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(data.exercises));
        syncListToCloud('custom_exercises', (data.exercises as Exercise[]).filter((e) => e.isCustom));
      }
      if (data.routines && Array.isArray(data.routines)) {
        localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(data.routines));
        syncListToCloud('routines', data.routines);
      }
      if (data.history && Array.isArray(data.history)) {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(data.history));
        syncListToCloud('workouts', data.history);
      }
      if (data.settings) {
        localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(data.settings));
        this.pushSettingsBlob();
      }
      return true;
    } catch (e) {
      console.error('Import error:', e);
      return false;
    }
  },

  // איפוס מלא: מנקים כל מפתח מקומי (Object.values כדי לכלול אוטומטית גם מפתחות שנוספו
  // מאז שהפונקציה הזו נכתבה במקור - במקור החסירה בטעות משקל גוף/מדידות/תזונה/תמונות/
  // התקדמות-תרגילים) ודוחפים איפוס גם לענן - אחרת ה-hydrate הבא (רענון/מכשיר אחר) פשוט
  // מחזיר את כל מה ש"אופס" בחזרה מהעותק הישן שנשאר שם.
  resetAllData() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('gym_tracker_favorite_exercises_v2');
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gym_tracker_active_day_'))
      .forEach((k) => localStorage.removeItem(k));
    PhotoStorage.clearAll().catch(() => {});
    this.init();
    if (getCloudUser()) {
      // מחיקה מפורשת של כל השורות - גם כאלה שנוצרו במכשירים אחרים ולא מוכרות כאן
      this.syncedTables().forEach(({ table }) => deleteAllCloudRows(table));
      PhotoStorage.deleteAllInCloud().catch(() => {});
      this.pushSettingsBlob();
    }
  },

  // ייבוא היסטוריה מאפליקציה אחרת: מוסיף (לא מחליף) - אימון/תרגיל שכבר קיים לפי מזהה מדולג,
  // כך שייבוא חוזר של אותו קובץ לא יוצר כפילויות. כתיבה אחת וסנכרון ענן אחד לכל הרשימה.
  importExternalHistory(workouts: WorkoutSession[], customExercises: Exercise[]): { added: number; skipped: number } {
    const history = this.getWorkoutHistory();
    const existingIds = new Set(history.map((w) => w.id));
    const fresh = workouts.filter((w) => !existingIds.has(w.id));

    const exercises = this.getExercises();
    const existingExerciseIds = new Set(exercises.map((e) => e.id));
    const newExercises = customExercises.filter((e) => !existingExerciseIds.has(e.id));

    const nextHistory = [...history, ...fresh].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    try {
      localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(nextHistory));
      if (newExercises.length > 0) {
        localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify([...newExercises, ...exercises]));
      }
    } catch (e) {
      // localStorage מלא - מחזירים את המצב הקודם כדי לא להשאיר ייבוא חלקי
      localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(history));
      throw new Error('אין מספיק מקום באחסון המכשיר לייבוא הזה.');
    }
    if (newExercises.length > 0) syncListToCloud('custom_exercises', this.getExercises().filter((e) => e.isCustom));
    syncListToCloud('workouts', nextHistory);
    return { added: fresh.length, skipped: workouts.length - fresh.length };
  },

  // Body Weight Tracking
  getBodyWeightLog(): BodyWeightEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BODY_WEIGHT_LOG);
      const list: BodyWeightEntry[] = data ? JSON.parse(data) : [];
      return list.sort((a, b) => a.date - b.date);
    } catch {
      return [];
    }
  },

  addBodyWeightEntry(weightKg: number, date: number = Date.now()): BodyWeightEntry {
    const entry: BodyWeightEntry = { id: `bw-${Date.now()}`, date, weightKg };
    const list = this.getBodyWeightLog().concat([entry]);
    localStorage.setItem(STORAGE_KEYS.BODY_WEIGHT_LOG, JSON.stringify(list));
    syncListToCloud('body_weight_entries', list);
    return entry;
  },

  deleteBodyWeightEntry(id: string) {
    const list = this.getBodyWeightLog().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.BODY_WEIGHT_LOG, JSON.stringify(list));
    syncListToCloud('body_weight_entries', list);
  },

  getTargetWeight(): number | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TARGET_WEIGHT);
      return data ? parseFloat(data) : null;
    } catch {
      return null;
    }
  },

  saveTargetWeight(kg: number | null) {
    if (kg === null) {
      localStorage.removeItem(STORAGE_KEYS.TARGET_WEIGHT);
    } else {
      localStorage.setItem(STORAGE_KEYS.TARGET_WEIGHT, String(kg));
    }
    this.pushSettingsBlob();
  },

  // Custom Body Measurements
  getMeasurementCategories(): MeasurementCategory[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEASUREMENT_CATEGORIES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveMeasurementCategory(category: MeasurementCategory) {
    const list = this.getMeasurementCategories();
    const idx = list.findIndex((c) => c.id === category.id);
    if (idx >= 0) list[idx] = category; else list.push(category);
    localStorage.setItem(STORAGE_KEYS.MEASUREMENT_CATEGORIES, JSON.stringify(list));
    syncListToCloud('measurement_categories', list);
  },

  deleteMeasurementCategory(categoryId: string) {
    const list = this.getMeasurementCategories().filter((c) => c.id !== categoryId);
    localStorage.setItem(STORAGE_KEYS.MEASUREMENT_CATEGORIES, JSON.stringify(list));
    syncListToCloud('measurement_categories', list);
    const entries = this.getAllMeasurementEntries().filter((e) => e.categoryId !== categoryId);
    localStorage.setItem(STORAGE_KEYS.MEASUREMENT_ENTRIES, JSON.stringify(entries));
    syncListToCloud('measurement_entries', entries);
  },

  getAllMeasurementEntries(): MeasurementEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEASUREMENT_ENTRIES);
      const list: MeasurementEntry[] = data ? JSON.parse(data) : [];
      return list.sort((a, b) => a.date - b.date);
    } catch {
      return [];
    }
  },

  getMeasurementEntries(categoryId: string): MeasurementEntry[] {
    return this.getAllMeasurementEntries().filter((e) => e.categoryId === categoryId);
  },

  addMeasurementEntry(categoryId: string, value: number, date: number = Date.now()): MeasurementEntry {
    const entry: MeasurementEntry = { id: `meas-${Date.now()}`, categoryId, date, value };
    const list = this.getAllMeasurementEntries().concat([entry]);
    localStorage.setItem(STORAGE_KEYS.MEASUREMENT_ENTRIES, JSON.stringify(list));
    syncListToCloud('measurement_entries', list);
    return entry;
  },

  deleteMeasurementEntry(id: string) {
    const list = this.getAllMeasurementEntries().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.MEASUREMENT_ENTRIES, JSON.stringify(list));
    syncListToCloud('measurement_entries', list);
  },

  // Progress Photos (metadata only - image blobs live in IndexedDB, see photoStorage.ts)
  getProgressPhotos(): ProgressPhoto[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROGRESS_PHOTOS);
      const list: ProgressPhoto[] = data ? JSON.parse(data) : [];
      return list.sort((a, b) => b.date - a.date);
    } catch {
      return [];
    }
  },

  saveProgressPhotoMeta(photo: ProgressPhoto) {
    const list = this.getProgressPhotos().concat([photo]);
    localStorage.setItem(STORAGE_KEYS.PROGRESS_PHOTOS, JSON.stringify(list));
    syncListToCloud('progress_photos', list);
  },

  deleteProgressPhotoMeta(id: string) {
    const list = this.getProgressPhotos().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROGRESS_PHOTOS, JSON.stringify(list));
    syncListToCloud('progress_photos', list);
  },

  // Nutrition: Food Library
  getFoodItems(): FoodItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FOOD_ITEMS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveFoodItem(item: FoodItem) {
    const list = this.getFoodItems();
    const idx = list.findIndex((f) => f.id === item.id);
    if (idx >= 0) list[idx] = item; else list.unshift(item);
    localStorage.setItem(STORAGE_KEYS.FOOD_ITEMS, JSON.stringify(list));
    syncListToCloud('food_items', list);
  },

  deleteFoodItem(id: string) {
    const list = this.getFoodItems().filter((f) => f.id !== id);
    localStorage.setItem(STORAGE_KEYS.FOOD_ITEMS, JSON.stringify(list));
    syncListToCloud('food_items', list);
  },

  // Nutrition: Daily Log
  getAllNutritionEntries(): NutritionEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NUTRITION_ENTRIES);
      const list: NutritionEntry[] = data ? JSON.parse(data) : [];
      return list.sort((a, b) => a.date - b.date);
    } catch {
      return [];
    }
  },

  addNutritionEntry(entry: NutritionEntry) {
    const list = this.getAllNutritionEntries().concat([entry]);
    localStorage.setItem(STORAGE_KEYS.NUTRITION_ENTRIES, JSON.stringify(list));
    syncListToCloud('nutrition_entries', list);
  },

  // כמה רשומות בכתיבה אחת (למשל "העתק מאתמול") - סנכרון ענן אחד במקום אחד לכל פריט
  addNutritionEntries(entries: NutritionEntry[]) {
    if (entries.length === 0) return;
    const list = this.getAllNutritionEntries().concat(entries);
    localStorage.setItem(STORAGE_KEYS.NUTRITION_ENTRIES, JSON.stringify(list));
    syncListToCloud('nutrition_entries', list);
  },

  updateNutritionEntry(entry: NutritionEntry) {
    const list = this.getAllNutritionEntries().map((e) => (e.id === entry.id ? entry : e));
    localStorage.setItem(STORAGE_KEYS.NUTRITION_ENTRIES, JSON.stringify(list));
    syncListToCloud('nutrition_entries', list);
  },

  deleteNutritionEntry(id: string) {
    const list = this.getAllNutritionEntries().filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.NUTRITION_ENTRIES, JSON.stringify(list));
    syncListToCloud('nutrition_entries', list);
  },

  // "הזיכרון" של מנוע ההתקדמות המחזורי - state לכל תרגיל בתוכניות שהמערכת בנתה (isGenerated)
  getExerciseProgressStates(routineId: string): ExerciseProgressState[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISE_PROGRESS);
      const list: ExerciseProgressState[] = data ? JSON.parse(data) : [];
      return list.filter((s) => s.routineId === routineId);
    } catch {
      return [];
    }
  },

  getAllExerciseProgressStates(): ExerciseProgressState[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXERCISE_PROGRESS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveExerciseProgressState(state: ExerciseProgressState) {
    this.saveExerciseProgressStates([state]);
  },

  // כותב כמה states בכתיבה אחת (localStorage + סנכרון-ענן אחד) - קריטי כשיוצרים/מעדכנים
  // הרבה תרגילים בבת אחת (בניית תוכנית, אימון עם כמה תרגילים): קריאות מקבילות בלולאה
  // ל-saveExerciseProgressState היו גורמות למספר קריאות syncListToCloud חופפות על אותה
  // טבלה (delete+insert לא אטומי), ומזה שגיאות "duplicate key" מהתחרות בין הקריאות.
  saveExerciseProgressStates(states: ExerciseProgressState[]) {
    if (states.length === 0) return;
    const list = this.getAllExerciseProgressStates();
    states.forEach((state) => {
      const idx = list.findIndex((s) => s.id === state.id);
      if (idx >= 0) list[idx] = state; else list.push(state);
    });
    localStorage.setItem(STORAGE_KEYS.EXERCISE_PROGRESS, JSON.stringify(list));
    syncListToCloud('exercise_progress', list);
  },

  deleteExerciseProgressStatesForRoutine(routineId: string) {
    const list = this.getAllExerciseProgressStates().filter((s) => s.routineId !== routineId);
    localStorage.setItem(STORAGE_KEYS.EXERCISE_PROGRESS, JSON.stringify(list));
    syncListToCloud('exercise_progress', list);
  },

  getNutritionGoals(): NutritionGoals {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NUTRITION_GOALS);
      return data ? { ...DEFAULT_NUTRITION_GOALS, ...JSON.parse(data) } : DEFAULT_NUTRITION_GOALS;
    } catch {
      return DEFAULT_NUTRITION_GOALS;
    }
  },

  saveNutritionGoals(goals: NutritionGoals) {
    localStorage.setItem(STORAGE_KEYS.NUTRITION_GOALS, JSON.stringify(goals));
    this.pushSettingsBlob();
  },

  // ===================== סנכרון ענן =====================

  // אוסף את כל ה"הגדרות" מהמפתחות המקומיים השונים לאובייקט אחד ודוחף לענן.
  pushSettingsBlob() {
    if (!getCloudUser()) return;
    // מסמנים "לא נשמר" לפני השליחה, ומנקים רק אם השליחה הזו (ולא אחת ישנה יותר) הצליחה -
    // כך שינוי שנעשה בלי קליטה (למשל מעבר ליום הבא אחרי אימון) לא נדרס בכניסה הבאה
    const token = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(SYNC_META_KEYS.SETTINGS_DIRTY, token);
    if (!hydrated) return;
    const routines = this.getRoutines();
    const selectedDayByRoutine: Record<string, number> = {};
    routines.forEach((r) => {
      selectedDayByRoutine[r.id] = this.getSelectedDayNumber(r.id);
    });
    const blob: CloudSettingsBlob = {
      settings: this.getSettings(),
      nutritionGoals: this.getNutritionGoals(),
      targetWeight: this.getTargetWeight(),
      exerciseNotes: this.getExerciseNotes(),
      favoriteExerciseIds: this.getFavoriteExerciseIds(),
      selectedDayByRoutine,
    };
    syncSettingsToCloud(blob).then((ok) => {
      if (ok && localStorage.getItem(SYNC_META_KEYS.SETTINGS_DIRTY) === token) {
        localStorage.removeItem(SYNC_META_KEYS.SETTINGS_DIRTY);
      }
    });
  },

  applySettingsBlob(blob: CloudSettingsBlob) {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(blob.settings));
    localStorage.setItem(STORAGE_KEYS.NUTRITION_GOALS, JSON.stringify(blob.nutritionGoals));
    if (blob.targetWeight === null) {
      localStorage.removeItem(STORAGE_KEYS.TARGET_WEIGHT);
    } else {
      localStorage.setItem(STORAGE_KEYS.TARGET_WEIGHT, String(blob.targetWeight));
    }
    localStorage.setItem(STORAGE_KEYS.EXERCISE_NOTES, JSON.stringify(blob.exerciseNotes || {}));
    localStorage.setItem('gym_tracker_favorite_exercises_v2', JSON.stringify(blob.favoriteExerciseIds || []));
    Object.entries(blob.selectedDayByRoutine || {}).forEach(([routineId, dayNumber]) => {
      localStorage.setItem(`gym_tracker_active_day_${routineId}`, String(dayNumber));
    });
  },

  syncedTables(): SyncedTable[] {
    return [
      { table: 'workouts', key: STORAGE_KEYS.WORKOUT_HISTORY, getLocal: () => this.getWorkoutHistory() },
      { table: 'routines', key: STORAGE_KEYS.ROUTINES, getLocal: () => this.getRoutines() },
      { table: 'custom_exercises', key: STORAGE_KEYS.EXERCISES, getLocal: () => this.getExercises().filter((e) => e.isCustom) },
      { table: 'body_weight_entries', key: STORAGE_KEYS.BODY_WEIGHT_LOG, getLocal: () => this.getBodyWeightLog() },
      { table: 'measurement_categories', key: STORAGE_KEYS.MEASUREMENT_CATEGORIES, getLocal: () => this.getMeasurementCategories() },
      { table: 'measurement_entries', key: STORAGE_KEYS.MEASUREMENT_ENTRIES, getLocal: () => this.getAllMeasurementEntries() },
      { table: 'progress_photos', key: STORAGE_KEYS.PROGRESS_PHOTOS, getLocal: () => this.getProgressPhotos() },
      { table: 'food_items', key: STORAGE_KEYS.FOOD_ITEMS, getLocal: () => this.getFoodItems() },
      { table: 'nutrition_entries', key: STORAGE_KEYS.NUTRITION_ENTRIES, getLocal: () => this.getAllNutritionEntries() },
      { table: 'exercise_progress', key: STORAGE_KEYS.EXERCISE_PROGRESS, getLocal: () => this.getAllExerciseProgressStates() },
    ];
  },

  // כניסה למערכת / פתיחת האפליקציה: מורידים את מה שבענן וממזגים עם השינויים המקומיים שעוד
  // לא עלו (לא דורסים אותם), ואז שולחים את השינויים האלה. אם לחשבון אין עדיין כלום בענן
  // (כניסה ראשונה אי פעם) - מעלים את מה שכבר קיים במכשיר כדי לזרוע את החשבון.
  // אם אין רשת - לא נוגעים בכלום, האפליקציה עובדת מקומית, ומנסים שוב ב-resume / חזרת רשת.
  async hydrateFromCloud(userId: string): Promise<void> {
    const owner = localStorage.getItem(SYNC_META_KEYS.OWNER);
    if (owner && owner !== userId) {
      // משתמש אחר מתחבר במכשיר הזה - הנתונים שבמכשיר שייכים לקודם ואסור שיעלו לחשבון הזה
      this.clearLocalDataOnLogout();
    }
    localStorage.setItem(SYNC_META_KEYS.OWNER, userId);
    setCloudUser(userId);
    hydrated = false;

    let hasCloudData: boolean;
    try {
      hasCloudData = await cloudHasAnyData();
    } catch {
      return; // אין קשר לענן - ממשיכים מקומית, hydrated נשאר false וננסה שוב
    }
    if (getCloudUser() !== userId) return;

    if (!hasCloudData) {
      hydrated = true;
      this.flushPendingSync();
      this.pushSettingsBlob();
      return;
    }

    const tables = this.syncedTables();
    // allSettled: כשל בטבלה אחת משאיר את הנתונים המקומיים שלה כמו שהם, בלי להפיל את השאר
    const results = await Promise.allSettled(tables.map(({ table }) => pullListFromCloud<{ id: string }>(table)));
    if (getCloudUser() !== userId) return;
    let allPulled = true;
    results.forEach((result, i) => {
      const { table, key, getLocal } = tables[i];
      if (result.status !== 'fulfilled') {
        allPulled = false;
        console.error(`[hydrateFromCloud] pull failed for "${table}" - keeping local data as-is`, result.reason);
        return;
      }
      const cloudList = result.value.filter((item) => item && typeof item.id === 'string');
      const { merged, cloudShadow } = mergeCloudWithLocal(cloudList, getLocal(), getTableShadow(table));
      localStorage.setItem(key, JSON.stringify(merged));
      setTableShadow(table, cloudShadow);
      syncListToCloud(table, merged);
    });
    PhotoStorage.flushPending(this.getProgressPhotos().map((p) => p.id)).catch(() => {});

    if (localStorage.getItem(SYNC_META_KEYS.SETTINGS_DIRTY)) {
      // ההגדרות במכשיר השתנו בלי שנשמרו (למשל מעבר ליום הבא באימון בלי קליטה) - הן הגרסה העדכנית
      hydrated = allPulled;
      if (hydrated) this.pushSettingsBlob();
      return;
    }
    try {
      const settingsBlob = await pullSettingsFromCloud<CloudSettingsBlob>();
      if (getCloudUser() !== userId) return;
      if (settingsBlob) this.applySettingsBlob(settingsBlob);
    } catch {
      allPulled = false;
    }
    hydrated = allPulled;
  },

  /** האם הסנכרון הראשוני מול הענן הושלם (אם לא - צריך לנסות שוב כשיש רשת) */
  isHydrated(): boolean {
    return hydrated;
  },

  /** שולח לענן כל שינוי מקומי שעוד לא עלה (נקרא בחזרה לאפליקציה ובחזרת רשת) */
  flushPendingSync() {
    if (!getCloudUser()) return;
    this.syncedTables().forEach(({ table, getLocal }) => syncListToCloud(table, getLocal()));
    PhotoStorage.flushPending(this.getProgressPhotos().map((p) => p.id)).catch(() => {});
    if (hydrated && localStorage.getItem(SYNC_META_KEYS.SETTINGS_DIRTY)) this.pushSettingsBlob();
  },

  /** כמה שינויים מקומיים עוד לא נשמרו בענן (לאזהרה לפני התנתקות) */
  countPendingCloudChanges(): number {
    if (!getCloudUser()) return 0;
    let count = this.syncedTables().reduce(
      (sum, { table, getLocal }) => sum + countPendingChanges(getLocal(), getTableShadow(table)),
      0
    );
    if (localStorage.getItem(SYNC_META_KEYS.SETTINGS_DIRTY)) count += 1;
    return count + PhotoStorage.pendingCount();
  },

  // בהתנתקות - מנקים את המכשיר כדי שמשתמש הבא שיתחבר כאן (מכשיר משותף) לא יראה נתונים
  // שלא שלו. כולל גם מפתחות "יום נבחר" פר-תוכנית (מפתח דינמי, לא ב-STORAGE_KEYS) ותמונות
  // ההתקדמות ב-IndexedDB - שני אלה נשארו בעבר כ"יתומים" אחרי logout על מכשיר משותף.
  clearLocalDataOnLogout() {
    setCloudUser(null);
    hydrated = false;
    clearSyncShadow();
    Object.values(SYNC_META_KEYS).forEach((key) => localStorage.removeItem(key));
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('gym_tracker_favorite_exercises_v2');
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gym_tracker_active_day_'))
      .forEach((k) => localStorage.removeItem(k));
    PhotoStorage.clearAll().catch(() => {});
    this.init();
  },
};
