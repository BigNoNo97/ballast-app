// ייבוא היסטוריה מאפליקציות אחרות: קורא את הקבצים שנבחרו (ZIP או CSV), מזהה את המקור
// ומחזיר אימונים בפורמט של Ballast. נתמך: Planfit, Strong, Hevy.
import { unzipSync, strFromU8 } from 'fflate';
import { Exercise } from '../../types';
import { isPlanfitExport, parsePlanfitExport } from './planfit';
import { isHevyExport, isStrongExport, parseHevyExport, parseStrongExport } from './strongHevy';
import type { ImportResult } from './generic';

export type ExternalImportResult = ImportResult & {
  source: 'Planfit' | 'Strong' | 'Hevy' | 'AI';
  /** Strong בלי עמודת יחידות: המשקלים נקראו ביחידה הזו */
  assumedUnit?: 'kg' | 'lbs';
};

async function readFiles(fileList: File[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of fileList) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip') || file.type === 'application/zip') {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      Object.entries(entries).forEach(([name, data]) => {
        if (name.toLowerCase().endsWith('.csv') && !name.startsWith('__MACOSX')) files[name] = strFromU8(data);
      });
    } else if (lower.endsWith('.csv') || file.type === 'text/csv') {
      files[file.name] = await file.text();
    }
  }
  return files;
}

export async function parseExternalExport(
  fileList: File[],
  library: Exercise[],
  weightUnit: 'kg' | 'lbs' = 'kg'
): Promise<ExternalImportResult> {
  const files = await readFiles(fileList);
  if (Object.keys(files).length === 0) {
    throw new Error('לא נמצאו קובצי CSV. בחר את קובץ ה-ZIP או ה-CSV שקיבלת מהאפליקציה הקודמת.');
  }
  if (isPlanfitExport(files)) {
    return { source: 'Planfit', ...parsePlanfitExport(files, new Set(library.map((e) => e.id))) };
  }
  if (isHevyExport(files)) {
    return { source: 'Hevy', ...parseHevyExport(files, library) };
  }
  if (isStrongExport(files)) {
    const hasUnit = Object.values(files).some((t) => /weight unit/i.test(t.slice(0, 600)));
    return { source: 'Strong', ...parseStrongExport(files, library, weightUnit), assumedUnit: hasUnit ? undefined : weightUnit };
  }
  throw new Error(
    'הקובץ לא זוהה. אפשר לייבא ייצוא של Planfit (ZIP), Strong (CSV) או Hevy (CSV). מאפליקציה אחרת או ממחברת - נסה "ייבוא מצילום או טקסט".'
  );
}
