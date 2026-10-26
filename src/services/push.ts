// התראות פוש (iOS בלבד): רישום המכשיר, שמירת המזהה שלו בשרת, ופתיחת המסך הנכון בלחיצה.
// השליחה עצמה נעשית בשרת (Edge Function notify) עם מפתח APNs שנשמר רק שם.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabaseClient';

const TOKEN_KEY = 'gym_tracker_push_token_v1';
const isSupported = () => Capacitor.getPlatform() === 'ios';

let listenersReady = false;
let onOpen: (() => void) | null = null;

/** מה לפתוח כשהמשתמש לוחץ על התראה (המסך של המאמנים) */
export function setPushOpenHandler(handler: () => void) {
  onOpen = handler;
}

async function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;
  await PushNotifications.addListener('registration', async ({ value }) => {
    localStorage.setItem(TOKEN_KEY, value);
    await supabase.rpc('register_push_token', { p_token: value });
  });
  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration failed', err.error);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', () => {
    onOpen?.();
  });
}

/** אחרי התחברות: אם המשתמש כבר אישר התראות - נרשמים שוב (המזהה יכול להשתנות). לא שואל. */
export async function resumePush(): Promise<void> {
  if (!isSupported()) return;
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive !== 'granted') return;
    await ensureListeners();
    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] resume failed', e);
  }
}

/**
 * מבקש הרשאה להתראות - רק ברגע שיש לזה סיבה ברורה (הצטרפות למאמן / פתיחת חשבון מאמן),
 * ולא בפתיחת האפליקציה. iOS מציג את השאלה פעם אחת בלבד.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await PushNotifications.requestPermissions()).receive;
    }
    if (receive !== 'granted') return false;
    await ensureListeners();
    await PushNotifications.register();
    return true;
  } catch (e) {
    console.warn('[push] permission request failed', e);
    return false;
  }
}

/** לפני התנתקות: המכשיר מפסיק לקבל התראות של החשבון הזה */
export async function unregisterPush(): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  localStorage.removeItem(TOKEN_KEY);
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch {
    // אין רשת - השרת ימחק את המזהה כש-Apple תדווח שהוא לא בתוקף
  }
}

/** השרת שולח התראה לצד השני על הודעה חדשה (הוא בודק שההודעה באמת שלך ושלא נשלחה כבר) */
export function notifyNewMessage(messageId: string): void {
  supabase.functions.invoke('notify', { body: { kind: 'message', messageId } }).catch(() => {});
}

// שינויים של המאמן מתרכזים: התראה אחת אחרי רצף עריכות, לא אחת לכל שמירה
const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();

/** המאמן שינה משהו אצל המתאמן - התראה מרוכזת (השרת גם מגביל לאחת ל-10 דקות) */
export function notifyClientUpdated(clientId: string): void {
  const existing = pendingUpdates.get(clientId);
  if (existing) clearTimeout(existing);
  pendingUpdates.set(
    clientId,
    setTimeout(() => {
      pendingUpdates.delete(clientId);
      supabase.functions.invoke('notify', { body: { kind: 'update', clientId } }).catch(() => {});
    }, 20_000)
  );
}
