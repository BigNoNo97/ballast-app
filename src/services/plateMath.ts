// מחשבון צלחות: איך להעמיס מוט למשקל מסוים עם הצלחות שיש במכון.
// עובדים ביחידות של 0.25 ק"ג (הצלחת הקטנה ביותר הנפוצה היא 1.25 = 5 יחידות), ומחשבים
// בתכנות דינמי את ההעמסה עם הכי מעט צלחות לכל צד - לא חמדנות, שנכשלת למשל ב-30 ק"ג לצד
// כשיש רק 20 ו-15 (15+15 עובד, 20+... לא).

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_KG = 20;

export interface PlateSetup {
  barKg: number;
  /** סוגי הצלחות שיש במכון (כל סוג - בכמות לא מוגבלת, בזוגות) */
  plates: number[];
}

export interface PlateLoad {
  /** הצלחות לצד אחד, מהכבדה לקלה (בסדר שמעמיסים אותן) */
  perSide: number[];
  /** המשקל הכולל שהעמסה הזו נותנת */
  totalKg: number;
}

export interface PlateResult {
  /** העמסה מדויקת למשקל המבוקש, או null אם אי אפשר להגיע אליו בדיוק */
  exact: PlateLoad | null;
  /** כשאין התאמה מדויקת: המשקל הקרוב מלמטה ומלמעלה שאפשר להרכיב */
  below: PlateLoad | null;
  above: PlateLoad | null;
  /** המשקל המבוקש קטן מהמוט עצמו */
  underBar: boolean;
}

const UNIT = 0.25;
const toUnits = (kg: number) => Math.round(kg / UNIT);
const MAX_PER_SIDE_UNITS = toUnits(300);

/** פתרון אחד לכל מספר יחידות לצד: הכי מעט צלחות, ובשוויון - צלחות כבדות קודם */
function solve(plates: number[], maxUnits: number): (number[] | null)[] {
  const kinds = [...new Set(plates.map(toUnits).filter((u) => u > 0))].sort((a, b) => b - a);
  const best: (number[] | null)[] = new Array(maxUnits + 1).fill(null);
  best[0] = [];
  for (let u = 1; u <= maxUnits; u++) {
    for (const k of kinds) {
      const prev = u >= k ? best[u - k] : null;
      if (!prev) continue;
      const candidate = [k, ...prev].sort((a, b) => b - a);
      const cur = best[u];
      if (!cur || candidate.length < cur.length) best[u] = candidate;
    }
  }
  return best;
}

const toLoad = (units: number[] | null, barKg: number): PlateLoad | null =>
  units ? { perSide: units.map((u) => u * UNIT), totalKg: barKg + 2 * units.reduce((s, u) => s + u, 0) * UNIT } : null;

export function calculatePlates(targetKg: number, setup: PlateSetup): PlateResult {
  const bar = Math.max(0, setup.barKg);
  if (!(targetKg > 0) || targetKg < bar) {
    return { exact: null, below: null, above: bar > 0 ? { perSide: [], totalKg: bar } : null, underBar: targetKg > 0 && targetKg < bar };
  }
  // ההפרש מהמוט מתחלק לשני צדדים. הפרש אי-זוגי (למשל 101 ק"ג על מוט 20) אי אפשר להעמיס בדיוק
  const diffUnits = toUnits(targetKg - bar);
  const floorUnits = Math.min(MAX_PER_SIDE_UNITS, Math.floor(diffUnits / 2));
  const ceilUnits = Math.min(MAX_PER_SIDE_UNITS, Math.ceil(diffUnits / 2));
  const table = solve(setup.plates, Math.min(MAX_PER_SIDE_UNITS, ceilUnits + toUnits(25)));

  if (diffUnits % 2 === 0 && table[floorUnits]) {
    return { exact: toLoad(table[floorUnits], bar), below: null, above: null, underBar: false };
  }

  let below: PlateLoad | null = null;
  for (let u = Math.min(floorUnits, table.length - 1); u >= 0; u--) {
    if (table[u]) {
      below = toLoad(table[u], bar);
      break;
    }
  }
  let above: PlateLoad | null = null;
  for (let u = ceilUnits; u < table.length; u++) {
    if (table[u] && u * 2 * UNIT + bar > targetKg) {
      above = toLoad(table[u], bar);
      break;
    }
  }
  return { exact: null, below, above, underBar: false };
}

/** צבעי צלחות תחרות לפי התקן הבינלאומי (IWF), כדי שיתאימו למה שרואים במכון */
export function plateColor(kg: number): { fill: string; text: string } {
  if (kg >= 25) return { fill: '#d6312b', text: '#fff' };
  if (kg >= 20) return { fill: '#2b62d6', text: '#fff' };
  if (kg >= 15) return { fill: '#f2c230', text: '#1a1a1a' };
  if (kg >= 10) return { fill: '#2e9e55', text: '#fff' };
  if (kg >= 5) return { fill: '#f4f4f6', text: '#1a1a1a' };
  if (kg >= 2.5) return { fill: '#d6312b', text: '#fff' };
  return { fill: '#b9bcc4', text: '#1a1a1a' };
}

/** גובה יחסי של צלחת (צלחות 10 ק"ג ומעלה באותו קוטר, הקטנות נמוכות יותר) */
export function plateHeight(kg: number): number {
  if (kg >= 15) return 1;
  if (kg >= 10) return 0.92;
  if (kg >= 5) return 0.66;
  if (kg >= 2.5) return 0.52;
  return 0.42;
}

export const formatKg = (kg: number) => (Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
