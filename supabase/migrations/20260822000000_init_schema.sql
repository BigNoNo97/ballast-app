-- Per-user cloud storage for the gym tracker app.
-- Every table stores its record as JSONB, mirroring the shapes already used
-- client-side (WorkoutSession, RoutineTemplate, Exercise, etc.) so the app's
-- existing data model doesn't need to change - only where it's persisted.

create table if not exists public.workouts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.routines (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.custom_exercises (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.body_weight_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.measurement_categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.measurement_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.progress_photos (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.food_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.nutrition_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Single row per user: app settings + nutrition goals + selected-day-per-routine map.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every table only readable/writable by its own owner.
alter table public.workouts enable row level security;
alter table public.routines enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.body_weight_entries enable row level security;
alter table public.measurement_categories enable row level security;
alter table public.measurement_entries enable row level security;
alter table public.progress_photos enable row level security;
alter table public.food_items enable row level security;
alter table public.nutrition_entries enable row level security;
alter table public.user_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'workouts', 'routines', 'custom_exercises', 'body_weight_entries',
    'measurement_categories', 'measurement_entries', 'progress_photos',
    'food_items', 'nutrition_entries', 'user_settings'
  ]
  loop
    execute format('create policy "owner_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "owner_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "owner_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "owner_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Storage bucket for progress photos (private, per-user folder).
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "owner_read_photos" on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner_upload_photos" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner_delete_photos" on storage.objects for delete
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
