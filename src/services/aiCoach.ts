// צ'אט ה-AI (המאמן): בונה תמונת מצב קומפקטית של המשתמש מכל המערכות באפליקציה (פרופיל, מוח
// התזונה, מוח האימונים, היסטוריה), ומזרים תשובה מה-Edge Function ai-coach. המפתח של Claude
// נמצא רק בשרת - מכאן נשלח רק הטוקן של המשתמש.
import { supabase } from './supabaseClient';
import { StorageService } from './storage';
import { analyzeNutrition, currentWeight } from './nutrition/engine';
import { injuryLabel } from './training/injuries';
import { MUSCLE_GROUP_LABELS } from '../data/exercises';
import type { NutritionEntry, UserSettings } from '../types';
import { weeklyMuscleTargets } from './programGenerator';
import { muscleBalance, weeklyLoad } from './muscleLoad';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export type CoachErrorCode = 'quota' | 'not_configured' | 'busy' | 'network' | 'auth' | 'refusal' | 'failed';

export class CoachError extends Error {
  constructor(
    public code: CoachErrorCode,
    public limit?: number
  ) {
    super(code);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const round = (n: number, digits = 0) => Math.round(n * 10 ** digits) / 10 ** digits;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function dayTotals(entries: NutritionEntry[], dayStart: number) {
  const day = entries.filter((e) => e.date >= dayStart && e.date < dayStart + DAY_MS);
  if (!day.length) return null;
  const sum = (per100: (e: NutritionEntry) => number) => round(day.reduce((acc, e) => acc + (per100(e) * e.grams) / 100, 0));
  return {
    date: isoDay(dayStart),
    kcal: sum((e) => e.caloriesPer100g),
    protein: sum((e) => e.proteinPer100g),
    carbs: sum((e) => e.carbsPer100g),
    fat: sum((e) => e.fatPer100g),
    items: day.length,
  };
}

/** תמונת המצב שנשלחת למאמן. רק מה שעוזר לענות - בלי מזהים, אימייל או תמונות. */
export function buildCoachContext(settings: UserSettings): Record<string, unknown> {
  const now = Date.now();
  const exercises = StorageService.getExercises();
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.nameHe ?? id;
  const weightLog = StorageService.getBodyWeightLog();
  const entries = StorageService.getAllNutritionEntries();
  const goals = StorageService.getNutritionGoals();
  const analysis = analyzeNutrition(settings, weightLog, entries, goals, now);

  const profile = {
    sex: settings.gender,
    ageYears: settings.ageYears,
    heightCm: settings.heightCm,
    currentWeightKg: (() => {
      const w = currentWeight(weightLog, now);
      return w === null ? undefined : round(w, 1);
    })(),
    targetWeightKg: StorageService.getTargetWeight() ?? undefined,
    goals: settings.goals,
    experience: settings.experienceLevel,
    trainingDaysPerWeek: settings.trainingDaysPerWeek,
    sessionMinutes: settings.sessionDurationMinutes,
    equipment: settings.availableEquipment ?? 'full gym',
    injuries: settings.injuries?.map(injuryLabel),
    focusMuscles: settings.focusMuscles?.map((m) => MUSCLE_GROUP_LABELS[m]?.he ?? m),
    dailyActivity: settings.activityLevel,
    nutritionGoal: analysis.profile?.mode ?? settings.nutritionGoalMode,
    weeklyRatePercent: analysis.profile?.weeklyRatePercent,
  };

  const todayStart = new Date(new Date(now).toDateString()).getTime();
  const last7 = Array.from({ length: 7 }, (_, i) => dayTotals(entries, todayStart - i * DAY_MS)).filter(Boolean);

  const nutrition = {
    dailyTargets: goals,
    expenditure: analysis.estimate && {
      tdeeUsed: round(analysis.estimate.tdee),
      formulaTdee: round(analysis.estimate.formulaTdee),
      adaptiveTdeeFromData: analysis.estimate.adaptiveTdee === null ? null : round(analysis.estimate.adaptiveTdee),
      confidence0to1: round(analysis.estimate.confidence, 2),
      completeLoggedDays: analysis.estimate.completeDays,
      avgLoggedIntake: analysis.estimate.avgIntake === null ? null : round(analysis.estimate.avgIntake),
    },
    targetHitSafetyFloor: analysis.targets?.flooredAtMinimum || undefined,
    observedWeeklyWeightChangePercent:
      analysis.observedWeeklyPercent === null ? null : round(analysis.observedWeeklyPercent, 2),
    engineInsights: analysis.insights.map((i) => `${i.title}: ${i.body}`),
    last7Days: last7,
    autoAdjustTargets: settings.nutritionAutoAdjustEnabled !== false,
  };

  const recentWeights = [...weightLog]
    .sort((a, b) => b.date - a.date)
    .slice(0, 10)
    .map((e) => ({ date: isoDay(e.date), kg: round(e.weightKg, 1) }));

  const routines = StorageService.getRoutines();
  const active =
    settings.activeRoutineId === null
      ? undefined
      : routines.find((r) => r.id === settings.activeRoutineId) ?? (settings.activeRoutineId === undefined ? routines[0] : undefined);
  const program = active && {
    title: active.title,
    builtByEngine: !!active.isGenerated,
    editedByUser: !!active.manuallyEditedAt,
    split: active.splitType,
    cycle: active.mesocycle && `week ${active.mesocycle.currentWeek} of ${active.mesocycle.lengthWeeks} (cycle ${active.mesocycle.cycleNumber})`,
    days: active.days.map((d) => ({
      day: d.dayTitle,
      exercises: d.exercises.map(
        (x) => `${nameOf(x.exerciseId)} ${x.targetSets}x${x.targetReps}${x.repRangeMax ? `-${x.repRangeMax}` : ''}${x.restSec ? ` rest ${x.restSec}s` : ''}`
      ),
    })),
    whyThisProgram: active.planRationale?.map((d) => d.text),
  };

  const recentWorkouts = StorageService.getWorkoutHistory()
    .filter((w) => w.isCompleted)
    .slice(0, 6)
    .map((w) => ({
      date: isoDay(w.startTime),
      title: w.title,
      minutes: Math.round(w.durationSec / 60),
      completedSets: w.completedSetsCount,
      volumeKg: Math.round(w.totalVolumeKg),
      exercises: w.exercises.map((x) => {
        const done = x.sets.filter((s) => s.completed);
        const best = done.reduce<(typeof done)[number] | null>((b, s) => (!b || s.weightKg > b.weightKg ? s : b), null);
        return `${nameOf(x.exerciseId)}: ${done.length} sets${best ? `, top ${best.weightKg}kg x ${best.reps}` : ''}`;
      }),
    }));

  const personalRecords = Object.values(StorageService.getPersonalRecords())
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, 8)
    .map((pr) => `${pr.exerciseNameHe}: ${pr.maxWeight}kg x ${pr.repsAtMaxWeight} (e1RM ${round(pr.estimated1RM)})`);

  // עומס שרירים: סטים השבוע מול היעד, ואיזון ב-4 השבועות האחרונים (אחוז מהיעד)
  const history = StorageService.getWorkoutHistory();
  const w = currentWeight(weightLog, now);
  const targets = weeklyMuscleTargets(settings, active, w ?? undefined);
  const muscleHe = (m: keyof typeof MUSCLE_GROUP_LABELS) => MUSCLE_GROUP_LABELS[m]?.he ?? m;
  const muscleLoadThisWeek = weeklyLoad(history, exercises, targets)
    .filter((r) => r.target || r.sets > 0)
    .map((r) => `${muscleHe(r.muscle)}: ${r.sets} sets${r.target ? ` of ${r.target} target` : ' (no direct target)'}`);
  const muscleBalanceLast4Weeks = muscleBalance(history, exercises, targets)?.map((b) => `${muscleHe(b.muscle)}: ${b.percent}% of target`);

  // סדר המפתחות חשוב: השרת חותך הקשר ארוך מהסוף, אז הנתונים החשובים קודם
  return { profile, nutrition, recentWeights, program, muscleLoadThisWeek, muscleBalanceLast4Weeks, recentWorkouts, personalRecords };
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/ai-coach`;

/** שולח את השיחה ומזרים את התשובה. onText מקבל בכל פעם את כל הטקסט עד עכשיו. */
export async function streamCoachReply(
  history: CoachMessage[],
  /** null = המשתמש בחר לא לשתף את נתוני האפליקציה - נשלחת רק השיחה */
  settings: UserSettings | null,
  onText: (textSoFar: string) => void,
  signal: AbortSignal
): Promise<{ text: string; remaining: number | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new CoachError('auth');

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: history.map(({ role, content }) => ({ role, content })),
        context: settings ? buildCoachContext(settings) : undefined,
      }),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new CoachError('network');
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (res.status === 429 && body.error === 'quota') throw new CoachError('quota', Number(body.limit) || undefined);
    if (res.status === 503) throw new CoachError('not_configured');
    if (res.status === 401) throw new CoachError('auth');
    throw new CoachError('failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const line = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (!line.startsWith('data:')) continue;
      let event: { type: string; text?: string; remaining?: number; code?: string };
      try {
        event = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (event.type === 'delta' && event.text) {
        text += event.text;
        onText(text);
      } else if (event.type === 'done') {
        if (event.text) {
          text = event.text;
          onText(text);
        }
        return { text, remaining: typeof event.remaining === 'number' ? event.remaining : null };
      } else if (event.type === 'refusal') {
        throw new CoachError('refusal');
      } else if (event.type === 'error') {
        throw new CoachError(event.code === 'busy' || event.code === 'not_configured' ? event.code : 'failed');
      }
    }
  }
  // הזרם נסגר בלי אירוע סיום (ניתוק באמצע)
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  throw new CoachError('network');
}
