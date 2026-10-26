// מאמנים ומתאמנים: כל הקריאות לשרת (טבלאות + פונקציות ב-migration 20261027000000_trainers).
// ההרשאות נאכפות בשרת (RLS + פונקציות שבודקות הכל) - כאן רק עטיפה נוחה ותרגום שגיאות לעברית.
//
// המאמן מנהל את נתוני המתאמן ישירות בשרת: אותן טבלאות ואותו מבנה שהאפליקציה של המתאמן
// מסנכרנת. האפליקציה של המתאמן מושכת את השינויים (cloudSync ממזג אותם עם מה שבמכשיר),
// ויומן השינויים (trainer_activity) מעדכן אותה מיד ומראה למתאמן מה השתנה.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { analyzeNutrition, NutritionAnalysis } from './nutrition/engine';
import type {
  BodyWeightEntry,
  Exercise,
  ExerciseProgressState,
  MeasurementCategory,
  MeasurementEntry,
  NutritionEntry,
  NutritionGoals,
  RoutineTemplate,
  UserSettings,
  WorkoutSession,
} from '../types';

export interface TrainerProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  invite_code: string;
  created_at: string;
}

export interface TrainerStatus {
  plan: 'free' | 'premium' | 'trainer';
  client_limit: number;
  active_clients: number;
}

export interface TrainerRelation {
  trainer_id: string;
  client_id: string;
  client_display_name: string;
  status: 'active' | 'ended';
  share_nutrition: boolean;
  consented_at: string;
  ended_at: string | null;
  ended_by: string | null;
}

export interface TrainerMessage {
  id: string;
  trainer_id: string;
  client_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface TrainerActivity {
  id: number;
  trainer_id: string;
  client_id: string;
  table_name: string;
  row_id: string;
  action: 'insert' | 'update' | 'delete';
  created_at: string;
}

/** הטבלאות שהמאמן מנהל ישירות (user_settings - רק דרך patchClientSettings) */
export type ClientTable =
  | 'workouts'
  | 'routines'
  | 'custom_exercises'
  | 'body_weight_entries'
  | 'measurement_categories'
  | 'measurement_entries'
  | 'exercise_progress'
  | 'nutrition_entries';

const RELATION_COLUMNS = 'trainer_id, client_id, client_display_name, status, share_nutrition, consented_at, ended_at, ended_by';

const ERRORS: Record<string, string> = {
  invalid_code: 'הקוד לא נמצא. בדוק שהקלדת אותו נכון.',
  own_code: 'זה הקוד שלך עצמך 🙂',
  already_has_trainer: 'כבר יש לך מאמן פעיל. כדי לעבור למאמן אחר, קודם צריך להפסיק את השיתוף עם הנוכחי.',
  trainer_full: 'למאמן הזה אין כרגע מקום למתאמנים נוספים. כדאי לעדכן אותו.',
  removed_by_trainer: 'המאמן הסיר אותך מרשימת המתאמנים שלו. כדי לחזור, דבר איתו ישירות.',
  invalid_name: 'השם צריך להיות באורך 1–60 תווים.',
  not_a_trainer: 'אין לך חשבון מאמן.',
  too_many_attempts: 'יותר מדי ניסיונות עם קוד שגוי. נסה שוב בעוד שעה.',
  forbidden: 'אין לך יותר גישה לנתונים של המתאמן הזה.',
  'row-level security': 'אין לך יותר גישה לנתונים של המתאמן הזה.',
};

/** שגיאה בעברית שאפשר להציג למשתמש */
export class TrainerError extends Error {}

function fail(error: { message?: string } | null | undefined): never {
  const raw = error?.message ?? '';
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  if (key) throw new TrainerError(ERRORS[key]);
  if (/fetch|network|Failed to/i.test(raw)) throw new TrainerError('אין חיבור לאינטרנט. נסה שוב.');
  throw new TrainerError('משהו השתבש. נסה שוב.');
}

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

// ===================== צד המאמן =====================

export async function getMyTrainerProfile(): Promise<TrainerProfile | null> {
  const { data, error } = await supabase.rpc('my_trainer_profile');
  if (error) fail(error);
  return (data as TrainerProfile[] | null)?.[0] ?? null;
}

export async function becomeTrainer(displayName: string, bio: string): Promise<TrainerProfile> {
  const { data, error } = await supabase.rpc('become_trainer', { p_display_name: displayName.trim(), p_bio: bio.trim() || null });
  if (error) fail(error);
  return data as TrainerProfile;
}

export async function updateTrainerProfile(userId: string, displayName: string, bio: string): Promise<void> {
  const { error } = await supabase
    .from('trainer_profiles')
    .update({ display_name: displayName.trim(), bio: bio.trim() || null })
    .eq('user_id', userId);
  if (error) fail(error);
}

export async function rotateInviteCode(): Promise<string> {
  const { data, error } = await supabase.rpc('rotate_trainer_code');
  if (error) fail(error);
  return data as string;
}

/** סגירת חשבון המאמן: כל המתאמנים מנותקים והגישה לנתונים שלהם נחסמת */
export async function closeTrainerAccount(): Promise<void> {
  const { error } = await supabase.rpc('close_trainer_account');
  if (error) fail(error);
}

export async function getTrainerStatus(): Promise<TrainerStatus> {
  const { data, error } = await supabase.rpc('my_trainer_status');
  if (error) fail(error);
  return (data as TrainerStatus[])[0];
}

export async function getMyClients(trainerId: string): Promise<TrainerRelation[]> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(RELATION_COLUMNS)
    .eq('trainer_id', trainerId)
    .order('consented_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as TrainerRelation[];
}

/** אימונים מהשבועיים האחרונים של כל המתאמנים - שאילתה אחת לרשימת המתאמנים */
export async function getRecentClientWorkouts(clientIds: string[], days = 14): Promise<Map<string, WorkoutSession[]>> {
  const byClient = new Map<string, WorkoutSession[]>();
  if (!clientIds.length) return byClient;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('workouts')
    .select('user_id, data')
    .in('user_id', clientIds)
    // timestamp במילישניות (13 ספרות) - השוואה טקסטואלית שקולה למספרית
    .filter('data->>startTime', 'gte', String(since));
  if (error) fail(error);
  for (const row of (data ?? []) as { user_id: string; data: WorkoutSession }[]) {
    if (!row.data?.isCompleted) continue;
    const list = byClient.get(row.user_id) ?? [];
    list.push(row.data);
    byClient.set(row.user_id, list);
  }
  byClient.forEach((list) => list.sort((a, b) => b.startTime - a.startTime));
  return byClient;
}

export interface ClientSnapshot {
  settings: Partial<UserSettings>;
  nutritionGoals: NutritionGoals | null;
  targetWeight: number | null;
  workouts: WorkoutSession[];
  routines: RoutineTemplate[];
  customExercises: Exercise[];
  exerciseProgress: ExerciseProgressState[];
  weightLog: BodyWeightEntry[];
  measurementCategories: MeasurementCategory[];
  measurementEntries: MeasurementEntry[];
  /** null = המתאמן לא שיתף תזונה */
  nutritionEntries: NutritionEntry[] | null;
  nutrition: NutritionAnalysis | null;
  /** מתי המכשיר של המתאמן שמר משהו בשרת לאחרונה - מה שהמאמן רואה נכון לרגע הזה */
  lastSyncedAt: string | null;
}

type Res = { data: unknown; error: { message?: string } | null };
const rows = <T,>(res: Res): T[] => {
  if (res.error) fail(res.error);
  return ((res.data ?? []) as { data: T }[]).map((r) => r.data).filter(Boolean);
};
const latest = (res: Res): string | null =>
  ((res.data ?? []) as { updated_at?: string }[]).reduce<string | null>((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), null);

/** כל מה שהמתאמן משתף, במבנה הרגיל של האפליקציה - כדי להשתמש באותם מנועים ותצוגות */
export async function getClientSnapshot(relation: TrainerRelation): Promise<ClientSnapshot> {
  const uid = relation.client_id;
  const since = Date.now() - 28 * 24 * 60 * 60 * 1000;
  const [settingsRes, workoutsRes, routinesRes, customRes, progressRes, weightRes, catRes, entryRes, nutritionRes] = await Promise.all([
    supabase.from('user_settings').select('data, updated_at').eq('user_id', uid).maybeSingle(),
    supabase.from('workouts').select('data, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(80),
    supabase.from('routines').select('data').eq('user_id', uid),
    supabase.from('custom_exercises').select('data').eq('user_id', uid),
    supabase.from('exercise_progress').select('data').eq('user_id', uid),
    supabase.from('body_weight_entries').select('data, updated_at').eq('user_id', uid),
    supabase.from('measurement_categories').select('data').eq('user_id', uid),
    supabase.from('measurement_entries').select('data').eq('user_id', uid),
    relation.share_nutrition
      ? supabase.from('nutrition_entries').select('data, updated_at').eq('user_id', uid).filter('data->>date', 'gte', String(since))
      : Promise.resolve(null),
  ]);
  if (settingsRes.error) fail(settingsRes.error);
  const blob = (settingsRes.data?.data ?? {}) as {
    settings?: Partial<UserSettings>;
    nutritionGoals?: NutritionGoals;
    targetWeight?: number | null;
  };
  const settings = blob.settings ?? {};
  const weightLog = rows<BodyWeightEntry>(weightRes).sort((a, b) => a.date - b.date);
  const nutritionEntries = nutritionRes ? rows<NutritionEntry>(nutritionRes) : null;
  const nutritionGoals = blob.nutritionGoals ?? null;

  let nutrition: NutritionAnalysis | null = null;
  if (nutritionGoals) {
    try {
      nutrition = analyzeNutrition(settings as UserSettings, weightLog, nutritionEntries ?? [], nutritionGoals);
    } catch {
      nutrition = null;
    }
  }

  const syncTimes = [settingsRes.data?.updated_at ?? null, latest(workoutsRes), latest(weightRes), nutritionRes ? latest(nutritionRes) : null];
  return {
    settings,
    nutritionGoals,
    targetWeight: blob.targetWeight ?? null,
    workouts: rows<WorkoutSession>(workoutsRes)
      .filter((w) => w.isCompleted)
      .sort((a, b) => b.startTime - a.startTime),
    routines: rows<RoutineTemplate>(routinesRes),
    customExercises: rows<Exercise>(customRes),
    exerciseProgress: rows<ExerciseProgressState>(progressRes),
    weightLog,
    measurementCategories: rows<MeasurementCategory>(catRes),
    measurementEntries: rows<MeasurementEntry>(entryRes),
    nutritionEntries,
    nutrition,
    lastSyncedAt: syncTimes.reduce<string | null>((m, t) => (t && (!m || t > m) ? t : m), null),
  };
}

/** התוכנית הפעילה של המתאמן: לפי activeRoutineId, ובחשבון ישן - הראשונה */
export function activeRoutineOf(snapshot: ClientSnapshot): RoutineTemplate | null {
  const id = snapshot.settings.activeRoutineId;
  if (id === null) return null;
  return snapshot.routines.find((r) => r.id === id) ?? (id === undefined ? snapshot.routines[0] ?? null : null);
}

// ---------- המאמן כותב בנתוני המתאמן ----------

/** שמירה (יצירה/עדכון) של רשומות המתאמן - באותו מבנה שהאפליקציה שלו מסנכרנת */
export async function saveClientRows<T extends { id: string }>(clientId: string, table: ClientTable, items: T[]): Promise<void> {
  if (!items.length) return;
  const { error } = await supabase
    .from(table)
    .upsert(items.map((item) => ({ id: item.id, user_id: clientId, data: item })), { onConflict: 'user_id,id' });
  if (error) fail(error);
}

export async function deleteClientRows(clientId: string, table: ClientTable, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().eq('user_id', clientId).in('id', ids);
  if (error) fail(error);
}

export interface ClientSettingsPatch {
  settings?: Partial<UserSettings>;
  nutritionGoals?: Partial<NutritionGoals>;
  targetWeight?: number | null;
  selectedDayByRoutine?: Record<string, number>;
}

/** עדכון פרטי הפרופיל של המתאמן (השרת מקבל רק רשימה סגורה של שדות) */
export async function patchClientSettings(clientId: string, patch: ClientSettingsPatch): Promise<void> {
  const { error } = await supabase.rpc('trainer_update_client_settings', { p_client: clientId, p_patch: patch });
  if (error) fail(error);
}

/**
 * העתק של תוכנית לתרגילים מותאמים אישית של המאמן שהתוכנית צריכה: מה שכבר קיים אצל המתאמן
 * (אותו מזהה ואותו שם) נשאר; מזהה שתפוס אצלו ע"י תרגיל אחר מקבל מזהה חדש, והתוכנית מתעדכנת.
 */
function prepareCustomExercises(routine: RoutineTemplate, trainerLibrary: Exercise[], clientCustom: Exercise[]) {
  const used = new Set(routine.days.flatMap((d) => d.exercises.map((x) => x.exerciseId)));
  const clientById = new Map(clientCustom.map((e) => [e.id, e]));
  const remap = new Map<string, string>();
  const toCopy: Exercise[] = [];
  trainerLibrary
    .filter((e) => e.isCustom && used.has(e.id))
    .forEach((e) => {
      const existing = clientById.get(e.id);
      if (existing && existing.nameHe === e.nameHe) return;
      const id = existing ? `${e.id}-coach-${Date.now().toString(36)}` : e.id;
      if (id !== e.id) remap.set(e.id, id);
      toCopy.push({ ...e, id, isCustom: true });
    });
  const days = routine.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((x) => (remap.has(x.exerciseId) ? { ...x, exerciseId: remap.get(x.exerciseId)! } : x)),
  }));
  return { days, toCopy };
}

/** המאמן נותן למתאמן תוכנית מהספרייה שלו: עותק חדש אצל המתאמן, והיא הופכת לתוכנית הפעילה */
export async function assignProgram(
  clientId: string,
  trainerName: string,
  routine: RoutineTemplate,
  trainerLibrary: Exercise[],
  snapshot: ClientSnapshot
): Promise<RoutineTemplate> {
  const { days, toCopy } = prepareCustomExercises(routine, trainerLibrary, snapshot.customExercises);
  const copy: RoutineTemplate = {
    ...routine,
    id: `coach-${Date.now().toString(36)}`,
    days,
    isCustom: true,
    isGenerated: false,
    manuallyEditedAt: undefined,
    mesocycle: undefined,
    volumeTargets: undefined,
    createdAt: Date.now(),
    assignedByTrainer: trainerName,
  };
  await saveClientRows(clientId, 'custom_exercises', toCopy);
  await saveClientRows(clientId, 'routines', [copy]);
  await patchClientSettings(clientId, { settings: { activeRoutineId: copy.id }, selectedDayByRoutine: { [copy.id]: 1 } });
  return copy;
}

/**
 * שמירת תוכנית של המתאמן אחרי עריכה. בתוכניות שהמנוע בנה, המשקל והחזרות הנוכחיים של כל
 * תרגיל נשמרים במצב ההתקדמות (exercise_progress) ולא בתוכנית עצמה - אז מעדכנים גם אותו,
 * אחרת האימון הבא של המתאמן ימשיך מהמשקל הישן.
 */
export async function saveClientRoutine(clientId: string, routine: RoutineTemplate, snapshot: ClientSnapshot): Promise<void> {
  await saveClientRows(clientId, 'routines', [routine]);
  const states = snapshot.exerciseProgress.filter((s) => s.routineId === routine.id);
  if (!states.length) return;
  const items = new Map(routine.days.flatMap((d) => d.exercises).map((x) => [x.exerciseId, x]));
  const updated = states
    .map((s) => {
      const item = items.get(s.exerciseId);
      if (!item) return null;
      const weight = item.suggestedWeight ?? s.currentWeightKg;
      if (weight === s.currentWeightKg && item.targetReps === s.currentTargetReps) return null;
      return {
        ...s,
        currentWeightKg: weight,
        currentTargetReps: item.targetReps,
        repRangeMin: Math.min(s.repRangeMin, item.targetReps),
        repRangeMax: Math.max(item.repRangeMax ?? s.repRangeMax, item.targetReps),
        consecutiveStalls: 0,
      };
    })
    .filter((s): s is ExerciseProgressState => !!s);
  await saveClientRows(clientId, 'exercise_progress', updated);
}

/** לעורך: בתוכנית שהמנוע בנה, מציגים למאמן את המשקל והחזרות הנוכחיים (ממצב ההתקדמות) */
export function routineWithCurrentLoads(routine: RoutineTemplate, snapshot: ClientSnapshot): RoutineTemplate {
  const states = new Map(snapshot.exerciseProgress.filter((s) => s.routineId === routine.id).map((s) => [s.exerciseId, s]));
  if (!states.size) return routine;
  return {
    ...routine,
    days: routine.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((x) => {
        const s = states.get(x.exerciseId);
        return s ? { ...x, targetReps: s.currentTargetReps, suggestedWeight: s.currentWeightKg || x.suggestedWeight } : x;
      }),
    })),
  };
}

/** אימון שנערך: מחשבים מחדש את הסיכומים (נפח וסטים) כדי שההיסטוריה והשיאים יישארו נכונים */
export function recomputeWorkoutTotals(w: WorkoutSession): WorkoutSession {
  let volume = 0;
  let sets = 0;
  w.exercises.forEach((x) =>
    x.sets.forEach((s) => {
      if (!s.completed) return;
      sets += 1;
      volume += (s.weightKg || 0) * (s.reps || 0);
    })
  );
  return { ...w, totalVolumeKg: Math.round(volume), completedSetsCount: sets };
}

// ===================== צד המתאמן =====================

export async function previewTrainerCode(code: string): Promise<{ trainer_id: string; display_name: string; bio: string | null } | null> {
  const { data, error } = await supabase.rpc('preview_trainer_code', { p_code: normalizeCode(code) });
  if (error) fail(error);
  return (data as { trainer_id: string; display_name: string; bio: string | null }[])[0] ?? null;
}

export async function joinTrainer(code: string, clientName: string, shareNutrition: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('join_trainer', {
    p_code: normalizeCode(code),
    p_client_name: clientName.trim(),
    p_share_nutrition: shareNutrition,
  });
  if (error) fail(error);
  if (!data) throw new TrainerError(ERRORS.invalid_code);
  return data as string;
}

/** הקשר הפעיל של המשתמש כמתאמן + שם המאמן */
export async function getMyTrainerRelation(clientId: string): Promise<{ relation: TrainerRelation; trainerName: string; trainerBio: string | null } | null> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select(RELATION_COLUMNS)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const relation = data as TrainerRelation;
  const { data: prof } = await supabase
    .from('trainer_profiles')
    .select('display_name, bio')
    .eq('user_id', relation.trainer_id)
    .maybeSingle();
  return { relation, trainerName: prof?.display_name ?? 'המאמן', trainerBio: prof?.bio ?? null };
}

export async function setNutritionSharing(trainerId: string, share: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_trainer_nutrition_sharing', { p_trainer: trainerId, p_share: share });
  if (error) fail(error);
}

export async function endRelation(trainerId: string, clientId: string): Promise<void> {
  const { error } = await supabase.rpc('end_trainer_relation', { p_trainer: trainerId, p_client: clientId });
  if (error) fail(error);
}

/** מה המאמן שינה לאחרונה בנתונים של המתאמן */
export async function getRecentActivity(clientId: string, limit = 30): Promise<TrainerActivity[]> {
  const { data, error } = await supabase
    .from('trainer_activity')
    .select('id, trainer_id, client_id, table_name, row_id, action, created_at')
    .eq('client_id', clientId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) fail(error);
  return (data ?? []) as TrainerActivity[];
}

// ===================== הודעות =====================

export async function getThread(trainerId: string, clientId: string): Promise<TrainerMessage[]> {
  const { data, error } = await supabase
    .from('trainer_messages')
    .select('id, trainer_id, client_id, sender_id, body, created_at, read_at')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) fail(error);
  return ((data ?? []) as TrainerMessage[]).reverse();
}

export async function sendMessage(trainerId: string, clientId: string, senderId: string, body: string): Promise<TrainerMessage> {
  const { data, error } = await supabase
    .from('trainer_messages')
    .insert({ trainer_id: trainerId, client_id: clientId, sender_id: senderId, body: body.trim() })
    .select('id, trainer_id, client_id, sender_id, body, created_at, read_at')
    .single();
  if (error) fail(error);
  return data as TrainerMessage;
}

export async function markThreadRead(trainerId: string, clientId: string): Promise<void> {
  await supabase.rpc('mark_trainer_thread_read', { p_trainer: trainerId, p_client: clientId });
}

/** הודעות שלא נקראו, לפי שיחה (מפתח: `${trainer_id}:${client_id}`) */
export async function getUnreadCounts(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('trainer_messages')
    .select('trainer_id, client_id')
    .is('read_at', null)
    .neq('sender_id', userId);
  const counts = new Map<string, number>();
  if (error) return counts;
  for (const m of (data ?? []) as { trainer_id: string; client_id: string }[]) {
    const key = `${m.trainer_id}:${m.client_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * מאזין להודעות ולשינויים של המאמן (Realtime מסנן לפי ה-RLS - מגיע רק מה שמותר לראות).
 * onMyDataChanged נקרא כשהמאמן שינה משהו בנתונים של המשתמש הזה (כדי למשוך אותם מהשרת).
 */
export function subscribeTrainerInbox(userId: string, onMessages: () => void, onMyDataChanged: () => void): RealtimeChannel {
  return supabase
    .channel(`trainer-inbox-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_messages' }, onMessages)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trainer_activity', filter: `client_id=eq.${userId}` },
      onMyDataChanged
    )
    .subscribe();
}
