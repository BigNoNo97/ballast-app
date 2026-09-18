import { Exercise } from '../types';

// תרגילי חימום כלליים (לא ספציפיים לשריר) - נפרדים ממאגר התרגילים הרגיל בכוונה, כדי
// שלא יופיעו כתרגיל רגיל לבחירה/החלפה (מסוננים החוצה ב-ExerciseLibraryView/ExerciseSwapModal
// לפי isWarmup). ממוזגים ל-StorageService.getExercises() כדי ששם/תמונה יתפענחו כרגיל בכל מקום.
export const WARMUP_EXERCISES: Exercise[] = [
  {
    id: 'warmup-light-cardio',
    nameHe: 'חימום קרדיווסקולרי קל',
    nameEn: 'Light Cardio Warm-up',
    muscle: 'core',
    equipment: 'bodyweight',
    alternatives: [],
    defaultSets: 1,
    defaultReps: 5,
    defaultRestSec: 0,
    tipsHe: '5 דקות הליכה מהירה, אופניים או חבל דילוג בעצימות נמוכה - מעלה חום גוף ומכין את המערכת לאימון.',
    isWarmup: true,
  },
  {
    id: 'warmup-dynamic-stretch',
    nameHe: 'מתיחות דינמיות לכל הגוף',
    nameEn: 'Dynamic Full-Body Stretch',
    muscle: 'core',
    equipment: 'bodyweight',
    alternatives: [],
    defaultSets: 1,
    defaultReps: 10,
    defaultRestSec: 0,
    tipsHe: 'סבבי זרועות, מתיחות רגליים בהליכה, וסקוואט משקל גוף קל - מכין את המפרקים והשרירים לתנועה מלאה.',
    isWarmup: true,
  },
];
