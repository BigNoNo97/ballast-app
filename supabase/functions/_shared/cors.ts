// מקורות שמותר להם לקרוא לפונקציות - משותף לכל ה-Edge Functions.
// לא * (כל אתר בעולם): האפליקציה באייפון (capacitor://), האתר ב-Netlify, ושרת הפיתוח המקומי
// בכל פורט (localhost:5173 וכו'). הפונקציות עצמן מאמתות את המשתמש מהטוקן שלו, אז זו שכבת
// הגנה נוספת ולא היחידה.
const PRODUCTION_ORIGINS = new Set(['https://gym-tracker-app-110.netlify.app', 'capacitor://localhost', 'ionic://localhost']);
const LOCAL_DEV = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const FALLBACK_ORIGIN = 'https://gym-tracker-app-110.netlify.app';

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = PRODUCTION_ORIGINS.has(origin) || LOCAL_DEV.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : FALLBACK_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
