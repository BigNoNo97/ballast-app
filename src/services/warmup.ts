// מחשבון סטי חימום: 1-4 סטים מדורגים לפני משקל העבודה, לפי כמה כבד הוא. אחוזים יורדים
// בחזרות ככל שמתקרבים למשקל העבודה - מחממים את התנועה בלי לעייף לפני סטי העבודה.
// משקל של מוט מעוגל למה שאפשר להעמיס עם הפלטות שיש במכון (מחשבון הפלטות).
import { EquipmentType } from '../types';
import { PlateSetup, calculatePlates } from './plateMath';

export interface WarmupStep {
  weightKg: number;
  reps: number;
}

/** הסכימה לפי משקל העבודה: [אחוז, חזרות] */
function scheme(workKg: number): [number, number][] {
  if (workKg < 30) return [[0.5, 10]];
  if (workKg < 60) return [[0.5, 10], [0.75, 5]];
  if (workKg < 100) return [[0.4, 10], [0.6, 5], [0.8, 3]];
  return [[0.4, 8], [0.6, 5], [0.75, 3], [0.85, 1]];
}

const roundDown = (kg: number, step: number) => Math.floor(kg / step + 1e-9) * step;

/** המשקל הקרוב (מלמטה) שאפשר באמת להרים בציוד הזה */
function loadable(kg: number, equipment: EquipmentType, plates?: PlateSetup | null): number {
  if (plates) {
    if (kg <= plates.barKg) return plates.barKg;
    const r = calculatePlates(kg, plates);
    return r.exact?.totalKg ?? r.below?.totalKg ?? plates.barKg;
  }
  // משקולות יד: עד 10 ק"ג בקפיצות של 1, מעל - 2.5. מכונות וכבלים - 2.5
  if (equipment === 'dumbbell' && kg < 10) return Math.max(1, Math.round(kg));
  return Math.max(2.5, roundDown(kg, 2.5));
}

/**
 * סטי החימום למשקל עבודה נתון. plates = הגדרות המוט והפלטות לתרגיל עם מוט (אחרת null).
 * סט שיוצא כבד מדי (שווה למשקל העבודה) או זהה לקודם אחרי העיגול - לא נכלל.
 */
export function warmupSets(workKg: number, equipment: EquipmentType, plates?: PlateSetup | null): WarmupStep[] {
  if (!(workKg > 0) || equipment === 'bodyweight') return [];
  const out: WarmupStep[] = [];
  // מוט: מתחילים תמיד במוט ריק כשמשקל העבודה מספיק כבד בשבילו
  if (plates && plates.barKg > 0 && workKg >= plates.barKg * 2.5) out.push({ weightKg: plates.barKg, reps: 10 });
  scheme(workKg).forEach(([pct, reps]) => {
    const kg = loadable(workKg * pct, equipment, plates);
    const prev = out[out.length - 1];
    if (kg >= workKg || (prev && kg <= prev.weightKg)) return;
    out.push({ weightKg: kg, reps });
  });
  // עד 4 סטים: אם יש יותר (מוט ריק + 4 שלבים), מוותרים על השלב הקל שאחרי המוט
  while (out.length > 4) out.splice(1, 1);
  return out;
}
