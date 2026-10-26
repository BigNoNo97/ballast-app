// מאמנים ומתאמנים: כל הקריאות לשרת (טבלאות + פונקציות ב-migration 20261027000000_trainers).
// ההרשאות נאכפות בשרת (RLS + פונקציות שבודקות הכל) - כאן רק עטיפה נוחה ותרגום שגיאות לעברית.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { analyzeNutrition, NutritionAnalysis } from './nutrition/engine';
import type {
  BodyWeightEntry,
  Exercise,
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

export interface ProgramOffer {
  id: string;
  trainer_id: string;
  client_id: string;
  routine: RoutineTemplate;
  custom_exercises: Exercise[];
  note: string | null;
  status: 'sent' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
}

const RELATION_COLUMNS = 'trainer_id, client_id, client_display_name, status, share_nutrition, consented_at, ended_at, ended_by';
const PROGRAM_COLUMNS = 'id, trainer_id, client_id, routine, custom_exercises, note, status, created_at, responded_at';

const ERRORS: Record<string, string> = {
  invalid_code: 'הקוד לא נמצא. בדוק שהקלדת אותו נכון.',
  own_code: 'זה הקוד שלך עצמך 🙂',
  already_has_trainer: 'כבר יש לך מאמן פעיל. כדי לעבור למאמן אחר, קודם צריך להפסיק את השיתוף עם הנוכחי.',
  trainer_full: 'למאמן הזה אין כרגע מקום למתאמנים נוספים. כדאי לעדכן אותו.',
  removed_by_trainer: 'המאמן הסיר אותך מרשימת המתאמנים שלו. כדי לחזור, דבר איתו ישירות.',
  invalid_name: 'השם צריך להיות באורך 1–60 תווים.',
  not_a_trainer: 'אין לך חשבון מאמן.',
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
  weightLog: BodyWeightEntry[];
  measurementCategories: MeasurementCategory[];
  measurementEntries: MeasurementEntry[];
  /** null = המתאמן לא שיתף תזונה */
  nutritionEntries: NutritionEntry[] | null;
  nutrition: NutritionAnalysis | null;
}

const rows = <T,>(res: { data: unknown; error: { message?: string } | null }): T[] => {
  if (res.error) fail(res.error);
  return ((res.data ?? []) as { data: T }[]).map((r) => r.data).filter(Boolean);
};

/** כל מה שהמתאמן משתף, במבנה הרגיל של האפליקציה - כדי להשתמש באותם מנועים ותצוגות */
export async function getClientSnapshot(relation: TrainerRelation): Promise<ClientSnapshot> {
  const uid = relation.client_id;
  const since = Date.now() - 28 * 24 * 60 * 60 * 1000;
  const [settingsRes, workoutsRes, routinesRes, customRes, weightRes, catRes, entryRes, nutritionRes] = await Promise.all([
    supabase.from('user_settings').select('data').eq('user_id', uid).maybeSingle(),
    supabase.from('workouts').select('data').eq('user_id', uid).order('updated_at', { ascending: false }).limit(80),
    supabase.from('routines').select('data').eq('user_id', uid),
    supabase.from('custom_exercises').select('data').eq('user_id', uid),
    supabase.from('body_weight_entries').select('data').eq('user_id', uid),
    supabase.from('measurement_categories').select('data').eq('user_id', uid),
    supabase.from('measurement_entries').select('data').eq('user_id', uid),
    relation.share_nutrition
      ? supabase.from('nutrition_entries').select('data').eq('user_id', uid).filter('data->>date', 'gte', String(since))
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

  return {
    settings,
    nutritionGoals,
    targetWeight: blob.targetWeight ?? null,
    workouts: rows<WorkoutSession>(workoutsRes)
      .filter((w) => w.isCompleted)
      .sort((a, b) => b.startTime - a.startTime),
    routines: rows<RoutineTemplate>(routinesRes),
    customExercises: rows<Exercise>(customRes),
    weightLog,
    measurementCategories: rows<MeasurementCategory>(catRes),
    measurementEntries: rows<MeasurementEntry>(entryRes),
    nutritionEntries,
    nutrition,
  };
}

/** התוכנית שמוצגת למתאמן כפעילה: לפי activeRoutineId, ובחשבון ישן - הראשונה */
export function activeRoutineOf(snapshot: ClientSnapshot): RoutineTemplate | null {
  const id = snapshot.settings.activeRoutineId;
  if (id === null) return null;
  return snapshot.routines.find((r) => r.id === id) ?? (id === undefined ? snapshot.routines[0] ?? null : null);
}

export async function sendProgram(
  trainerId: string,
  clientId: string,
  routine: RoutineTemplate,
  allExercises: Exercise[],
  note: string
): Promise<void> {
  // תרגילים מותאמים אישית של המאמן לא קיימים אצל המתאמן - שולחים אותם יחד עם התוכנית
  const ids = new Set(routine.days.flatMap((d) => d.exercises.map((x) => x.exerciseId)).concat(routine.exercises.map((x) => x.exerciseId)));
  const custom = allExercises.filter((e) => e.isCustom && ids.has(e.id));
  const { error } = await supabase.from('trainer_programs').insert({
    trainer_id: trainerId,
    client_id: clientId,
    routine,
    custom_exercises: custom,
    note: note.trim() || null,
  });
  if (error) fail(error);
}

export async function getProgramsForClient(trainerId: string, clientId: string): Promise<ProgramOffer[]> {
  const { data, error } = await supabase
    .from('trainer_programs')
    .select(PROGRAM_COLUMNS)
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) fail(error);
  return (data ?? []) as ProgramOffer[];
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
  return data as string;
}

/** הקשר הנוכחי של המשתמש כמתאמן (פעיל, או האחרון שהסתיים) + שם המאמן */
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

export async function getPendingPrograms(clientId: string): Promise<ProgramOffer[]> {
  const { data, error } = await supabase
    .from('trainer_programs')
    .select(PROGRAM_COLUMNS)
    .eq('client_id', clientId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as ProgramOffer[];
}

export async function respondToProgram(programId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_trainer_program', { p_program: programId, p_accept: accept });
  if (error) fail(error);
}

/** תוכנית שהתקבלה הופכת לתוכנית רגילה של המתאמן (עותק שלו - מותר לו לערוך) */
export function routineFromOffer(offer: ProgramOffer, trainerName: string): RoutineTemplate {
  return {
    ...offer.routine,
    id: `trainer-${offer.id}`,
    isCustom: true,
    isGenerated: false,
    manuallyEditedAt: undefined,
    mesocycle: undefined,
    createdAt: Date.now(),
    assignedByTrainer: trainerName,
  };
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

/** מאזין להודעות ותוכניות חדשות (Realtime מסנן לפי ה-RLS - מגיע רק מה שמותר לראות) */
export function subscribeTrainerInbox(userId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`trainer-inbox-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trainer_programs' }, onChange)
    .subscribe();
}
