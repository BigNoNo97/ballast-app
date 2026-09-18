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
import { DEFAULT_ROUTINES } from '../data/defaultRoutines';
import {
  setCloudUser,
  syncListToCloud,
  pullListFromCloud,
  syncSettingsToCloud,
  pullSettingsFromCloud,
  cloudHasAnyData,
} from './cloudSync';

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
      if (!data) return INITIAL_EXERCISES;
      const list: Exercise[] = JSON.parse(data);
      // תרגילי הליבה תמיד מגיעים מהקוד העדכני (כדי שעדכונים כמו תמונות חדשות יחולו),
      // רק תרגילים מותאמים אישית של המשתמש נשמרים מה-localStorage
      const map = new Map<string, Exercise>();
      INITIAL_EXERCISES.forEach((e) => map.set(e.id, e));
      list.filter((e) => e.isCustom).forEach((e) => map.set(e.id, e));
      return Array.from(map.values());
    } catch {
      return INITIAL_EXERCISES;
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
      if (!Array.isArray(parsed)) return [];
      // מערך ריק הוא מצב לגיטימי (משתמש בלי תוכניות), לא שגיאה - רק צורה ישנה/פגומה
      // של רשומה בפועל (חסר days) נופלת חזרה לתוכניות ברירת המחדל.
      if (parsed.length > 0 && !parsed[0].days) return DEFAULT_ROUTINES;
      return parsed;
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
  getWorkoutHistory(): WorkoutSession[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKOUT_HISTORY);
      return data ? JSON.parse(data) : [];
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

  importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (data.exercises && Array.isArray(data.exercises)) {
        localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(data.exercises));
      }
      if (data.routines && Array.isArray(data.routines)) {
        localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(data.routines));
      }
      if (data.history && Array.isArray(data.history)) {
        localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(data.history));
      }
      if (data.settings) {
        localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(data.settings));
      }
      return true;
    } catch (e) {
      console.error('Import error:', e);
      return false;
    }
  },

  resetAllData() {
    localStorage.removeItem(STORAGE_KEYS.APP_INITIALIZED);
    localStorage.removeItem(STORAGE_KEYS.EXERCISES);
    localStorage.removeItem(STORAGE_KEYS.ROUTINES);
    localStorage.removeItem(STORAGE_KEYS.WORKOUT_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    localStorage.removeItem(STORAGE_KEYS.USER_SETTINGS);
    this.init();
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
    syncSettingsToCloud(blob);
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

  // מריץ פעם אחת בכניסה למערכת: אם למשתמש כבר יש נתונים בענן - מוריד אותם ומחליף
  // את מה שיש במכשיר. אם זו הכניסה הראשונה שלו אי פעם (אין לו עדיין כלום בענן),
  // "מעלה" את מה שכבר קיים במכשיר הזה כדי לא לאבד נתונים שהיו כאן לפני ההרשמה.
  async hydrateFromCloud(userId: string): Promise<void> {
    setCloudUser(userId);
    const hasCloudData = await cloudHasAnyData();

    if (hasCloudData) {
      const [
        workouts, routines, customExercises, bodyWeightEntries,
        measurementCategories, measurementEntries, progressPhotos,
        foodItems, nutritionEntries, exerciseProgressStates, settingsBlob,
      ] = await Promise.all([
        pullListFromCloud<WorkoutSession>('workouts'),
        pullListFromCloud<RoutineTemplate>('routines'),
        pullListFromCloud<Exercise>('custom_exercises'),
        pullListFromCloud<BodyWeightEntry>('body_weight_entries'),
        pullListFromCloud<MeasurementCategory>('measurement_categories'),
        pullListFromCloud<MeasurementEntry>('measurement_entries'),
        pullListFromCloud<ProgressPhoto>('progress_photos'),
        pullListFromCloud<FoodItem>('food_items'),
        pullListFromCloud<NutritionEntry>('nutrition_entries'),
        pullListFromCloud<ExerciseProgressState>('exercise_progress'),
        pullSettingsFromCloud<CloudSettingsBlob>(),
      ]);

      localStorage.setItem(STORAGE_KEYS.WORKOUT_HISTORY, JSON.stringify(workouts));
      // רשימה ריקה מהענן היא מצב תקין (משתמש בלי תוכניות משלו) - לא נופלים חזרה
      // לתוכניות הדמו רק כי הוא עוד לא יצר לעצמו כלום.
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(routines));
      localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(customExercises));
      localStorage.setItem(STORAGE_KEYS.BODY_WEIGHT_LOG, JSON.stringify(bodyWeightEntries));
      localStorage.setItem(STORAGE_KEYS.MEASUREMENT_CATEGORIES, JSON.stringify(measurementCategories));
      localStorage.setItem(STORAGE_KEYS.MEASUREMENT_ENTRIES, JSON.stringify(measurementEntries));
      localStorage.setItem(STORAGE_KEYS.PROGRESS_PHOTOS, JSON.stringify(progressPhotos));
      localStorage.setItem(STORAGE_KEYS.FOOD_ITEMS, JSON.stringify(foodItems));
      localStorage.setItem(STORAGE_KEYS.NUTRITION_ENTRIES, JSON.stringify(nutritionEntries));
      localStorage.setItem(STORAGE_KEYS.EXERCISE_PROGRESS, JSON.stringify(exerciseProgressStates));
      if (settingsBlob) this.applySettingsBlob(settingsBlob);
    } else {
      // משתמש חדש - מעלים את מה שכבר קיים במכשיר (אם קיים) כדי לזרוע את החשבון שלו.
      syncListToCloud('workouts', this.getWorkoutHistory());
      syncListToCloud('routines', this.getRoutines());
      syncListToCloud('custom_exercises', this.getExercises().filter((e) => e.isCustom));
      syncListToCloud('body_weight_entries', this.getBodyWeightLog());
      syncListToCloud('measurement_categories', this.getMeasurementCategories());
      syncListToCloud('measurement_entries', this.getAllMeasurementEntries());
      syncListToCloud('progress_photos', this.getProgressPhotos());
      syncListToCloud('food_items', this.getFoodItems());
      syncListToCloud('nutrition_entries', this.getAllNutritionEntries());
      syncListToCloud('exercise_progress', this.getAllExerciseProgressStates());
      this.pushSettingsBlob();
    }
  },

  // בהתנתקות - מנקים את המכשיר כדי שמשתמש הבא שיתחבר כאן לא יראה נתונים שלא שלו.
  clearLocalDataOnLogout() {
    setCloudUser(null);
    localStorage.removeItem(STORAGE_KEYS.APP_INITIALIZED);
    localStorage.removeItem(STORAGE_KEYS.EXERCISES);
    localStorage.removeItem(STORAGE_KEYS.ROUTINES);
    localStorage.removeItem(STORAGE_KEYS.WORKOUT_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKOUT);
    localStorage.removeItem(STORAGE_KEYS.USER_SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.EXERCISE_NOTES);
    localStorage.removeItem(STORAGE_KEYS.BODY_WEIGHT_LOG);
    localStorage.removeItem(STORAGE_KEYS.TARGET_WEIGHT);
    localStorage.removeItem(STORAGE_KEYS.MEASUREMENT_CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.MEASUREMENT_ENTRIES);
    localStorage.removeItem(STORAGE_KEYS.PROGRESS_PHOTOS);
    localStorage.removeItem(STORAGE_KEYS.FOOD_ITEMS);
    localStorage.removeItem(STORAGE_KEYS.NUTRITION_ENTRIES);
    localStorage.removeItem(STORAGE_KEYS.NUTRITION_GOALS);
    localStorage.removeItem(STORAGE_KEYS.EXERCISE_PROGRESS);
    localStorage.removeItem('gym_tracker_favorite_exercises_v2');
    this.init();
  },
};
