import { MuscleGroup } from '../types';

// אין שדה "תרגיל מורכב/תרגיל בידוד" במאגר התרגילים הקיים - זו רשימה מקודדת-ידנית
// של תנועות רב-מפרקיות (compound) לפי הקריטריון האמיתי (מפעילות יותר ממפרק אחד),
// כדי שמחולל התוכניות יוכל לבחור "תרגיל ראשי" אחד ליום/שריר ואז למלא נפח בבידוד.
export const COMPOUND_EXERCISE_IDS = new Set<string>([
  // Hip hinge / deadlift
  'deadlift-conventional', 'deadlift-trap-bar', 'romanian-deadlift-barbell', 'romanian-deadlift-dumbbell',
  'sumo-deadlift', 'stiff-leg-deadlift-barbell', 'sumo-stiff-leg-deadlift', 'rack-pulls', 'deficit-deadlift',
  'good-morning-barbell', 'single-leg-deadlift-kettlebell', 'power-clean', 'clean-and-press-barbell', 'clean-shrug-barbell',
  // Squat / knee-dominant
  'barbell-back-squat', 'front-squat-barbell', 'goblet-squat-dumbbell', 'squat-dumbbell', 'box-squat-barbell',
  'smith-squat', 'hack-squat-machine', 'leg-press-machine', 'leg-press-narrow-stance', 'leg-press-smith',
  'bulgarian-split-squat', 'walking-lunges-dumbbell', 'lunge-barbell', 'reverse-lunge-dumbbell', 'sumo-squat-dumbbell',
  'chair-squat-barbell', 'elevated-reverse-lunge-barbell', 'step-up-barbell', 'step-up-dumbbell', 'step-up-knee-raise',
  'bodyweight-squat', 'jump-squat-bodyweight',
  // Horizontal push (chest)
  'bench-press-barbell', 'bench-press-dumbbell', 'incline-bench-dumbbell', 'incline-bench-barbell',
  'incline-smith-press', 'bench-press-smith', 'decline-bench-press-barbell', 'decline-bench-press-dumbbell',
  'decline-bench-press-smith', 'bench-press-wide-grip-barbell', 'bench-press-neutral-grip-dumbbell',
  'bench-press-single-arm-dumbbell', 'chest-press-machine', 'chest-press-machine-plate-loaded',
  'chest-press-cable-standing', 'incline-chest-machine', 'dips-chest', 'pushups', 'incline-pushup',
  'decline-pushup-feet-elevated', 'pushup-wide-grip', 'diamond-pushup', 'handstand-pushup',
  'close-grip-bench-press-barbell', 'floor-press-barbell', 'jm-press-barbell',
  // Horizontal/vertical pull (back)
  'barbell-row', 'barbell-row-underhand', 'bent-over-row-dumbbell-both-arms', 't-bar-row', 'seated-cable-row',
  'elevated-seated-cable-row', 'kneeling-single-arm-cable-row', 'chest-supported-row-machine', 'high-row-machine',
  'iso-row-machine', 'dumbbell-row-single-arm', 'incline-row-dumbbell', 'incline-bench-row-dumbbell',
  'kettlebell-row-single-arm', 'kettlebell-row-double-arm', 'renegade-row',
  'lat-pulldown-cable', 'lat-pulldown-close-grip', 'lat-pulldown-machine', 'lat-pulldown-v-bar',
  'lat-pulldown-underhand', 'pullups', 'chin-up',
  // Overhead press (shoulders)
  'overhead-press-dumbbell', 'overhead-press-barbell', 'overhead-press-smith', 'shoulder-press-machine',
  'shoulder-press-cable-standing', 'seated-overhead-press-barbell', 'arnold-press-dumbbell', 'push-press-barbell',
  'kettlebell-press-alternating',
]);

export type MuscleSizeCategory = 'large' | 'medium' | 'small';

export const MUSCLE_SIZE_CATEGORY: Record<MuscleGroup, MuscleSizeCategory> = {
  back: 'large',
  chest: 'large',
  quads: 'large',
  hamstrings: 'large',
  glutes: 'large',
  shoulders: 'medium',
  biceps: 'medium',
  triceps: 'medium',
  core: 'medium',
  traps: 'small',
  calves: 'small',
  lower_back: 'small',
};

// נפחי MEV/MAV שבועיים (סטים קשים בשבוע) - ברירות מחדל מבוססות-מחקר, לא אישיות-מדויקות
// (הנפח האמיתי משתנה בין מתאמנים; אלו נקודות פתיחה סבירות למרבית האנשים).
export const VOLUME_LANDMARKS: Record<MuscleSizeCategory, { mev: number; mav: number }> = {
  large: { mev: 8, mav: 16 },
  medium: { mev: 6, mav: 14 },
  small: { mev: 6, mav: 12 },
};

// כמה ק"ג להוסיף בצעד התקדמות אחד - שרירים גדולים סופגים יותר עומס בכל פעם. נצרך גם
// ממנוע ההתקדמות בין-אימונים וגם מהצעת "קל מדי" בזמן אמת תוך כדי אימון.
export function getWeightIncrement(muscle: MuscleGroup): number {
  return MUSCLE_SIZE_CATEGORY[muscle] === 'large' ? 2.5 : 1.25;
}
