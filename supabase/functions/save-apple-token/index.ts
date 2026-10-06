// Edge Function: שומרת את ה-refresh token של Apple של המשתמש המחובר, מיד אחרי כניסה עם Apple.
// נדרש כדי שמחיקת חשבון תוכל לבטל את ההרשאה מול Apple (ראו delete-account).
// המשתמש מזוהה מה-JWT שלו, והטוקן נשמר רק אם החשבון באמת מחובר ל-Apple.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://gym-tracker-app-110.netlify.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://gym-tracker-app-110.netlify.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const { refresh_token } = await req.json().catch(() => ({}));
    if (typeof refresh_token !== 'string' || refresh_token.length < 10 || refresh_token.length > 4096) {
      return json({ error: 'Invalid token' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Invalid session' }, 401);

    const providers: string[] = userData.user.app_metadata?.providers ?? [userData.user.app_metadata?.provider];
    if (!providers.includes('apple')) return json({ error: 'Not an Apple account' }, 400);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin
      .from('apple_tokens')
      .upsert({ user_id: userData.user.id, refresh_token, updated_at: new Date().toISOString() });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
