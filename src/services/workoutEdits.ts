import { WorkoutSession, WorkoutSet } from '../types';

/**
 * עריכת שדה בסט אחד. משקל/חזרות מתפשטים לסטים *שאחריו* באותו תרגיל שעדיין לא הושלמו -
 * אף פעם לא לסטים קודמים, בלי לסמן אותם ✓, ובלי לגעת בסטים שכבר אושרו.
 * משותף למסך האימון באייפון ולפקודות שמגיעות מהשעון, כדי ששניהם יתנהגו בדיוק אותו דבר.
 */
export function applySetFieldEdit(
  sets: WorkoutSet[],
  setIndex: number,
  field: keyof WorkoutSet,
  value: any
): WorkoutSet[] {
  const isCascadeField = field === 'weightKg' || field === 'reps';
  return sets.map((s, idx) => {
    if (idx === setIndex) {
      // עריכה ישירה של המשתמש על השדה הזה - מבטלת את תזכורת "עודכן אוטומטית" שלו,
      // כי מעכשיו זה הערך שהמשתמש עצמו בחר, לא הצעה של המערכת.
      if (field === 'weightKg') return { ...s, weightKg: value, autoFilledFromWeight: undefined };
      if (field === 'reps') return { ...s, reps: value, autoFilledFromReps: undefined };
      return { ...s, [field]: value };
    }
    if (isCascadeField && idx > setIndex && !s.completed && s[field] !== value) {
      const prevKey = field === 'weightKg' ? 'autoFilledFromWeight' : 'autoFilledFromReps';
      // שומרים את הערך שהיה לפני תחילת העריכה, לא את זה של ההקשה הקודמת -
      // אחרת הקלדת "12" משאירה "קודם: 1". ואם חזרנו בדיוק לערך המקורי, אין מה להציג.
      const original = s[prevKey] ?? s[field];
      return { ...s, [field]: value, [prevKey]: original === value ? undefined : original };
    }
    return s;
  });
}

/** השהיה/המשך של שעון האימון ברגע `at` (מהשעון זה הרגע שבו לחצו שם, לא כשהפקודה עובדה) */
export function toggleWorkoutPause(workout: WorkoutSession, at: number): WorkoutSession {
  if (workout.pausedAt != null) {
    const pausedFor = Math.max(0, at - workout.pausedAt);
    return {
      ...workout,
      pausedAt: undefined,
      pausedTotalMs: (workout.pausedTotalMs || 0) + pausedFor,
      pauses: [...(workout.pauses || []), { startMs: workout.pausedAt, endMs: workout.pausedAt + pausedFor }],
    };
  }
  return { ...workout, pausedAt: at };
}
