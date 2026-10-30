// ייבוא מצילום (מחברת, צילום מסך מאפליקציה אחרת) או מטקסט חופשי, בעזרת ה-AI בשרת (ai-import).
// התמונות מוקטנות במכשיר לפני השליחה - תמונת אייפון מלאה כבדה מדי ולא משפרת את הקריאה.
import { Exercise } from '../../types';
import { supabase } from '../supabaseClient';
import { ImportResult, RawWorkout, buildImport, stableKey } from './generic';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/ai-import`;
const MAX_SIDE = 1600;

export type AiImportErrorCode = 'auth' | 'quota' | 'refusal' | 'unreadable' | 'too_long' | 'not_configured' | 'busy' | 'failed';

export class AiImportError extends Error {
  constructor(
    public code: AiImportErrorCode,
    public detail?: string
  ) {
    super(code);
  }
}

export const AI_IMPORT_ERROR_TEXT: Record<AiImportErrorCode, string> = {
  auth: 'צריך להתחבר לחשבון כדי להשתמש בייבוא בעזרת AI.',
  quota: 'נגמרה מכסת שאלות ה-AI החודשית. היא מתחדשת ב-1 לחודש.',
  refusal: 'ה-AI לא הצליח לעבד את התוכן הזה.',
  unreadable: 'לא נמצא יומן אימונים בתמונה או בטקסט.',
  too_long: 'יש כאן יותר מדי אימונים לקריאה אחת. נסה פחות עמודים בכל פעם.',
  not_configured: 'הייבוא בעזרת AI עוד לא זמין.',
  busy: 'השרת עמוס כרגע. נסה שוב בעוד דקה.',
  failed: 'הקריאה נכשלה. נסה שוב.',
};

/** מקטין תמונה ל-1600 פיקסלים בצד הארוך ומחזיר JPEG ב-base64 */
async function shrinkImage(file: File): Promise<{ mediaType: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new AiImportError('failed', 'image'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface AiSet {
  weightKg: number;
  reps: number;
  seconds: number;
  warmup: boolean;
}
interface AiWorkout {
  date: string;
  title: string;
  notes: string;
  exercises: { name: string; originalName: string; notes: string; sets: AiSet[] }[];
}

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** הופך את תשובת השרת לאימונים. אימון בלי תאריך נרשם להיום, בצהריים (השעה לא ידועה) */
export function aiWorkoutsToImport(workouts: AiWorkout[], library: Exercise[], now = new Date()): ImportResult {
  const raw: RawWorkout[] = workouts.map((w, i) => {
    const m = w.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const start = m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    return {
      // אותו תוכן = אותו מזהה, כך שקריאה חוזרת של אותו עמוד לא משכפלת אימון
      key: stableKey(`${w.date || localDay(now)}|${i}|${JSON.stringify(w.exercises)}`),
      title: w.title,
      start,
      durationSec: 0,
      notes: w.notes || undefined,
      exercises: w.exercises.map((x) => ({
        name: x.name,
        displayName: x.originalName && x.originalName !== x.name ? x.originalName : undefined,
        notes: x.notes || undefined,
        sets: x.sets.map((s) => ({
          weightKg: Math.max(0, s.weightKg),
          reps: Math.max(0, s.reps),
          seconds: Math.max(0, s.seconds),
          kind: s.warmup ? ('warmup' as const) : ('normal' as const),
        })),
      })),
    };
  });
  return buildImport('AI', raw, library);
}

export async function importWithAi(
  input: { images: File[]; text: string },
  library: Exercise[]
): Promise<{ result: ImportResult; unreadable: string; remaining: number }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiImportError('auth');

  const images = await Promise.all(input.images.slice(0, 4).map(shrinkImage));
  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ images, text: input.text.trim() || undefined, today: localDay() }),
    });
  } catch {
    throw new AiImportError('busy');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (body.error as AiImportErrorCode) || 'failed';
    throw new AiImportError(code in AI_IMPORT_ERROR_TEXT ? code : 'failed', body.unreadable);
  }
  return { result: aiWorkoutsToImport(body.workouts, library), unreadable: body.unreadable || '', remaining: body.remaining };
}
