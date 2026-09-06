import { Capacitor } from '@capacitor/core';
import { AppleHealth } from '../plugins/appleHealth';
import { StorageService } from './storage';
import { WorkoutSession } from '../types';

const isNativeIOS = (): boolean => Capacitor.getPlatform() === 'ios';

// MET (Metabolic Equivalent of Task) של אימון התנגדות בעצימות בינונית,
// לפי ה-Compendium of Physical Activities. הערכה גסה בלבד לצורך תרומה ל"קלוריות פעילות" ב-Health.
const STRENGTH_TRAINING_MET = 5;
const FALLBACK_BODY_WEIGHT_KG = 75;

function estimateWorkoutCalories(session: WorkoutSession): number | undefined {
  if (!session.endTime) return undefined;
  const hours = (session.endTime - session.startTime) / 3_600_000;
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
      const { granted } = await AppleHealth.requestAuthorization();
      return granted ? { success: true } : { success: false, error: 'ההרשאה לא אושרה' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'שגיאה לא ידועה בחיבור ל-Health' };
    }
  },

  /** מסנכרן אימון שהושלם ל-Apple Health (נכשל בשקט אם הסנכרון כבוי / לא iOS / אין הרשאה) */
  async syncWorkout(session: WorkoutSession): Promise<void> {
    if (!this.isEnabled() || !session.endTime) return;
    try {
      await AppleHealth.saveWorkout({
        startMs: session.startTime,
        endMs: session.endTime,
        activeEnergyKcal: estimateWorkoutCalories(session),
        title: session.title,
      });
    } catch (e) {
      console.warn('[AppleHealth] סנכרון אימון נכשל:', e);
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

  /** דופק אחרון שנמדד (למשל ע"י Apple Watch) - null אם אין נתון/הרשאה/לא iOS */
  async getLatestHeartRate(): Promise<{ bpm: number; date: number } | null> {
    if (!isNativeIOS()) return null;
    try {
      const result = await AppleHealth.getLatestHeartRate();
      if (result.bpm == null || result.date == null) return null;
      return { bpm: result.bpm, date: result.date };
    } catch {
      return null;
    }
  },

  /** צעדים שנספרו היום - null אם לא זמין */
  async getStepsToday(): Promise<number | null> {
    if (!isNativeIOS()) return null;
    try {
      const { steps } = await AppleHealth.getStepsToday();
      return steps;
    } catch {
      return null;
    }
  },
};
