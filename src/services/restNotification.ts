import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// התראה מקומית לסוף המנוחה באייפון - כשהמסך נעול או שהאפליקציה ברקע, ה-JS מושהה ולא יכול
// לצפצף, אז iOS מציגה את ההתראה בזמן. כשהאפליקציה פתוחה, טיימר המנוחה מבטל אותה רגע לפני
// הסוף ומצפצף בעצמו (כדי שלא יהיו גם צפצוף וגם באנר).
const REST_NOTIFICATION_ID = 4201;

let permission: Promise<boolean> | null = null;
// כל ביטול מקדם את המונה - תזמון שהתחיל לפני הביטול (למשל בזמן שדיאלוג ההרשאה פתוח) לא ייצא לפועל
let generation = 0;

function ensurePermission(): Promise<boolean> {
  if (!permission) {
    permission = LocalNotifications.checkPermissions()
      .then(async ({ display }) => {
        if (display === 'granted') return true;
        if (display === 'denied') return false;
        return (await LocalNotifications.requestPermissions()).display === 'granted';
      })
      .catch(() => false);
  }
  return permission;
}

export async function scheduleRestEndNotification(at: Date, nextUp?: string) {
  if (!Capacitor.isNativePlatform()) return;
  const myGeneration = ++generation;
  if (!(await ensurePermission()) || myGeneration !== generation) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] });
    if (myGeneration !== generation || at.getTime() <= Date.now()) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_NOTIFICATION_ID,
          title: 'המנוחה נגמרה',
          body: nextUp ? `הגיע הזמן לסט הבא: ${nextUp} 💪` : 'הגיע הזמן לסט הבא 💪',
          schedule: { at, allowWhileIdle: true },
        },
      ],
    });
  } catch (e) {
    console.warn('[restNotification] scheduling failed', e);
  }
}

export function cancelRestEndNotification() {
  if (!Capacitor.isNativePlatform()) return;
  generation++;
  LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] }).catch(() => {});
}
