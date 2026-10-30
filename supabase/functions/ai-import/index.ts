// Edge Function: ייבוא אימונים מצילום (מחברת, צילום מסך מאפליקציה אחרת) או מטקסט חופשי.
// Claude קורא את התמונה/הטקסט ומחזיר JSON לפי סכמה קבועה (structured outputs); האפליקציה
// משייכת את שמות התרגילים למאגר ובונה מזה אימונים. כל קריאה נספרת כשאלה אחת ממכסת ה-AI
// החודשית (אותה מכסה של המאמן), ומוחזרת אם הקריאה נכשלה.
//
// בקשה: { images?: [{ mediaType, data }], text?: string, today: 'YYYY-MM-DD' }
// תשובה: { workouts: [...], unreadable: string, remaining } | שגיאה: 400 bad_request, 401, 429 quota,
//   422 refusal | unreadable, 503 not_configured, 502 busy | failed
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const MODEL = 'claude-sonnet-5-5';
const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 5_000_000; // ~3.7MB - האפליקציה מקטינה ל-1600px לפני השליחה
const MAX_TEXT = 8000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Plan = 'free' | 'premium' | 'trainer';
const DEFAULT_MONTHLY_LIMITS: Record<Plan, number> = { free: 5, premium: 60, trainer: 60 };
function monthlyLimit(plan: Plan): number {
  const raw = Deno.env.get(`AI_MONTHLY_LIMIT_${plan.toUpperCase()}`);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_LIMITS[plan];
}
const israelDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

const INSTRUCTIONS = `You extract strength-training logs for a gym app. The input is a photo (handwritten notebook page, whiteboard, or a screenshot of another fitness app) or pasted text, often in Hebrew, sometimes mixed with English.

Return every workout you can find. For each workout:
- date: YYYY-MM-DD. Notebooks often write dates as D.M or D/M (day first, Israeli style). Infer the year from "today" (given below): use the most recent such date that is not in the future. Empty string if no date is written.
- title: the workout's name as written (e.g. "Push", "יום A", "חזה + יד אחורית"), or empty.
- notes: anything about the whole workout worth keeping (empty if none).
- exercises, in order. For each:
  - name: the exercise's standard English name in the format "Movement (Equipment)", e.g. "Bench Press (Barbell)", "Lat Pulldown (Cable)", "Lateral Raise (Dumbbell)", "Leg Press", "Pull Up". Translate Hebrew gym slang (e.g. לחיצת חזה = Bench Press, פולי עליון = Lat Pulldown (Cable), חתירה = Row, כפיפת מרפקים = Bicep Curl, פשיטת מרפקים / פולי לטרייספס = Triceps Pushdown, סקוואט = Squat, דדליפט = Deadlift, לחיצת רגליים = Leg Press, הרחקות = Lateral Raise, מתח = Pull Up, מקבילים = Dip).
  - originalName: the name exactly as written.
  - sets: one entry per set. weightKg (convert lb to kg if the log says lb/lbs; kg otherwise), reps, seconds (for timed holds like plank, else 0), warmup (true only if marked as warm-up).
    Expand shorthand: "80x8x3" or "3x8 @80" = three sets of 8 reps at 80; "80: 10, 9, 8" = three sets at 80. "BW" / "משקל גוף" = weightKg 0. If only sets x reps are written with no weight, weightKg 0.
  - notes: per-exercise notes as written (empty if none).
Skip cardio-only lines unless they include sets and reps. Do not invent numbers: if a value is unreadable, leave that set out and describe what you could not read in "unreadable" (in Hebrew, short). If the input is not a workout log at all, return no workouts and say so in "unreadable".`;

const SET = {
  type: 'object',
  additionalProperties: false,
  required: ['weightKg', 'reps', 'seconds', 'warmup'],
  properties: {
    weightKg: { type: 'number' },
    reps: { type: 'integer' },
    seconds: { type: 'integer' },
    warmup: { type: 'boolean' },
  },
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['workouts', 'unreadable'],
  properties: {
    unreadable: { type: 'string' },
    workouts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'title', 'notes', 'exercises'],
        properties: {
          date: { type: 'string' },
          title: { type: 'string' },
          notes: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'originalName', 'notes', 'sets'],
              properties: {
                name: { type: 'string' },
                originalName: { type: 'string' },
                notes: { type: 'string' },
                sets: { type: 'array', items: SET },
              },
            },
          },
        },
      },
    },
  },
};

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const userId = userData.user.id;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(503, { error: 'not_configured' });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const images = Array.isArray(payload.images) ? payload.images : [];
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const today = typeof payload.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.today) ? payload.today : israelDay();
  if ((!images.length && !text) || images.length > MAX_IMAGES || text.length > MAX_TEXT) return json(400, { error: 'bad_request' });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of images) {
    const { mediaType, data } = (img ?? {}) as Record<string, unknown>;
    if (typeof mediaType !== 'string' || !IMAGE_TYPES.has(mediaType) || typeof data !== 'string' || data.length > MAX_IMAGE_B64) {
      return json(400, { error: 'bad_request' });
    }
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data } });
  }
  content.push({ type: 'text', text: `Today is ${today}.${text ? `\n\nWorkout log text:\n${text}` : ''}` });

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: ent } = await admin.from('entitlements').select('plan, expires_at').eq('user_id', userId).maybeSingle();
  const plan: Plan =
    ent && (ent.plan === 'premium' || ent.plan === 'trainer') && (!ent.expires_at || new Date(ent.expires_at) > new Date())
      ? ent.plan
      : 'free';
  const limit = monthlyLimit(plan);
  const day = `${israelDay().slice(0, 8)}01`;
  const { data: used, error: quotaError } = await admin.rpc('ai_try_consume', { p_user: userId, p_day: day, p_limit: limit });
  if (quotaError) return json(500, { error: 'failed' });
  if (used === null) return json(429, { error: 'quota', plan, limit });
  const remaining = Math.max(limit - (used as number), 0);

  const client = new Anthropic({ apiKey, maxRetries: 1 });
  let inputTokens = 0;
  let outputTokens = 0;
  let refund = true;
  try {
    const res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        // קריאת כתב יד דורשת קצת יותר מחשבה מצ'אט, אבל לא ניתוח עמוק
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: INSTRUCTIONS,
        messages: [{ role: 'user', content }],
      },
      { signal: req.signal }
    );
    const u = res.usage;
    inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    outputTokens = u.output_tokens ?? 0;
    if (res.stop_reason === 'refusal') return json(422, { error: 'refusal' });
    if (res.stop_reason === 'max_tokens') return json(422, { error: 'too_long' });
    const out = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = JSON.parse(out);
    if (!Array.isArray(parsed.workouts) || parsed.workouts.length === 0) {
      return json(422, { error: 'unreadable', unreadable: String(parsed.unreadable ?? '') });
    }
    refund = false;
    return json(200, { workouts: parsed.workouts, unreadable: String(parsed.unreadable ?? ''), remaining });
  } catch (e) {
    console.error('ai-import failed', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json(503, { error: 'not_configured' });
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
      return json(502, { error: 'busy' });
    }
    return json(502, { error: 'failed' });
  } finally {
    await admin.rpc('ai_record_usage', {
      p_user: userId,
      p_day: day,
      p_input: inputTokens,
      p_output: outputTokens,
      p_refund: refund,
    });
  }
});
