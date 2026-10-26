-- apple_tokens נגישה רק לפונקציות השרת (service_role). ה-RLS כבר חוסם גישה בלי מדיניות,
-- אבל ההרשאות שנוצרו אוטומטית (כולל TRUNCATE, שלא כפוף ל-RLS) מוסרות כהגנה שכבתית.
revoke all on table public.apple_tokens from anon, authenticated;
grant select, insert, update, delete on table public.apple_tokens to service_role;
