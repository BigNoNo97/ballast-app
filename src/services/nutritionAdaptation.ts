// נקודת הכניסה של מסך התזונה ל"מוח התזונה" (services/nutrition/engine.ts): ניתוח מלא של
// המצב, והצעה שבועית לעדכון היעד - שלעולם לא מוחלת בלי אישור המשתמש.
import { BodyWeightEntry, NutritionEntry, NutritionGoals, UserSettings } from '../types';
import { analyzeNutrition, NutritionAnalysis, suggestTargetUpdate, TargetSuggestion } from './nutrition/engine';

const MIN_DAYS_BETWEEN_PROMPTS = 7;

export function runNutritionBrain(
  bodyWeightLog: BodyWeightEntry[],
  nutritionEntries: NutritionEntry[],
  currentGoals: NutritionGoals,
  settings: UserSettings,
  now: number = Date.now()
): { analysis: NutritionAnalysis; suggestion: TargetSuggestion | null } {
  const analysis = analyzeNutrition(settings, bodyWeightLog, nutritionEntries, currentGoals, now);
  const promptedRecently =
    !!settings.lastNutritionAdaptationPromptAt &&
    now - settings.lastNutritionAdaptationPromptAt < MIN_DAYS_BETWEEN_PROMPTS * 24 * 60 * 60 * 1000;
  const suggestion =
    settings.nutritionAutoAdjustEnabled === false || promptedRecently ? null : suggestTargetUpdate(analysis, currentGoals);
  return { analysis, suggestion };
}
