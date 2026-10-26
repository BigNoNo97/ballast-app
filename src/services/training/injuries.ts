// פציעות ואזורים רגישים: איזה תרגילים לא נכניס לתוכנית, ולמה.
// אלה כללי זהירות שמרניים לבחירת תרגילים - לא אבחנה ולא טיפול. העיקרון (מהמקורות):
// להמשיך להתאמן ולחזק, אבל בלי התנועות שמעמיסות הכי הרבה על האזור הרגיש, ולפי מודל
// ניטור הכאב - כאב עד 5/10 שחולף עד למחרת מותר, כאב חד או מחמיר = לעצור ולהתייעץ.

import type { Exercise, InjuryArea, JointArea, MuscleGroup } from '../../types';
import { MUSCLE_GROUP_LABELS } from '../../data/exercises';

export const JOINT_AREAS: JointArea[] = ['shoulder', 'elbow', 'wrist', 'neck', 'lower_back', 'hip', 'knee', 'ankle'];

export const JOINT_LABELS: Record<JointArea, string> = {
  shoulder: 'כתף',
  elbow: 'מרפק',
  wrist: 'שורש כף היד',
  neck: 'צוואר',
  lower_back: 'גב תחתון',
  hip: 'מפרק הירך',
  knee: 'ברך',
  ankle: 'קרסול',
};

export const isJointArea = (a: InjuryArea): a is JointArea => (JOINT_AREAS as string[]).includes(a);

export function injuryLabel(area: InjuryArea): string {
  return isJointArea(area) ? JOINT_LABELS[area] : `שריר ${MUSCLE_GROUP_LABELS[area as MuscleGroup]?.he ?? area}`;
}

interface JointRule {
  /** תבניות על מזהה התרגיל + השם באנגלית: תנועות שמעמיסות הרבה על האזור */
  avoid: RegExp;
  /** מה עשינו, בשפה של המשתמש */
  explanation: string;
  evidence: string[];
}

export const JOINT_RULES: Record<JointArea, JointRule> = {
  shoulder: {
    // מתח בתלייה (כל משקל הגוף על הכתפיים) - במקומו פולי עליון, שבו העומס נשלט
    avoid: /hanging|pull[- ]?ups?\b|pullups|chin[- ]?ups?\b|overhead|military|push[- ]press|upright|behind[- ]the[- ]neck|\bdips?\b|dips-|handstand|snatch|jerk|arnold|kipping|muscle[- ]up|pullover|wide[- ]grip[- ]bench|bench-press-wide/i,
    explanation: 'בלי לחיצות מעל הראש, חתירה אנכית, מקבילים ומתח בתלייה - התנועות שמעמיסות הכי הרבה על מפרק הכתף. לחיצות, חתירות ופולי עליון בטווח נוח נשארים.',
    evidence: ['painMonitoring'],
  },
  elbow: {
    avoid: /skull|lying[- ]tricep|french[- ]press|overhead[- ]tri|tricep[s]?[- ]extension.*overhead|close[- ]grip[- ]bench|\bdips?\b|dips-|preacher|jm[- ]press|tate[- ]press/i,
    explanation: 'בלי פשיטות מרפק מעל הראש/בשכיבה, מקבילים וכפיפות מרפק על ספסל כומר - במקומם תרגילי פולי עם עומס יציב יותר.',
    evidence: ['painMonitoring'],
  },
  wrist: {
    avoid: /front[- ]squat|\bclean\b|clean-|snatch|wrist|push[- ]?ups?\b|pushup|planche|handstand|straight[- ]bar|bicep-curl-barbell|bicep-curl-straight|barbell[- ]curl/i,
    explanation: 'בלי שכיבות סמיכה על כפות הידיים, מוט ישר לכפיפות וסקוואט קדמי - העדפה למשקולות יד ואחיזה ניטרלית.',
    evidence: ['painMonitoring'],
  },
  neck: {
    avoid: /shrug|behind[- ]the[- ]neck|upright|headstand|\bneck\b|neck-|back[- ]squat|barbell-back-squat|good[- ]morning/i,
    explanation: 'בלי מוט על הגב העליון, משיכות כתפיים ותרגילים שמעמיסים על הצוואר - לרגליים יש לחיצת רגליים, גובלט וחלופות דומות.',
    evidence: ['painMonitoring'],
  },
  lower_back: {
    // + עומס צירי על עמוד השדרה: מוט על הגב (סקוואט/לאנג'/בוקס), לחיצה מעל הראש בעמידה עם מוט
    avoid: /lunge-barbell|barbell[- ]lunge|box[- ]squat|push[- ]press|overhead-press-barbell|standing[- ]barbell[- ]overhead|deadlift|good[- ]morning|rack[- ]pull|bent[- ]over|barbell[- ]row|barbell-row|\bt[- ]bar\b|back[- ]squat|front[- ]squat|\bclean\b|clean-|snatch|jefferson|hyperextension|back[- ]extension|superman|sit[- ]?up|russian[- ]twist|toes[- ]to[- ]bar|v[- ]up|swing/i,
    explanation: 'בלי דדליפטים, חתירה בהטיה קדימה וסקוואט עם מוט - במקומם תרגילים עם תמיכה (חתירה עם תמיכת חזה, לחיצת רגליים, מכונות). תנועה ותרגול מדורג עדיפים על מנוחה.',
    evidence: ['backPain', 'painMonitoring'],
  },
  hip: {
    avoid: /sumo|pistol|sissy|lunge|split[- ]squat|bulgarian|step[- ]up|jump|plyo|deep[- ]squat|wide[- ]stance/i,
    explanation: 'בלי לאנג׳ים, סקוואט בעמידה רחבה/עמוק וקפיצות. חיזוק הישבן והירכיים נשאר - הוא חלק מהטיפול המומלץ.',
    evidence: ['kneeOA', 'painMonitoring'],
  },
  knee: {
    avoid: /jump|plyo|box[- ]jump|sissy|pistol|lunge|split[- ]squat|bulgarian|step[- ]up|skater|burpee|deep[- ]squat/i,
    explanation: 'בלי קפיצות, לאנג׳ים וסקוואט על רגל אחת. חיזוק הירך (לחיצת רגליים בטווח נוח, כפיפות ברך) נשאר - זה טיפול מרכזי מומלץ בכאבי ברך.',
    evidence: ['kneeOA', 'painMonitoring'],
  },
  ankle: {
    avoid: /jump|plyo|lunge|step[- ]up|standing[- ]calf|calf[- ]raise.*standing|standing-calf|skip|burpee|sprint|skater/i,
    explanation: 'בלי קפיצות, לאנג׳ים והרמות עקבים בעמידה - הרמות עקבים בישיבה במקומן.',
    evidence: ['painMonitoring'],
  },
};

/** האם התרגיל מתאים למי שיש לו את הפציעות האלה */
export function isSafeFor(exercise: Exercise, injuries: InjuryArea[]): boolean {
  if (injuries.length === 0) return true;
  const text = `${exercise.id} ${exercise.nameEn}`;
  for (const area of injuries) {
    if (isJointArea(area)) {
      if (JOINT_RULES[area].avoid.test(text)) return false;
    } else if (exercise.muscle === area) {
      // שריר פצוע (מתיחה/קרע) - בלי אימון ישיר שלו עד שיחלים
      return false;
    }
  }
  return true;
}

export function injuryExplanation(area: InjuryArea): { text: string; evidence: string[] } {
  if (isJointArea(area)) return { text: `${JOINT_LABELS[area]}: ${JOINT_RULES[area].explanation}`, evidence: JOINT_RULES[area].evidence };
  return {
    text: `${injuryLabel(area)}: בלי אימון ישיר של השריר עד שיחלים. כשהכאב חולף - אפשר להסיר את הפציעה בהגדרות, והתוכנית תחזיר אותו בהדרגה.`,
    evidence: ['painMonitoring'],
  };
}

/** קפיצות ותרגילי השפעה - לא מתאימים למבוגרים (60+) או ל-BMI גבוה מאוד, גם בלי פציעה */
export const HIGH_IMPACT = /jump|plyo|box[- ]jump|burpee|skater|sprint/i;
