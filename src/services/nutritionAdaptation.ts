import { BodyWeightEntry, NutritionEntry, NutritionGoals, OnboardingGoal, UserSettings } from '../types';

// כמה להוסיף/להוריד מה-TDEE בפועל לפי מטרה - המקור היחיד לקבוע הזה (גם האונבורדינג משתמש בו).
export const GOAL_CALORIE_ADJUST: Record<OnboardingGoal, number> = {
  lose_weight: -500,
  gain_muscle: 300,
  strength: 150,
  maintain: 0,
};

const WINDOW_DAYS = 14;
const MIN_LOGGED_DAYS = 10; // מתוך WINDOW_DAYS - כדי לא לחשב מנתונים חסרים מדי
const MIN_CHANGE_TO_SUGGEST = 75; // קלוריות - שינויים קטנים מזה הם רעש, לא שווה להטריד את המשתמש
const MIN_DAYS_BETWEEN_PROMPTS = 7;
const KCAL_PER_KG_BODYFAT = 7700;
const EMA_ALPHA = 0.2;

export interface AdaptiveNutritionSuggestion {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  previousCalories: number;
  rationale: string;
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toDateString();
}

// ממוצע נע (EMA) על נקודות משקל גולמיות - כדי לחלץ מגמה אמיתית מתוך רעש התנודות היומיות
// (אין לוגיקת מגמה כזו בשום מקום אחר בקוד - התצוגה הקיימת ב-BodyWeightView היא הפרש גולמי).
function trendWeightSeries(entries: BodyWeightEntry[]): { date: number; trend: number }[] {
  const sorted = [...entries].sort((a, b) => a.date - b.date);
  const series: { date: number; trend: number }[] = [];
  let ema: number | null = null;
  sorted.forEach((e) => {
    ema = ema === null ? e.weightKg : EMA_ALPHA * e.weightKg + (1 - EMA_ALPHA) * ema;
    series.push({ date: e.date, trend: ema });
  });
  return series;
}

function pickCalorieAdjust(goals: OnboardingGoal[] | undefined): number {
  if (!goals || goals.length === 0) return GOAL_CALORIE_ADJUST.maintain;
  return Math.round(goals.reduce((sum, g) => sum + GOAL_CALORIE_ADJUST[g], 0) / goals.length);
}

export function computeAdaptiveTarget(
  bodyWeightLog: BodyWeightEntry[],
  nutritionEntries: NutritionEntry[],
  currentGoals: NutritionGoals,
  goals: OnboardingGoal[] | undefined,
  settings: UserSettings
): AdaptiveNutritionSuggestion | null {
  if (settings.nutritionAutoAdjustEnabled === false) return null;

  const lastPromptAt = settings.lastNutritionAdaptationPromptAt;
  if (lastPromptAt && Date.now() - lastPromptAt < MIN_DAYS_BETWEEN_PROMPTS * 24 * 60 * 60 * 1000) return null;

  const windowStart = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const weightInWindow = bodyWeightLog.filter((e) => e.date >= windowStart);
  if (weightInWindow.length < 2) return null;

  const caloriesByDay = new Map<string, number>();
  nutritionEntries
    .filter((e) => e.date >= windowStart)
    .forEach((e) => {
      const kcal = (e.grams / 100) * e.caloriesPer100g;
      const key = dayKey(e.date);
      caloriesByDay.set(key, (caloriesByDay.get(key) || 0) + kcal);
    });
  if (caloriesByDay.size < MIN_LOGGED_DAYS) return null; // לא מספיק ימי דיווח בחלון - לא מנחשים

  const avgCaloriesLogged = Array.from(caloriesByDay.values()).reduce((a, b) => a + b, 0) / caloriesByDay.size;

  const trend = trendWeightSeries(bodyWeightLog);
  const trendInWindow = trend.filter((t) => t.date >= windowStart);
  if (trendInWindow.length < 2) return null;
  const weightChangeKg = trendInWindow[trendInWindow.length - 1].trend - trendInWindow[0].trend;
  const actualDays = Math.max(1, Math.round((trendInWindow[trendInWindow.length - 1].date - trendInWindow[0].date) / (24 * 60 * 60 * 1000)));

  const actualTDEE = avgCaloriesLogged - (weightChangeKg * KCAL_PER_KG_BODYFAT) / actualDays;
  const adjust = pickCalorieAdjust(goals);
  const newCalories = Math.round(actualTDEE + adjust);

  if (Math.abs(newCalories - currentGoals.calories) < MIN_CHANGE_TO_SUGGEST) return null;

  const latestTrendWeight = trendInWindow[trendInWindow.length - 1].trend;
  const protein = Math.round(latestTrendWeight * 2);
  const fat = Math.round((newCalories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((newCalories - protein * 4 - fat * 9) / 4));

  const direction = newCalories > currentGoals.calories ? 'עלייה' : 'הפחתה';
  const weightDirection = weightChangeKg > 0.1 ? 'עלית במשקל' : weightChangeKg < -0.1 ? 'ירדת במשקל' : 'המשקל שלך היה יציב';
  const rationale = `בשבועיים האחרונים ${weightDirection} בפועל לפי הצריכה הקלורית שדיווחת - ${direction} ביעד היומי מדויקת יותר מהנוסחה הראשונית.`;

  return { calories: newCalories, protein, carbs, fat, previousCalories: currentGoals.calories, rationale };
}
