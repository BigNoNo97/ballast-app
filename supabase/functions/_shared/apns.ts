// שליחת התראות פוש דרך Apple Push Notification service (APNs), עם מפתח .p8 (token-based auth).
// הסודות: APNS_KEY_ID, APNS_PRIVATE_KEY (תוכן קובץ ה-.p8), APPLE_TEAM_ID (קיים כבר),
// APNS_TOPIC (ה-bundle id, ברירת מחדל co.brainslead.ballast),
// APNS_ENV = production (TestFlight / App Store, ברירת מחדל) או sandbox (בנייה מ-Xcode).
import { signES256 } from './apple.ts';

export function apnsConfigured(): boolean {
  return ['APNS_KEY_ID', 'APNS_PRIVATE_KEY', 'APPLE_TEAM_ID'].every((k) => !!Deno.env.get(k));
}

// Apple מבקשת לא ליצור טוקן חדש יותר מפעם ב-20 דקות, וטוקן תקף עד שעה - שומרים אחד בזיכרון
let cached: { token: string; at: number } | null = null;

async function providerToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 40 * 60 * 1000) return cached.token;
  const token = await signES256(
    { alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID')! },
    { iss: Deno.env.get('APPLE_TEAM_ID')!, iat: Math.floor(Date.now() / 1000) },
    Deno.env.get('APNS_PRIVATE_KEY')!
  );
  cached = { token, at: Date.now() };
  return token;
}

export interface PushContent {
  title: string;
  body: string;
  /** ממיין התראות לשיחות במסך ההתראות */
  threadId?: string;
  data?: Record<string, unknown>;
}

/** שולח לכל מזהה; מחזיר את המזהים ש-Apple אמרה שכבר לא בתוקף (למחיקה) */
export async function sendApns(tokens: string[], content: PushContent): Promise<string[]> {
  if (!tokens.length || !apnsConfigured()) return [];
  const host = Deno.env.get('APNS_ENV') === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const topic = Deno.env.get('APNS_TOPIC') || 'co.brainslead.ballast';
  const jwt = await providerToken();
  const payload = JSON.stringify({
    aps: {
      alert: { title: content.title, body: content.body },
      sound: 'default',
      ...(content.threadId ? { 'thread-id': content.threadId } : {}),
    },
    ...(content.data ?? {}),
  });

  const dead: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(`https://${host}/3/device/${token}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'content-type': 'application/json',
          },
          body: payload,
        });
        if (res.ok) return;
        const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? '';
        if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') {
          dead.push(token);
        } else {
          console.error('apns send failed', res.status, reason);
        }
      } catch (e) {
        console.error('apns network error', String(e));
      }
    })
  );
  return dead;
}
