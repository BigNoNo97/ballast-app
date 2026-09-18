-- Per-exercise progressive-overload state for system-generated ("isGenerated") routines.
-- Same JSONB-per-row shape and RLS pattern as every other synced table in this project.

create table if not exists public.exercise_progress (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.exercise_progress enable row level security;

create policy "owner_select" on public.exercise_progress for select using (auth.uid() = user_id);
create policy "owner_insert" on public.exercise_progress for insert with check (auth.uid() = user_id);
create policy "owner_update" on public.exercise_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner_delete" on public.exercise_progress for delete using (auth.uid() = user_id);
