-- ===== מנויים (entitlements) =====
-- שורה לכל משתמש עם תוכנית בתשלום. אין שורה = free. נכתבת רק מהשרת (service_role) - בעתיד
-- מה-webhook של RevenueCat אחרי רכישה ב-App Store, וידנית לבדיקות. המשתמש רק קורא את שלו.
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium', 'trainer')),
  source text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

drop policy if exists "Users read own entitlement" on public.entitlements;
create policy "Users read own entitlement" on public.entitlements
  for select to authenticated using (auth.uid() = user_id);

revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant select, insert, update, delete on table public.entitlements to service_role;

-- ===== שימוש בצ'אט ה-AI =====
-- מונה יומי לכל משתמש: כמה הודעות וכמה טוקנים. נכתב רק דרך הפונקציות למטה (מה-Edge Function).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "Users read own ai usage" on public.ai_usage;
create policy "Users read own ai usage" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;
grant select, insert, update, delete on table public.ai_usage to service_role;

-- תופס מקום להודעה אחת אם עוד לא הגיעו למכסה. אטומי (שורה אחת, upsert מותנה) - שתי בקשות
-- במקביל לא יכולות לעבור את המכסה. מחזיר את מספר ההודעות אחרי הספירה, או null אם המכסה מלאה.
create or replace function public.ai_try_consume(p_user uuid, p_day date, p_limit integer)
returns integer
language sql
set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, day, messages)
  select p_user, p_day, 1
  where p_limit > 0
  on conflict (user_id, day) do update
    set messages = u.messages + 1
    where u.messages < p_limit
  returning u.messages;
$$;

-- רישום הטוקנים בסוף התשובה, או החזרת ההודעה למכסה כשהקריאה למודל נכשלה.
create or replace function public.ai_record_usage(
  p_user uuid, p_day date, p_input bigint, p_output bigint, p_refund boolean
)
returns void
language sql
set search_path = ''
as $$
  update public.ai_usage
    set input_tokens = input_tokens + greatest(p_input, 0),
        output_tokens = output_tokens + greatest(p_output, 0),
        messages = case when p_refund then greatest(messages - 1, 0) else messages end
  where user_id = p_user and day = p_day;
$$;

revoke all on function public.ai_try_consume(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.ai_record_usage(uuid, date, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.ai_try_consume(uuid, date, integer) to service_role;
grant execute on function public.ai_record_usage(uuid, date, bigint, bigint, boolean) to service_role;
