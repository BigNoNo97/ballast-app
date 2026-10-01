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

// מחליף את כל השורות של המשתמש בטבלה נתונה ברשימה החדשה (upsert מלא, לא הפרשי דלתא).
// כותבים קודם (upsert) ורק אז מוחקים את מה שכבר לא קיים - לא ההפך - כדי שאם הפעולה
// נקטעת באמצע (קריסה/אובדן רשת) לא יהיה רגע שבו הענן ריק לגמרי; במקרה הגרוע יישארו
// כמה שורות "יתומות" ישנות שינוקו בסנכרון הבא, לא אובדן נתונים.
export async function syncListToCloud(table: string, list: { id: string }[]): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  try {
    if (list.length > 0) {
      const rows = list.map((item) => ({ id: item.id, user_id: userId, data: item }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
    }
    const { data: existing, error: fetchError } = await supabase.from(table).select('id').eq('user_id', userId);
    if (fetchError) throw fetchError;
    const currentIds = new Set(list.map((item) => item.id));
    const staleIds = (existing || []).map((r) => r.id as string).filter((id) => !currentIds.has(id));
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from(table).delete().eq('user_id', userId).in('id', staleIds);
      if (deleteError) throw deleteError;
    }
  } catch (e) {
    console.error(`[cloudSync] failed to sync list "${table}"`, e);
  }
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

export async function syncSettingsToCloud(data: unknown): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  try {
    const { error } = await supabase.from('user_settings').upsert({ user_id: userId, data });
    if (error) throw error;
  } catch (e) {
    console.error('[cloudSync] failed to sync settings', e);
  }
}

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
    return null;
  }
  return (data?.data as T) ?? null;
}

// בודק אם למשתמש הזה כבר יש בכלל נתונים בענן (כדי להבדיל בין "משתמש חדש לגמרי"
// לבין "משתמש קיים שמתחבר ממכשיר אחר").
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
    return false;
  }
  return !!data;
}
