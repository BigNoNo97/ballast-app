import { ProgressionRule, WorkoutSet } from '../types';

// מחשב מה המשקל/חזרות המומלצים לסט הבא, בהתאם לחוק ההתקדמות ולביצוע האחרון
export function computeProgressedTarget(
  rule: ProgressionRule | undefined,
  lastSet: Pick<WorkoutSet, 'weightKg' | 'reps' | 'completed'> | null,
  fallbackWeight: number | undefined,
  fallbackReps: number | undefined
): { weight: number; reps: number } {
  if (!lastSet) {
    return { weight: fallbackWeight || 0, reps: fallbackReps || 10 };
  }

  if (!rule) {
    return { weight: fallbackWeight || lastSet.weightKg, reps: lastSet.reps };
  }

  if (rule.requireCompletion && !lastSet.completed) {
    // לא הושלם בפעם הקודמת - חוזרים על אותו יעד, לא מתקדמים
    return { weight: lastSet.weightKg, reps: lastSet.reps };
  }

  if (rule.metric === 'weight') {
    const newWeight =
      rule.mode === 'add'
        ? lastSet.weightKg + rule.amount
        : Math.round(lastSet.weightKg * (1 + rule.amount / 100) * 4) / 4; // מעוגל לרבע ק"ג
    return { weight: Math.max(0, newWeight), reps: lastSet.reps };
  }

  const newReps =
    rule.mode === 'add'
      ? lastSet.reps + rule.amount
      : Math.round(lastSet.reps * (1 + rule.amount / 100));
  return { weight: lastSet.weightKg, reps: Math.max(1, newReps) };
}

export const PROGRESSION_METRIC_LABELS: Record<ProgressionRule['metric'], string> = {
  weight: 'משקל',
  reps: 'חזרות',
};

export const PROGRESSION_MODE_LABELS: Record<ProgressionRule['mode'], string> = {
  add: 'הוספה קבועה',
  percent: 'אחוז',
};

export function describeProgressionRule(rule: ProgressionRule): string {
  const metric = PROGRESSION_METRIC_LABELS[rule.metric];
  const unit = rule.metric === 'weight' ? (rule.mode === 'add' ? 'ק"ג' : '%') : (rule.mode === 'add' ? '' : '%');
  const sign = rule.amount >= 0 ? '+' : '';
  return `${metric} ${sign}${rule.amount}${unit} בכל אימון${rule.requireCompletion ? ' (אם הושלם)' : ''}`;
}
