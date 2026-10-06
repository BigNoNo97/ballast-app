// Edge Function: כניסה לחשבון הדמו (לבוחני App Store ולמי שרוצה להציץ באפליקציה).
// הסיסמה של חשבון הדמו לא נמצאת יותר בקוד של האפליקציה: בכל כניסה הפונקציה קובעת לחשבון
// סיסמה אקראית חדשה (וגם מחזירה את האימייל המקורי), מתחברת איתה ומחזירה את הטוקנים.
// כך גם אם מישהו השתמש בחשבון כדי לשנות לו סיסמה או אימייל, הכניסה הבאה מחזירה אותו לשליטתנו.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// לא סוד: המזהה של חשבון הדמו (test@test.com) - לפיו ולא לפי האימייל, כי האימייל יכול להשתנות
const DEMO_USER_ID = '85ea1b60-fc24-4a16-a92b-e87d91dfb89b';
const DEMO_EMAIL = 'test@test.com';

const ALLOWED_ORIGINS = new Set([
  'https://gym-tracker-app-110.netlify.app',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://localhost:5173',
]);

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://gym-tracker-app-110.netlify.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const password = randomPassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(DEMO_USER_ID, {
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
    });
    if (updateError) return json({ error: updateError.message }, 500);

    const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({ email: DEMO_EMAIL, password });
    if (error || !data.session) return json({ error: error?.message || 'Demo sign-in failed' }, 500);

    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
