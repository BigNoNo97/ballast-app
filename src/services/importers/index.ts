// ייבוא היסטוריה מאפליקציות אחרות: קורא את הקבצים שנבחרו (ZIP או CSV), מזהה את המקור
// ומחזיר אימונים בפורמט של Ballast. כרגע נתמך: Planfit.
import { unzipSync, strFromU8 } from 'fflate';
import { isPlanfitExport, parsePlanfitExport, PlanfitImportResult } from './planfit';

export type ExternalImportResult = PlanfitImportResult & { source: 'Planfit' };

async function readFiles(fileList: File[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip') || file.type === 'application/zip') {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      Object.entries(entries).forEach(([name, data]) => {
        if (name.toLowerCase().endsWith('.csv') && !name.startsWith('__MACOSX')) files[name] = strFromU8(data);
      });
    } else if (lower.endsWith('.csv')) {
      files[file.name] = await file.text();
    }
  }
  return files;
}

export async function parseExternalExport(fileList: File[], knownExerciseIds: Set<string>): Promise<ExternalImportResult> {
  const files = await readFiles(fileList);
  if (Object.keys(files).length === 0) {
    throw new Error('לא נמצאו קובצי CSV. בחר את קובץ ה-ZIP שקיבלת מהאפליקציה הקודמת (או את קובצי ה-CSV שבתוכו).');
  }
  if (isPlanfitExport(files)) {
    return { source: 'Planfit', ...parsePlanfitExport(files, knownExerciseIds) };
  }
  throw new Error('הקבצים לא זוהו. כרגע אפשר לייבא ייצוא של Planfit (קובץ ZIP עם workout_sessions.csv ו-sets.csv).');
}
