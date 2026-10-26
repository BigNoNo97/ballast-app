// מאגר המקורות של "מוח האימונים" - כל החלטה של מחולל התוכניות (programGenerator.ts) מצביעה
// לכאן לפי מזהה, והתוכנית שומרת את רשימת ההחלטות שלה עם המזהים (RoutineTemplate.planRationale).
// כך אפשר להציג למשתמש "למה התוכנית ככה", ובעתיד צ'אט AI יוכל להסביר כל החלטה עם המקור שלה.
// רק סקירות שיטתיות, מטא-אנליזות, עמדות רשמיות והנחיות קליניות. מזהי PubMed נבדקו ישירות.

import type { EvidenceSource } from '../nutrition/evidence';

export const TRAINING_EVIDENCE_REVIEWED_AT = '2026-10-09';

export const TRAINING_EVIDENCE: Record<string, EvidenceSource> = {
  acsm2026: {
    id: 'acsm2026',
    finding:
      'עמדת ACSM העדכנית (137 סקירות שיטתיות, 30,000+ משתתפים): כוח משתפר עם משקלים כבדים (80%+ מהמקסימום), טווח תנועה מלא, תרגילים בתחילת האימון ו-2+ אימונים בשבוע. מסת שריר משתפרת עם 10+ סטים לשריר בשבוע. סוג הציוד ומורכבות התרגיל לא שינו את התוצאות.',
    citation: 'Currier BS, et al. ACSM Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults. Med Sci Sports Exerc 2026;58:851-72',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/',
    kind: 'position-stand',
  },
  volumeDose: {
    id: 'volumeDose',
    finding:
      'יותר סטים בשבוע = יותר שריר וכוח, עם תשואה פוחתת (בכוח מוקדם יותר). סט שבו השריר עובד כשריר משני נספר כחצי סט.',
    citation: 'Pelland JC, et al. The Resistance Training Dose Response. Sports Med 2026;56:481-505 · Schoenfeld BJ, et al. J Sports Sci 2017;35:1073-82',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/',
    kind: 'meta-analysis',
  },
  frequency: {
    id: 'frequency',
    finding: 'תדירות של פעמיים בשבוע לשריר משפרת כוח; למסת שריר, כשהנפח זהה, התדירות כמעט לא משנה - היא בעיקר דרך לחלק את הנפח.',
    citation: 'Pelland JC, et al. Sports Med 2026;56:481-505 · Schoenfeld BJ, et al. Sports Med 2016;46:1689-97',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/',
    kind: 'meta-analysis',
  },
  loadRange: {
    id: 'loadRange',
    finding: 'מסת שריר נבנית בטווח רחב של משקלים (בערך 6-30 חזרות) כשמתקרבים לכשל; לכוח מקסימלי עדיפים משקלים כבדים (מעט חזרות).',
    citation: 'Lopez P, et al. Resistance training load effects on muscle hypertrophy and strength gain: network meta-analysis. Med Sci Sports Exerc 2021;53:1206-16',
    url: 'https://pubmed.ncbi.nlm.nih.gov/33433148/',
    kind: 'meta-analysis',
  },
  proximity: {
    id: 'proximity',
    finding: 'מסת שריר עולה ככל שמתקרבים לכשל; לכוח הקרבה לכשל כמעט לא משנה. עצירה 1-3 חזרות לפני כשל נותנת את רוב התועלת עם פחות עייפות.',
    citation: 'Robinson ZP, Pelland JC, et al. Proximity to failure, strength and hypertrophy. Sports Med 2024;54:2209-31',
    url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/',
    kind: 'meta-analysis',
  },
  rest: {
    id: 'rest',
    finding: 'מנוחה ארוכה (כ-3 דקות) בין סטים בתרגילים מורכבים נתנה יותר כוח ומסה ממנוחה קצרה (דקה).',
    citation: 'Schoenfeld BJ, et al. Longer interset rest periods enhance muscle strength and hypertrophy. J Strength Cond Res 2016;30:1805-12',
    url: 'https://pubmed.ncbi.nlm.nih.gov/26605807/',
    kind: 'rct',
  },
  order: {
    id: 'order',
    finding: 'תרגיל שמבוצע מוקדם באימון מקבל יותר חזרות וכוח - לכן התרגילים החשובים לך (ואזורי המיקוד) בתחילת האימון.',
    citation: 'Simão R, et al. Exercise order in resistance training. Sports Med 2012;42:251-65',
    url: 'https://pubmed.ncbi.nlm.nih.gov/22292516/',
    kind: 'systematic-review',
  },
  maintenance: {
    id: 'maintenance',
    finding: 'לשמירה על כוח ומסה מספיק בערך שליש מנפח האימון הקודם, כל עוד העצימות נשמרת.',
    citation: 'Spiering BA, et al. Maintaining physical performance: the minimal dose of exercise. J Strength Cond Res 2021;35:1449-58',
    url: 'https://pubmed.ncbi.nlm.nih.gov/33629972/',
    kind: 'narrative-review',
  },
  olderAdults: {
    id: 'olderAdults',
    finding: 'מבוגרים מגיבים היטב לאימון כוח. מומלץ להתחיל בעומס מתון, להעדיף תרגילים יציבים (מכונות), ולהתקדם בהדרגה.',
    citation: 'Fragala MS, et al. Resistance training for older adults: NSCA position statement. J Strength Cond Res 2019;33:2019-52',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31343601/',
    kind: 'position-stand',
  },
  sex: {
    id: 'sex',
    finding: 'גברים ונשים מתחזקים ובונים שריר באופן דומה ביחס לנקודת הפתיחה - לכן מבנה התוכנית זהה, והמין משפיע רק על התזונה.',
    citation: 'Roberts BM, et al. Sex differences in resistance training: systematic review and meta-analysis. J Strength Cond Res 2020;34:1448-60',
    url: 'https://pubmed.ncbi.nlm.nih.gov/32218059/',
    kind: 'meta-analysis',
  },
  painMonitoring: {
    id: 'painMonitoring',
    finding: 'אפשר להמשיך להתאמן עם פציעה כשהכאב נשאר נמוך (עד 5 מתוך 10) וחולף עד למחרת. כאב חד או שמחמיר - לעצור ולהתייעץ.',
    citation: 'Silbernagel KG, et al. Continued sports activity, using a pain-monitoring model. Am J Sports Med 2007;35:897-906',
    url: 'https://pubmed.ncbi.nlm.nih.gov/17307888/',
    kind: 'rct',
  },
  backPain: {
    id: 'backPain',
    finding: 'בכאבי גב תחתון כרוניים, פעילות ותרגול מדורגים עדיפים על מנוחה - בהתחלה עם תרגילים שמעמיסים פחות על עמוד השדרה.',
    citation: 'Almeida de Oliveira L, et al. Graded activity for chronic low back pain. Cochrane Database Syst Rev 2025;2:CD015507',
    url: 'https://pubmed.ncbi.nlm.nih.gov/39936503/',
    kind: 'systematic-review',
  },
  kneeOA: {
    id: 'kneeOA',
    finding: 'בכאבי ברך/ירך (כולל שחיקה), חיזוק שרירים הוא טיפול מרכזי מומלץ - עם תרגילים מבוקרים ובלי קפיצות.',
    citation: 'Bannuru RR, et al. OARSI guidelines for the non-surgical management of knee, hip, and polyarticular osteoarthritis. Osteoarthritis Cartilage 2019;27:1578-89',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31278997/',
    kind: 'guideline',
  },
};
