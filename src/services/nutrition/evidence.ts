// מאגר המקורות של "מוח התזונה". כל כלל במנוע (engine.ts) מצביע לכאן לפי מזהה, והאפליקציה
// מציגה את המקורות במסך "איך זה מחושב". רק מחקרים שעברו ביקורת עמיתים, הנחיות קליניות
// ועמדות רשמיות של גופים מקצועיים - לא בלוגים, לא משפיענים.
//
// כשיוצא מחקר חדש שמשנה המלצה: מעדכנים את הכלל במנוע, את הרשומה כאן ואת reviewedAt -
// ומעלים גרסה. כך תמיד ברור על מה מבוססת כל המלצה ומתי נבדקה לאחרונה.

export interface EvidenceSource {
  id: string;
  /** מה לקחנו מהמקור, במשפט אחד */
  finding: string;
  citation: string;
  url: string;
  /** סוג הראיה: מטא-אנליזה / סקירה שיטתית / הנחיה קלינית / עמדה רשמית / מחקר מבוקר / מודל פיזיולוגי */
  kind: 'meta-analysis' | 'systematic-review' | 'guideline' | 'position-stand' | 'rct' | 'model' | 'narrative-review';
}

export const EVIDENCE_REVIEWED_AT = '2026-10-09';

export const EVIDENCE: Record<string, EvidenceSource> = {
  mifflin: {
    id: 'mifflin',
    finding: 'משוואת Mifflin-St Jeor היא המדויקת ביותר מבין המשוואות המקובלות לחילוף חומרים במנוחה, אצל בעלי משקל תקין ועודף משקל - אבל עדיין רק הערכה (כ-70%-80% מהאנשים בטווח של 10%).',
    citation: 'Frankenfield D, et al. J Am Diet Assoc 2005;105(5):775-89 · Mifflin MD, et al. Am J Clin Nutr 1990;51:241-7',
    url: 'https://pubmed.ncbi.nlm.nih.gov/15883556/',
    kind: 'systematic-review',
  },
  pal: {
    id: 'pal',
    finding: 'הוצאת אנרגיה יומית = חילוף חומרים במנוחה × רמת פעילות (PAL): אורח חיים יושבני/קל 1.40-1.69, פעיל 1.70-1.99, פעיל מאוד 2.00-2.40.',
    citation: 'FAO/WHO/UNU. Human energy requirements. Food and Nutrition Technical Report Series 1, Rome 2004',
    url: 'https://www.fao.org/3/y5686e/y5686e00.htm',
    kind: 'guideline',
  },
  energyDensity: {
    id: 'energyDensity',
    finding: 'קילוגרם משקל שיורד או עולה אינו תמיד 7,700 קלוריות: הוא תלוי בכמה שומן יש בגוף. ק"ג שומן = 39.5 MJ (כ-9,440 קק"ל), ק"ג רקמה רזה = 7.6 MJ (כ-1,820 קק"ל), והחלוקה ביניהם לפי משוואת Forbes.',
    citation: 'Hall KD. What is the required energy deficit per unit weight loss? Int J Obes 2008;32:573-6 · Hall KD. Forbes\'s theory revisited. Br J Nutr 2007;97:1059-63',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17848938/',
    kind: 'model',
  },
  adaptiveEstimate: {
    id: 'adaptiveEstimate',
    finding: 'ההוצאה האמיתית מחושבת ממאזן אנרגיה: צריכה ממוצעת פחות שינוי מאגרי הגוף (מגמת המשקל × צפיפות האנרגיה). כך החישוב מתקן את עצמו לפי מה שקורה בפועל, וגם מנטרל דיווח חסר עקבי.',
    citation: 'Hall KD, Chow CC. Why is the 3500 kcal per pound weight loss rule wrong? Int J Obes 2013;37:1614 · Thomas DM, et al. Int J Obes 2014;38:1-8',
    url: 'https://pubmed.ncbi.nlm.nih.gov/23774459/',
    kind: 'model',
  },
  underreporting: {
    id: 'underreporting',
    finding: 'בהשוואה למים מסומנים כפולים (DLW), רוב האנשים מדווחים פחות ממה שאכלו - לכן ימים שתועדו חלקית לא נכנסים לחישוב, והיעד נגזר מהצריכה המדווחת שלך עצמך.',
    citation: 'Burrows TL, et al. Validity of dietary assessment methods when compared to the method of doubly labeled water: a systematic review in adults. Front Endocrinol 2019;10:850 (59 studies)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31920966/',
    kind: 'systematic-review',
  },
  lossRate: {
    id: 'lossRate',
    finding: 'בחיטוב, ירידה של כ-0.5%-1% ממשקל הגוף בשבוע שומרת יותר שריר; גירעון גדול יותר מגדיל את חלק השריר במשקל שיורד. ניסוי מבוקר: 0.7% בשבוע שמר מסת שריר וכוח טוב יותר מ-1.4%.',
    citation: 'Helms ER, et al. J Int Soc Sports Nutr 2014;11:20 · Garthe I, et al. Int J Sport Nutr Exerc Metab 2011;21:97-104',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/',
    kind: 'rct',
  },
  gainRate: {
    id: 'gainRate',
    finding: 'בבניית מסה: עודף של כ-10%-20% מעל שמירה למתחילים/בינוניים וכ-5%-10% למתקדמים, עם עלייה של כ-0.25%-0.5% ממשקל הגוף בשבוע. עודף גדול יותר מוסיף בעיקר שומן.',
    citation: 'Iraki J, Fitschen P, Espinar S, Helms E. Nutrition recommendations for bodybuilders in the off-season. Sports 2019;7(7):154',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31247944/',
    kind: 'narrative-review',
  },
  recomp: {
    id: 'recomp',
    finding: 'אצל מתאמנים בכוח, חלבון גבוה עם צריכה קרובה לשמירה (או גירעון קטן) מאפשר לרדת בשומן ולעלות בשריר במקביל.',
    citation: 'Aragon AA, et al. ISSN position stand: diets and body composition. J Int Soc Sports Nutr 2017;14:16',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28630601/',
    kind: 'position-stand',
  },
  protein: {
    id: 'protein',
    finding: 'מעל כ-1.6 גרם חלבון לק"ג ביום התועלת לבניית שריר כמעט נעצרת (טווח עליון ~2.2). לרוב המתאמנים מספיק 1.4-2.0 גרם לק"ג.',
    citation: 'Morton RW, et al. Br J Sports Med 2018;52:376-84 (meta-analysis, 49 RCTs) · Jäger R, et al. ISSN position stand: protein and exercise. J Int Soc Sports Nutr 2017;14:20',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    kind: 'meta-analysis',
  },
  proteinDeficit: {
    id: 'proteinDeficit',
    finding: 'בגירעון קלורי אצל מתאמני כוח, צריכה גבוהה יותר (2.3-3.1 גרם לק"ג מסת גוף רזה) עוזרת לשמור על שריר.',
    citation: 'Helms ER, et al. J Int Soc Sports Nutr 2014;11:20 · Jäger R, et al. J Int Soc Sports Nutr 2017;14:20',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
    kind: 'position-stand',
  },
  bodyFatEstimate: {
    id: 'bodyFatEstimate',
    finding: 'כשאין מדידה, אחוז השומן מוערך מ-BMI, גיל ומין (משוואת Deurenberg). ההערכה גסה ונוטה להגזים אצל שריריים - משמשת רק לחלוקת המאקרו ולצפיפות האנרגיה.',
    citation: 'Deurenberg P, Weststrate JA, Seidell JC. Br J Nutr 1991;65:105-14',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2043597/',
    kind: 'model',
  },
  fat: {
    id: 'fat',
    finding: 'שומן: 20%-35% מהקלוריות (טווח AMDR). אצל מתאמנים לפחות כ-0.5 גרם לק"ג ביום.',
    citation: 'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat... 2002/2005 · Iraki J, et al. Sports 2019;7:154',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK610329/',
    kind: 'guideline',
  },
  fiber: {
    id: 'fiber',
    finding: 'סיבים תזונתיים: 14 גרם לכל 1,000 קלוריות (צריכה מספקת, מבוסס על הקשר לסיכון למחלות לב).',
    citation: 'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat... 2002/2005',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4224210/',
    kind: 'guideline',
  },
  calorieFloor: {
    id: 'calorieFloor',
    finding: 'בהרזיה ללא השגחה: גירעון של 500-750 קלוריות ביום, או 1,200-1,500 לנשים ו-1,500-1,800 לגברים. דיאטה מתחת ל-800 קלוריות רק בהשגחה רפואית.',
    citation: 'Jensen MD, et al. 2013 AHA/ACC/TOS Guideline for the Management of Overweight and Obesity in Adults. Circulation 2014;129:S102-38',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5819889/',
    kind: 'guideline',
  },
};
