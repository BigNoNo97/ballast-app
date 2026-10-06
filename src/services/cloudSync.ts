import { supabase } from './supabaseClient';

// מזהה המשתמש המחובר כרגע - נקבע ע"י App.tsx בהתאם למצב ההתחברות.
// כל עוד אין מישהו מחובר, שום דבר לא נשלח לענן (למשל בזמן בדיקות/פיתוח).
let currentUserId: string | null = null;

export function setCloudUser(userId: string | null) {
  currentUserId = userId;
}

export function getCloudUser(): string | null {
  return currentUserId;
}

// ===================== "צל" של הענן =====================
// לכל טבלה שומרים במכשיר מה הענן מחזיק לפי מיטב ידיעתנו: מזהה -> חתימה (hash) של הרשומה.
// ממנו נגזר מה צריך לשלוח: רשומה מקומית שהחתימה שלה שונה = שינוי שעוד לא עלה, ומזהה שקיים
// בצל ולא במכשיר = מחיקה שעוד לא עלתה. זה נותן שלושה דברים:
// 1. שמירה שנכשלה (בלי קליטה) לא הולכת לאיבוד - הצל לא מתעדכן, אז השינוי נשלח שוב בהמשך.
// 2. מוחקים מהענן רק רשומות שנמחקו במכשיר הזה - לא רשומות שמכשיר אחר יצר בינתיים.
// 3. בכניסה מחדש אפשר למזג: מה שהענן מחזיק + השינויים המקומיים שעוד לא עלו.
const SHADOW_KEY = 'gym_tracker_sync_shadow_v1';

type TableShadow = Record<string, string>;
interface ShadowStore {
  userId: string;
  tables: Record<string, TableShadow>;
}

function loadShadowStore(userId: string): ShadowStore {
  try {
    const raw = localStorage.getItem(SHADOW_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ShadowStore;
      if (parsed && parsed.userId === userId && parsed.tables) return parsed;
    }
  } catch {}
  return { userId, tables: {} };
}

/** null = המכשיר הזה עוד אף פעם לא סנכרן את הטבלה הזו עבור המשתמש הזה */
export function getTableShadow(table: string): TableShadow | null {
  if (!currentUserId) return null;
  return loadShadowStore(currentUserId).tables[table] ?? null;
}

export function setTableShadow(table: string, shadow: TableShadow) {
  if (!currentUserId) return;
  const store = loadShadowStore(currentUserId);
  store.tables[table] = shadow;
  try {
    localStorage.setItem(SHADOW_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('[cloudSync] failed to save sync shadow', e);
  }
}

export function clearSyncShadow() {
  localStorage.removeItem(SHADOW_KEY);
}

// FNV-1a על ה-JSON - מספיק כדי לזהות "הרשומה השתנתה". התנגשות נדירה רק תגרום לשליחה מיותרת.
export function hashItem(item: unknown): string {
  const text = JSON.stringify(item) ?? '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ':' + text.length.toString(36);
}

/** כמה שינויים מקומיים בטבלה עוד לא הגיעו לענן */
export function countPendingChanges(list: { id: string }[], shadow: TableShadow | null): number {
  if (!shadow) return list.length;
  const ids = new Set(list.map((item) => item.id));
  const changed = list.filter((item) => shadow[item.id] !== hashItem(item)).length;
  const deleted = Object.keys(shadow).filter((id) => !ids.has(id)).length;
  return changed + deleted;
}

/**
 * מיזוג בכניסה: הענן הוא הבסיס, ועליו מיישמים את השינויים המקומיים שעוד לא עלו.
 * בלי צל (מכשיר שסנכרן לפני המנגנון הזה) לא מוחקים כלום, ורק משלימים רשומות שקיימות
 * במכשיר ולא בענן - למשל אימון שהסתיים בלי קליטה.
 */
export function mergeCloudWithLocal<T extends { id: string }>(
  cloud: T[],
  local: T[],
  shadow: TableShadow | null
): { merged: T[]; cloudShadow: TableShadow } {
  const cloudShadow: TableShadow = {};
  cloud.forEach((item) => {
    cloudShadow[item.id] = hashItem(item);
  });
  const localIds = new Set(local.map((item) => item.id));

  let pendingUpserts: T[];
  let pendingDeletes: string[];
  if (shadow) {
    pendingUpserts = local.filter((item) => shadow[item.id] !== hashItem(item));
    pendingDeletes = Object.keys(shadow).filter((id) => !localIds.has(id));
  } else {
    pendingUpserts = local.filter((item) => !(item.id in cloudShadow));
    pendingDeletes = [];
  }

  const map = new Map(cloud.map((item) => [item.id, item]));
  pendingDeletes.forEach((id) => map.delete(id));
  pendingUpserts.forEach((item) => map.set(item.id, item));
  return { merged: Array.from(map.values()), cloudShadow };
}

// ===================== שליחה לענן =====================
// כל טבלה בתור משלה: קריאות חופפות על אותה טבלה רצות אחת אחרי השנייה, ואם כמה ממתינות -
// רק הרשימה האחרונה נשלחת (היא ממילא מכילה את כל הקודמות).
const tableQueues: Record<string, Promise<void>> = {};
const latestLists: Record<string, { id: string }[]> = {};

export function syncListToCloud(table: string, list: { id: string }[]): Promise<void> {
  if (!currentUserId) return Promise.resolve();
  latestLists[table] = list;
  const run = (tableQueues[table] ?? Promise.resolve()).then(async () => {
    const pending = latestLists[table];
    if (!pending) return;
    delete latestLists[table];
    await pushTable(table, pending);
  });
  tableQueues[table] = run.catch(() => {});
  return tableQueues[table];
}

const CHUNK = 200;

async function pushTable(table: string, list: { id: string }[]): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  const shadow: TableShadow = { ...(getTableShadow(table) ?? {}) };
  const hashes = new Map(list.map((item) => [item.id, hashItem(item)]));
  const upserts = list.filter((item) => shadow[item.id] !== hashes.get(item.id));
  const deletes = Object.keys(shadow).filter((id) => !hashes.has(id));
  if (upserts.length === 0 && deletes.length === 0) return;

  try {
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const chunk = upserts.slice(i, i + CHUNK);
      const rows = chunk.map((item) => ({ id: item.id, user_id: userId, data: item }));
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      if (currentUserId !== userId) return;
      chunk.forEach((item) => {
        shadow[item.id] = hashes.get(item.id)!;
      });
      setTableShadow(table, shadow);
    }
    for (let i = 0; i < deletes.length; i += CHUNK) {
      const chunk = deletes.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', chunk);
      if (error) throw error;
      if (currentUserId !== userId) return;
      chunk.forEach((id) => delete shadow[id]);
      setTableShadow(table, shadow);
    }
  } catch (e) {
    // הצל לא עודכן עבור מה שנכשל - השינוי יישלח שוב בסנכרון הבא (חזרה לאפליקציה / חזרת רשת)
    console.error(`[cloudSync] failed to sync list "${table}" - will retry later`, e);
  }
}

/** מוחק את כל השורות של המשתמש בטבלה (איפוס מלא) - כולל כאלה שנוצרו במכשירים אחרים */
export async function deleteAllCloudRows(table: string): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  const { error } = await supabase.from(table).delete().eq('user_id', userId);
  if (error) {
    console.error(`[cloudSync] failed to clear "${table}"`, error);
    return;
  }
  setTableShadow(table, {});
}

// זורק בשגיאה במקום להחזיר [] - כדי שהקורא (hydrateFromCloud) יוכל להבדיל בין "ריק באמת"
// לבין "השליפה נכשלה" ולא ידרוס נתונים מקומיים תקינים במערך ריק בטעות.
export async function pullListFromCloud<T>(table: string): Promise<T[]> {
  const userId = currentUserId;
  if (!userId) return [];
  const { data, error } = await supabase.from(table).select('data').eq('user_id', userId);
  if (error) {
    console.error(`[cloudSync] failed to pull list "${table}"`, error);
    throw error;
  }
  return (data || []).map((row: { data: T }) => row.data);
}

// גם ההגדרות בתור: רק הגרסה האחרונה נשלחת, ומחזירים אם היא באמת נשמרה
let settingsQueue: Promise<boolean> = Promise.resolve(true);
let latestSettings: { data: unknown } | null = null;

export function syncSettingsToCloud(data: unknown): Promise<boolean> {
  if (!currentUserId) return Promise.resolve(false);
  latestSettings = { data };
  settingsQueue = settingsQueue.then(async () => {
    const userId = currentUserId;
    const pending = latestSettings;
    if (!pending) return true;
    if (!userId) return false;
    latestSettings = null;
    try {
      const { error } = await supabase.from('user_settings').upsert({ user_id: userId, data: pending.data });
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[cloudSync] failed to sync settings - will retry later', e);
      return false;
    }
  });
  return settingsQueue;
}

// זורק בשגיאה (ולא מחזיר null) - כדי לא להחליף הגדרות מקומיות בברירת מחדל בגלל תקלת רשת
export async function pullSettingsFromCloud<T>(): Promise<T | null> {
  const userId = currentUserId;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[cloudSync] failed to pull settings', error);
    throw error;
  }
  return (data?.data as T) ?? null;
}

// בודק אם למשתמש הזה כבר יש בכלל נתונים בענן (כדי להבדיל בין "משתמש חדש לגמרי"
// לבין "משתמש קיים שמתחבר ממכשיר אחר"). זורק בשגיאה: אם מתייחסים לכשל רשת כאל "משתמש
// חדש", המכשיר (שאולי ריק) נדחף לענן כאילו הוא האמת - בדיוק מה שאסור שיקרה.
export async function cloudHasAnyData(): Promise<boolean> {
  const userId = currentUserId;
  if (!userId) return false;
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[cloudSync] failed to check for existing cloud data', error);
    throw error;
  }
  return !!data;
}
