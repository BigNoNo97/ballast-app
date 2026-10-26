-- ===================== מאמנים ומתאמנים =====================
-- מודל ההרשאות:
--   * מאמן = משתמש עם שורה ב-trainer_profiles. יש לו קוד הזמנה קבוע (אפשר להחליף).
--   * מתאמן מצטרף עם הקוד ומאשר במפורש שהמאמן *מנהל* את הנתונים שלו. שיתוף התזונה אופציונלי.
--   * כל עוד הקשר פעיל, המאמן קורא וכותב את נתוני האימון של המתאמן (תוכניות, אימונים, משקלים,
--     משקל גוף, מדידות, ותזונה אם שותפה). פרטי הפרופיל (גובה, גיל, מטרות...) מתעדכנים רק דרך
--     trainer_update_client_settings, שמאפשרת רשימה סגורה של שדות - כך המאמן לא יכול לגעת
--     בהסכמות של המתאמן (למשל לצ'אט ה-AI) או בהעדפות אישיות שלו.
--   * כל שינוי של המאמן נרשם ב-trainer_activity (טריגר) - המתאמן רואה מה השתנה, והאפליקציה
--     שלו מושכת את השינוי מהשרת מיד.
--   * תמונות התקדמות ומאגר המזון האישי לא משותפים לעולם.
--   * כל אחד מהצדדים יכול לסיים את הקשר בכל רגע, והגישה נחסמת מיד.
-- כל השינויים במצב הקשר עוברים בפונקציות (security definer) שבודקות הכל בשרת.

-- ---------- טבלאות ----------

create table if not exists public.trainer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  bio text check (bio is null or char_length(bio) <= 500),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_clients (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  client_display_name text not null check (char_length(client_display_name) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'ended')),
  share_nutrition boolean not null default false,
  consented_at timestamptz not null default now(),
  ended_at timestamptz,
  -- מי סיים את הקשר. מתאמן שהמאמן הסיר לא יכול להצטרף שוב לבד עם הקוד
  ended_by uuid,
  -- מתי נשלחה למתאמן התראת "המאמן עדכן" אחרונה (כדי לא להציף בהתראות על כל שינוי)
  last_update_push_at timestamptz,
  primary key (trainer_id, client_id),
  check (trainer_id <> client_id)
);
-- למתאמן יש לכל היותר מאמן פעיל אחד
create unique index if not exists trainer_clients_one_active_trainer
  on public.trainer_clients (client_id) where status = 'active';
create index if not exists trainer_clients_trainer_idx on public.trainer_clients (trainer_id, status);

create table if not exists public.trainer_messages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null,
  client_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- מתי נשלחה התראת פוש על ההודעה (מונע התראה כפולה)
  pushed_at timestamptz,
  foreign key (trainer_id, client_id) references public.trainer_clients (trainer_id, client_id) on delete cascade,
  check (sender_id = trainer_id or sender_id = client_id)
);
create index if not exists trainer_messages_thread_idx on public.trainer_messages (trainer_id, client_id, created_at desc);

-- יומן השינויים שהמאמן עשה בנתוני המתאמן. נכתב רק ע"י הטריגר.
create table if not exists public.trainer_activity (
  id bigint generated always as identity primary key,
  trainer_id uuid not null,
  client_id uuid not null,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  created_at timestamptz not null default now(),
  foreign key (trainer_id, client_id) references public.trainer_clients (trainer_id, client_id) on delete cascade
);
create index if not exists trainer_activity_client_idx on public.trainer_activity (client_id, created_at desc);

-- ניסיונות קוד שגויים - הגבלת קצב נגד ניחוש קודים (אין גישה למשתמשים)
create table if not exists public.trainer_code_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists trainer_code_attempts_idx on public.trainer_code_attempts (user_id, attempted_at desc);

-- מכשירים שמקבלים התראות פוש. נכתב רק דרך register_push_token (מכשיר יכול לעבור בין חשבונות).
create table if not exists public.push_tokens (
  token text primary key check (char_length(token) between 32 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ---------- פונקציות עזר ל-RLS ----------
-- security definer כדי שמדיניות על טבלה אחת תוכל לבדוק את trainer_clients בלי רקורסיה של RLS.
-- הן מחזירות רק true/false על הקשר של המשתמש המחובר עצמו - לא חושפות מידע.

create or replace function public.trainer_can_read(p_client uuid, p_need_nutrition boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_clients tc
    where tc.trainer_id = auth.uid()
      and tc.client_id = p_client
      and tc.status = 'active'
      and (not p_need_nutrition or tc.share_nutrition)
  );
$$;

create or replace function public.is_client_of(p_trainer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_clients tc
    where tc.client_id = auth.uid() and tc.trainer_id = p_trainer
  );
$$;

create or replace function public.trainer_relation_active(p_trainer uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_clients tc
    where tc.trainer_id = p_trainer and tc.client_id = p_client and tc.status = 'active'
      and auth.uid() in (p_trainer, p_client)
  );
$$;

-- ---------- RLS ----------

alter table public.trainer_profiles enable row level security;
alter table public.trainer_clients enable row level security;
alter table public.trainer_messages enable row level security;
alter table public.trainer_activity enable row level security;
alter table public.trainer_code_attempts enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists "trainer_profiles_select" on public.trainer_profiles;
create policy "trainer_profiles_select" on public.trainer_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_client_of(user_id));
drop policy if exists "trainer_profiles_update" on public.trainer_profiles;
create policy "trainer_profiles_update" on public.trainer_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "trainer_clients_select" on public.trainer_clients;
create policy "trainer_clients_select" on public.trainer_clients for select to authenticated
  using (auth.uid() = trainer_id or auth.uid() = client_id);

drop policy if exists "trainer_messages_select" on public.trainer_messages;
create policy "trainer_messages_select" on public.trainer_messages for select to authenticated
  using (auth.uid() = trainer_id or auth.uid() = client_id);
drop policy if exists "trainer_messages_insert" on public.trainer_messages;
create policy "trainer_messages_insert" on public.trainer_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and read_at is null
    and pushed_at is null
    and public.trainer_relation_active(trainer_id, client_id)
  );

drop policy if exists "trainer_activity_select" on public.trainer_activity;
create policy "trainer_activity_select" on public.trainer_activity for select to authenticated
  using (auth.uid() = trainer_id or auth.uid() = client_id);

drop policy if exists "push_tokens_select" on public.push_tokens;
create policy "push_tokens_select" on public.push_tokens for select to authenticated
  using (user_id = auth.uid());

-- המאמן קורא וכותב את נתוני האימון של המתאמן שלו (קשר פעיל בלבד). תזונה - רק בהסכמה.
-- user_settings: קריאה בלבד; כתיבה רק דרך trainer_update_client_settings (רשימה סגורה של שדות).
-- progress_photos ו-food_items: לא משותפים בכלל.
do $$
declare
  t text;
begin
  foreach t in array array[
    'workouts', 'routines', 'custom_exercises', 'body_weight_entries',
    'measurement_categories', 'measurement_entries', 'exercise_progress'
  ]
  loop
    execute format('drop policy if exists "trainer_select" on public.%I', t);
    execute format('drop policy if exists "trainer_insert" on public.%I', t);
    execute format('drop policy if exists "trainer_update" on public.%I', t);
    execute format('drop policy if exists "trainer_delete" on public.%I', t);
    execute format('create policy "trainer_select" on public.%I for select to authenticated using (public.trainer_can_read(user_id))', t);
    execute format('create policy "trainer_insert" on public.%I for insert to authenticated with check (public.trainer_can_read(user_id))', t);
    execute format('create policy "trainer_update" on public.%I for update to authenticated using (public.trainer_can_read(user_id)) with check (public.trainer_can_read(user_id))', t);
    execute format('create policy "trainer_delete" on public.%I for delete to authenticated using (public.trainer_can_read(user_id))', t);
  end loop;
end $$;

drop policy if exists "trainer_select" on public.nutrition_entries;
drop policy if exists "trainer_insert" on public.nutrition_entries;
drop policy if exists "trainer_update" on public.nutrition_entries;
drop policy if exists "trainer_delete" on public.nutrition_entries;
create policy "trainer_select" on public.nutrition_entries for select to authenticated using (public.trainer_can_read(user_id, true));
create policy "trainer_insert" on public.nutrition_entries for insert to authenticated with check (public.trainer_can_read(user_id, true));
create policy "trainer_update" on public.nutrition_entries for update to authenticated
  using (public.trainer_can_read(user_id, true)) with check (public.trainer_can_read(user_id, true));
create policy "trainer_delete" on public.nutrition_entries for delete to authenticated using (public.trainer_can_read(user_id, true));

drop policy if exists "trainer_select" on public.user_settings;
create policy "trainer_select" on public.user_settings for select to authenticated using (public.trainer_can_read(user_id));

-- ---------- updated_at אמיתי בכל עדכון (כדי שהמאמן יראה עד מתי הנתונים מסונכרנים) ----------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- יומן השינויים של המאמן ----------

create or replace function public.log_trainer_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client uuid;
  v_row_id text;
begin
  if tg_op = 'DELETE' then
    v_client := old.user_id;
    v_row_id := coalesce(to_jsonb(old) ->> 'id', '');
  else
    v_client := new.user_id;
    v_row_id := coalesce(to_jsonb(new) ->> 'id', '');
  end if;
  -- רק שינוי שמישהו אחר (המאמן) עשה בנתונים של המתאמן. המשתמש עצמו ושירותי השרת לא נרשמים.
  if v_actor is null or v_actor = v_client then
    return null;
  end if;
  insert into public.trainer_activity (trainer_id, client_id, table_name, row_id, action)
  values (v_actor, v_client, tg_table_name, v_row_id, lower(tg_op));
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'workouts', 'routines', 'custom_exercises', 'body_weight_entries', 'measurement_categories',
    'measurement_entries', 'exercise_progress', 'nutrition_entries', 'user_settings'
  ]
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists log_trainer_activity on public.%I', t);
    execute format('create trigger log_trainer_activity after insert or update or delete on public.%I for each row execute function public.log_trainer_activity()', t);
  end loop;
end $$;

-- ---------- הרשאות טבלה (חובה מ-30.10.2026 לטבלאות חדשות) ----------

revoke all on table public.trainer_profiles, public.trainer_clients, public.trainer_messages,
  public.trainer_activity, public.trainer_code_attempts, public.push_tokens from anon, authenticated;
-- קוד ההזמנה גלוי רק למאמן עצמו (דרך my_trainer_profile) - לא למתאמנים, כולל כאלה שהוסרו
grant select (user_id, display_name, bio, created_at) on table public.trainer_profiles to authenticated;
grant update (display_name, bio) on table public.trainer_profiles to authenticated;
grant select on table public.trainer_clients to authenticated;
grant select, insert on table public.trainer_messages to authenticated;
grant select on table public.trainer_activity to authenticated;
grant select on table public.push_tokens to authenticated;
grant all on table public.trainer_profiles, public.trainer_clients, public.trainer_messages,
  public.trainer_activity, public.trainer_code_attempts, public.push_tokens to service_role;

-- ---------- פעולות ----------

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 תווים, בלי 0/O/1/I שמתבלבלים
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  -- 256 מתחלק ב-32 בדיוק, אז אין הטיה: 8 תווים = 40 ביט אקראיים (כטריליון צירופים)
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  end loop;
  return code;
end;
$$;

-- כמה מתאמנים פעילים מותר למאמן לפי המנוי. ערכים זמניים עד שתיקבע מדיניות המנויים.
-- המנוי נקרא מ-entitlements, שנכתבת רק מהשרת (בעתיד: אחרי רכישה ב-App Store).
create or replace function public.trainer_client_limit(p_trainer uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.entitlements e
      where e.user_id = p_trainer and e.plan = 'trainer' and (e.expires_at is null or e.expires_at > now())
    ) then 100
    else 5
  end;
$$;

-- הגבלת קצב: עד 20 קודים שגויים בשעה למשתמש
create or replace function public.check_code_attempts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.trainer_code_attempts where user_id = auth.uid() and attempted_at < now() - interval '1 day';
  if (select count(*) from public.trainer_code_attempts
      where user_id = auth.uid() and attempted_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_attempts';
  end if;
end;
$$;

create or replace function public.become_trainer(p_display_name text, p_bio text default null)
returns public.trainer_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.trainer_profiles;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into public.trainer_profiles (user_id, display_name, bio, invite_code)
  values (auth.uid(), btrim(p_display_name), nullif(btrim(coalesce(p_bio, '')), ''), public.generate_invite_code())
  on conflict (user_id) do update set display_name = excluded.display_name, bio = excluded.bio
  returning * into result;
  return result;
end;
$$;

create or replace function public.rotate_trainer_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  update public.trainer_profiles set invite_code = public.generate_invite_code()
  where user_id = auth.uid()
  returning invite_code into new_code;
  if new_code is null then raise exception 'not_a_trainer'; end if;
  return new_code;
end;
$$;

-- לפני הצטרפות: מי המאמן שמאחורי הקוד (שם ותיאור בלבד). קוד שגוי נספר להגבלת הקצב.
create or replace function public.preview_trainer_code(p_code text)
returns table (trainer_id uuid, display_name text, bio text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  perform public.check_code_attempts();
  return query
    select tp.user_id, tp.display_name, tp.bio
    from public.trainer_profiles tp
    where tp.invite_code = upper(btrim(p_code)) and tp.user_id <> auth.uid();
  if not found then
    insert into public.trainer_code_attempts (user_id) values (auth.uid());
  end if;
end;
$$;

-- מחזיר את מזהה המאמן, או null כשהקוד לא קיים (בלי exception - כדי שהניסיון השגוי יישמר)
create or replace function public.join_trainer(p_code text, p_client_name text, p_share_nutrition boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer uuid;
  v_active integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(btrim(coalesce(p_client_name, ''))) not between 1 and 60 then raise exception 'invalid_name'; end if;
  perform public.check_code_attempts();

  select tp.user_id into v_trainer from public.trainer_profiles tp where tp.invite_code = upper(btrim(p_code));
  if v_trainer is null then
    insert into public.trainer_code_attempts (user_id) values (auth.uid());
    return null;
  end if;
  if v_trainer = auth.uid() then raise exception 'own_code'; end if;

  if exists (select 1 from public.trainer_clients
             where trainer_id = v_trainer and client_id = auth.uid() and status = 'ended' and ended_by = v_trainer) then
    raise exception 'removed_by_trainer';
  end if;

  if exists (select 1 from public.trainer_clients where client_id = auth.uid() and status = 'active' and trainer_id <> v_trainer) then
    raise exception 'already_has_trainer';
  end if;

  -- נועלים את רשימת המתאמנים של המאמן כדי ששתי הצטרפויות במקביל לא יעברו את המכסה
  perform 1 from public.trainer_profiles where user_id = v_trainer for update;
  select count(*) into v_active from public.trainer_clients
    where trainer_id = v_trainer and status = 'active' and client_id <> auth.uid();
  if v_active >= public.trainer_client_limit(v_trainer) then raise exception 'trainer_full'; end if;

  insert into public.trainer_clients (trainer_id, client_id, client_display_name, status, share_nutrition, consented_at, ended_at, ended_by)
  values (v_trainer, auth.uid(), btrim(p_client_name), 'active', coalesce(p_share_nutrition, false), now(), null, null)
  on conflict (trainer_id, client_id) do update
    set client_display_name = excluded.client_display_name, status = 'active',
        share_nutrition = excluded.share_nutrition, consented_at = now(), ended_at = null, ended_by = null;
  return v_trainer;
end;
$$;

-- המאמן מעדכן את פרטי הפרופיל של המתאמן. רק השדות ברשימה נכנסים - כל השאר (הסכמות, העדפות
-- תצוגה, ערכת נושא, מצב שעון...) נשארים בשליטת המתאמן בלבד.
create or replace function public.trainer_update_client_settings(p_client uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'gender', 'ageYears', 'heightCm', 'goals', 'experienceLevel', 'trainingDaysPerWeek',
    'scheduledWeekdays', 'sessionDurationMinutes', 'includeWarmup', 'availableEquipment',
    'injuries', 'focusMuscles', 'activityLevel', 'nutritionGoalMode', 'weeklyRatePercent',
    'activeRoutineId', 'defaultRestSeconds', 'nutritionAutoAdjustEnabled'
  ];
  v_settings jsonb;
  v_goals jsonb;
  v_days jsonb;
  v_data jsonb;
begin
  if not public.trainer_can_read(p_client) then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch'; end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_settings
  from jsonb_each(coalesce(p_patch -> 'settings', '{}'::jsonb)) where key = any (allowed);

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_goals
  from jsonb_each(coalesce(p_patch -> 'nutritionGoals', '{}'::jsonb))
  where key in ('calories', 'protein', 'carbs', 'fat') and jsonb_typeof(value) = 'number';

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_days
  from jsonb_each(coalesce(p_patch -> 'selectedDayByRoutine', '{}'::jsonb)) where jsonb_typeof(value) = 'number';

  select data into v_data from public.user_settings where user_id = p_client for update;
  v_data := coalesce(v_data, '{}'::jsonb);
  v_data := jsonb_set(v_data, '{settings}', coalesce(v_data -> 'settings', '{}'::jsonb) || v_settings);
  if v_goals <> '{}'::jsonb then
    v_data := jsonb_set(v_data, '{nutritionGoals}', coalesce(v_data -> 'nutritionGoals', '{}'::jsonb) || v_goals);
  end if;
  if v_days <> '{}'::jsonb then
    v_data := jsonb_set(v_data, '{selectedDayByRoutine}', coalesce(v_data -> 'selectedDayByRoutine', '{}'::jsonb) || v_days);
  end if;
  if p_patch ? 'targetWeight' and jsonb_typeof(p_patch -> 'targetWeight') in ('number', 'null') then
    v_data := jsonb_set(v_data, '{targetWeight}', p_patch -> 'targetWeight');
  end if;

  insert into public.user_settings (user_id, data) values (p_client, v_data)
  on conflict (user_id) do update set data = excluded.data;
end;
$$;

-- המתאמן משנה את ההסכמה לשיתוף התזונה
create or replace function public.set_trainer_nutrition_sharing(p_trainer uuid, p_share boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trainer_clients set share_nutrition = coalesce(p_share, false)
  where trainer_id = p_trainer and client_id = auth.uid() and status = 'active';
$$;

-- כל צד יכול לסיים את הקשר. ההודעות נשמרות לקריאה, אבל הגישה לנתונים נחסמת מיד.
create or replace function public.end_trainer_relation(p_trainer uuid, p_client uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trainer_clients set status = 'ended', ended_at = now(), ended_by = auth.uid()
  where trainer_id = p_trainer and client_id = p_client and status = 'active'
    and auth.uid() in (p_trainer, p_client);
$$;

-- סגירת חשבון המאמן: כל הקשרים הפעילים מסתיימים (הגישה לנתוני המתאמנים נחסמת) והפרופיל נמחק
create or replace function public.close_trainer_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  update public.trainer_clients set status = 'ended', ended_at = now(), ended_by = auth.uid()
  where trainer_id = auth.uid() and status = 'active';
  delete from public.trainer_profiles where user_id = auth.uid();
end;
$$;

create or replace function public.mark_trainer_thread_read(p_trainer uuid, p_client uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trainer_messages set read_at = now()
  where trainer_id = p_trainer and client_id = p_client and read_at is null
    and sender_id <> auth.uid()
    and auth.uid() in (p_trainer, p_client);
$$;

-- מכשיר נרשם להתראות. אותו מכשיר שעבר לחשבון אחר עובר איתו (לא נשאר אצל הקודם).
create or replace function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), 'ios', now())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- הפרופיל של המאמן המחובר, כולל קוד ההזמנה
create or replace function public.my_trainer_profile()
returns setof public.trainer_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.trainer_profiles where user_id = auth.uid();
$$;

-- מצב המאמן: מנוי, מכסה ומספר מתאמנים פעילים (למסך המאמן)
create or replace function public.my_trainer_status()
returns table (plan text, client_limit integer, active_clients integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select e.plan from public.entitlements e
              where e.user_id = auth.uid() and (e.expires_at is null or e.expires_at > now())), 'free'),
    public.trainer_client_limit(auth.uid()),
    (select count(*)::integer from public.trainer_clients tc where tc.trainer_id = auth.uid() and tc.status = 'active');
$$;

-- הרשאות הרצה: רק משתמשים מחוברים, ורק הפונקציות שהאפליקציה צריכה
revoke all on function public.trainer_can_read(uuid, boolean) from public, anon;
revoke all on function public.is_client_of(uuid) from public, anon;
revoke all on function public.trainer_relation_active(uuid, uuid) from public, anon;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.log_trainer_activity() from public, anon, authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;
revoke all on function public.trainer_client_limit(uuid) from public, anon, authenticated;
revoke all on function public.check_code_attempts() from public, anon, authenticated;
revoke all on function public.become_trainer(text, text) from public, anon;
revoke all on function public.rotate_trainer_code() from public, anon;
revoke all on function public.preview_trainer_code(text) from public, anon;
revoke all on function public.join_trainer(text, text, boolean) from public, anon;
revoke all on function public.trainer_update_client_settings(uuid, jsonb) from public, anon;
revoke all on function public.set_trainer_nutrition_sharing(uuid, boolean) from public, anon;
revoke all on function public.end_trainer_relation(uuid, uuid) from public, anon;
revoke all on function public.close_trainer_account() from public, anon;
revoke all on function public.mark_trainer_thread_read(uuid, uuid) from public, anon;
revoke all on function public.register_push_token(text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.my_trainer_profile() from public, anon;
revoke all on function public.my_trainer_status() from public, anon;

grant execute on function public.trainer_can_read(uuid, boolean) to authenticated;
grant execute on function public.is_client_of(uuid) to authenticated;
grant execute on function public.trainer_relation_active(uuid, uuid) to authenticated;
grant execute on function public.become_trainer(text, text) to authenticated;
grant execute on function public.rotate_trainer_code() to authenticated;
grant execute on function public.preview_trainer_code(text) to authenticated;
grant execute on function public.join_trainer(text, text, boolean) to authenticated;
grant execute on function public.trainer_update_client_settings(uuid, jsonb) to authenticated;
grant execute on function public.set_trainer_nutrition_sharing(uuid, boolean) to authenticated;
grant execute on function public.end_trainer_relation(uuid, uuid) to authenticated;
grant execute on function public.close_trainer_account() to authenticated;
grant execute on function public.mark_trainer_thread_read(uuid, uuid) to authenticated;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.my_trainer_profile() to authenticated;
grant execute on function public.my_trainer_status() to authenticated;

-- הודעות ושינויים בזמן אמת (Realtime מכבד את מדיניות ה-select שלמעלה)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trainer_messages') then
    alter publication supabase_realtime add table public.trainer_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trainer_activity') then
    alter publication supabase_realtime add table public.trainer_activity;
  end if;
end $$;
