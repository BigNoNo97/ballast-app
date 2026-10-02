import { registerPlugin } from '@capacitor/core';

/**
 * ממשק ה-TypeScript מול הפלאגין הנייטיבי (Swift) שנכתב במיוחד לאפליקציה הזו:
 * ios/App/App/AppleHealthPlugin.swift
 *
 * הפלאגין קיים רק בבנייה הנייטיבית של iOS (Capacitor) - ב-web/PWA ובאנדרואיד
 * הקריאות ייכשלו בשקט (ראה appleHealthService.ts שעוטף את זה בבדיקת פלטפורמה).
 */
export interface AppleHealthPlugin {
  /** האם HealthKit זמין בכלל על המכשיר הזה */
  isAvailable(): Promise<{ available: boolean }>;

  /** מבקש הרשאת קריאה/כתיבה למשתמש (מציג את דיאלוג ההרשאות של Apple) */
  requestAuthorization(): Promise<{ granted: boolean }>;

  /** בודק את מצב ההרשאה הנוכחי בלי להציג דיאלוג */
  getAuthorizationStatus(): Promise<{ status: 'notDetermined' | 'denied' | 'authorized' | 'unknown' }>;

  /** שומר מדידת משקל גוף ב-Apple Health */
  saveBodyWeight(options: { kg: number; dateMs?: number }): Promise<{ success: boolean }>;

  /** שומר אימון שהושלם כ-HKWorkout (מופיע גם באפליקציית הכושר/פעילות של אפל) */
  saveWorkout(options: {
    startMs: number;
    endMs: number;
    activeEnergyKcal?: number;
    title?: string;
    pauses?: { startMs: number; endMs: number }[];
  }): Promise<{ success: boolean; workoutId: string; energySaved: boolean }>;

  /** מפעיל את אפליקציית השעון עם סשן אימון כוח (HKHealthStore.startWatchApp) */
  startWatchApp(): Promise<{ started: boolean }>;

  /** מוחק מ-Health אימון ש-Ballast שמרה, לפי שעת ההתחלה שלו (לא נוגע באימונים של אפליקציות אחרות) */
  deleteWorkout(options: { startMs: number }): Promise<{ deletedWorkouts: number }>;

  /** קורא את מדידת הדופק האחרונה שנשמרה ב-Health (למשל מהשעון) */
  getLatestHeartRate(): Promise<{ bpm: number | null; date: number | null }>;

  /** סך הצעדים שנספרו היום */
  getStepsToday(): Promise<{ steps: number }>;
}

export const AppleHealth = registerPlugin<AppleHealthPlugin>('AppleHealth');
