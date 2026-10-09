// חיפוש במאגר התזונה הלאומי (צמרת, משרד הבריאות) - עותק מקומי ב-public/data/tzameret.json
// (נבנה ע"י scripts/fetch-tzameret.mjs). נטען רק כשפותחים חיפוש מזון, ועובד גם בלי קליטה.

import type { FoodServing, NutrientKey, NutrientMap } from '../types';

export type Serving = FoodServing;

export interface IsraeliFood {
  code: number;
  nameHe: string;
  nameEn: string;
  kcal: number; // ל-100 גרם
  protein: number;
  carbs: number;
  fat: number;
  nutrients: NutrientMap; // רכיבים נוספים ל-100 גרם - רק מה שנמדד במאגר
  servings: Serving[];
}

interface RawDb {
  source: string;
  fetchedAt: string;
  units: Record<string, string>;
  nutrientKeys: NutrientKey[];
  foods: [number, string, string, number, number, number, number, [string, number][], (number | null)[]][];
}

export interface IsraeliFoodDb {
  source: string;
  fetchedAt: string;
  foods: IsraeliFood[];
  byCode: Map<number, IsraeliFood>;
  search: (query: string, limit?: number) => IsraeliFood[];
}

// מנרמל עברית לחיפוש: בלי ניקוד, בלי גרשיים/מרכאות, אותיות סופיות כרגילות, יו"ד/וי"ו כפולות
// (כתיב מלא/חסר), ואנגלית באותיות קטנות - כך "קוטג" מוצא "קוטג'" ו"פיתה" מוצא "פתה".
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/['"`׳״]/g, '')
    .replace(/[,()/.\-–]+/g, ' ')
    .replace(/וו/g, 'ו')
    .replace(/יי/g, 'י')
    .replace(/\s+/g, ' ')
    .trim();
}
// כתיב חסר: מסירים י/ו מאמצע מילה, כדי ש"פיתה" ו"פתה" יתאימו זה לזה
const skeleton = (word: string) => (word.length > 2 ? word[0] + word.slice(1, -1).replace(/[יו]/g, '') + word.slice(-1) : word);
// סמיכות: "אבקת חלבון" צריך למצוא "אבקה", "ארוחת" -> "ארוחה"
const variants = (t: string) => (t.length > 3 && t.endsWith('ת') ? [t, t.slice(0, -1) + 'ה'] : [t]);
// מוצרים מעובדים (אבקה, מיובש) רק כשביקשו אותם - "ביצה" צריך להביא ביצה טרייה, לא אבקת ביצים
const PROCESSED = /מיובש|אבקה|מרוכז/;

let loading: Promise<IsraeliFoodDb> | null = null;

export function loadIsraeliFoodDb(): Promise<IsraeliFoodDb> {
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}data/tzameret.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<RawDb>;
      })
      .then(buildDb)
      .catch((e) => {
        loading = null; // ננסה שוב בפעם הבאה
        throw e;
      });
  }
  return loading;
}

function buildDb(raw: RawDb): IsraeliFoodDb {
  const foods: IsraeliFood[] = raw.foods.map(([code, nameHe, nameEn, kcal, protein, carbs, fat, servings, values]) => ({
    code,
    nameHe,
    nameEn,
    kcal,
    protein,
    carbs,
    fat,
    nutrients: Object.fromEntries(
      raw.nutrientKeys.map((key, i) => [key, values[i]]).filter(([, v]) => v !== null && v !== undefined)
    ) as NutrientMap,
    servings: servings
      .map(([unit, grams]) => ({ label: raw.units[unit] || 'מנה', grams }))
      .sort((a, b) => a.grams - b.grams),
  }));

  const index = foods.map((f) => {
    const he = normalizeForSearch(f.nameHe);
    const words = he.split(' ');
    return { food: f, he, en: normalizeForSearch(f.nameEn), words, skeletons: words.map(skeleton) };
  });

  const search = (query: string, limit = 40): IsraeliFood[] => {
    const q = normalizeForSearch(query);
    if (!q) return [];
    const tokens = q.split(' ');
    const scored: { food: IsraeliFood; score: number }[] = [];
    for (const item of index) {
      let score = 0;
      let matchedAll = true;
      for (const token of tokens) {
        const vs = variants(token);
        const wordStart = vs.some((t) => item.words.some((w) => w.startsWith(t)));
        const skelStart = vs.some((t) => item.skeletons.some((w) => w.startsWith(skeleton(t))));
        const inside = vs.some((t) => item.he.includes(t) || item.en.includes(t));
        if (wordStart) score += 3;
        else if (skelStart) score += 2;
        else if (inside) score += 1;
        else {
          matchedAll = false;
          break;
        }
      }
      if (!matchedAll) continue;
      if (item.he.startsWith(q)) score += 4; // השם מתחיל במה שהוקלד - כנראה זה המאכל הבסיסי
      score -= item.he.length / 60; // שם קצר = פריט כללי, עדיף על וריאציה ספציפית
      if (PROCESSED.test(item.he) && !PROCESSED.test(q)) score -= 1.5;
      scored.push({ food: item.food, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.food);
  };

  return {
    source: raw.source,
    fetchedAt: raw.fetchedAt,
    foods,
    byCode: new Map(foods.map((f) => [f.code, f])),
    search,
  };
}
