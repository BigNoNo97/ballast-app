-- Explicit Data API grants for every table.
-- From October 30, 2026 Supabase no longer grants anon/authenticated/service_role
-- access to new tables in public automatically. The live project's existing
-- tables keep their grants, so this changes nothing there; it makes a fresh
-- project, branch or `supabase db reset` end up with the same access.
-- anon gets nothing: every table is per-user behind RLS.

grant select, insert, update, delete on
  public.workouts,
  public.routines,
  public.custom_exercises,
  public.body_weight_entries,
  public.measurement_categories,
  public.measurement_entries,
  public.progress_photos,
  public.food_items,
  public.nutrition_entries,
  public.user_settings,
  public.exercise_progress
to authenticated, service_role;
