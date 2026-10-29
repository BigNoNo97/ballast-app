// Edge Function: צ'אט ה-AI (המאמן). מאמתת את המשתמש, בודקת מכסה חודשית לפי המנוי, ומזרימה
// תשובה מ-Claude כ-SSE. מפתח ה-API נשמר רק כסוד בשרת (ANTHROPIC_API_KEY) ולעולם לא מגיע לאפליקציה.
//
// פרוטוקול התשובה (text/event-stream), שורות "data: {json}":
//   {type:'delta', text}            קטע טקסט חדש
//   {type:'done', text, remaining}  סוף התשובה - text הוא הנוסח הסופי המלא (מחליף את מה שהוזרם)
//   {type:'refusal'}                המודל סירב לענות
//   {type:'error', code}            busy | not_configured | failed
// שגיאות לפני תחילת ההזרמה חוזרות כ-JSON רגיל: 401, 400 bad_request, 429 quota, 503 not_configured.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { COACH_INSTRUCTIONS } from '../_shared/coachPrompt.ts';
import { COACH_KNOWLEDGE } from '../_shared/coachKnowledge.ts';

const MODEL = 'claude-sonnet-5-5';
const MAX_OUTPUT_TOKENS = 4096;
const MAX_TURNS = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_CHARS = 12000;

// מכסת שאלות חודשית לפי מנוי (הוחלט 29.10.2026): שאלה עולה עד ~12 אגורות, אז המכסה נקבעה כך
// שגם המשתמש הכבד ביותר במנוי השנתי נשאר רווחי. ניתן לשינוי בלי העלאת קוד:
// supabase secrets set AI_MONTHLY_LIMIT_FREE=5
const DEFAULT_MONTHLY_LIMITS: Record<Plan, number> = { free: 5, premium: 60, trainer: 60 };
type Plan = 'free' | 'premium' | 'trainer';

function monthlyLimit(plan: Plan): number {
  const raw = Deno.env.get(`AI_MONTHLY_LIMIT_${plan.toUpperCase()}`);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_LIMITS[plan];
}

// לפי שעון ישראל, לא UTC. המונה נשמר תחת היום הראשון של החודש (עמודת day ב-ai_usage),
// כך שהמכסה מתחדשת ב-1 לכל חודש
const israelDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

// מנוע הידע נשמר ב-prompt cache: החלק הקבוע ראשון, עם נקודת שמירה בסופו.
const STABLE_SYSTEM = `${COACH_INSTRUCTIONS}\n\n# Knowledge base\n${COACH_KNOWLEDGE}`;

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function parseTurns(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const turns: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { role, content } = item as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    const text = content.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS) return null;
    // תורות חייבות להתחלף משתמש/מאמן - שתי הודעות רצופות מאותו צד = בקשה לא תקינה
    if (turns.length && turns[turns.length - 1].role === role) return null;
    turns.push({ role, content: text });
  }
  if (turns[0].role !== 'user' || turns[turns.length - 1].role !== 'user') return null;
  // רק סוף השיחה, ותמיד מתחילים בהודעת משתמש
  let recent = turns.slice(-MAX_TURNS);
  if (recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}

function errorCode(e: unknown): 'busy' | 'not_configured' | 'failed' {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'not_configured';
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) return 'busy';
  return 'failed';
}

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
  const turns = parseTurns(payload.messages);
  if (!turns) return json(400, { error: 'bad_request' });
  let contextText = '';
  if (payload.context !== undefined) {
    if (!payload.context || typeof payload.context !== 'object') return json(400, { error: 'bad_request' });
    contextText = JSON.stringify(payload.context);
    if (contextText.length > MAX_CONTEXT_CHARS) contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS)} …(truncated)`;
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: ent } = await admin.from('entitlements').select('plan, expires_at').eq('user_id', userId).maybeSingle();
  const plan: Plan =
    ent && (ent.plan === 'premium' || ent.plan === 'trainer') && (!ent.expires_at || new Date(ent.expires_at) > new Date())
      ? ent.plan
      : 'free';
  const limit = monthlyLimit(plan);
  const today = israelDay();
  const day = `${today.slice(0, 8)}01`;

  const { data: used, error: quotaError } = await admin.rpc('ai_try_consume', { p_user: userId, p_day: day, p_limit: limit });
  if (quotaError) return json(500, { error: 'failed' });
  if (used === null) return json(429, { error: 'quota', plan, limit });
  const remaining = Math.max(limit - (used as number), 0);

  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const userDataBlock = contextText
    ? `# User data (calculated by the app, today is ${today})\n${contextText}`
    : `# User data\nNo data was shared. Today is ${today}.`;

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      // צ'אט: מאמץ נמוך = תשובה מהירה; המודל עדיין חושב כשהשאלה מורכבת
      output_config: { effort: 'low' },
      // סירוב בטיחותי בקטגוריות מסוימות עובר אוטומטית למודל חלופי בשרת של Anthropic
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: STABLE_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: userDataBlock },
      ],
      messages: turns,
    },
    { signal: req.signal }
  );

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // הלקוח התנתק - אין לאן לשלוח
        }
      };
      let inputTokens = 0;
      let outputTokens = 0;
      let refund = false;
      try {
        stream.on('text', (delta) => send({ type: 'delta', text: delta }));
        const final = await stream.finalMessage();
        const u = final.usage;
        inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        outputTokens = u.output_tokens ?? 0;
        if (final.stop_reason === 'refusal') {
          refund = true;
          send({ type: 'refusal' });
        } else {
          const text = final.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');
          send({ type: 'done', text, remaining, truncated: final.stop_reason === 'max_tokens' });
        }
      } catch (e) {
        refund = true;
        if (!(e instanceof Anthropic.APIUserAbortError)) {
          console.error('ai-coach stream failed', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
          send({ type: 'error', code: errorCode(e) });
        }
      } finally {
        await admin.rpc('ai_record_usage', {
          p_user: userId,
          p_day: day,
          p_input: inputTokens,
          p_output: outputTokens,
          p_refund: refund,
        });
        try {
          controller.close();
        } catch {
          // כבר סגור
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
