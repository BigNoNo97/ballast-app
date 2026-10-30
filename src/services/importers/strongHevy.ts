// ייבוא מ-Strong ומ-Hevy (קובץ CSV אחד בכל אחת). שתי האפליקציות משתמשות באותה שיטת שמות
// לתרגילים ("Bench Press (Barbell)"), ולכן הזיהוי מול המאגר משותף (generic.ts).
//
// Strong: Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds,
//   Notes, Workout Notes, RPE. בגרסאות חדשות גם Weight Unit / Distance Unit, ולפעמים מפריד ';'.
//   Set Order: מספר, או W (חימום), D (דרופ), F (כישלון). שורות "Rest Timer" - מדלגים.
//   המשקל ביחידה שהמשתמש בחר ב-Strong; כשאין עמודת יחידה - לפי weightUnit שמועבר.
// Hevy: title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
//   set_index, set_type (normal / warmup / dropset / failure), weight_kg או weight_lbs, reps,
//   distance_km או distance_miles, duration_seconds, rpe. תאריך: "26 Jan 2024, 18:05".
import { Exercise } from '../../types';
import { parseCsv } from './csv';
import { ImportResult, RawSet, RawWorkout, buildImport, stableKey } from './generic';

type Row = Record<string, string>;
const LB = 0.45359237;

const num = (v: string | undefined) => {
  const n = parseFloat((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function findCsv(files: Record<string, string>, requiredHeaders: string[]): Row[] | null {
  for (const text of Object.values(files)) {
    const head = text.slice(0, 600).toLowerCase();
    if (requiredHeaders.every((h) => head.includes(h))) return parseCsv(text);
  }
  return null;
}

export const isStrongExport = (files: Record<string, string>) => !!findCsv(files, ['exercise name', 'set order', 'workout name']);
export const isHevyExport = (files: Record<string, string>) => !!findCsv(files, ['exercise_title', 'set_index', 'start_time']);

/** קיבוץ שורות לאימונים ולתרגילים לפי סדר ההופעה בקובץ */
function group<T>(rows: T[], workoutKey: (r: T) => string, exerciseKey: (r: T) => string) {
  const workouts = new Map<string, { rows: T[]; exercises: Map<string, T[]> }>();
  rows.forEach((r) => {
    const wk = workoutKey(r);
    if (!workouts.has(wk)) workouts.set(wk, { rows: [], exercises: new Map() });
    const w = workouts.get(wk)!;
    w.rows.push(r);
    const ek = exerciseKey(r);
    if (!w.exercises.has(ek)) w.exercises.set(ek, []);
    w.exercises.get(ek)!.push(r);
  });
  return workouts;
}

// "2023-05-14 18:02:11" או "2023-05-14T18:02:11" - שעון מקומי
function parseIsoLocal(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0)) : null;
}

// משך ב-Strong: "1h 5m", "45m", "50s", או מספר שניות
function parseStrongDuration(v: string): number {
  if (/^\d+$/.test(v.trim())) return +v;
  let sec = 0;
  v.replace(/(\d+)\s*([hms])/g, (_, n, u) => {
    sec += +n * (u === 'h' ? 3600 : u === 'm' ? 60 : 1);
    return '';
  });
  return sec;
}

export function parseStrongExport(files: Record<string, string>, library: Exercise[], weightUnit: 'kg' | 'lbs'): ImportResult {
  const rows = (findCsv(files, ['exercise name', 'set order']) ?? []).filter((r) => r['Exercise Name'] && !/rest/i.test(r['Set Order']));
  if (!rows.length) throw new Error('לא נמצאו סטים בקובץ של Strong.');
  const workouts = group(rows, (r) => `${r.Date}|${r['Workout Name']}`, (r) => r['Exercise Name']);

  const raw: RawWorkout[] = [];
  workouts.forEach((w, key) => {
    const first = w.rows[0];
    const start = parseIsoLocal(first.Date);
    if (!start) return;
    raw.push({
      key: stableKey(key),
      title: first['Workout Name'],
      start,
      durationSec: parseStrongDuration(first.Duration || first['Workout Duration'] || ''),
      notes: first['Workout Notes'] || undefined,
      exercises: Array.from(w.exercises.entries()).map(([name, sets]) => ({
        name,
        notes: sets.find((s) => s.Notes)?.Notes,
        sets: sets.map((s): RawSet => {
          const unit = (s['Weight Unit'] || weightUnit).toLowerCase();
          const order = (s['Set Order'] || '').trim().toUpperCase();
          const distUnit = (s['Distance Unit'] || 'km').toLowerCase();
          const dist = num(s.Distance);
          return {
            weightKg: num(s.Weight) * (unit.startsWith('lb') ? LB : 1),
            reps: num(s.Reps),
            seconds: num(s.Seconds),
            distanceM: dist * (distUnit.startsWith('mi') ? 1609.344 : distUnit === 'm' ? 1 : 1000),
            kind: order === 'W' ? 'warmup' : order === 'D' ? 'drop' : order === 'F' ? 'failure' : 'normal',
            rpe: num(s.RPE) || undefined,
          };
        }),
      })),
    });
  });
  return buildImport('Strong', raw, library);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Hevy: "26 Jan 2024, 18:05" (שעון מקומי). גרסאות ישנות - ISO
function parseHevyDate(v: string): Date | null {
  const m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1], +m[4], +m[5]);
  return parseIsoLocal(v);
}

export function parseHevyExport(files: Record<string, string>, library: Exercise[]): ImportResult {
  const rows = (findCsv(files, ['exercise_title', 'set_index']) ?? []).filter((r) => r.exercise_title);
  if (!rows.length) throw new Error('לא נמצאו סטים בקובץ של Hevy.');
  const lbs = 'weight_lbs' in rows[0] && !('weight_kg' in rows[0]);
  const miles = 'distance_miles' in rows[0] && !('distance_km' in rows[0]);
  // תרגיל שמופיע פעמיים באותו אימון (למשל בסופרסט אחר) נשאר כרשומה נפרדת
  const workouts = group(rows, (r) => `${r.start_time}|${r.title}`, (r) => `${r.exercise_title}|${r.superset_id}|${r.exercise_notes}`);

  const raw: RawWorkout[] = [];
  workouts.forEach((w, key) => {
    const first = w.rows[0];
    const start = parseHevyDate(first.start_time);
    if (!start) return;
    const end = parseHevyDate(first.end_time);
    raw.push({
      key: stableKey(key),
      title: first.title,
      start,
      durationSec: end && end > start ? Math.round((end.getTime() - start.getTime()) / 1000) : 0,
      notes: first.description || undefined,
      exercises: Array.from(w.exercises.values()).map((sets) => ({
        name: sets[0].exercise_title,
        notes: sets[0].exercise_notes || undefined,
        sets: sets
          .sort((a, b) => num(a.set_index) - num(b.set_index))
          .map((s): RawSet => {
            const t = (s.set_type || '').toLowerCase();
            return {
              weightKg: lbs ? num(s.weight_lbs) * LB : num(s.weight_kg),
              reps: num(s.reps),
              seconds: num(s.duration_seconds),
              distanceM: miles ? num(s.distance_miles) * 1609.344 : num(s.distance_km) * 1000,
              kind: t === 'warmup' ? 'warmup' : t === 'dropset' ? 'drop' : t === 'failure' ? 'failure' : 'normal',
              rpe: num(s.rpe) || undefined,
            };
          }),
      })),
    });
  });
  return buildImport('Hevy', raw, library);
}
