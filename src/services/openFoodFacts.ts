// Open Food Facts - מאגר מוצרים פתוח עולמי (ODbL). עיקר הערך לישראל: סריקת ברקוד, כי למוצרים
// ישראליים (729...) יש שם ערכים תזונתיים מלאים, אבל כמעט אין שמות בעברית לחיפוש טקסט.
//
// כללי השימוש שלהם (openfoodfacts.github.io/openfoodfacts-server/api):
// - לזהות את האפליקציה ב-User-Agent: "AppName/Version (email)"
// - מגבלה: 15 קריאות מוצר ו-10 חיפושים לדקה. אסור לחפש תוך כדי הקלדה - חוסמים IP.
// - חיפוש טקסט: search.openfoodfacts.org. השרת שלהם לא מאפשר קריאה מדפדפן (אין CORS), לכן
//   חיפוש טקסט רק באפליקציה (CapacitorHttp עוקף את הדפדפן). קריאת מוצר לפי ברקוד כן מאפשרת CORS.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { FoodServing, NutrientKey, NutrientMap } from '../types';

const USER_AGENT = 'Ballast/1.0 (kartanas97@gmail.com)';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v3/product/';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const FIELDS = 'code,product_name,product_name_he,generic_name,brands,nutriments,serving_size,serving_quantity,product_quantity,image_front_small_url';

export interface OffFood {
  barcode: string;
  name: string;
  brand: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrients: NutrientMap;
  servings: FoodServing[];
  imageUrl?: string;
  /** אין ערכים תזונתיים במאגר - המשתמש ימלא מהתווית */
  incomplete: boolean;
}

// ===== הגבלת קצב בצד שלנו, עם מרווח מתחת למגבלה שלהם =====
const recent: Record<'product' | 'search', number[]> = { product: [], search: [] };
const LIMITS = { product: 12, search: 8 };
function takeSlot(kind: 'product' | 'search') {
  const now = Date.now();
  recent[kind] = recent[kind].filter((t) => now - t < 60_000);
  if (recent[kind].length >= LIMITS[kind]) {
    throw new Error('יותר מדי חיפושים בדקה האחרונה - נסה שוב בעוד רגע.');
  }
  recent[kind].push(now);
}

async function getJson(url: string, params: Record<string, string>): Promise<{ status: number; data: any }> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, params, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    return { status: res.status, data: typeof res.data === 'string' ? JSON.parse(res.data) : res.data };
  }
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json' } });
  return { status: res.status, data: res.status === 404 ? null : await res.json() };
}

// ===== המרת ערכים: OFF שומר הכל בגרמים ל-100 גרם =====
const OFF_NUTRIENTS: Record<NutrientKey, { field: string; factor: number }> = {
  fiber: { field: 'fiber_100g', factor: 1 },
  sugars: { field: 'sugars_100g', factor: 1 },
  satFat: { field: 'saturated-fat_100g', factor: 1 },
  transFat: { field: 'trans-fat_100g', factor: 1 },
  monoFat: { field: 'monounsaturated-fat_100g', factor: 1 },
  polyFat: { field: 'polyunsaturated-fat_100g', factor: 1 },
  cholesterol: { field: 'cholesterol_100g', factor: 1000 }, // גרם -> מ"ג
  sodium: { field: 'sodium_100g', factor: 1000 },
  potassium: { field: 'potassium_100g', factor: 1000 },
  calcium: { field: 'calcium_100g', factor: 1000 },
  iron: { field: 'iron_100g', factor: 1000 },
  magnesium: { field: 'magnesium_100g', factor: 1000 },
  vitaminA: { field: 'vitamin-a_100g', factor: 1_000_000 }, // גרם -> מק"ג
  vitaminC: { field: 'vitamin-c_100g', factor: 1000 },
  vitaminD: { field: 'vitamin-d_100g', factor: 1_000_000 },
  vitaminB12: { field: 'vitamin-b12_100g', factor: 1_000_000 },
};

const n = (v: unknown): number | undefined => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : undefined;
};
const round = (v: number) => Math.round(v * 100) / 100;

export function mapOffProduct(p: any): OffFood | null {
  if (!p) return null;
  const nut = p.nutriments || {};
  const kcal = n(nut['energy-kcal_100g']) ?? (n(nut['energy_100g']) !== undefined ? n(nut['energy_100g'])! / 4.184 : undefined);
  const nutrients: NutrientMap = {};
  (Object.keys(OFF_NUTRIENTS) as NutrientKey[]).forEach((key) => {
    const { field, factor } = OFF_NUTRIENTS[key];
    let v = n(nut[field]);
    if (key === 'sodium' && v === undefined && n(nut['salt_100g']) !== undefined) v = n(nut['salt_100g'])! / 2.5;
    if (v !== undefined) nutrients[key] = round(v * factor);
  });
  const servings: FoodServing[] = [];
  const servingG = n(p.serving_quantity);
  // "25 g" לא מוסיף מידע (הגרמים מוצגים ממילא), אבל "1 bar" / "2 biscuits" כן
  const sizeText = String(p.serving_size || '').trim();
  const informative = sizeText && !/^\d+([.,]\d+)?\s*(g|gr|ml|גר|גרם|מ"ל)\.?$/i.test(sizeText);
  if (servingG && servingG > 0) servings.push({ label: informative ? `מנה (${sizeText})` : 'מנה', grams: round(servingG) });
  const packageG = n(p.product_quantity);
  if (packageG && packageG > 0 && packageG !== servingG) servings.push({ label: 'אריזה שלמה', grams: round(packageG) });
  const brand = Array.isArray(p.brands) ? p.brands.join(', ') : String(p.brands || '');
  const name = String(p.product_name_he || p.product_name || p.generic_name || '').trim();
  return {
    barcode: String(p.code || ''),
    name: name || brand || `מוצר ${p.code}`,
    brand,
    kcal: round(kcal ?? 0),
    protein: round(n(nut['proteins_100g']) ?? 0),
    carbs: round(n(nut['carbohydrates_100g']) ?? 0),
    fat: round(n(nut['fat_100g']) ?? 0),
    nutrients,
    servings,
    imageUrl: p.image_front_small_url || undefined,
    incomplete: kcal === undefined,
  };
}

// ===== מטמון ברקודים (מוצרים כמעט לא משתנים, וכך גם לא מבזבזים את המכסה) =====
const CACHE_KEY = 'ballast_off_cache_v1';
const CACHE_MAX = 300;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function readCache(): Record<string, { at: number; food: OffFood | null }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeCache(barcode: string, food: OffFood | null) {
  try {
    const cache = readCache();
    cache[barcode] = { at: Date.now(), food };
    const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
    keys.slice(CACHE_MAX).forEach((k) => delete cache[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export const normalizeBarcode = (raw: string) => raw.replace(/\D/g, '');

/** null = המוצר לא קיים במאגר */
export async function getProductByBarcode(rawBarcode: string): Promise<OffFood | null> {
  const barcode = normalizeBarcode(rawBarcode);
  if (barcode.length < 6) throw new Error('הברקוד קצר מדי.');
  const cached = readCache()[barcode];
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.food;

  takeSlot('product');
  const { status, data } = await getJson(`${PRODUCT_URL}${barcode}`, { fields: FIELDS });
  if (status === 404 || data?.status === 'failure' || !data?.product) {
    writeCache(barcode, null);
    return null;
  }
  if (status >= 500) throw new Error('השרת של Open Food Facts לא זמין כרגע.');
  const food = mapOffProduct({ ...data.product, code: data.product.code || barcode });
  writeCache(barcode, food);
  return food;
}

export const isOffTextSearchAvailable = () => Capacitor.isNativePlatform();

export async function searchProducts(query: string): Promise<OffFood[]> {
  if (!isOffTextSearchAvailable()) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  takeSlot('search');
  const { status, data } = await getJson(SEARCH_URL, { q, page_size: '20', langs: 'he,en', fields: FIELDS });
  if (status >= 400) throw new Error('החיפוש ב-Open Food Facts נכשל.');
  return ((data?.hits as any[]) || [])
    .map(mapOffProduct)
    .filter((f): f is OffFood => !!f && !f.incomplete);
}
