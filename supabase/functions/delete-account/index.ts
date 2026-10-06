// Edge Function: מוחקת לצמיתות את חשבון המשתמש שקורא לפונקציה - ואת כל הנתונים שלו
// (מחיקה עם הרשאת admin, אבל רק על המשתמש המזוהה מה-JWT שלו עצמו - לא אפשרי למחוק מישהו אחר).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { appleConfigured, revokeAppleToken } from '../_shared/apple.ts';

// מקורות מוכרים בלבד - לא * (wildcard). הפונקציה כבר מאמתת את המשתמש מהטוקן שלו ולא
// סומכת על שום דבר מהקלט (ראו למטה), אז CORS פתוח לא היה חור אבטחה בפועל - אבל אין סיבה
// טובה שפעולה הרסנית/בלתי-הפיכה כמו מחיקת חשבון תהיה קריאה לגיטימית מכל אתר בעולם.
// חשבון הדמו (test@test.com) - ראו demo-login
const DEMO_USER_ID = '85ea1b60-fc24-4a16-a92b-e87d91dfb89b';

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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // לקוח שמאמת מי המשתמש שקורא (לפי הטוקן שלו, לא הרשאות אדמין)
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // חשבון הדמו משותף (בוחני App Store נכנסים אליו) - אסור שמישהו יוכל למחוק אותו
    if (userData.user.id === DEMO_USER_ID) {
      return new Response(JSON.stringify({ error: 'אי אפשר למחוק את חשבון הדמו.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // לקוח אדמין - רק כדי למחוק בדיוק את המשתמש הזה
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // תמונות ההתקדמות ב-Storage לא נמחקות אוטומטית עם המשתמש (אין שרשור כמו בטבלאות) -
    // מוחקים את כל התיקייה שלו לפני מחיקת החשבון
    for (let round = 0; round < 50; round++) {
      const { data: files, error: listError } = await adminClient.storage
        .from('progress-photos')
        .list(userData.user.id, { limit: 100 });
      if (listError || !files || files.length === 0) break;
      const { error: removeError } = await adminClient.storage
        .from('progress-photos')
        .remove(files.map((f) => `${userData.user.id}/${f.name}`));
      if (removeError) {
        return new Response(JSON.stringify({ error: 'מחיקת התמונות נכשלה, נסה שוב.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // מי שנכנס עם Apple: מבטלים קודם את ההרשאה מול Apple (דרישת App Store 5.1.1(v)).
    // כשל כאן לא עוצר את המחיקה - המשתמש ביקש למחוק את החשבון, וזה מה שחשוב יותר.
    if (appleConfigured()) {
      const { data: tokenRow } = await adminClient
        .from('apple_tokens')
        .select('refresh_token')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (tokenRow?.refresh_token) {
        try {
          await revokeAppleToken(tokenRow.refresh_token);
        } catch (e) {
          console.error('[delete-account] Apple token revoke failed', e);
        }
      }
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
