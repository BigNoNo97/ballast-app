// npm run test:db - runs the real Ballast migrations on PGlite (Postgres 17 in WASM) and exercises
// the trainer RLS + RPCs as different users.
//
// What this does NOT cover (stubs below): Supabase's real auth.uid() (here it reads the same
// request.jwt.claim.sub setting, but from a stub), pgcrypto's gen_random_bytes (stubbed with
// md5(random())), Supabase's default grants, and Realtime. Verify those against the real
// project after `supabase db push` (see the read-only checks at the end of the trainer docs).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const MIG = new URL('../migrations/', import.meta.url);
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema extensions;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile
    as $$ select substring(decode(md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $$;
  create schema storage; create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- the pre-2026-10-30 Supabase default: new public tables are granted to the API roles
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);

for (const f of [
  '20260822000000_init_schema.sql',
  '20260918080427_exercise_progress.sql',
  '20261006000000_apple_tokens.sql',
  '20261006000100_progress_photos_limits.sql',
  '20261026000000_harden_apple_tokens_grants.sql',
  '20261026000100_ai_coach.sql',
  '20261027000000_trainers.sql',
]) {
  try {
    await db.exec(readFileSync(new URL(f, MIG), 'utf8'));
  } catch (e) {
    if (f.includes('photos_limits')) continue; // touches storage internals we don't stub
    console.error('MIGRATION FAILED', f, e.message);
    process.exit(1);
  }
}

const id = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const T = id(1), C1 = id(2), C2 = id(3), C3 = id(4), X = id(5), T2 = id(6);
const EXTRA = [7, 8, 9, 10].map(id);
await db.exec(`insert into auth.users values ${[T, C1, C2, C3, X, T2, ...EXTRA].map((u) => `('${u}')`).join(',')}`);

async function as(user, sql, params = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function asService(sql) {
  await db.exec('set role service_role');
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
const count = async (user, sql, params) => (await as(user, sql, params)).rows.length;

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };
async function expectError(promise, match, name) {
  try { await promise; ok(false, `${name} (no error)`); }
  catch (e) { ok(!match || new RegExp(match).test(e.message), `${name} -> ${e.message}`); }
}

// --- data owned by C1 and T
await as(C1, `insert into public.workouts (id, user_id, data) values ('w1', '${C1}', '{"title":"c1 workout"}')`);
await as(C1, `insert into public.routines (id, user_id, data) values ('r1', '${C1}', '{"id":"r1","title":"Dana plan"}')`);
await as(C1, `insert into public.nutrition_entries (id, user_id, data) values ('n1', '${C1}', '{"foodName":"egg"}')`);
await as(C1, `insert into public.progress_photos (id, user_id, data) values ('p1', '${C1}', '{}')`);
await as(C1, `insert into public.food_items (id, user_id, data) values ('f1', '${C1}', '{}')`);
await as(C1, `insert into public.user_settings (user_id, data) values ('${C1}', '{"settings":{"ageYears":30,"theme":"dark","aiCoachConsentAt":0},"nutritionGoals":{"calories":2000,"protein":120,"carbs":200,"fat":60},"targetWeight":70}')`);
await as(T, `insert into public.workouts (id, user_id, data) values ('wt', '${T}', '{"title":"trainer workout"}')`);
ok((await db.query(`select count(*)::int n from public.trainer_activity`)).rows[0].n === 0, 'own writes are not logged as trainer activity');

// --- becoming a trainer
const prof = (await as(T, `select * from public.become_trainer('Coach Dan', 'strength coach')`)).rows[0];
ok(/^[A-Z2-9]{8}$/.test(prof.invite_code), `become_trainer gives code ${prof.invite_code}`);
const code = prof.invite_code;
ok((await count(X, `select user_id, display_name from public.trainer_profiles`)) === 0, 'stranger cannot list trainer profiles');
ok((await as(C1, `select * from public.preview_trainer_code($1)`, [code.toLowerCase()])).rows[0]?.display_name === 'Coach Dan', 'client previews code (case-insensitive)');
ok((await count(T, `select * from public.preview_trainer_code($1)`, [code])) === 0, 'trainer previewing own code -> nothing');
await expectError(as(null, `select public.join_trainer($1, 'anon', false)`, [code]), 'permission denied', 'anon cannot join');
await expectError(as(T, `select public.join_trainer($1, 'me', false)`, [code]), 'own_code', 'trainer cannot join self');
ok((await as(C1, `select public.join_trainer('ZZZZZZZZ', 'Dana', false) as t`)).rows[0].t === null, 'bad code -> null (and counted)');

// --- joining without nutrition sharing
await as(C1, `select public.join_trainer($1, 'Dana', false)`, [code]);
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 1, 'trainer reads client workouts');
ok((await count(T, `select * from public.user_settings where user_id = $1`, [C1])) === 1, 'trainer reads client settings');
ok((await count(T, `select * from public.nutrition_entries where user_id = $1`, [C1])) === 0, 'nutrition hidden without consent');
ok((await count(T, `select * from public.progress_photos where user_id = $1`, [C1])) === 0, 'progress photos never shared');
ok((await count(T, `select * from public.food_items where user_id = $1`, [C1])) === 0, 'personal food DB never shared');
ok((await count(X, `select * from public.workouts where user_id = $1`, [C1])) === 0, 'stranger reads nothing');
ok((await as(C1, `select display_name from public.trainer_profiles`)).rows[0]?.display_name === 'Coach Dan', 'client sees trainer name');
await expectError(as(C1, `select invite_code from public.trainer_profiles`), 'permission denied', 'client cannot read invite code column');
ok((await as(T, `select * from public.my_trainer_profile()`)).rows[0]?.invite_code === code, 'trainer reads own code via RPC');
ok((await as(T, `select id from public.workouts where user_id = $1`, [T])).rows.map((r) => r.id).join() === 'wt', "trainer's own sync query unaffected");

// --- trainer manages the client's training data
ok((await as(T, `update public.workouts set data = '{"title":"edited by coach"}' where user_id = '${C1}' and id = 'w1' returning id`)).rows.length === 1, 'trainer edits a client workout');
await as(T, `insert into public.routines (id, user_id, data) values ('r2', '${C1}', '{"id":"r2","title":"Coach plan"}')`);
ok((await count(C1, `select * from public.routines where user_id = $1 and id = 'r2'`, [C1])) === 1, 'trainer creates a routine for the client');
await as(T, `insert into public.body_weight_entries (id, user_id, data) values ('bw1', '${C1}', '{"id":"bw1","weightKg":71}')`);
ok((await as(T, `delete from public.routines where user_id = '${C1}' and id = 'r1' returning id`)).rows.length === 1, 'trainer deletes a client routine');
const acts = (await as(C1, `select table_name, row_id, action from public.trainer_activity order by id`)).rows;
ok(acts.length === 4 && acts.map((a) => `${a.table_name}:${a.action}`).join() === 'workouts:update,routines:insert,body_weight_entries:insert,routines:delete', `client sees the activity log ${JSON.stringify(acts.map((a) => a.action))}`);
ok((await count(X, `select * from public.trainer_activity`)) === 0, 'stranger sees no activity');
await expectError(as(T, `insert into public.trainer_activity (trainer_id, client_id, table_name, row_id, action) values ($1, $2, 'x', 'x', 'insert')`, [T, C1]), 'permission denied', 'activity log cannot be forged');
const touched = (await db.query(`select updated_at > now() - interval '1 minute' as fresh from public.workouts where id = 'w1'`)).rows[0].fresh;
ok(touched, 'updated_at is bumped on update');
await expectError(as(T, `insert into public.progress_photos (id, user_id, data) values ('evil', '${C1}', '{}')`), 'row-level security', 'trainer cannot write progress photos');
await expectError(as(T, `insert into public.nutrition_entries (id, user_id, data) values ('n2', '${C1}', '{}')`), 'row-level security', 'trainer cannot write nutrition without consent');
await expectError(as(X, `insert into public.workouts (id, user_id, data) values ('evil', '${C1}', '{}')`), 'row-level security', 'stranger cannot write client data');
ok((await as(T2, `update public.workouts set data = '{}' where user_id = '${C1}' returning id`)).rows.length === 0, 'another trainer cannot edit');

// --- settings: whitelist only
ok((await as(T, `update public.user_settings set data = '{}' where user_id = '${C1}' returning 1`)).rows.length === 0, 'direct settings update affects nothing');
await as(T, `select public.trainer_update_client_settings($1, $2)`, [C1, JSON.stringify({
  settings: { heightCm: 172, ageYears: 31, activeRoutineId: 'r2', theme: 'light', aiCoachConsentAt: 123, aiCoachShareData: true },
  nutritionGoals: { calories: 2200, protein: 140, hacked: 1, fat: 'x' },
  targetWeight: 68,
  selectedDayByRoutine: { r2: 1 },
})]);
const blob = (await as(C1, `select data from public.user_settings where user_id = $1`, [C1])).rows[0].data;
ok(blob.settings.heightCm === 172 && blob.settings.ageYears === 31 && blob.settings.activeRoutineId === 'r2', 'whitelisted fields updated');
ok(blob.settings.theme === 'dark' && blob.settings.aiCoachConsentAt === 0 && !('aiCoachShareData' in blob.settings), 'consents and personal prefs untouched');
ok(blob.nutritionGoals.calories === 2200 && blob.nutritionGoals.protein === 140 && blob.nutritionGoals.carbs === 200 && blob.nutritionGoals.fat === 60 && !('hacked' in blob.nutritionGoals), 'nutrition goals merged, junk dropped');
ok(blob.targetWeight === 68 && blob.selectedDayByRoutine?.r2 === 1, 'target weight + selected day set');
await expectError(as(X, `select public.trainer_update_client_settings($1, '{"settings":{"heightCm":1}}')`, [C1]), 'forbidden', 'stranger cannot patch settings');

// --- nutrition consent on, then off again mid-relationship
await as(C1, `select public.set_trainer_nutrition_sharing($1, true)`, [T]);
ok((await count(T, `select * from public.nutrition_entries where user_id = $1`, [C1])) === 1, 'nutrition visible after consent');
await as(T, `insert into public.nutrition_entries (id, user_id, data) values ('n2', '${C1}', '{"foodName":"rice"}')`);
ok((await count(C1, `select * from public.nutrition_entries where user_id = $1`, [C1])) === 2, 'trainer logs food with consent');
await as(C1, `select public.set_trainer_nutrition_sharing($1, false)`, [T]);
ok((await count(T, `select * from public.nutrition_entries where user_id = $1`, [C1])) === 0, 'turning sharing off hides nutrition immediately');

// --- relationship table is read-only for users
await expectError(as(C1, `update public.trainer_clients set share_nutrition = true`), 'permission denied', 'no direct update on trainer_clients');
await expectError(as(X, `insert into public.trainer_clients (trainer_id, client_id, client_display_name) values ('${T}', '${X}', 'x')`), 'permission denied', 'no direct insert on trainer_clients');
await expectError(as(T, `update public.trainer_profiles set invite_code = 'AAAAAAAA'`), 'permission denied', 'trainer cannot choose own invite code');
ok((await as(T, `update public.trainer_profiles set display_name = 'Coach Danny' returning display_name`)).rows[0]?.display_name === 'Coach Danny', 'trainer edits own name');

// --- client limit (free trainer = 5)
await as(C2, `select public.join_trainer($1, 'Avi', false)`, [code]);
for (const u of EXTRA.slice(0, 3)) await as(u, `select public.join_trainer($1, 'Extra', false)`, [code]);
await expectError(as(C3, `select public.join_trainer($1, 'Noa', false)`, [code]), 'trainer_full', 'sixth client blocked on free plan');
await asService(`insert into public.entitlements (user_id, plan) values ('${T}', 'trainer')`);
await as(C3, `select public.join_trainer($1, 'Noa', true)`, [code]);
const status = (await as(T, `select * from public.my_trainer_status()`)).rows[0];
ok(status.plan === 'trainer' && status.client_limit === 100 && status.active_clients === 6, `my_trainer_status ${JSON.stringify(status)}`);
await expectError(as(C1, `select public.trainer_client_limit($1)`, [T]), 'permission denied', 'limit function not callable directly');

// --- one active trainer per client
await as(T2, `select * from public.become_trainer('Other Coach')`);
const code2 = (await as(T2, `select invite_code from public.my_trainer_profile()`)).rows[0].invite_code;
await expectError(as(C1, `select public.join_trainer($1, 'Dana', false)`, [code2]), 'already_has_trainer', 'client cannot have two active trainers');

// --- messages
await as(C1, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $2, 'hi coach')`, [T, C1]);
await as(T, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $1, 'hi Dana')`, [T, C1]);
await expectError(as(X, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $3, 'spam')`, [T, C1, X]), 'violates', 'stranger cannot post into a thread');
await expectError(as(C1, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $1, 'forged')`, [T, C1]), 'row-level security', 'cannot forge sender');
await expectError(as(C1, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body, pushed_at) values ($1, $2, $2, 'x', now())`, [T, C1]), 'row-level security', 'cannot pre-mark as pushed');
await expectError(as(C1, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $2, '   ')`, [T, C1]), 'check', 'empty message rejected');
ok((await count(C2, `select * from public.trainer_messages`)) === 0, "another client doesn't see Dana's thread");
await as(T, `select public.mark_trainer_thread_read($1, $2)`, [T, C1]);
const msgs = (await as(C1, `select body, read_at from public.trainer_messages order by created_at`)).rows;
ok(msgs.find((m) => m.body === 'hi coach').read_at && !msgs.find((m) => m.body === 'hi Dana').read_at, 'mark read only marks the other side');
await expectError(as(C1, `update public.trainer_messages set body = 'edited'`), 'permission denied', 'messages are immutable');

// --- push tokens
const TOKEN = 'a'.repeat(64);
await as(C1, `select public.register_push_token($1)`, [TOKEN]);
ok((await count(C1, `select * from public.push_tokens`)) === 1, 'device registers for push');
ok((await count(X, `select * from public.push_tokens`)) === 0, "others can't see tokens");
await as(X, `select public.register_push_token($1)`, [TOKEN]);
ok((await count(C1, `select * from public.push_tokens`)) === 0 && (await count(X, `select * from public.push_tokens`)) === 1, 'same device moves to the new account');
await expectError(as(C1, `insert into public.push_tokens (token, user_id) values ($1, $2)`, ['b'.repeat(64), C1]), 'permission denied', 'no direct token insert');
await as(C1, `select public.unregister_push_token($1)`, [TOKEN]);
ok((await count(X, `select * from public.push_tokens`)) === 1, "can't unregister someone else's device");

// --- rate limiting wrong codes
for (let i = 0; i < 20; i++) await as(X, `select * from public.preview_trainer_code('WRONG${String(i).padStart(3, '2')}')`);
await expectError(as(X, `select * from public.preview_trainer_code('WRONGXXX')`), 'too_many_attempts', '21st wrong code in an hour -> blocked');
await expectError(as(X, `select public.join_trainer($1, 'x', false)`, [code]), 'too_many_attempts', 'even a valid code is blocked while rate-limited');

// --- ending the relationship
await as(X, `select public.end_trainer_relation($1, $2)`, [T, C1]);
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 1, 'stranger cannot end the relationship');
await as(C1, `select public.end_trainer_relation($1, $2)`, [T, C1]);
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 0, 'access revoked immediately after client ends');
ok((await as(T, `update public.workouts set data = '{}' where user_id = '${C1}' returning id`)).rows.length === 0, 'no writes after end');
await expectError(as(T, `select public.trainer_update_client_settings($1, '{"settings":{"heightCm":1}}')`, [C1]), 'forbidden', 'no settings writes after end');
await expectError(as(T, `insert into public.trainer_messages (trainer_id, client_id, sender_id, body) values ($1, $2, $1, 'come back')`, [T, C1]), 'row-level security', 'no new messages after end');
ok((await count(C1, `select * from public.trainer_messages`)) === 2, 'history stays readable');
await as(C1, `select public.join_trainer($1, 'Dana', false)`, [code2]);
ok((await count(T2, `select * from public.workouts where user_id = $1`, [C1])) === 1, 'client can switch to a new trainer');
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 0, 'old trainer still has no access');

// --- trainer removes a client: no self-rejoin
await as(T2, `select public.end_trainer_relation($1, $2)`, [T2, C1]);
await expectError(as(C1, `select public.join_trainer($1, 'Dana', false)`, [code2]), 'removed_by_trainer', 'client removed by trainer cannot rejoin alone');
await as(C1, `select public.join_trainer($1, 'Dana', false)`, [code]);
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 1, 'client who left on their own can return');

// --- code rotation
const newCode = (await as(T, `select public.rotate_trainer_code() as c`)).rows[0].c;
ok(newCode !== code && /^[A-Z2-9]{8}$/.test(newCode), 'code rotated');
ok((await count(C2, `select * from public.preview_trainer_code($1)`, [code])) === 0, 'old code dead');

// --- closing the trainer account ends every relationship
await as(T, `select public.close_trainer_account()`);
ok((await count(T, `select * from public.workouts where user_id = $1`, [C1])) === 0, 'closed trainer loses access to all clients');
ok((await count(T, `select * from public.my_trainer_profile()`)) === 0, 'trainer profile deleted');
ok((await as(C2, `select public.join_trainer($1, 'Avi', false) as t`, [newCode])).rows[0].t === null, 'closed trainer code no longer works');

// --- account deletion cascades
await db.exec(`delete from auth.users where id = '${C2}'`);
ok((await db.query(`select count(*)::int as n from public.trainer_clients where client_id = '${C2}'`)).rows[0].n === 0, 'deleting a user removes their relationships');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
