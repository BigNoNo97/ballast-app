// רכיבי התזונה שהאפליקציה מציגה מעבר לקלוריות/חלבון/פחמימה/שומן, עם ערך יומי לייחוס.
// הערכים היומיים (DV) - טבלת ה-FDA למבוגרים (21 CFR 101.9, עדכון 2016), אותה טבלה שעליה
// מבוססות התוויות בארה"ב ואפליקציות כמו MyFitnessPal. סיבים ושומן רווי מותאמים ליעד הקלורי
// האישי: 14 גרם סיבים לכל 1,000 קק"ל (IOM), שומן רווי עד 10% מהקלוריות (הנחיות התזונה בארה"ב).

import type { NutrientKey, NutrientMap } from '../../types';
export type { NutrientKey, NutrientMap };

export interface NutrientInfo {
  key: NutrientKey;
  label: string;
  unit: 'גר׳' | 'מ״ג' | 'מק״ג';
  /** ערך יומי לייחוס, או פונקציה של היעד הקלורי. undefined = אין ערך יומי מוגדר */
  dailyValue?: number | ((calories: number) => number);
  /** "limit" = כדאי לא לעבור (נתרן, שומן רווי...), "target" = כדאי להגיע */
  kind: 'limit' | 'target' | 'info';
  group: 'carbs' | 'fats' | 'minerals' | 'vitamins';
}

export const NUTRIENTS: NutrientInfo[] = [
  { key: 'fiber', label: 'סיבים תזונתיים', unit: 'גר׳', dailyValue: (kcal) => Math.round((14 * kcal) / 1000), kind: 'target', group: 'carbs' },
  { key: 'sugars', label: 'סוכרים', unit: 'גר׳', kind: 'info', group: 'carbs' },
  { key: 'satFat', label: 'שומן רווי', unit: 'גר׳', dailyValue: (kcal) => Math.round((0.1 * kcal) / 9), kind: 'limit', group: 'fats' },
  { key: 'transFat', label: 'שומן טראנס', unit: 'גר׳', kind: 'limit', group: 'fats' },
  { key: 'monoFat', label: 'שומן חד בלתי רווי', unit: 'גר׳', kind: 'info', group: 'fats' },
  { key: 'polyFat', label: 'שומן רב בלתי רווי', unit: 'גר׳', kind: 'info', group: 'fats' },
  { key: 'cholesterol', label: 'כולסטרול', unit: 'מ״ג', dailyValue: 300, kind: 'limit', group: 'fats' },
  { key: 'sodium', label: 'נתרן', unit: 'מ״ג', dailyValue: 2300, kind: 'limit', group: 'minerals' },
  { key: 'potassium', label: 'אשלגן', unit: 'מ״ג', dailyValue: 4700, kind: 'target', group: 'minerals' },
  { key: 'calcium', label: 'סידן', unit: 'מ״ג', dailyValue: 1300, kind: 'target', group: 'minerals' },
  { key: 'iron', label: 'ברזל', unit: 'מ״ג', dailyValue: 18, kind: 'target', group: 'minerals' },
  { key: 'magnesium', label: 'מגנזיום', unit: 'מ״ג', dailyValue: 420, kind: 'target', group: 'minerals' },
  { key: 'vitaminA', label: 'ויטמין A', unit: 'מק״ג', dailyValue: 900, kind: 'target', group: 'vitamins' },
  { key: 'vitaminC', label: 'ויטמין C', unit: 'מ״ג', dailyValue: 90, kind: 'target', group: 'vitamins' },
  { key: 'vitaminD', label: 'ויטמין D', unit: 'מק״ג', dailyValue: 20, kind: 'target', group: 'vitamins' },
  { key: 'vitaminB12', label: 'ויטמין B12', unit: 'מק״ג', dailyValue: 2.4, kind: 'target', group: 'vitamins' },
];

export const NUTRIENT_GROUP_LABELS: Record<NutrientInfo['group'], string> = {
  carbs: 'פחמימות',
  fats: 'שומנים',
  minerals: 'מינרלים',
  vitamins: 'ויטמינים',
};

export function dailyValueFor(info: NutrientInfo, calories: number): number | undefined {
  return typeof info.dailyValue === 'function' ? info.dailyValue(calories) : info.dailyValue;
}

export const formatNutrient = (value: number, unit: string) =>
  `${value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100} ${unit}`;
