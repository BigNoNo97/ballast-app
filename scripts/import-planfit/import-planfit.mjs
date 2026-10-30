#!/usr/bin/env node
// ייבוא היסטוריית אימונים מייצוא הנתונים של Planfit (קובצי CSV) לטבלאות של Ballast ב-Supabase.
// ברירת המחדל היא dry-run: הסקריפט רק קורא, ממיר ומדפיס סיכום. כתיבה לענן רק עם --apply.
// המיפוי המלא (שדות, יחידות, אזורי זמן, מה לא נכנס) מתועד ב-README.md שבתיקייה הזו.
//
// שימוש:
//   node scripts/import-planfit/import-planfit.mjs --dir <תיקיית ה-CSV>            # dry-run מקומי
//   node scripts/import-planfit/import-planfit.mjs --dir <dir> --user-id <uuid>     # dry-run + בדיקת חפיפות מול הענן
//   node scripts/import-planfit/import-planfit.mjs --dir <dir> --user-id <uuid> --apply
//
// משתני סביבה (רק לבדיקת חפיפות ול---apply): SUPABASE_URL (או VITE_SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY. מפתח ה-service role עוקף RLS - אף פעם לא לשמור אותו בגיט.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const ID_PREFIX = 'planfit-';
const WORKOUT_TITLE = 'אימון מ-Planfit';
const CHUNK = 200;

// ---------- args ----------

function parseArgs(argv) {
  const args = { apply: false, includeOverlaps: false, timesLocal: false, sample: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') args.dir = argv[++i];
    else if (a === '--user-id') args.userId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--apply') args.apply = true;
    else if (a === '--include-overlaps') args.includeOverlaps = true;
    else if (a === '--planfit-times-local') args.timesLocal = true;
    else if (a === '--sample') args.sample = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  args.userId = args.userId || process.env.BALLAST_USER_ID;
  return args;
}

const HELP = `Usage: node scripts/import-planfit/import-planfit.mjs --dir <csv dir> [options]

  --dir <path>              Folder with the Planfit CSVs (1_workout_sessions.csv, 2_exercises_per_session.csv, 3_sets.csv)
  --user-id <uuid>          Ballast user id (auth.users.id). Also BALLAST_USER_ID. Needed for --apply.
  --apply                   Write to Supabase. Without it nothing is written (dry run).
  --include-overlaps        Also import Planfit workouts on days that already have a Ballast workout.
  --planfit-times-local     Read Planfit timestamps as Asia/Jerusalem local time instead of UTC.
  --out <file>              Write the converted rows as JSON for inspection (keep it out of git).
  --sample                  Print one converted workout.
`;

// ---------- CSV ----------

// פרסר CSV מינימלי (RFC 4180: מרכאות, פסיקים ושורות חדשות בתוך מרכאות), בלי תלות חיצונית.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function readCsv(dir, suffix) {
  // Planfit מוסיף מספר בתחילת שם הקובץ; מחפשים לפי הסיומת כדי לא להיות תלויים בשם המדויק.
  const name = readdirSync(dir).find((f) => f.endsWith(suffix));
  if (!name) throw new Error(`Missing ${suffix} in ${dir}`);
  return parseCsv(readFileSync(join(dir, name), 'utf8'));
}

// ---------- time ----------

// אופסט (בדקות) של אזור זמן ברגע נתון, דרך Intl - בלי ספריית תאריכים.
function tzOffsetMinutes(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

// "2023-09-01 12:11:25.766000" -> epoch ms. ב-Planfit אין אזור זמן בחותמת; ברירת המחדל UTC.
export function parsePlanfitTime(s, { local = false, timeZone = 'Asia/Jerusalem' } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(s.trim());
  if (!m) return NaN;
  const ms = m[7] ? Math.round(Number(m[7].padEnd(6, '0')) / 1000) : 0;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
  if (!local) return naive;
  // שני סבבים כדי ליישב את מעברי שעון הקיץ.
  let utc = naive - tzOffsetMinutes(naive, timeZone) * 60000;
  utc = naive - tzOffsetMinutes(utc, timeZone) * 60000;
  return utc;
}

const isMidnightPlaceholder = (s) => /\s00:00:00(\.0+)?$/.test(s.trim());

// ---------- conversion ----------

const num = (v) => (v === '' || v == null ? NaN : Number(v));
const round1 = (n) => Math.round(n * 10) / 10;

function formatDuration(sec) {
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min && s) return `${min} דק׳ ${s} שנ׳`;
  if (min) return `${min} דק׳`;
  return `${s} שנ׳`;
}

function loadKnownExerciseIds() {
  const ids = new Set();
  for (const f of ['exercises.ts', 'importedExercises.ts', 'warmupExercises.ts']) {
    const text = readFileSync(join(REPO_ROOT, 'src', 'data', f), 'utf8');
    for (const m of text.matchAll(/\bid:\s*'([^']+)'/g)) ids.add(m[1]);
  }
  return ids;
}

export function convert({ sessions, entries, sets, exerciseMap, timesLocal = false }) {
  const report = {
    workouts: 0, exercises: 0, sets: 0,
    skipped: { emptyWorkouts: [], zeroRepSets: 0, cardioEntries: 0, plankSets: 0 },
    approxMatches: new Map(), customExercises: new Map(), dateOnlyWorkouts: 0,
  };
  const t = (s) => parsePlanfitTime(s, { local: timesLocal });

  const setsByEntry = new Map();
  for (const s of sets) {
    if (!setsByEntry.has(s.exercise_entry_id)) setsByEntry.set(s.exercise_entry_id, []);
    setsByEntry.get(s.exercise_entry_id).push(s);
  }
  const entriesByWorkout = new Map();
  for (const e of entries) {
    if (!entriesByWorkout.has(e.workout_id)) entriesByWorkout.set(e.workout_id, []);
    entriesByWorkout.get(e.workout_id).push(e);
  }

  const customExercises = new Map();
  const workouts = [];

  for (const w of sessions) {
    const dateOnly = isMidnightPlaceholder(w.started_at) && w.started_at.trim() === w.done_at.trim();
    // אימונים שהוזנו ידנית ב-Planfit מגיעים עם 00:00:00 - שמים אותם בצהרי היום (UTC) כדי שהתאריך לא יזוז.
    const startTime = dateOnly ? Date.parse(`${w.date}T12:00:00Z`) : t(w.started_at);
    const durationSec = Math.round((num(w.workout_minutes) || 0) * 60);
    const doneAt = dateOnly ? NaN : t(w.done_at);
    const endTime = Number.isFinite(doneAt) && doneAt > startTime ? doneAt : startTime + durationSec * 1000;
    if (dateOnly) report.dateOnlyWorkouts++;

    const cardioNotes = [];
    const exercises = [];
    const wEntries = (entriesByWorkout.get(w.workout_id) || [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || Number(a.exercise_entry_id) - Number(b.exercise_entry_id));

    for (const e of wEntries) {
      const name = e.exercise_name.trim();
      const mapping = exerciseMap[name];
      if (!mapping) throw new Error(`No mapping for Planfit exercise "${name}" - add it to exercise-map.json`);
      const eSets = (setsByEntry.get(e.exercise_entry_id) || []).slice().sort((a, b) => Number(a.set_id) - Number(b.set_id));

      if (mapping.cardio) {
        // ב-Planfit סט מסוג time: value2 = דקות, value3 = שניות. ל-Ballast אין סטים של זמן, אז רק הערה.
        const totalSec = eSets.reduce((acc, s) => acc + (num(s.value2) || 0) * 60 + (num(s.value3) || 0), 0);
        cardioNotes.push(totalSec > 0 ? `${mapping.cardio}: ${formatDuration(totalSec)}` : mapping.cardio);
        report.skipped.cardioEntries++;
        continue;
      }

      let exerciseId = mapping.ballastId;
      if (mapping.custom) {
        exerciseId = `${ID_PREFIX}ex-${e.training_model_id}`;
        if (!customExercises.has(exerciseId)) {
          customExercises.set(exerciseId, {
            id: exerciseId,
            nameHe: mapping.custom.nameHe,
            nameEn: name,
            muscle: mapping.custom.muscle,
            equipment: mapping.custom.equipment,
            alternatives: [],
            defaultSets: 3,
            defaultReps: 10,
            defaultRestSec: 90,
            isCustom: true,
          });
        }
        report.customExercises.set(name, (report.customExercises.get(name) || 0) + 1);
      }
      if (mapping.approx) report.approxMatches.set(name, mapping.ballastId);

      const isTime = e.type === 'time';
      const isBodyWeight = e.type === 'body_weight';
      const holdSeconds = [];
      const outSets = [];
      for (const s of eSets) {
        let weightKg;
        let reps;
        if (isTime) {
          // פלאנק וכדומה: סט אחד = החזקה אחת (כמו ברירת המחדל של plank ב-Ballast), הזמן נשמר בהערות.
          weightKg = 0;
          reps = 1;
          holdSeconds.push((num(s.value2) || 0) * 60 + (num(s.value3) || 0));
          report.skipped.plankSets++;
        } else if (isBodyWeight) {
          // ב-Planfit לתרגילי משקל גוף value1 = חזרות.
          weightKg = 0;
          reps = num(s.value1);
        } else {
          // normal: value1 = משקל (ק"ג), value2 = חזרות. עמודת weight קיימת רק מסוף ינואר 2026 ושווה ל-value1.
          const raw = Number.isFinite(num(s.weight)) && num(s.weight) > 0 ? num(s.weight) : num(s.value1);
          weightKg = s.weight_unit && s.weight_unit.toLowerCase().startsWith('lb') ? round1(raw * 0.45359237) : raw;
          reps = num(s.value2);
        }
        if (!Number.isFinite(reps) || reps <= 0) { report.skipped.zeroRepSets++; continue; }
        const completedAt = t(s.created_at);
        outSets.push({
          id: `${ID_PREFIX}set-${s.set_id}`,
          setNumber: outSets.length + 1,
          type: 'normal',
          weightKg: Number.isFinite(weightKg) ? weightKg : 0,
          reps,
          completed: true,
          ...(Number.isFinite(completedAt) ? { completedAt } : {}),
        });
      }
      if (outSets.length === 0) continue;
      const notes = holdSeconds.length ? `Planfit: ${holdSeconds.map(formatDuration).join(', ')}` : undefined;
      exercises.push({ exerciseId, sets: outSets, ...(notes ? { notes } : {}) });
    }

    if (exercises.length === 0 && cardioNotes.length === 0) {
      report.skipped.emptyWorkouts.push(w.date);
      continue;
    }

    const allSets = exercises.flatMap((x) => x.sets);
    const totalVolumeKg = round1(allSets.reduce((acc, s) => acc + s.weightKg * s.reps, 0));
    const notes = ['יובא מ-Planfit', cardioNotes.length ? `אירובי: ${cardioNotes.join(' · ')}` : null].filter(Boolean).join('\n');
    workouts.push({
      id: `${ID_PREFIX}${w.workout_id}`,
      title: WORKOUT_TITLE,
      startTime,
      endTime,
      durationSec,
      exercises,
      notes,
      isCompleted: true,
      totalVolumeKg,
      completedSetsCount: allSets.length,
    });
    report.workouts++;
    report.exercises += exercises.length;
    report.sets += allSets.length;
  }

  workouts.sort((a, b) => a.startTime - b.startTime);
  return { workouts, customExercises: [...customExercises.values()], report };
}

// ---------- Supabase ----------

async function getClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ymd = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

async function fetchExisting(client, userId) {
  const { data, error } = await client.from('workouts').select('id, data->startTime').eq('user_id', userId);
  if (error) throw error;
  const { data: settings, error: sErr } = await client.from('user_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (sErr) throw sErr;
  return { rows: data || [], hasSettingsRow: !!settings };
}

async function upsertAll(client, table, userId, items) {
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map((item) => ({ id: item.id, user_id: userId, data: item }));
    const { error } = await client.from(table).upsert(rows, { onConflict: 'user_id,id' });
    if (error) throw error;
  }
}

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) { console.log(HELP); process.exit(args.help ? 0 : 1); }

  const exerciseMap = JSON.parse(readFileSync(join(HERE, 'exercise-map.json'), 'utf8'));
  const known = loadKnownExerciseIds();
  const badIds = Object.entries(exerciseMap)
    .filter(([, v]) => v && v.ballastId && !known.has(v.ballastId))
    .map(([k, v]) => `${k} -> ${v.ballastId}`);
  if (badIds.length) throw new Error(`exercise-map.json points at unknown Ballast exercises:\n  ${badIds.join('\n  ')}`);

  const dir = resolve(args.dir);
  const sessions = readCsv(dir, 'workout_sessions.csv');
  const entries = readCsv(dir, 'exercises_per_session.csv');
  const sets = readCsv(dir, 'sets.csv');

  const { workouts, customExercises, report } = convert({ sessions, entries, sets, exerciseMap, timesLocal: args.timesLocal });

  const client = await getClient();
  let toWrite = workouts;
  let overlapDays = [];
  if (client && args.userId) {
    const existing = await fetchExisting(client, args.userId);
    if (!existing.hasSettingsRow) {
      console.warn('! No user_settings row for this user: the app will not pull cloud data on login. Open the app once while signed in first.');
    }
    const ballastDays = new Set(
      existing.rows.filter((r) => !String(r.id).startsWith(ID_PREFIX) && r.startTime).map((r) => ymd(Number(r.startTime))),
    );
    overlapDays = [...new Set(workouts.map((w) => ymd(w.startTime)).filter((d) => ballastDays.has(d)))].sort();
    if (!args.includeOverlaps) toWrite = workouts.filter((w) => !ballastDays.has(ymd(w.startTime)));
    const already = existing.rows.filter((r) => String(r.id).startsWith(ID_PREFIX)).length;
    if (already) console.log(`Already in Ballast from an earlier run: ${already} Planfit workouts (they will be overwritten in place, not duplicated).`);
  } else {
    console.log('(No Supabase credentials or --user-id: overlap check against existing Ballast workouts skipped.)');
  }

  const first = workouts[0];
  const last = workouts[workouts.length - 1];
  console.log(`\nPlanfit input: ${sessions.length} workouts, ${entries.length} exercise entries, ${sets.length} sets`);
  console.log(`Converted: ${report.workouts} workouts, ${report.exercises} exercises, ${report.sets} sets`);
  if (first) console.log(`Date range: ${ymd(first.startTime)} .. ${ymd(last.startTime)}`);
  console.log(`Timestamps read as: ${args.timesLocal ? 'Asia/Jerusalem local time' : 'UTC'}; date-only (manually logged) workouts: ${report.dateOnlyWorkouts}`);
  console.log(`Skipped: ${report.skipped.emptyWorkouts.length} workouts with no exercises (${report.skipped.emptyWorkouts.join(', ') || '-'}), ` +
    `${report.skipped.zeroRepSets} sets with 0 reps, ${report.skipped.cardioEntries} cardio entries kept as workout notes only`);
  console.log(`Timed holds (plank) imported as 1 rep with the duration in notes: ${report.skipped.plankSets} sets`);
  if (report.customExercises.size) console.log(`New custom exercises: ${[...report.customExercises.keys()].join(', ')}`);
  if (report.approxMatches.size) {
    console.log('Close (not exact) matches:');
    for (const [k, v] of report.approxMatches) console.log(`  ${k} -> ${v}`);
  }
  if (overlapDays.length) {
    console.log(`Days that already have a Ballast workout: ${overlapDays.length} (${overlapDays.join(', ')})` +
      (args.includeOverlaps ? ' - importing anyway (--include-overlaps)' : ' - Planfit workouts on these days are left out'));
  }
  console.log(`To write: ${toWrite.length} workouts to public.workouts, ${customExercises.length} rows to public.custom_exercises`);

  if (args.sample && toWrite[0]) console.log('\nSample workout:\n' + JSON.stringify(toWrite.find((w) => w.exercises.length > 2) || toWrite[0], null, 2));
  if (args.out) {
    writeFileSync(args.out, JSON.stringify({ workouts: toWrite, customExercises }, null, 2));
    console.log(`Wrote converted rows to ${args.out}`);
  }

  if (!args.apply) { console.log('\nDry run: nothing was written. Add --apply to write.'); return; }
  if (!client) throw new Error('--apply needs SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  if (!args.userId) throw new Error('--apply needs --user-id (or BALLAST_USER_ID)');

  console.log('\nMake sure Ballast is closed on every device: an open app pushes its local list and deletes rows it does not know.');
  await upsertAll(client, 'custom_exercises', args.userId, customExercises);
  await upsertAll(client, 'workouts', args.userId, toWrite);
  console.log(`Done: upserted ${toWrite.length} workouts and ${customExercises.length} custom exercises. Open the app to pull them in.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
