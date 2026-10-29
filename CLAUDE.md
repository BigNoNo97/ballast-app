# CLAUDE.md

## Supabase migrations

Every migration that creates a table in `public` must, in the same file:

1. Grant the Data API roles what they need. Supabase stopped doing this automatically on October 30, 2026, so a table without grants is unreachable from supabase-js (`permission denied`, error 42501):

   ```sql
   grant select, insert, update, delete on public.<table> to authenticated, service_role;
   -- grant select on public.<table> to anon;  -- only if signed-out users must read it
   ```

2. Enable RLS and add the owner policies, as in the existing migrations:

   ```sql
   alter table public.<table> enable row level security;
   ```
