# ייבוא היסטוריית אימונים מ-Planfit

הסקריפט `import-planfit.mjs` לוקח את ייצוא הנתונים של Planfit (קובצי CSV) ומכניס את היסטוריית האימונים לטבלאות הקיימות של Ballast. לא נדרשת מיגרציה: כל השורות נכנסות ל-`public.workouts` ו-`public.custom_exercises` באותו מבנה JSONB שהאפליקציה כבר משתמשת בו.

קובצי ה-CSV עצמם הם מידע אישי ולא נכנסים לגיט. שומרים אותם מחוץ לריפו, או בתיקייה `scripts/import-planfit/data/` (שמוחרגת ב-`.gitignore`).

## הרצה

```bash
# 1. dry-run מקומי: רק ממיר ומדפיס סיכום, בלי רשת ובלי כתיבה
npm run import:planfit -- --dir ~/Downloads/EAKn9id_planfit_data --sample

# 2. dry-run מול הענן: גם בודק אילו ימים כבר יש בהם אימון ב-Ballast (קריאה בלבד)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run import:planfit -- --dir ~/Downloads/EAKn9id_planfit_data --user-id <auth.users.id>

# 3. כתיבה בפועל: רק אחרי שה-dry-run נראה נכון, וכשהאפליקציה סגורה בכל המכשירים
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run import:planfit -- --dir ~/Downloads/EAKn9id_planfit_data --user-id <auth.users.id> --apply
```

אפשרויות נוספות: `--out <file>` כותב את כל השורות המומרות ל-JSON לבדיקה, `--include-overlaps` מייבא גם ימים שכבר יש בהם אימון ב-Ballast, `--planfit-times-local` קורא את השעות של Planfit כשעון ישראל במקום UTC.

## למה חשוב לסגור את האפליקציה

`syncListToCloud` דוחף את הרשימה המקומית לענן ואז מוחק מהענן כל שורה שלא קיימת במכשיר. אם Ballast פתוחה במכשיר כלשהו בזמן הייבוא ושומרת אימון, היא תמחק את כל מה שיובא. סדר נכון: לסגור את האפליקציה בכל המכשירים, להריץ `--apply`, לפתוח את האפליקציה מחדש. בכניסה, `hydrateFromCloud` מוריד את הנתונים מהענן ומחליף בהם את המקומיים.

## אידמפוטנטיות

לכל שורה מזהה קבוע שנגזר מ-Planfit: `planfit-<workout_id>` לאימון, `planfit-set-<set_id>` לסט, `planfit-ex-<training_model_id>` לתרגיל מותאם. הכתיבה היא `upsert` על `(user_id, id)`, כך שהרצה חוזרת מעדכנת את אותן שורות ולא יוצרת כפילויות. הסקריפט אף פעם לא מוחק.

## מיפוי שדות

### `1_workout_sessions.csv` → `public.workouts` (`WorkoutSession`)

| Planfit | Ballast | הערות |
|---|---|---|
| `workout_id` | `id` = `planfit-<workout_id>` | |
| `started_at` | `startTime` (ms) | בלי אזור זמן בקובץ. ברירת המחדל: UTC (טווח השעות בנתונים 04:00 עד 19:00 מתאים ל-UTC של אימונים בין 06:00 ל-22:00 בישראל). בכל 510 האימונים התאריך יוצא זהה לעמודת `date` בשעון ישראל |
| `started_at` = `done_at` = `00:00:00` | `startTime` = צהרי היום ב-UTC | 24 אימונים שהוזנו ידנית ב-Planfit בלי שעה |
| `done_at` | `endTime` | אם חסר או לא תקין: `startTime + workout_minutes` |
| `workout_minutes` | `durationSec` | `elapsed_minutes` שונה רק ב-33 אימונים, ונבחר הזמן הפעיל |
| `name`, `routine_name` | `title` = "אימון מ-Planfit" | בפועל רק "Custom Workout Routine" ו-"YYYY-MM-DD Smart Training", בלי מידע שימושי |
| | `notes` | "יובא מ-Planfit" ושורת אירובי אם הייתה |
| | `isCompleted` = true, `totalVolumeKg`, `completedSetsCount` | מחושבים מהסטים שיובאו |
| `calorie`, `condition`, `feedback`, `satisfaction`, `is_home`, `memo`, `comment` | לא מיובא | אין שדה מקביל. `memo`/`comment`/`satisfaction` ריקים בכל השורות |

### `2_exercises_per_session.csv` → `WorkoutSession.exercises[]`

| Planfit | Ballast | הערות |
|---|---|---|
| `exercise_name` | `exerciseId` | לפי `exercise-map.json` (שם → מזהה ב-Ballast) |
| `type` | אופן קריאת הסטים | `normal`, `body_weight`, `time` (ראו למטה) |
| `created_at` | סדר התרגילים באימון | |
| `difficulty`, `memo` | לא מיובא | `memo` ריק בכל השורות |

### `3_sets.csv` → `WorkoutExercise.sets[]`

| Planfit | Ballast | הערות |
|---|---|---|
| `set_id` | `id` = `planfit-set-<set_id>` | הסדר לפי `set_id` (זהה לסדר `created_at`) |
| `value1` (normal) | `weightKg` | עמודת `weight` קיימת רק מסוף ינואר 2026 ושווה ל-`value1`. יחידה: ק"ג (`weight_unit` ריק או `kg`; אם יופיע `lb` הסקריפט ממיר) |
| `value2` (normal) | `reps` | |
| `value1` (body_weight) | `reps`, `weightKg` = 0 | |
| `value2` דקות + `value3` שניות (time) | ראו "אירובי ופלאנק" | |
| `is_done` | `completed` = true | 1 בכל השורות |
| `created_at` | `completedAt` | Planfit שומר את כל הסטים בסוף האימון, אז זו שעת הסיום ולא שעת הסט |
| `set_type`, `set_order`, `details` | לא מיובא | `set_order` ריק בכל השורות. `set_type` הוא `main` או ריק, ונכנס כ-`normal` |

`4_exercise_records_by_date.csv` (שיאים מחושבים), `5_daily_steps.csv` ו-`6_profile_and_goals.csv` לא מיובאים: Ballast מחשבת שיאים בעצמה מההיסטוריה, ואין לה טבלת צעדים. קובץ 4 שימש רק לבדיקה: המשקל המקסימלי לכל תרגיל ויום תואם בכל 3,210 השורות, חוץ מ-7 שמוסברות בהמשך.

## התאמת תרגילים

ב-Planfit יש 126 תרגילים שונים. החלוקה ב-`exercise-map.json`:

- 114 מותאמים לתרגיל קיים בספרייה של Ballast. 9 מהם הם התאמה קרובה ולא זהה (מסומנים `approx`): Leg Raise, Lunge, Low Row Machine, Dumbbell Wrist Curl, Close Grip T-bar Row, Cable High Row, Cable Rope Tricep Extension, Dumbbell Seal Row, One Arm Dumbbell Preacher Curl. הסקריפט מדפיס אותם בכל הרצה.
- 3 נוצרים כתרגיל מותאם אישית ב-`custom_exercises` (Box Jump, Torso Rotation, Hammer Strength Plate-Loaded Squat Lunge - Romanian Deadlift), כי אין להם מקבילה סבירה.
- 9 תרגילי אירובי (הליכון, הליכה, אופניים וכו') לא נכנסים כתרגיל. ראו בהמשך.

הסקריפט בודק בכל הרצה שכל מזהה במפה קיים ב-`src/data/*.ts`, ונכשל אם מופיע ב-CSV תרגיל שאין לו שורה במפה.

## מה לא נכנס, או נכנס אחרת

- **אירובי** (157 רשומות): ל-Ballast אין סטים של זמן או מרחק. משך הזמן נשמר בהערות האימון, למשל "אירובי: ריצה על הליכון: 15 דק׳". ב-Walking מ-2026 יש `value1` = 1, שמשמעותו לא ברורה, והוא לא מיובא.
- **פלאנק** (19 סטים): כל החזקה נכנסת כסט של חזרה אחת (כמו ברירת המחדל של `plank` ב-Ballast), והשניות נשמרות בהערות התרגיל.
- **סטים בלי חזרות** (14): 12 סטים של Bulgarian Split Squat עם 12 ק"ג ו-0 חזרות, ו-2 סטים ריקים של Dumbbell Lunge. גם קובץ השיאים של Planfit מראה בהם 0 חזרות, ולכן הם לא מיובאים.
- **אימונים ריקים** (7, בספטמבר ואוקטובר 2024): אין בהם אף תרגיל, רק משך וקלוריות.
- **Assisted Pull Up**: המשקל ב-Planfit הוא משקל הסיוע. Ballast תציג אותו כמשקל רגיל, ולכן "שיא" בתרגיל הזה הוא בעצם הסיוע הגבוה ביותר. זה גם ההסבר ל-2 מתוך 7 הפערים מול קובץ השיאים.
- **ימים חופפים**: אם כבר יש ב-Ballast אימון באותו יום, אימון ה-Planfit של אותו יום לא נכנס, אלא אם מוסיפים `--include-overlaps`. הבדיקה רצה רק כשיש פרטי גישה ל-Supabase.
- **משקל גוף ומדידות**: לא נכללו בייצוא של Planfit.
