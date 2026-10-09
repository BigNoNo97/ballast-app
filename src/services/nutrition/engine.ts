// "מוח התזונה": מעריך כמה אתה שורף בפועל, קובע יעדים לפי המטרה, ומתריע כשמשהו לא בכיוון.
// כל מספר כאן מגיע ממקור במאגר evidence.ts (המזהה מופיע בהערה ליד הכלל). הקובץ טהור - בלי
// גישה לאחסון או לממשק - כדי שאפשר יהיה לבדוק אותו ולעדכן כללים כשיוצא מחקר חדש.

import {
  ActivityLevel,
  BodyWeightEntry,
  ExperienceLevel,
  NutritionEntry,
  NutritionGoalMode,
  NutritionGoals,
  OnboardingGoal,
  UserSettings,
} from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ===== קבועים (כל אחד עם המקור שלו) =====

/** [pal] FAO/WHO/UNU 2004 - נקודות בתוך הטווחים של כל קטגוריה */
export const ACTIVITY_PAL: Record<ActivityLevel, number> = {
  sedentary: 1.45, // עבודה מול מחשב, כמעט בלי הליכה
  light: 1.6, // עבודה בישיבה + הליכה/אימונים
  moderate: 1.75, // עבודה בעמידה/תנועה או אימונים כמעט כל יום
  active: 1.9, // עבודה פיזית או אימונים אינטנסיביים יומיים
  very_active: 2.1, // עבודה פיזית קשה + אימונים
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'יושבני - עבודה מול מחשב, מעט תנועה',
  light: 'קל - עבודה בישיבה, הליכה ואימונים',
  moderate: 'בינוני - הרבה עמידה/תנועה ביום',
  active: 'פעיל - עבודה פיזית או אימון יומי אינטנסיבי',
  very_active: 'פעיל מאוד - עבודה פיזית קשה + אימונים',
};

/** [energyDensity] Hall 2008: 39.5 MJ/kg שומן, 7.6 MJ/kg רקמה רזה */
const KCAL_PER_KG_FAT = 9440;
const KCAL_PER_KG_LEAN = 1816;
/** [energyDensity] Forbes: חלק הרקמה הרזה בשינוי משקל = C / (C + מסת שומן) */
const FORBES_C = 10.4;

/** [calorieFloor] AHA/ACC/TOS 2013 */
const CALORIE_FLOOR: Record<'male' | 'female', number> = { male: 1500, female: 1200 };

/** [lossRate] [gainRate] קצב שבועי באחוזים ממשקל הגוף */
export const RATE_LIMITS = {
  lose: { min: 0.25, max: 1.0, default: 0.5 },
  recomp: { min: 0.1, max: 0.35, default: 0.25 },
  gain: { min: 0.1, max: 0.5, default: 0.35 },
};
const GAIN_RATE_BY_EXPERIENCE: Record<ExperienceLevel, number> = { beginner: 0.5, intermediate: 0.35, advanced: 0.25 };
/** [gainRate] תקרת עודף כאחוז מההוצאה - מתחילים/בינוניים עד 20%, מתקדמים עד 10% */
const MAX_SURPLUS_FRACTION: Record<ExperienceLevel, number> = { beginner: 0.2, intermediate: 0.15, advanced: 0.1 };

// ===== פרופיל =====

export interface NutritionProfile {
  sex: 'male' | 'female';
  ageYears: number;
  heightCm: number;
  weightKg: number; // משקל מגמה עדכני (לא שקילה בודדת)
  activityLevel: ActivityLevel;
  experience: ExperienceLevel;
  mode: NutritionGoalMode;
  weeklyRatePercent: number; // גודל הקצב (תמיד חיובי); הכיוון נקבע לפי mode
}

export function goalModeFromGoals(goals: OnboardingGoal[] | undefined): NutritionGoalMode {
  const g = new Set(goals || []);
  if (g.has('lose_weight') && (g.has('gain_muscle') || g.has('strength'))) return 'recomp';
  if (g.has('lose_weight')) return 'lose';
  if (g.has('gain_muscle') || g.has('strength')) return 'gain';
  return 'maintain';
}

export function defaultActivityLevel(trainingDaysPerWeek: number | undefined): ActivityLevel {
  return (trainingDaysPerWeek ?? 3) >= 5 ? 'moderate' : 'light';
}

export function defaultWeeklyRate(mode: NutritionGoalMode, experience: ExperienceLevel): number {
  if (mode === 'lose') return RATE_LIMITS.lose.default;
  if (mode === 'recomp') return RATE_LIMITS.recomp.default;
  if (mode === 'gain') return GAIN_RATE_BY_EXPERIENCE[experience];
  return 0;
}

export function clampRate(mode: NutritionGoalMode, rate: number): number {
  if (mode === 'maintain') return 0;
  const lim = RATE_LIMITS[mode];
  return Math.min(lim.max, Math.max(lim.min, rate));
}

/** null = חסרים נתוני בסיס (מין/גיל/גובה/משקל) - אין על מה לחשב */
export function buildProfile(settings: UserSettings, weightKg: number | null): NutritionProfile | null {
  if (!settings.gender || !settings.ageYears || !settings.heightCm || !weightKg) return null;
  const experience = settings.experienceLevel ?? 'beginner';
  const mode = settings.nutritionGoalMode ?? goalModeFromGoals(settings.goals);
  const rate = settings.weeklyRatePercent ?? defaultWeeklyRate(mode, experience);
  return {
    sex: settings.gender,
    ageYears: settings.ageYears,
    heightCm: settings.heightCm,
    weightKg,
    activityLevel: settings.activityLevel ?? defaultActivityLevel(settings.trainingDaysPerWeek),
    experience,
    mode,
    weeklyRatePercent: clampRate(mode, rate),
  };
}

// ===== פיזיולוגיה =====

/** [mifflin] */
export function bmrMifflin(p: Pick<NutritionProfile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears + (p.sex === 'male' ? 5 : -161);
}

export function formulaTdee(p: NutritionProfile): number {
  return bmrMifflin(p) * ACTIVITY_PAL[p.activityLevel];
}

/** [bodyFatEstimate] Deurenberg 1991 - אחוז שומן משוער */
export function estimateBodyFatPercent(p: Pick<NutritionProfile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const bf = 1.2 * bmi + 0.23 * p.ageYears - 10.8 * (p.sex === 'male' ? 1 : 0) - 5.4;
  return Math.min(50, Math.max(p.sex === 'male' ? 6 : 12, bf));
}

/** [energyDensity] כמה קלוריות "שווה" ק"ג אחד של שינוי במשקל, לפי מסת השומן הנוכחית */
export function kcalPerKgChange(p: Pick<NutritionProfile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  const fatMass = (p.weightKg * estimateBodyFatPercent(p)) / 100;
  const leanFraction = FORBES_C / (FORBES_C + fatMass);
  return leanFraction * KCAL_PER_KG_LEAN + (1 - leanFraction) * KCAL_PER_KG_FAT;
}

// ===== מגמת משקל =====

export interface WeightTrend {
  /** שיפוע (ק"ג ליום) לפי רגרסיה לינארית - עמיד יותר לתנודות מים מהפרש בין שתי שקילות */
  slopeKgPerDay: number;
  /** משקל המגמה היום (קו הרגרסיה בנקודה האחרונה) */
  currentKg: number;
  weighIns: number;
  spanDays: number;
}

export function weightTrend(log: BodyWeightEntry[], now: number, windowDays: number): WeightTrend | null {
  const pts = log.filter((e) => e.date >= now - windowDays * DAY_MS && e.date <= now && e.weightKg > 0);
  if (pts.length < 2) return null;
  const xs = pts.map((e) => (e.date - now) / DAY_MS);
  const ys = pts.map((e) => e.weightKg);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const lastX = Math.max(...xs);
  return {
    slopeKgPerDay: slope,
    currentKg: my + slope * (lastX - mx),
    weighIns: n,
    spanDays: Math.max(...xs) - Math.min(...xs),
  };
}

/** המשקל העדכני הטוב ביותר שיש: מגמה של 14 יום, או השקילה האחרונה */
export function currentWeight(log: BodyWeightEntry[], now: number): number | null {
  const t = weightTrend(log, now, 14);
  if (t && t.weighIns >= 3) return Math.round(t.currentKg * 10) / 10;
  const last = [...log].sort((a, b) => b.date - a.date)[0];
  return last ? last.weightKg : null;
}

// ===== צריכה מדווחת =====

export interface DayIntake {
  dayStart: number;
  kcal: number;
  protein: number;
  fiber: number;
  /** כמה מהקלוריות של היום הגיעו מפריטים שידוע להם ערך סיבים */
  fiberKnownKcal: number;
  entries: number;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function dailyIntake(entries: NutritionEntry[], from: number, to: number): DayIntake[] {
  const byDay = new Map<number, DayIntake>();
  entries
    .filter((e) => e.date >= from && e.date < to)
    .forEach((e) => {
      const key = startOfDay(e.date);
      const d = byDay.get(key) || { dayStart: key, kcal: 0, protein: 0, fiber: 0, fiberKnownKcal: 0, entries: 0 };
      const f = e.grams / 100;
      const kcal = e.caloriesPer100g * f;
      d.kcal += kcal;
      d.protein += e.proteinPer100g * f;
      if (e.fiberPer100g !== undefined) {
        d.fiber += e.fiberPer100g * f;
        d.fiberKnownKcal += kcal;
      }
      d.entries += 1;
      byDay.set(key, d);
    });
  return [...byDay.values()].sort((a, b) => a.dayStart - b.dayStart);
}

/**
 * [underreporting] יום שתועד חלקית (שכחת ארוחה) היה "מוכיח" שאתה שורף פחות ממה שאתה שורף,
 * ומוריד את היעד בטעות. יום נחשב שלם רק אם הוא לפחות מחצית מהיעד הנוכחי (ולא פחות מ-800).
 */
export function isCompleteDay(day: DayIntake, currentGoalKcal: number): boolean {
  return day.kcal >= Math.max(800, currentGoalKcal * 0.5);
}

// ===== הערכת ההוצאה היומית =====

export interface TdeeEstimate {
  tdee: number;
  formulaTdee: number;
  adaptiveTdee: number | null;
  /** 0 = רק נוסחה, 1 = מבוסס לגמרי על הנתונים שלך */
  confidence: number;
  completeDays: number;
  trend: WeightTrend | null;
  avgIntake: number | null;
  /** הנתונים לא מסתדרים עם הנוסחה בכלל - כנראה תיעוד חלקי */
  suspicious: boolean;
}

const ADAPTIVE_WINDOW_DAYS = 28;

/** [adaptiveEstimate] צריכה ממוצעת − (שינוי מאגרי הגוף ליום) */
export function estimateTdee(
  profile: NutritionProfile,
  log: BodyWeightEntry[],
  entries: NutritionEntry[],
  currentGoalKcal: number,
  now: number
): TdeeEstimate {
  const formula = formulaTdee(profile);
  const from = now - ADAPTIVE_WINDOW_DAYS * DAY_MS;
  const days = dailyIntake(entries, from, startOfDay(now)).filter((d) => isCompleteDay(d, currentGoalKcal));
  const trend = weightTrend(log, now, ADAPTIVE_WINDOW_DAYS);
  const base = { formulaTdee: Math.round(formula), completeDays: days.length, trend };

  // צריך מספיק נתונים כדי שהרעש (מים, מלח, מחזור) לא ישלוט: 10+ ימים מתועדים, 5+ שקילות על פני 10+ ימים
  if (days.length < 10 || !trend || trend.weighIns < 5 || trend.spanDays < 10) {
    return { ...base, tdee: Math.round(formula), adaptiveTdee: null, confidence: 0, avgIntake: null, suspicious: false };
  }

  const avgIntake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
  const adaptive = avgIntake - trend.slopeKgPerDay * kcalPerKgChange({ ...profile, weightKg: trend.currentKg });
  let confidence = Math.min(1, days.length / 21) * Math.min(1, trend.spanDays / 21);
  // תוצאה רחוקה מאוד מכל הערכה סבירה - כמעט תמיד תיעוד חסר, לא חילוף חומרים חריג
  const suspicious = adaptive < formula * 0.65 || adaptive > formula * 1.5;
  if (suspicious) confidence = 0;
  const tdee = confidence * adaptive + (1 - confidence) * formula;
  return {
    ...base,
    tdee: Math.round(tdee),
    adaptiveTdee: Math.round(adaptive),
    confidence: Math.round(confidence * 100) / 100,
    avgIntake: Math.round(avgIntake),
    suspicious,
  };
}

// ===== יעדים =====

export interface NutritionTargets extends NutritionGoals {
  fiber: number;
  /** היעד הוגבל לרצפה הבטוחה (הקצב שנבחר היה מוריד מתחתיה) */
  flooredAtMinimum: boolean;
  dailyEnergyDelta: number;
}

export function computeTargets(profile: NutritionProfile, tdee: number): NutritionTargets {
  const perKg = kcalPerKgChange(profile);
  const weeklyKg = (profile.weeklyRatePercent / 100) * profile.weightKg;
  let delta = 0;
  if (profile.mode === 'lose' || profile.mode === 'recomp') delta = -(weeklyKg * perKg) / 7; // [lossRate] [recomp]
  if (profile.mode === 'gain') delta = Math.min((weeklyKg * perKg) / 7, tdee * MAX_SURPLUS_FRACTION[profile.experience]); // [gainRate]

  // [calorieFloor] לא מתחת ל-1,200/1,500, ולא מתחת לחילוף החומרים במנוחה
  const floor = Math.max(CALORIE_FLOOR[profile.sex], Math.round(bmrMifflin(profile)));
  let calories = Math.round(tdee + delta);
  const flooredAtMinimum = calories < floor;
  if (flooredAtMinimum) calories = floor;
  calories = Math.round(calories / 10) * 10;

  // [protein] [proteinDeficit] לפי מסת הגוף הרזה המשוערת; אצל BMI≥30 משקל ייחוס ב-BMI 25
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const refWeight = bmi >= 30 ? 25 * (profile.heightCm / 100) ** 2 : profile.weightKg;
  const leanMass = profile.weightKg * (1 - estimateBodyFatPercent(profile) / 100);
  const inDeficit = calories < tdee - 50;
  const protein = Math.round(Math.max(1.6 * refWeight, leanMass * (inDeficit ? 2.4 : 2.0)));

  // [fat] 25% מהקלוריות, ולא פחות מ-20% או 0.5 גרם לק"ג
  const fatMin = Math.max((calories * 0.2) / 9, 0.5 * refWeight);
  let fat = Math.max((calories * 0.25) / 9, fatMin);
  let carbs = (calories - protein * 4 - fat * 9) / 4;
  if (carbs < 0) {
    fat = fatMin;
    carbs = Math.max(0, (calories - protein * 4 - fat * 9) / 4);
  }

  return {
    calories,
    protein,
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    fiber: Math.round((14 * calories) / 1000), // [fiber]
    flooredAtMinimum,
    dailyEnergyDelta: Math.round(delta),
  };
}

// ===== תובנות והתרעות =====

export interface NutritionInsight {
  id: string;
  severity: 'warn' | 'info' | 'good';
  title: string;
  body: string;
  evidence: string[];
}

export interface NutritionAnalysis {
  profile: NutritionProfile | null;
  estimate: TdeeEstimate | null;
  targets: NutritionTargets | null;
  /** קצב שינוי בפועל באחוזים לשבוע (שלילי = ירידה) */
  observedWeeklyPercent: number | null;
  insights: NutritionInsight[];
}

const pct = (n: number) => `${Math.abs(n).toFixed(2).replace(/\.?0+$/, '')}%`;

export function analyzeNutrition(
  settings: UserSettings,
  log: BodyWeightEntry[],
  entries: NutritionEntry[],
  currentGoals: NutritionGoals,
  now: number = Date.now()
): NutritionAnalysis {
  const insights: NutritionInsight[] = [];
  const profile = buildProfile(settings, currentWeight(log, now));
  if (!profile) {
    insights.push({
      id: 'missing_profile',
      severity: 'info',
      title: 'חסרים פרטים בסיסיים',
      body: 'כדי לחשב יעדים צריך מין, גיל, גובה ומשקל. אפשר להשלים אותם במסך "המטרה שלי".',
      evidence: ['mifflin'],
    });
    return { profile: null, estimate: null, targets: null, observedWeeklyPercent: null, insights };
  }

  const estimate = estimateTdee(profile, log, entries, currentGoals.calories, now);
  const targets = computeTargets(profile, estimate.tdee);
  const trend21 = weightTrend(log, now, 21);
  const observedWeeklyPercent =
    trend21 && trend21.weighIns >= 4 && trend21.spanDays >= 10 ? ((trend21.slopeKgPerDay * 7) / trend21.currentKg) * 100 : null;

  const last14 = dailyIntake(entries, now - 14 * DAY_MS, startOfDay(now));
  const complete14 = last14.filter((d) => isCompleteDay(d, currentGoals.calories));
  const last7 = complete14.filter((d) => d.dayStart >= startOfDay(now) - 7 * DAY_MS);
  const weighIns14 = log.filter((e) => e.date >= now - 14 * DAY_MS).length;

  // --- קצב
  if (observedWeeklyPercent !== null) {
    if ((profile.mode === 'lose' || profile.mode === 'recomp') && observedWeeklyPercent < -1.0) {
      insights.push({
        id: 'loss_too_fast',
        severity: 'warn',
        title: `יורד מהר מדי (${pct(observedWeeklyPercent)} בשבוע)`,
        body: 'מעל כ-1% בשבוע, חלק גדול יותר מהמשקל שיורד הוא שריר. כדאי להעלות מעט את הקלוריות - ההצעה השבועית תתאים את היעד.',
        evidence: ['lossRate'],
      });
    }
    if (profile.mode === 'gain' && observedWeeklyPercent > 0.5) {
      insights.push({
        id: 'gain_too_fast',
        severity: 'warn',
        title: `עולה מהר מדי (${pct(observedWeeklyPercent)} בשבוע)`,
        body: 'מעל כ-0.5% בשבוע, רוב התוספת היא שומן ולא שריר. עודף קטן יותר יבנה את אותו שריר עם פחות שומן.',
        evidence: ['gainRate'],
      });
    }
    if (profile.mode === 'gain' && observedWeeklyPercent <= 0 && (trend21?.spanDays ?? 0) >= 18) {
      insights.push({
        id: 'not_gaining',
        severity: 'info',
        title: 'המשקל לא עולה',
        body: 'במסה, בלי עלייה הדרגתית במשקל קשה לבנות שריר. אם התיעוד מלא - היעד יעלה בהצעה הבאה.',
        evidence: ['gainRate'],
      });
    }
    if (profile.mode === 'lose' && observedWeeklyPercent > -0.1 && (trend21?.spanDays ?? 0) >= 18 && complete14.length >= 10) {
      insights.push({
        id: 'plateau',
        severity: 'info',
        title: 'המשקל נתקע',
        body: 'שלושה שבועות בלי ירידה למרות תיעוד מלא. ההוצאה שלך כנראה נמוכה ממה שהוערך - ההצעה השבועית תוריד את היעד. שווה גם לוודא שמשקלים/שמנים מתועדים במדויק.',
        evidence: ['adaptiveEstimate', 'underreporting'],
      });
    }
    if (
      ((profile.mode === 'lose' || profile.mode === 'recomp') && observedWeeklyPercent <= -0.25 && observedWeeklyPercent >= -1.0) ||
      (profile.mode === 'gain' && observedWeeklyPercent >= 0.1 && observedWeeklyPercent <= 0.5)
    ) {
      insights.push({
        id: 'on_track',
        severity: 'good',
        title: `בקצב טוב (${observedWeeklyPercent < 0 ? 'ירידה' : 'עלייה'} של ${pct(observedWeeklyPercent)} בשבוע)`,
        body: 'הקצב בטווח שהמחקר ממליץ עליו למטרה שלך. להמשיך כך.',
        evidence: [profile.mode === 'gain' ? 'gainRate' : 'lossRate'],
      });
    }
  }

  // --- חלבון: ממוצע הימים המלאים בשבוע האחרון
  if (last7.length >= 4) {
    const avgProtein = last7.reduce((s, d) => s + d.protein, 0) / last7.length;
    if (avgProtein < targets.protein * 0.85) {
      insights.push({
        id: 'protein_low',
        severity: 'info',
        title: `חלבון נמוך מהיעד (ממוצע ${Math.round(avgProtein)} מתוך ${targets.protein} גרם)`,
        body: 'חלבון מספק הוא מה שמאפשר לבנות ולשמור שריר. הכי קל לחלק אותו ל-3-5 ארוחות של 20-40 גרם.',
        evidence: [targets.calories < estimate.tdee ? 'proteinDeficit' : 'protein'],
      });
    }
  }

  // --- סיבים: רק כשלרוב הקלוריות יש ערך סיבים ידוע (מהמאגר הישראלי)
  if (last7.length >= 4) {
    const kcal = last7.reduce((s, d) => s + d.kcal, 0);
    const knownKcal = last7.reduce((s, d) => s + d.fiberKnownKcal, 0);
    if (kcal > 0 && knownKcal / kcal >= 0.6) {
      const fiberPer1000 = (last7.reduce((s, d) => s + d.fiber, 0) / knownKcal) * 1000;
      if (fiberPer1000 < 14 * 0.7) {
        insights.push({
          id: 'fiber_low',
          severity: 'info',
          title: `מעט סיבים (${fiberPer1000.toFixed(1)} גרם לכל 1,000 קלוריות, ההמלצה 14)`,
          body: 'ירקות, פירות, קטניות ודגנים מלאים. סיבים עוזרים לשובע ומקושרים לסיכון נמוך יותר למחלות לב.',
          evidence: ['fiber'],
        });
      }
    }
  }

  // --- צריכה נמוכה מהרצפה הבטוחה
  if (last7.length >= 4) {
    const avg = last7.reduce((s, d) => s + d.kcal, 0) / last7.length;
    if (avg < CALORIE_FLOOR[profile.sex] - 100) {
      insights.push({
        id: 'below_floor',
        severity: 'warn',
        title: `צריכה נמוכה מאוד (ממוצע ${Math.round(avg)} קלוריות)`,
        body: `מתחת ל-${CALORIE_FLOOR[profile.sex].toLocaleString()} קלוריות ביום קשה לקבל מספיק חלבון, ויטמינים ומינרלים. דיאטה דלה מאוד צריכה ליווי רפואי.`,
        evidence: ['calorieFloor'],
      });
    }
  }

  // --- איכות הנתונים
  if (estimate.suspicious) {
    insights.push({
      id: 'data_suspicious',
      severity: 'info',
      title: 'הנתונים לא מסתדרים',
      body: 'לפי המשקל והאוכל שתועד יוצאת הוצאה לא סבירה - כנראה חלק מהארוחות לא תועדו. עד שזה יתאזן, היעד נשען יותר על הנוסחה.',
      evidence: ['underreporting'],
    });
  } else if (last14.length >= 3 && complete14.length < 7) {
    insights.push({
      id: 'logging_incomplete',
      severity: 'info',
      title: 'תיעוד חלקי',
      body: 'כדי שהיעד יתאים לגוף שלך צריך לפחות 10 ימים מתועדים במלואם בחודש. ימים חלקיים לא נספרים.',
      evidence: ['underreporting', 'adaptiveEstimate'],
    });
  }
  if (weighIns14 < 4) {
    insights.push({
      id: 'weigh_more',
      severity: 'info',
      title: 'צריך עוד שקילות',
      body: 'שקילה 3-7 פעמים בשבוע (בבוקר, אחרי שירותים) מאפשרת לחשב מגמה אמיתית מתוך תנודות המים היומיות.',
      evidence: ['gainRate', 'adaptiveEstimate'],
    });
  }

  if (targets.flooredAtMinimum) {
    insights.push({
      id: 'floored',
      severity: 'info',
      title: 'היעד הוגבל לרצפה בטוחה',
      body: `הקצב שנבחר היה מוריד את היעד מתחת ל-${targets.calories.toLocaleString()} קלוריות, אז הוא הוגבל. הירידה תהיה מעט איטית יותר.`,
      evidence: ['calorieFloor'],
    });
  }

  const order = { warn: 0, info: 1, good: 2 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  return { profile, estimate, targets, observedWeeklyPercent, insights };
}

// ===== הצעה שבועית לעדכון היעד =====

export interface TargetSuggestion {
  goals: NutritionGoals;
  previousCalories: number;
  rationale: string;
}

const MIN_CHANGE_TO_SUGGEST = 75;
/** הערכה מבוססת נתונים רועשת - לא מזיזים יותר מ-250 קלוריות בבת אחת, ממשיכים בשבוע הבא */
const MAX_CHANGE_PER_STEP = 250;

export function suggestTargetUpdate(analysis: NutritionAnalysis, current: NutritionGoals): TargetSuggestion | null {
  const { targets, estimate, profile } = analysis;
  if (!targets || !estimate || !profile || estimate.confidence < 0.4) return null;
  const diff = targets.calories - current.calories;
  if (Math.abs(diff) < MIN_CHANGE_TO_SUGGEST) return null;
  const step = Math.max(-MAX_CHANGE_PER_STEP, Math.min(MAX_CHANGE_PER_STEP, diff));
  const calories = Math.round((current.calories + step) / 10) * 10;
  const scaled = computeTargetsAtCalories(profile, estimate.tdee, calories);
  const weekly = analysis.observedWeeklyPercent;
  const trendText =
    weekly === null ? '' : weekly < -0.05 ? `אתה יורד ${pct(weekly)} בשבוע` : weekly > 0.05 ? `אתה עולה ${pct(weekly)} בשבוע` : 'המשקל שלך יציב';
  const rationale =
    `לפי ${estimate.completeDays} ימים מתועדים והמשקל שלך, אתה שורף בפועל כ-${estimate.tdee.toLocaleString()} קלוריות ביום` +
    (trendText ? ` (${trendText})` : '') +
    `. ${step !== diff ? 'מעדכנים בהדרגה - ' : ''}היעד החדש מותאם למטרה ולקצב שבחרת.`;
  return { goals: scaled, previousCalories: current.calories, rationale };
}

/** אותה חלוקת מאקרו כמו computeTargets, אבל סביב יעד קלורי נתון (לעדכון הדרגתי) */
export function computeTargetsAtCalories(profile: NutritionProfile, tdee: number, calories: number): NutritionGoals {
  const full = computeTargets(profile, tdee);
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const refWeight = bmi >= 30 ? 25 * (profile.heightCm / 100) ** 2 : profile.weightKg;
  const fatMin = Math.max((calories * 0.2) / 9, 0.5 * refWeight);
  let fat = Math.max((calories * 0.25) / 9, fatMin);
  let carbs = (calories - full.protein * 4 - fat * 9) / 4;
  if (carbs < 0) {
    fat = fatMin;
    carbs = Math.max(0, (calories - full.protein * 4 - fat * 9) / 4);
  }
  return { calories, protein: full.protein, fat: Math.round(fat), carbs: Math.round(carbs) };
}
