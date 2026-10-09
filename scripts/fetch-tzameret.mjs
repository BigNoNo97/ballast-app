// מוריד את מאגר התזונה הלאומי (צמרת, משרד הבריאות) מ-data.gov.il ושומר עותק דחוס בתוך
// האפליקציה (public/data/tzameret.json) - כך החיפוש עובד מהר וגם בלי קליטה בחדר הכושר.
// זה אותו מקור שה-MCP @skills-il/israel-nutrition-mcp קורא ממנו.
//
// הרצה (כשרוצים לרענן את המאגר, למשל כשמשרד הבריאות מעדכן אותו):
//   node scripts/fetch-tzameret.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://data.gov.il/api/3/action/datastore_search';
const RESOURCES = {
  foods: 'c3cb0630-0650-46c1-a068-82d575c094b2', // מצרכים ומתכונים - ערכים ל-100 גרם
  units: '98fb46fe-e8de-4067-94d2-b0a8ea4269da', // טבלת יחידות מידה (כוס, כף, פרוסה...)
  weights: '755d28c0-75f7-40e1-9c8c-ecdd106f9b2d', // משקל בגרמים ליחידת מידה לכל מצרך
};

async function fetchAll(resourceId) {
  const records = [];
  const pageSize = 5000;
  for (let offset = 0; ; offset += pageSize) {
    const url = `${API}?resource_id=${resourceId}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    const json = await res.json();
    if (!json.success) throw new Error(`API error for ${url}`);
    records.push(...json.result.records);
    if (records.length >= json.result.total || json.result.records.length === 0) break;
  }
  return records;
}

// רכיבים נוספים (מעבר לאנרגיה וחלבון/פחמימה/שומן) - המפתחות כמו ב-src/services/nutrition/nutrients.ts
const EXTRA_NUTRIENTS = {
  fiber: 'total_dietary_fiber',
  sugars: 'total_sugars',
  satFat: 'saturated_fat',
  transFat: 'trans_fatty_acids',
  monoFat: 'mono_unsaturated_fat',
  polyFat: 'poly_unsaturated_fat',
  cholesterol: 'cholesterol',
  sodium: 'sodium',
  potassium: 'potassium',
  calcium: 'calcium',
  iron: 'iron',
  magnesium: 'magnesium',
  vitaminA: 'vitamin_a_re',
  vitaminC: 'vitamin_c',
  vitaminD: 'vitamin_d',
  vitaminB12: 'vitamin_b12',
};
// ערך חסר במאגר = null (לא ידוע), לא 0 - אחרת נציג "0 ויטמין D" כשבעצם לא נמדד
const optNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
};

const [foods, units, weights] = await Promise.all([
  fetchAll(RESOURCES.foods),
  fetchAll(RESOURCES.units),
  fetchAll(RESOURCES.weights),
]);

const unitNames = Object.fromEntries(units.map((u) => [String(u.smlmida), String(u.shmmida).replace(/\s+/g, ' ').trim()]));

// משקל ליחידה לפי קוד המצרך (Code במאגר המצרכים = mmitzrach בטבלת המשקלים)
const weightsByCode = new Map();
for (const w of weights) {
  const grams = parseFloat(w.mishkal);
  const unit = String(w.mida);
  // 700 = "גרם" ו-2000-ומעלה הן יחידות נפח/משקל כלליות - לא מוסיפות מידע מעבר לגרמים
  if (!Number.isFinite(grams) || grams <= 0 || !unitNames[unit] || /^(גרם|גרמים|ק"ג|קילוגרם|קילו)$/.test(unitNames[unit])) continue;
  const list = weightsByCode.get(String(w.mmitzrach)) || [];
  if (!list.some(([u]) => u === unit)) list.push([unit, Math.round(grams * 10) / 10]);
  weightsByCode.set(String(w.mmitzrach), list);
}

const usedUnits = new Set();
const compact = foods
  // FFQ- הן קבוצות של שאלון מחקרי (למשל "מתכוני ביצים") ולא מאכל אמיתי - רק מבלבלות בחיפוש
  .filter((f) => f.shmmitzrach && !String(f.shmmitzrach).startsWith('FFQ'))
  .map((f) => {
    const servings = weightsByCode.get(String(f.Code)) || [];
    servings.forEach(([u]) => usedUnits.add(u));
    return [
      f.smlmitzrach,
      String(f.shmmitzrach).replace(/\s+/g, ' ').trim(),
      String(f.english_name || '').replace(/\s+/g, ' ').trim(),
      num(f.food_energy),
      num(f.protein),
      num(f.carbohydrates),
      num(f.total_fat),
      servings,
      Object.values(EXTRA_NUTRIENTS).map((field) => optNum(f[field])),
    ];
  });

const out = {
  source: 'מאגר התזונה הלאומי (צמרת) - משרד הבריאות, data.gov.il',
  fetchedAt: new Date().toISOString().slice(0, 10),
  // סדר השדות בכל מצרך
  fields: ['code', 'nameHe', 'nameEn', 'kcal', 'protein', 'carbs', 'fat', 'servings', 'nutrients'],
  nutrientKeys: Object.keys(EXTRA_NUTRIENTS),
  units: Object.fromEntries([...usedUnits].map((u) => [u, unitNames[u]])),
  foods: compact,
};

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/tzameret.json', JSON.stringify(out));
console.log(`foods: ${compact.length} (of ${foods.length}), units used: ${usedUnits.size}, with servings: ${compact.filter((f) => f[7].length).length}`);
