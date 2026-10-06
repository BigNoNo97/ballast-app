import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// התחברות עם Google/Apple חוזרת מהספק (באפליקציה דרך קישור co.brainslead.ballast://auth-callback).
// מסמנים לפני שיוצאים לספק שההתחברות התחילה מכאן ועם איזה ספק, ומקבלים חזרה רק אם יש סימון
// טרי - כך שקישור שמגיע מבחוץ (אתר/הודעה) לא יכול להחדיר טוקנים של חשבון אחר.
// 'recovery' = איפוס סיסמה: הקישור מהמייל חוזר לאפליקציה באותה דרך, רק שהוא תקף עד שעה
export type OAuthProvider = 'google' | 'apple' | 'recovery';
const OAUTH_PENDING_KEY = 'ballast_oauth_pending';
const OAUTH_PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const RECOVERY_PENDING_MAX_AGE_MS = 60 * 60 * 1000;

export function markOAuthPending(provider: OAuthProvider) {
  localStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ provider, at: Date.now() }));
}

/** מחזיר את הספק אם התחברות התחילה מכאן ב-15 הדקות האחרונות (ומוחק את הסימון) */
export function consumeOAuthPending(): OAuthProvider | null {
  try {
    const raw = localStorage.getItem(OAUTH_PENDING_KEY);
    localStorage.removeItem(OAUTH_PENDING_KEY);
    if (!raw) return null;
    const { provider, at } = JSON.parse(raw);
    if (provider !== 'google' && provider !== 'apple' && provider !== 'recovery') return null;
    const maxAge = provider === 'recovery' ? RECOVERY_PENDING_MAX_AGE_MS : OAUTH_PENDING_MAX_AGE_MS;
    return Date.now() - Number(at) < maxAge ? provider : null;
  } catch {
    return null;
  }
}

// Apple דורשת לבטל את ההרשאה כשמשתמש מוחק חשבון, ולשם כך צריך את ה-refresh token שלה -
// הוא מגיע רק ברגע ההתחברות, אז שומרים אותו מיד בשרת (טבלה שהאפליקציה עצמה לא יכולה לקרוא)
export function rememberAppleRefreshToken(refreshToken: string | null | undefined) {
  if (!refreshToken) return;
  supabase.functions
    .invoke('save-apple-token', { body: { refresh_token: refreshToken } })
    .catch((e) => console.error('[auth] failed to store Apple token', e));
}
