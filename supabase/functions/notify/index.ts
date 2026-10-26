// Edge Function: שולחת התראת פוש לצד השני בקשר מאמן-מתאמן.
//   {kind:'message', messageId}  הודעה חדשה - רק השולח שלה יכול לבקש, ורק פעם אחת להודעה
//   {kind:'update', clientId}    המאמן שינה משהו אצל המתאמן - לכל היותר התראה אחת ל-10 דקות
// הכל נבדק מול הנתונים בשרת; מהבקשה עצמה לוקחים רק מזהים. תוכן ההתראה נבנה כאן.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { apnsConfigured, sendApns } from '../_shared/apns.ts';

const UPDATE_PUSH_INTERVAL_MIN = 10;

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });
  const me = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const uuid = /^[0-9a-f-]{36}$/i;

  let recipient: string;
  let title: string;
  let text: string;
  let threadId: string;

  if (body.kind === 'message' && typeof body.messageId === 'string' && uuid.test(body.messageId)) {
    // מסמנים "נשלח" באופן אטומי - בקשה כפולה לא תשלח פעמיים
    const { data: msg } = await admin
      .from('trainer_messages')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', body.messageId)
      .eq('sender_id', me)
      .is('pushed_at', null)
      .select('trainer_id, client_id, sender_id, body')
      .maybeSingle();
    if (!msg) return json(200, { skipped: 'not_found_or_already_sent' });
    const fromTrainer = msg.sender_id === msg.trainer_id;
    recipient = fromTrainer ? msg.client_id : msg.trainer_id;
    if (fromTrainer) {
      const { data: p } = await admin.from('trainer_profiles').select('display_name').eq('user_id', msg.trainer_id).maybeSingle();
      title = p?.display_name ?? 'המאמן שלך';
    } else {
      const { data: r } = await admin
        .from('trainer_clients')
        .select('client_display_name')
        .eq('trainer_id', msg.trainer_id)
        .eq('client_id', msg.client_id)
        .maybeSingle();
      title = r?.client_display_name ?? 'מתאמן';
    }
    text = msg.body.length > 140 ? `${msg.body.slice(0, 139)}…` : msg.body;
    threadId = `${msg.trainer_id}:${msg.client_id}`;
  } else if (body.kind === 'update' && typeof body.clientId === 'string' && uuid.test(body.clientId)) {
    const since = new Date(Date.now() - UPDATE_PUSH_INTERVAL_MIN * 60 * 1000).toISOString();
    const { data: rel } = await admin
      .from('trainer_clients')
      .update({ last_update_push_at: new Date().toISOString() })
      .eq('trainer_id', me)
      .eq('client_id', body.clientId)
      .eq('status', 'active')
      .or(`last_update_push_at.is.null,last_update_push_at.lt."${since}"`)
      .select('client_id')
      .maybeSingle();
    if (!rel) return json(200, { skipped: 'not_allowed_or_too_soon' });
    const { data: p } = await admin.from('trainer_profiles').select('display_name').eq('user_id', me).maybeSingle();
    recipient = body.clientId;
    title = p?.display_name ?? 'המאמן שלך';
    text = 'עדכנתי לך את התוכנית והנתונים באפליקציה 💪';
    threadId = `${me}:${body.clientId}`;
  } else {
    return json(400, { error: 'bad_request' });
  }

  if (!apnsConfigured()) return json(200, { skipped: 'not_configured' });

  const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', recipient);
  const dead = await sendApns(
    (tokens ?? []).map((t) => t.token as string),
    { title, body: text, threadId, data: { kind: body.kind } }
  );
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
  return json(200, { sent: (tokens?.length ?? 0) - dead.length });
});
