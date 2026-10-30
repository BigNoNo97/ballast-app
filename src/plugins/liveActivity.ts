import { Capacitor, registerPlugin } from '@capacitor/core';

/** ממשק מול ios/App/App/LiveActivityPlugin.swift - טיימר המנוחה במסך הנעילה וב-Dynamic Island */
interface LiveActivityPlugin {
  startRest(options: { endsAt: number; exercise: string; nextUp: string }): Promise<{ started: boolean }>;
  updateRest(options: { endsAt: number; nextUp?: string }): Promise<void>;
  endRest(): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');
const available = () => Capacitor.getPlatform() === 'ios';

// קריאות שנכשלות (גרסת iOS ישנה, Live Activities כבויות בהגדרות) לא משנות כלום -
// ההתראה המקומית בסוף המנוחה היא הגיבוי
export function startRestActivity(endsAt: number, exercise: string, nextUp: string) {
  if (available()) LiveActivity.startRest({ endsAt, exercise, nextUp }).catch(() => {});
}

export function updateRestActivity(endsAt: number) {
  if (available()) LiveActivity.updateRest({ endsAt }).catch(() => {});
}

export function endRestActivity() {
  if (available()) LiveActivity.endRest().catch(() => {});
}
