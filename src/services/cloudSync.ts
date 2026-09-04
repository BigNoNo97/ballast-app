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
// מספיק פשוט וזול ביחס לגודל הנתונים של אפליקציית כושר אישית.
export async function syncListToCloud(table: string, list: { id: string }[]): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  try {
    await supabase.from(table).delete().eq('user_id', userId);
    if (list.length > 0) {
      const rows = list.map((item) => ({ id: item.id, user_id: userId, data: item }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(table).insert(rows.slice(i, i + 200));
        if (error) throw error;
      }
    }
  } catch (e) {
    console.error(`[cloudSync] failed to sync list "${table}"`, e);
  }
}

export async function pullListFromCloud<T>(table: string): Promise<T[]> {
  const userId = currentUserId;
  if (!userId) return [];
  const { data, error } = await supabase.from(table).select('data').eq('user_id', userId);
  if (error) {
    console.error(`[cloudSync] failed to pull list "${table}"`, error);
    return [];
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
