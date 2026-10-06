-- Refresh token של "Sign in with Apple" לכל משתמש שנכנס עם Apple - נדרש כדי לבטל את ההרשאה
-- מול Apple כשהמשתמש מוחק את החשבון (דרישת App Store, הנחיה 5.1.1(v)).
-- RLS פעיל בלי אף policy: האפליקציה לא יכולה לקרוא או לכתוב כאן בכלל, רק Edge Functions
-- עם service role (save-apple-token, delete-account).
create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
