import { Capacitor } from '@capacitor/core';
import { AppleHealth } from '../plugins/appleHealth';
import { StorageService } from './storage';
import { WorkoutSession } from '../types';

const isNativeIOS = (): boolean => Capacitor.getPlatform() === 'ios';

// MET (Metabolic Equivalent of Task) של אימון התנגדות בעצימות בינונית,
// לפי ה-Compendium of Physical Activities. הערכה גסה בלבד לצורך תרומה ל"קלוריות פעילות" ב-Health.
const STRENGTH_TRAINING_MET = 5;
const FALLBACK_BODY_WEIGHT_KG = 75;

const SAVE_TIMEOUT_MS = 20_000;

const WORKOUT_PERMISSION_HELP =
  'אין ל-Ballast הרשאה לשמור אימונים ב-Apple Health. כדי להפעיל: אפליקציית "בריאות" › תמונת הפרופיל › אפליקציות › Ballast › הפעל "אימונים" (ומומלץ גם "אנרגיה פעילה" ו"משקל").';

function estimateWorkoutCalories(session: WorkoutSession): number | undefined {
  if (!session.endTime) return undefined;
  // durationSec כבר לא כולל זמן השהיה של שעון האימון, בניגוד ל-endTime-startTime
  const hours = (session.durationSec || (session.endTime - session.startTime) / 1000) / 3600;
  if (hours <= 0) return undefined;

  const log = StorageService.getBodyWeightLog();
  const weightKg = log.length > 0 ? log[log.length - 1].weightKg : FALLBACK_BODY_WEIGHT_KG;

  return Math.round(STRENGTH_TRAINING_MET * weightKg * hours);
}

export const AppleHealthService = {
  /** האם התכונה בכלל רלוונטית על הפלטפורמה הנוכחית (רק iOS נייטיבי) */
  isSupported(): boolean {
    return isNativeIOS();
  },

  /** האם המשתמש הפעיל את הסנכרון בהגדרות (ורצים על iOS נייטיבי) */
  isEnabled(): boolean {
    return isNativeIOS() && Boolean(StorageService.getSettings().appleHealthSyncEnabled);
  },

  /** מבקש הרשאות מ-Health. לא הופך appleHealthSyncEnabled - זה תפקיד הקורא (מסך ההגדרות). */
  async requestPermissions(): Promise<{ success: boolean; error?: string }> {
    if (!isNativeIOS()) {
      return { success: false, error: 'Apple Health זמין רק באפליקציית ה-iPhone' };
    }
    try {
      const { available } = await AppleHealth.isAvailable();
      if (!available) {
        return { success: false, error: 'Health לא זמין במכשיר הזה' };
      }
      await AppleHealth.requestAuthorization();
      // granted רק אומר שהדיאלוג הוצג, לא מה המשתמש בחר בו - אז בודקים בפועל
      // אם מותר לכתוב אימונים (זה הדבר העיקרי שהסנכרון עושה).
      const { status } = await AppleHealth.getAuthorizationStatus();
      return status === 'authorized' ? { success: true } : { success: false, error: WORKOUT_PERMISSION_HELP };
    } catch (e: any) {
      return { success: false, error: e?.message || 'שגיאה לא ידועה בחיבור ל-Health' };
    }
  },

  /**
   * מסנכרן אימון שהושלם ל-Apple Health. 'skipped' = הסנכרון כבוי / לא iOS (לא מציגים כלום),
   * 'saved' / 'failed' מוצגים למשתמש במסך הסיום כדי שתקלה לא תעבור בשקט.
   */
  async syncWorkout(
    session: WorkoutSession
  ): Promise<{ status: 'skipped' } | { status: 'saved' } | { status: 'failed'; error: string }> {
    if (!this.isEnabled() || !session.endTime) return { status: 'skipped' };
    try {
      const save = AppleHealth.saveWorkout({
        startMs: session.startTime,
        endMs: session.endTime,
        activeEnergyKcal: estimateWorkoutCalories(session),
        title: session.title,
        pauses: session.pauses,
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject({ code: 'TIMEOUT' }), SAVE_TIMEOUT_MS)
      );
      await Promise.race([save, timeout]);
      return { status: 'saved' };
    } catch (e: any) {
      if (e?.code === 'TIMEOUT') {
        return { status: 'failed', error: 'לא התקבלה תשובה מ-Apple Health תוך 20 שניות - ייתכן שהאימון לא נשמר.' };
      }
      console.warn('[AppleHealth] סנכרון אימון נכשל:', e);
      if (e?.code === 'WORKOUT_NOT_AUTHORIZED') return { status: 'failed', error: WORKOUT_PERMISSION_HELP };
      return { status: 'failed', error: 'האימון לא נשמר ב-Apple Health: ' + (e?.message || 'שגיאה לא ידועה') };
    }
  },

  /** פותח את אפליקציית השעון עם סשן אימון פעיל (דופק/קלוריות). נכשל בשקט אם אין שעון מצומד. */
  async startWatchWorkout(): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await AppleHealth.startWatchApp();
    } catch (e) {
      console.warn('[AppleHealth] פתיחת אפליקציית השעון נכשלה:', e);
    }
  },

  /** מוחק מ-Health את האימון ש-Ballast שמרה עבור האימון הזה (בלי תלות במתג הסנכרון - ייתכן שסונכרן בעבר) */
  async deleteWorkout(
    session: WorkoutSession
  ): Promise<{ status: 'deleted'; count: number } | { status: 'failed'; error: string }> {
    if (!isNativeIOS()) return { status: 'deleted', count: 0 };
    try {
      const { deletedWorkouts } = await AppleHealth.deleteWorkout({ startMs: session.startTime });
      return { status: 'deleted', count: deletedWorkouts };
    } catch (e: any) {
      if (e?.code === 'WORKOUT_NOT_AUTHORIZED') return { status: 'failed', error: WORKOUT_PERMISSION_HELP };
      return { status: 'failed', error: 'המחיקה מ-Apple Health נכשלה: ' + (e?.message || 'שגיאה לא ידועה') };
    }
  },

  /** מסנכרן מדידת משקל גוף ל-Apple Health */
  async syncBodyWeight(weightKg: number, dateMs: number = Date.now()): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await AppleHealth.saveBodyWeight({ kg: weightKg, dateMs });
    } catch (e) {
      console.warn('[AppleHealth] סנכרון משקל נכשל:', e);
    }
  },
};
