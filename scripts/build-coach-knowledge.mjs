// בונה את מאגר הידע של צ'אט ה-AI מתוך מאגרי המקורות של האפליקציה (מוח התזונה ומוח האימונים),
// כדי שיהיה מקור אמת אחד: מעדכנים מחקר ב-evidence.ts, מריצים את הסקריפט, ומעלים את הפונקציה.
//   node scripts/build-coach-knowledge.mjs
//   supabase functions deploy ai-coach
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase/functions/_shared/coachKnowledge.ts');

const tmp = mkdtempSync(join(tmpdir(), 'coach-knowledge-'));
const bundle = join(tmp, 'registries.mjs');
await build({
  stdin: {
    contents: `
      export { EVIDENCE, EVIDENCE_REVIEWED_AT } from './src/services/nutrition/evidence.ts';
      export { TRAINING_EVIDENCE, TRAINING_EVIDENCE_REVIEWED_AT } from './src/services/training/evidence.ts';
      export { injuryExplanation, JOINT_AREAS } from './src/services/training/injuries.ts';
      export { NUTRIENTS } from './src/services/nutrition/nutrients.ts';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'error',
});
const reg = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

const section = (title, registry) =>
  `## ${title}\n` +
  Object.values(registry)
    .map((s) => `- [${s.id}] (${s.kind}) ${s.finding}\n  מקור: ${s.citation} — ${s.url}`)
    .join('\n');

const injuries = reg.JOINT_AREAS.map((area) => {
  const { text, evidence } = reg.injuryExplanation(area);
  return `- ${text} (מקורות: ${evidence.join(', ')})`;
}).join('\n');

const nutrients = reg.NUTRIENTS.map((n) => {
  const dv =
    typeof n.dailyValue === 'function'
      ? `${n.dailyValue(2000)} ${n.unit} (בתפריט של 2,000 קק"ל)`
      : n.dailyValue
        ? `${n.dailyValue} ${n.unit}`
        : null;
  return `- ${n.label}${dv ? `: ${n.kind === 'limit' ? 'עד' : 'יעד'} ${dv}` : ''}`;
}).join('\n');

const text = [
  `# מאגר המקורות של Ballast (נבדק לאחרונה: תזונה ${reg.EVIDENCE_REVIEWED_AT}, אימונים ${reg.TRAINING_EVIDENCE_REVIEWED_AT})`,
  'אלה המקורות שעליהם בנויים מנועי האפליקציה. כשתשובה נשענת על אחד מהם, ציין אותו בקצרה (שם המחבר ושנה).',
  section('מוח התזונה', reg.EVIDENCE),
  section('מוח האימונים', reg.TRAINING_EVIDENCE),
  `## כללי פציעות במחולל התוכניות\n${injuries}`,
  `## רכיבי התזונה שהאפליקציה עוקבת אחריהם (ערכים יומיים לפי FDA)\n${nutrients}`,
].join('\n\n');

writeFileSync(
  out,
  `// נוצר אוטומטית ע"י scripts/build-coach-knowledge.mjs מתוך מאגרי המקורות באפליקציה - לא לערוך ידנית.\n` +
    `export const COACH_KNOWLEDGE = ${JSON.stringify(text)};\n`
);
console.log(`wrote ${out} (${text.length} chars)`);
