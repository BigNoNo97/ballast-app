import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Search,
  Settings,
  Save,
  Coffee,
  Sun,
  Moon,
  Apple,
  ScanBarcode,
  Copy,
  Zap,
  Trash2,
  Globe,
  Loader2,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { ActivityLevel, FoodItem, FoodServing, NutrientMap, NutritionEntry, NutritionGoals, MealType, NutritionGoalMode, UserSettings } from '../types';
import { StorageService } from '../services/storage';
import { runNutritionBrain } from '../services/nutritionAdaptation';
import {
  ACTIVITY_LABELS,
  ACTIVITY_PAL,
  NutritionAnalysis,
  RATE_LIMITS,
  analyzeNutrition,
  clampRate,
  currentWeight,
  defaultActivityLevel,
  defaultWeeklyRate,
  goalModeFromGoals,
} from '../services/nutrition/engine';
import { EVIDENCE, EVIDENCE_REVIEWED_AT } from '../services/nutrition/evidence';
import { NUTRIENTS, NUTRIENT_GROUP_LABELS, NutrientInfo, dailyValueFor, formatNutrient } from '../services/nutrition/nutrients';
import { IsraeliFood, IsraeliFoodDb, loadIsraeliFoodDb, normalizeForSearch } from '../services/israeliFoodDb';
import { OffFood, getProductByBarcode, isOffTextSearchAvailable, normalizeBarcode, searchProducts } from '../services/openFoodFacts';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנושים',
};
const MEAL_SHORT: Record<MealType, string> = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'נשנוש' };
const MEAL_ICONS: Record<MealType, React.ReactNode> = {
  breakfast: <Coffee size={16} />,
  lunch: <Sun size={16} />,
  dinner: <Moon size={16} />,
  snack: <Apple size={16} />,
};

const MODE_LABELS: Record<NutritionGoalMode, string> = {
  lose: 'חיטוב (ירידה בשומן)',
  recomp: 'רה-קומפוזיציה (פחות שומן, יותר שריר)',
  maintain: 'שמירה על המשקל',
  gain: 'מסה (בניית שריר)',
};

const MACRO_COLORS = { protein: 'var(--color-blue)', carbs: 'var(--color-green)', fat: 'var(--color-purple)' };

/** הארוחה הסבירה לפי השעה - כדי שהוספה מהחיפוש הראשי תיכנס למקום הנכון בלי שאלות */
function mealByTime(d = new Date()): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Totals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrients: Partial<Record<keyof NutrientMap, number>>;
  /** לכל רכיב: כמה מהקלוריות הגיעו מפריטים שידוע להם הערך - מתחת ל-100% הסכום חלקי */
  coverage: Partial<Record<keyof NutrientMap, number>>;
}

function totalsOf(entries: NutritionEntry[]): Totals {
  const t: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, nutrients: {}, coverage: {} };
  const knownKcal: Partial<Record<keyof NutrientMap, number>> = {};
  entries.forEach((e) => {
    const f = e.grams / 100;
    const kcal = e.caloriesPer100g * f;
    t.calories += kcal;
    t.protein += e.proteinPer100g * f;
    t.carbs += e.carbsPer100g * f;
    t.fat += e.fatPer100g * f;
    const map: NutrientMap = { ...(e.nutrientsPer100g || {}) };
    if (map.fiber === undefined && e.fiberPer100g !== undefined) map.fiber = e.fiberPer100g;
    (Object.keys(map) as (keyof NutrientMap)[]).forEach((k) => {
      t.nutrients[k] = (t.nutrients[k] || 0) + (map[k] as number) * f;
      knownKcal[k] = (knownKcal[k] || 0) + kcal;
    });
  });
  (Object.keys(knownKcal) as (keyof NutrientMap)[]).forEach((k) => {
    t.coverage[k] = t.calories > 0 ? (knownKcal[k] as number) / t.calories : 1;
  });
  t.calories = Math.round(t.calories);
  return t;
}

const entryKcal = (e: NutritionEntry) => Math.round((e.caloriesPer100g * e.grams) / 100);
const amountLabel = (e: NutritionEntry) =>
  e.foodId.startsWith('quick-')
    ? 'הוספה מהירה'
    : e.unitLabel && e.unitQty ? `${r1(e.unitQty)} × ${e.unitLabel} · ${Math.round(e.grams)} גר׳` : `${Math.round(e.grams)} גר׳`;

// ===== טבעת התקדמות =====
const Ring: React.FC<{ value: number; goal: number; size: number; stroke: number; color: string; children?: React.ReactNode }> = ({
  value,
  goal,
  size,
  stroke,
  color,
  children,
}) => {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const frac = goal > 0 ? Math.min(1, value / goal) : 0;
  const over = goal > 0 && value > goal * 1.02;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={over ? 'var(--color-red)' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
};

interface NutritionViewProps {
  settings: UserSettings;
  onUpdateSettings: (settings: UserSettings) => void;
}

type AddRequest = { meal: MealType; start: 'search' | 'scan' | 'quick' };

export const NutritionView: React.FC<NutritionViewProps> = ({ settings, onUpdateSettings }) => {
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [entries, setEntries] = useState<NutritionEntry[]>(() => StorageService.getAllNutritionEntries());
  const [goals, setGoals] = useState<NutritionGoals>(() => StorageService.getNutritionGoals());
  const [adding, setAdding] = useState<AddRequest | null>(null);
  const [editing, setEditing] = useState<NutritionEntry | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [nutrientsFor, setNutrientsFor] = useState<{ title: string; entries: NutritionEntry[] } | null>(null);
  const [openMeals, setOpenMeals] = useState<Set<MealType>>(new Set());

  // המוח רץ ברקע: מציגים רק הצעת עדכון כשיש, ואזהרות חשובות (בריאות) - בלי מסך ניתוח
  const { analysis, suggestion } = useMemo(
    () => runNutritionBrain(StorageService.getBodyWeightLog(), entries, goals, settings),
    [entries, goals, settings]
  );
  const warnings = analysis.insights.filter((i) => i.severity === 'warn').slice(0, 2);

  const refresh = () => setEntries(StorageService.getAllNutritionEntries());
  const markPrompted = () => onUpdateSettings({ ...settings, lastNutritionAdaptationPromptAt: Date.now() });

  const isToday = dayKey(viewDate) === dayKey(new Date());
  const dayEntries = useMemo(() => entries.filter((e) => dayKey(new Date(e.date)) === dayKey(viewDate)), [entries, viewDate]);
  const totals = useMemo(() => totalsOf(dayEntries), [dayEntries]);
  const remaining = goals.calories - totals.calories;

  // קלוריות לכל יום בשבוע המוצג - לפס הימים
  const caloriesByDay = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      const k = dayKey(new Date(e.date));
      map.set(k, (map.get(k) || 0) + entryKcal(e));
    });
    return map;
  }, [entries]);
  const weekStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - viewDate.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  const shiftDays = (n: number) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + n));

  const yesterdayEntries = useMemo(() => {
    const y = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 1);
    return entries.filter((e) => dayKey(new Date(e.date)) === dayKey(y));
  }, [entries, viewDate]);

  const copyFromYesterday = (meal: MealType) => {
    const source = yesterdayEntries.filter((e) => e.mealType === meal);
    const copies = source.map((e, i) => {
      const t = new Date(e.date);
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), t.getHours(), t.getMinutes()).getTime();
      return { ...e, id: `nut-${Date.now()}-${i}`, date };
    });
    StorageService.addNutritionEntries(copies);
    refresh();
  };

  // תאריך לרשומה חדשה: היום = עכשיו; יום אחר = אותו יום בשעה סבירה לארוחה
  const dateForNewEntry = (meal: MealType) => {
    if (isToday) return Date.now();
    const hour = { breakfast: 8, lunch: 13, dinner: 19, snack: 16 }[meal];
    return new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate(), hour).getTime();
  };

  const toggleMeal = (meal: MealType) =>
    setOpenMeals((prev) => {
      const next = new Set(prev);
      if (next.has(meal)) next.delete(meal);
      else next.add(meal);
      return next;
    });

  const dateTitle = isToday
    ? 'היום'
    : viewDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>תזונה</h1>
        <button onClick={() => setShowGoals(true)} style={iconButton} title="יעדים ומטרה">
          <Settings size={20} />
        </button>
      </div>

      {/* פס הימים בשבוע */}
      <div className="ios-card" style={{ padding: '10px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
          <button onClick={() => shiftDays(-7)} style={iconButton} title="שבוע קודם"><ChevronRight size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{dateTitle}</span>
            {!isToday && (
              <button onClick={() => setViewDate(startOfDay(new Date()))} style={chip}>חזרה להיום</button>
            )}
          </div>
          <button onClick={() => shiftDays(7)} style={iconButton} title="שבוע הבא"><ChevronLeft size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {weekDays.map((d) => {
            const k = dayKey(d);
            const kcal = caloriesByDay.get(k) || 0;
            const selected = k === dayKey(viewDate);
            const today = k === dayKey(new Date());
            return (
              <button
                key={k}
                onClick={() => setViewDate(d)}
                style={{
                  background: selected ? 'var(--color-blue-bg)' : 'transparent',
                  border: today && !selected ? '1px solid var(--border-subtle)' : '1px solid transparent',
                  borderRadius: 12,
                  padding: '6px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  color: 'var(--text-main)',
                }}
              >
                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                  {d.toLocaleDateString('he-IL', { weekday: 'narrow' })}
                </span>
                <Ring value={kcal} goal={goals.calories} size={30} stroke={3} color="var(--color-orange)">
                  <span style={{ fontSize: '0.7rem', fontWeight: selected ? 800 : 600 }}>{d.getDate()}</span>
                </Ring>
              </button>
            );
          })}
        </div>
      </div>

      {/* חיפוש וסריקה */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setAdding({ meal: isToday ? mealByTime() : 'snack', start: 'search' })}
          className="ios-card"
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.88rem', border: 'none', textAlign: 'start' }}
        >
          <Search size={17} />
          חפש מזון להוספה...
        </button>
        <button
          onClick={() => setAdding({ meal: isToday ? mealByTime() : 'snack', start: 'scan' })}
          className="ios-card"
          style={{ width: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-blue)', border: 'none' }}
          title="סריקת ברקוד"
        >
          <ScanBarcode size={22} />
        </button>
      </div>

      {/* סיכום היום */}
      <div className="ios-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring value={totals.calories} goal={goals.calories} size={112} stroke={10} color="var(--color-orange)">
            <span style={{ fontSize: '1.45rem', fontWeight: 900, color: remaining < 0 ? 'var(--color-red)' : 'var(--text-main)' }}>
              {Math.abs(remaining).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 700 }}>{remaining < 0 ? 'מעל היעד' : 'נותרו'}</span>
          </Ring>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
            <div style={summaryRow}><span style={{ color: 'var(--text-muted)' }}>יעד</span><b>{goals.calories.toLocaleString()}</b></div>
            <div style={summaryRow}><span style={{ color: 'var(--text-muted)' }}>אכלת</span><b>{totals.calories.toLocaleString()}</b></div>
            <div style={{ ...summaryRow, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>{remaining < 0 ? 'חריגה' : 'נותרו'}</span>
              <b style={{ color: remaining < 0 ? 'var(--color-red)' : 'var(--color-green)' }}>{Math.abs(remaining).toLocaleString()}</b>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
          {([
            ['חלבון', totals.protein, goals.protein, MACRO_COLORS.protein],
            ['פחמימות', totals.carbs, goals.carbs, MACRO_COLORS.carbs],
            ['שומן', totals.fat, goals.fat, MACRO_COLORS.fat],
          ] as [string, number, number, string][]).map(([label, value, goal, color]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Ring value={value} goal={goal} size={58} stroke={6} color={color}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{Math.round(value)}</span>
              </Ring>
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{label}</span>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                {Math.max(0, Math.round(goal - value))} גר׳ נותרו
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setNutrientsFor({ title: `ערכים תזונתיים · ${dateTitle}`, entries: dayEntries })}
          style={{ ...linkButton, marginTop: 12, width: '100%', justifyContent: 'center' }}
          disabled={dayEntries.length === 0}
        >
          כל הערכים התזונתיים (סיבים, סוכר, נתרן, ויטמינים...)
        </button>

        {warnings.map((w) => (
          <div key={w.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--color-red-bg)', borderRadius: 10, padding: '8px 10px', marginTop: 10, fontSize: '0.76rem', lineHeight: 1.5 }}>
            <AlertTriangle size={15} color="var(--color-red)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span><b>{w.title}.</b> {w.body}</span>
          </div>
        ))}
      </div>

      {/* הצעה שבועית לעדכון היעד - רק כשיש, ורק באישור */}
      {suggestion && (
        <div className="ios-card" style={{ padding: 14, border: '1px solid var(--color-blue)', background: 'var(--color-blue-bg)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 4 }}>
            עדכון מוצע ליעד היומי: {suggestion.previousCalories.toLocaleString()} ← {suggestion.goals.calories.toLocaleString()} קלוריות
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{suggestion.rationale}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                StorageService.saveNutritionGoals(suggestion.goals);
                setGoals(suggestion.goals);
                markPrompted();
              }}
              className="btn-primary"
              style={{ flex: 1, padding: 8, fontSize: '0.85rem' }}
            >
              עדכן
            </button>
            <button onClick={markPrompted} className="btn-secondary" style={{ flex: 1, padding: 8, fontSize: '0.85rem' }}>לא כרגע</button>
          </div>
        </div>
      )}

      {/* ארוחות */}
      {MEAL_TYPES.map((meal) => {
        const mealEntries = dayEntries.filter((e) => e.mealType === meal);
        const t = totalsOf(mealEntries);
        const canCopy = mealEntries.length === 0 && yesterdayEntries.some((e) => e.mealType === meal);
        const open = openMeals.has(meal);
        return (
          <div key={meal} className="ios-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--color-orange)', display: 'flex' }}>{MEAL_ICONS[meal]}</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{MEAL_LABELS[meal]}</span>
              </div>
              <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{t.calories > 0 ? `${t.calories.toLocaleString()} קל׳` : ''}</span>
            </div>

            {mealEntries.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 12, padding: '0 14px 8px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>חלבון <b style={{ color: MACRO_COLORS.protein }}>{Math.round(t.protein)}</b></span>
                  <span>פחמימות <b style={{ color: MACRO_COLORS.carbs }}>{Math.round(t.carbs)}</b></span>
                  <span>שומן <b style={{ color: MACRO_COLORS.fat }}>{Math.round(t.fat)}</b></span>
                  <button onClick={() => toggleMeal(meal)} style={{ ...linkButton, marginInlineStart: 'auto', fontSize: '0.7rem' }}>
                    {open ? 'פחות' : 'עוד ערכים'} <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
                  </button>
                </div>
                {open && (
                  <div style={{ padding: '0 14px 10px' }}>
                    <NutrientMiniGrid totals={t} calories={goals.calories} />
                    <button onClick={() => setNutrientsFor({ title: `${MEAL_LABELS[meal]} · ${dateTitle}`, entries: mealEntries })} style={{ ...linkButton, marginTop: 6 }}>
                      כל הערכים של הארוחה
                    </button>
                  </div>
                )}
                {mealEntries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setEditing(e)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', background: 'transparent', border: 'none', borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: 'var(--border-subtle)', cursor: 'pointer', textAlign: 'start', color: 'var(--text-main)' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.35 }}>{e.foodName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{amountLabel(e)}</div>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, flexShrink: 0 }}>{entryKcal(e)}</span>
                  </button>
                ))}
              </>
            )}

            <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setAdding({ meal, start: 'search' })} style={mealAction}>
                <Plus size={15} /> הוספת מזון
              </button>
              {canCopy && (
                <button onClick={() => copyFromYesterday(meal)} style={{ ...mealAction, borderInlineStart: '1px solid var(--border-subtle)' }}>
                  <Copy size={14} /> העתק מאתמול
                </button>
              )}
              <button onClick={() => setAdding({ meal, start: 'quick' })} style={{ ...mealAction, flex: '0 0 auto', padding: '10px 14px', borderInlineStart: '1px solid var(--border-subtle)' }} title="הוספה מהירה של קלוריות">
                <Zap size={15} />
              </button>
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
        נתונים: מאגר התזונה הלאומי (משרד הבריאות) · Open Food Facts (ODbL)
      </p>

      {adding && (
        <AddFoodSheet
          request={adding}
          entries={entries}
          dateFor={dateForNewEntry}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            refresh();
          }}
        />
      )}

      {editing && (
        <AmountSheet
          food={foodFromEntry(editing)}
          initialMeal={editing.mealType}
          initialUnit={editing.unitLabel}
          initialQty={editing.unitLabel ? editing.unitQty : editing.grams}
          confirmLabel="שמירה"
          onClose={() => setEditing(null)}
          onBack={() => setEditing(null)}
          onDelete={() => {
            StorageService.deleteNutritionEntry(editing.id);
            setEditing(null);
            refresh();
          }}
          onConfirm={({ grams, unitLabel, unitQty, meal }) => {
            StorageService.updateNutritionEntry({ ...editing, grams, unitLabel, unitQty, mealType: meal });
            setEditing(null);
            refresh();
          }}
        />
      )}

      {nutrientsFor && <NutrientsSheet title={nutrientsFor.title} entries={nutrientsFor.entries} calories={goals.calories} onClose={() => setNutrientsFor(null)} />}

      {showGoals && (
        <GoalsSheet
          settings={settings}
          goals={goals}
          analysis={analysis}
          onClose={() => setShowGoals(false)}
          onSaveSettings={(s, newGoals) => {
            onUpdateSettings(s);
            if (newGoals) {
              StorageService.saveNutritionGoals(newGoals);
              setGoals(newGoals);
            }
            setShowGoals(false);
          }}
          onSaveGoals={(g) => {
            StorageService.saveNutritionGoals(g);
            setGoals(g);
            setShowGoals(false);
          }}
        />
      )}
    </div>
  );
};

// ===== ערכים תזונתיים =====

const NutrientMiniGrid: React.FC<{ totals: Totals; calories: number }> = ({ totals, calories }) => {
  const keys: (keyof NutrientMap)[] = ['fiber', 'sugars', 'satFat', 'sodium'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {keys.map((k) => {
        const info = NUTRIENTS.find((x) => x.key === k)!;
        const v = totals.nutrients[k];
        const dv = dailyValueFor(info, calories);
        return (
          <div key={k} style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{info.label}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{v === undefined ? '—' : formatNutrient(v, info.unit)}</div>
            {v !== undefined && dv && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{Math.round((v / dv) * 100)}% מהיומי</div>}
          </div>
        );
      })}
    </div>
  );
};

const NutrientsSheet: React.FC<{ title: string; entries: NutritionEntry[]; calories: number; onClose: () => void }> = ({ title, entries, calories, onClose }) => {
  const t = totalsOf(entries);
  const groups = (Object.keys(NUTRIENT_GROUP_LABELS) as NutrientInfo['group'][]).map((g) => ({ g, items: NUTRIENTS.filter((n) => n.group === g) }));
  const row = (info: NutrientInfo) => {
    const v = t.nutrients[info.key];
    const dv = dailyValueFor(info, calories);
    const pct = v !== undefined && dv ? (v / dv) * 100 : null;
    const partial = v !== undefined && (t.coverage[info.key] ?? 1) < 0.95;
    const barColor = info.kind === 'limit' ? (pct !== null && pct > 100 ? 'var(--color-red)' : 'var(--color-orange)') : 'var(--color-green)';
    return (
      <div key={info.key} style={{ padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span>
            {info.label}
            {info.kind === 'limit' && <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem' }}> (מומלץ לא לעבור)</span>}
          </span>
          <span style={{ fontWeight: 700 }}>
            {v === undefined ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>אין נתון</span> : formatNutrient(v, info.unit)}
            {partial && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>+</span>}
            {dv !== undefined && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {formatNutrient(dv, info.unit)}</span>}
          </span>
        </div>
        {pct !== null && (
          <div style={{ background: 'var(--bg-surface-2)', borderRadius: 4, height: 5, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: barColor }} />
          </div>
        )}
      </div>
    );
  };
  const anyPartial = NUTRIENTS.some((n) => t.nutrients[n.key] !== undefined && (t.coverage[n.key] ?? 1) < 0.95);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 85)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={closeButton}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12, textAlign: 'center' }}>
          {([
            ['קלוריות', `${t.calories}`],
            ['חלבון', `${r1(t.protein)} גר׳`],
            ['פחמימות', `${r1(t.carbs)} גר׳`],
            ['שומן', `${r1(t.fat)} גר׳`],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '6px 2px' }}>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{l}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
        {groups.map(({ g, items }) => (
          <div key={g} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 2 }}>{NUTRIENT_GROUP_LABELS[g]}</div>
            {items.map(row)}
          </div>
        ))}
        <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {anyPartial && '"+" = לחלק מהפריטים אין נתון לרכיב הזה, אז הסכום האמיתי גבוה יותר. '}
          ערכים יומיים לפי טבלת ה-FDA למבוגרים; סיבים ושומן רווי מותאמים ליעד הקלורי שלך (14 גר׳ סיבים לכל 1,000 קל׳, שומן רווי עד 10% מהקלוריות).
        </p>
        <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>סגירה</button>
      </div>
    </div>
  );
};

const summaryRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between' };
const iconButton: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' };
const chip: React.CSSProperties = { background: 'var(--bg-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' };
const linkButton: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--color-blue)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3 };
const mealAction: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 8px', background: 'transparent', border: 'none', color: 'var(--color-blue)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' };
const closeButton: React.CSSProperties = { background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' };

// ===== הוספת מזון: חיפוש אחד על כל המקורות, סריקת ברקוד, הוספה מהירה, פריט חדש =====

/** מאכל שאפשר לבחור - מכל מקור, בפורמט אחד */
interface PickableFood {
  id: string;
  name: string;
  sub?: string; // שורה משנית: מותג / מקור
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrients: NutrientMap;
  servings: FoodServing[];
  source?: 'tzameret' | 'off';
}

const fromIsraeli = (f: IsraeliFood): PickableFood => ({
  id: `tz-${f.code}`,
  name: f.nameHe,
  kcal: f.kcal,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  nutrients: f.nutrients,
  servings: f.servings,
  source: 'tzameret',
});

const fromOff = (f: OffFood): PickableFood => ({
  id: `off-${f.barcode}`,
  name: f.name,
  sub: [f.brand, 'Open Food Facts'].filter(Boolean).join(' · '),
  kcal: f.kcal,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  nutrients: f.nutrients,
  servings: f.servings,
  source: 'off',
});

const fromFoodItem = (f: FoodItem): PickableFood => ({
  id: f.id,
  name: f.name,
  sub: 'המאכלים שלי',
  kcal: f.caloriesPer100g,
  protein: f.proteinPer100g,
  carbs: f.carbsPer100g,
  fat: f.fatPer100g,
  nutrients: { ...(f.nutrientsPer100g || {}), ...(f.fiberPer100g !== undefined ? { fiber: f.fiberPer100g } : {}) },
  servings: f.servings || [],
});

function foodFromEntry(e: NutritionEntry): PickableFood {
  return {
    id: e.foodId,
    name: e.foodName,
    kcal: e.caloriesPer100g,
    protein: e.proteinPer100g,
    carbs: e.carbsPer100g,
    fat: e.fatPer100g,
    nutrients: { ...(e.nutrientsPer100g || {}), ...(e.fiberPer100g !== undefined ? { fiber: e.fiberPer100g } : {}) },
    servings: e.servings || [],
    source: e.source,
  };
}

function entryFromFood(food: PickableFood, amount: AmountResult, date: number): NutritionEntry {
  return {
    id: `nut-${Date.now()}`,
    date,
    mealType: amount.meal,
    foodId: food.id,
    foodName: food.name,
    grams: amount.grams,
    caloriesPer100g: food.kcal,
    proteinPer100g: food.protein,
    carbsPer100g: food.carbs,
    fatPer100g: food.fat,
    fiberPer100g: food.nutrients.fiber,
    nutrientsPer100g: Object.keys(food.nutrients).length ? food.nutrients : undefined,
    source: food.source,
    servings: food.servings.length ? food.servings : undefined,
    unitLabel: amount.unitLabel,
    unitQty: amount.unitQty,
  };
}

/** סורק ברקוד במצלמה באפליקציה. בדפדפן (בדרך כלל מחשב בלי מצלמה) - מקלידים את המספר */
async function scanBarcode(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    const typed = window.prompt('הקלד את מספר הברקוד שמתחת לפסים:');
    return typed ? normalizeBarcode(typed) : null;
  }
  try {
    // נטען רק כשסורקים באמת - הספרייה כוללת מצלמת-דפדפן כבדה (~370KB) שלא צריך בשום מקום אחר
    const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } = await import('@capacitor/barcode-scanner');
    const res = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      scanInstructions: 'כוון את המצלמה לברקוד שעל האריזה',
      scanButton: false,
    });
    return res?.ScanResult ? normalizeBarcode(res.ScanResult) : null;
  } catch {
    return null; // המשתמש ביטל, או שאין הרשאת מצלמה
  }
}

const AddFoodSheet: React.FC<{
  request: AddRequest;
  entries: NutritionEntry[];
  dateFor: (meal: MealType) => number;
  onClose: () => void;
  onAdded: () => void;
}> = ({ request, entries, dateFor, onClose, onAdded }) => {
  const [meal, setMeal] = useState<MealType>(request.meal);
  const [mode, setMode] = useState<'search' | 'quick' | 'new'>(request.start === 'quick' ? 'quick' : 'search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickableFood | null>(null);
  const [db, setDb] = useState<IsraeliFoodDb | null>(null);
  const [dbError, setDbError] = useState(false);
  const [offResults, setOffResults] = useState<PickableFood[] | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [newFoodPrefill, setNewFoodPrefill] = useState<{ name?: string; barcode?: string } | null>(null);
  const foodItems = useMemo(() => StorageService.getFoodItems(), []);
  const scanStarted = useRef(false);

  useEffect(() => {
    loadIsraeliFoodDb().then(setDb).catch(() => setDbError(true));
  }, []);

  useEffect(() => {
    setOffResults(null);
  }, [query]);

  const recent: PickableFood[] = useMemo(() => {
    const seen = new Set<string>();
    const out: PickableFood[] = [];
    [...entries].sort((a, b) => b.date - a.date).forEach((e) => {
      if (seen.has(e.foodId) || out.length >= 15 || e.foodId.startsWith('quick-')) return;
      seen.add(e.foodId);
      out.push({ ...foodFromEntry(e), sub: `${MEAL_SHORT[e.mealType]} · ${amountLabel(e)}` });
    });
    return out;
  }, [entries]);

  const q = normalizeForSearch(query);
  const mine = q ? foodItems.filter((f) => normalizeForSearch(f.name).includes(q)).map(fromFoodItem) : [];
  const israeli = useMemo(() => (db && query.trim() ? db.search(query, 40).map(fromIsraeli) : []), [db, query]);

  const handleBarcode = async () => {
    setStatus(null);
    const code = await scanBarcode();
    if (!code) return;
    const own = foodItems.find((f) => f.barcode === code);
    if (own) return setSelected(fromFoodItem(own));
    setStatus('מחפש את המוצר...');
    try {
      const product = await getProductByBarcode(code);
      if (product && !product.incomplete) {
        setStatus(null);
        setSelected(fromOff(product));
        return;
      }
      setStatus(
        product
          ? `"${product.name}" נמצא, אבל בלי ערכים תזונתיים. הזן אותם מהתווית - בסריקה הבאה הוא יימצא מיד.`
          : 'המוצר לא נמצא במאגר. הזן את הערכים מהתווית - בסריקה הבאה הוא יימצא מיד.'
      );
      setNewFoodPrefill({ name: product?.name, barcode: code });
      setMode('new');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'החיפוש נכשל.');
    }
  };

  // פתיחה ישירה מכפתור הברקוד במסך הראשי
  useEffect(() => {
    if (request.start === 'scan' && !scanStarted.current) {
      scanStarted.current = true;
      handleBarcode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchWorld = async () => {
    setOffBusy(true);
    setStatus(null);
    try {
      setOffResults((await searchProducts(query)).map(fromOff));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'החיפוש נכשל.');
    } finally {
      setOffBusy(false);
    }
  };

  if (selected) {
    return (
      <AmountSheet
        food={selected}
        initialMeal={meal}
        confirmLabel="הוספה"
        onBack={() => setSelected(null)}
        onClose={onClose}
        onConfirm={(amount) => {
          StorageService.addNutritionEntry(entryFromFood(selected, amount, dateFor(amount.meal)));
          onAdded();
        }}
      />
    );
  }

  const row = (f: PickableFood) => (
    <button
      key={f.id}
      onClick={() => setSelected(f)}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 2px', borderBottom: '1px solid var(--border-subtle)', background: 'transparent', border: 'none', borderBottomStyle: 'solid', borderBottomWidth: 1, borderBottomColor: 'var(--border-subtle)', cursor: 'pointer', textAlign: 'start', color: 'var(--text-main)' }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.35 }}>{f.name}</div>
        {f.sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{f.sub}</div>}
      </div>
      <div style={{ textAlign: 'end', flexShrink: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{Math.round(f.kcal)}</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>קל׳ / 100 גר׳</div>
      </div>
    </button>
  );

  const sectionTitle = (t: string) => <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', margin: '10px 2px 2px' }}>{t}</div>;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 88)', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>הוספת מזון</h3>
          <button onClick={onClose} style={closeButton}><X size={18} /></button>
        </div>

        <MealPicker value={meal} onChange={setMeal} />

        <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
          <button className={`filter-chip ${mode === 'search' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setMode('search')}>חיפוש</button>
          <button className={`filter-chip ${mode === 'quick' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setMode('quick')}>הוספה מהירה</button>
          <button className={`filter-chip ${mode === 'new' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setNewFoodPrefill(null); setMode('new'); }}>פריט חדש</button>
        </div>

        {status && (
          <div style={{ fontSize: '0.76rem', background: 'var(--bg-surface-2)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, lineHeight: 1.5 }}>{status}</div>
        )}

        {mode === 'quick' && (
          <QuickAddForm
            onSubmit={(food) => {
              StorageService.addNutritionEntry(entryFromFood(food, { grams: 100, unitLabel: 'מנה', unitQty: 1, meal }, dateFor(meal)));
              onAdded();
            }}
          />
        )}

        {mode === 'new' && (
          <NewFoodForm
            key={newFoodPrefill?.barcode || 'new'}
            prefill={newFoodPrefill}
            onCreated={(food) => {
              setStatus(null);
              setSelected(fromFoodItem(food));
            }}
          />
        )}

        {mode === 'search' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)' }} />
                <input
                  type="search"
                  className="gym-input-box"
                  placeholder="קוטג׳, שקשוקה, במבה, חזה עוף..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ paddingRight: 36 }}
                  autoFocus={request.start === 'search'}
                />
              </div>
              <button onClick={handleBarcode} className="btn-secondary" style={{ width: 46, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="סריקת ברקוד">
                <ScanBarcode size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!query.trim() && (
                <>
                  {recent.length > 0 ? (
                    <>
                      {sectionTitle('אחרונים')}
                      {recent.map(row)}
                    </>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '24px 8px', lineHeight: 1.6 }}>
                      חפש מאכל, מוצר או מנה מתוך מאגר התזונה הלאומי - או סרוק ברקוד של מוצר ארוז.
                    </p>
                  )}
                </>
              )}

              {query.trim() && (
                <>
                  {mine.length > 0 && (
                    <>
                      {sectionTitle('המאכלים שלי')}
                      {mine.map(row)}
                    </>
                  )}
                  {sectionTitle('מאגר התזונה הלאומי')}
                  {!db && !dbError && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '10px 2px' }}>
                      <Loader2 size={14} className="spin" /> טוען...
                    </p>
                  )}
                  {dbError && <p style={{ color: 'var(--color-red)', fontSize: '0.8rem', padding: '10px 2px' }}>לא הצלחתי לטעון את המאגר.</p>}
                  {db && israeli.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '10px 2px' }}>לא נמצא.</p>}
                  {israeli.map(row)}

                  {isOffTextSearchAvailable() && (
                    <>
                      {offResults === null ? (
                        <button onClick={searchWorld} disabled={offBusy || query.trim().length < 2} className="btn-secondary" style={{ width: '100%', margin: '12px 0 4px' }}>
                          {offBusy ? <Loader2 size={15} className="spin" /> : <Globe size={15} />} חיפוש גם במוצרים מהעולם (Open Food Facts)
                        </button>
                      ) : (
                        <>
                          {sectionTitle('Open Food Facts')}
                          {offResults.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '10px 2px' }}>לא נמצא. במאגר הזה עדיף לחפש באנגלית, או לסרוק ברקוד.</p>
                          ) : (
                            offResults.map(row)
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MealPicker: React.FC<{ value: MealType; onChange: (m: MealType) => void }> = ({ value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, background: 'var(--bg-surface-2)', borderRadius: 10, padding: 3 }}>
    {MEAL_TYPES.map((m) => (
      <button
        key={m}
        onClick={() => onChange(m)}
        style={{
          border: 'none',
          borderRadius: 8,
          padding: '6px 0',
          fontSize: '0.76rem',
          fontWeight: 700,
          cursor: 'pointer',
          background: value === m ? 'var(--bg-surface-1)' : 'transparent',
          color: value === m ? 'var(--text-main)' : 'var(--text-muted)',
          boxShadow: value === m ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        {MEAL_SHORT[m]}
      </button>
    ))}
  </div>
);

interface AmountResult {
  grams: number;
  unitLabel?: string;
  unitQty?: number;
  meal: MealType;
}

/** כמות: יחידות מהמאגר (כף, פרוסה, מנה...) או גרמים, עם כל הערכים לכמות שנבחרה */
const AmountSheet: React.FC<{
  food: PickableFood;
  initialMeal: MealType;
  initialUnit?: string;
  initialQty?: number;
  confirmLabel: string;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (r: AmountResult) => void;
  onDelete?: () => void;
}> = ({ food, initialMeal, initialUnit, initialQty, confirmLabel, onBack, onClose, onConfirm, onDelete }) => {
  const defaultServing =
    (initialUnit && food.servings.find((s) => s.label === initialUnit)) ||
    (initialQty === undefined
      ? food.servings.find((s) => /בינונית/.test(s.label)) ??
        food.servings.find((s) => /^(יחידה|פרוסה|כף|כוס|מנה)( |$)/.test(s.label)) ??
        food.servings[0]
      : undefined);
  const [unit, setUnit] = useState<string>(defaultServing ? defaultServing.label : 'grams');
  const [qty, setQty] = useState(String(initialQty ?? (defaultServing ? 1 : 100)));
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const serving = food.servings.find((s) => s.label === unit);
  const qtyNum = parseFloat(qty) || 0;
  const grams = Math.round(qtyNum * (serving ? serving.grams : 1) * 10) / 10;
  const f = grams / 100;
  const extras = (['fiber', 'sugars', 'satFat', 'sodium'] as (keyof NutrientMap)[])
    .map((k) => ({ info: NUTRIENTS.find((n) => n.key === k)!, v: food.nutrients[k] }))
    .filter((x) => x.v !== undefined);

  const step = (delta: number) => setQty(String(Math.max(0, Math.round((qtyNum + delta) * 100) / 100)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 88)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.35 }}>{food.name}</h3>
          <button onClick={onClose} style={closeButton}><X size={18} /></button>
        </div>
        {food.sub && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{food.sub}</p>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-surface-2)', borderRadius: 14, padding: 12, margin: '8px 0 12px' }}>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>{Math.round(food.kcal * f)}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>קלוריות</div>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, textAlign: 'center' }}>
            {([
              ['חלבון', food.protein, MACRO_COLORS.protein],
              ['פחמימות', food.carbs, MACRO_COLORS.carbs],
              ['שומן', food.fat, MACRO_COLORS.fat],
            ] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: c }}>{r1(v * f)}</div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>כמות</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => step(serving ? -0.5 : -10)} className="btn-secondary" style={stepper}>−</button>
              <input type="number" inputMode="decimal" className="gym-input-box" value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()} style={{ textAlign: 'center', padding: '10px 4px' }} />
              <button onClick={() => step(serving ? 0.5 : 10)} className="btn-secondary" style={stepper}>+</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>יחידה</label>
            <select
              className="gym-input-box"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setQty(e.target.value === 'grams' ? '100' : '1');
              }}
            >
              {food.servings.map((s) => (
                <option key={s.label} value={s.label}>{s.label} ({s.grams} גר׳)</option>
              ))}
              <option value="grams">גרם</option>
            </select>
          </div>
        </div>

        <label style={labelStyle}>ארוחה</label>
        <div style={{ marginBottom: 12 }}>
          <MealPicker value={meal} onChange={setMeal} />
        </div>

        {extras.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${extras.length}, 1fr)`, gap: 6, marginBottom: 12 }}>
            {extras.map(({ info, v }) => (
              <div key={info.key} style={{ background: 'var(--bg-surface-2)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{info.label}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{formatNutrient((v as number) * f, info.unit)}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {onDelete ? (
            <button className="btn-secondary" style={{ flex: '0 0 auto', color: 'var(--color-red)', padding: '0 14px' }} onClick={() => window.confirm('למחוק את הפריט מהיומן?') && onDelete()}>
              <Trash2 size={16} />
            </button>
          ) : (
            <button className="btn-secondary" style={{ flex: 1 }} onClick={onBack}>חזרה</button>
          )}
          <button
            className="btn-primary"
            style={{ flex: 2 }}
            disabled={grams <= 0}
            onClick={() => onConfirm({ grams, unitLabel: serving?.label, unitQty: serving ? qtyNum : undefined, meal })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** הוספה מהירה: רק קלוריות (ומאקרו אם יודעים) - כמו "Quick Add" ב-MyFitnessPal */
const QuickAddForm: React.FC<{ onSubmit: (food: PickableFood) => void }> = ({ onSubmit }) => {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const field = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" inputMode="decimal" className="gym-input-box" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        יודע רק כמה קלוריות היו (למשל במסעדה)? הזן אותן ישירות.
      </p>
      <label style={labelStyle}>תיאור (לא חובה)</label>
      <input type="text" className="gym-input-box" value={name} onChange={(e) => setName(e.target.value)} placeholder="ארוחה במסעדה" style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {field('קלוריות *', kcal, setKcal)}
        {field('חלבון (גר׳)', protein, setProtein)}
        {field('פחמימות (גר׳)', carbs, setCarbs)}
        {field('שומן (גר׳)', fat, setFat)}
      </div>
      <button
        className="btn-primary"
        style={{ width: '100%' }}
        disabled={!(parseFloat(kcal) > 0)}
        onClick={() =>
          onSubmit({
            id: `quick-${Date.now()}`,
            name: name.trim() || 'הוספה מהירה',
            kcal: parseFloat(kcal) || 0,
            protein: parseFloat(protein) || 0,
            carbs: parseFloat(carbs) || 0,
            fat: parseFloat(fat) || 0,
            nutrients: {},
            servings: [{ label: 'מנה', grams: 100 }],
          })
        }
      >
        <Zap size={16} /> הוספה
      </button>
    </div>
  );
};

/** מאכל חדש לפי התווית - נשמר ב"המאכלים שלי" (ועם ברקוד, אם הגיע מסריקה) */
const NewFoodForm: React.FC<{ prefill: { name?: string; barcode?: string } | null; onCreated: (food: FoodItem) => void }> = ({ prefill, onCreated }) => {
  const [name, setName] = useState(prefill?.name || '');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [servingGrams, setServingGrams] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [k]: e.target.value }));
  const num = (k: string) => (vals[k] === undefined || vals[k].trim() === '' ? undefined : parseFloat(vals[k]));

  const create = () => {
    const kcal = num('kcal');
    if (!name.trim() || !kcal) return;
    const nutrients: NutrientMap = {};
    (['fiber', 'sugars', 'satFat', 'sodium'] as (keyof NutrientMap)[]).forEach((k) => {
      const v = num(k);
      if (v !== undefined && Number.isFinite(v)) nutrients[k] = v;
    });
    const sg = parseFloat(servingGrams);
    const food: FoodItem = {
      id: `food-${Date.now()}`,
      name: name.trim(),
      caloriesPer100g: kcal,
      proteinPer100g: num('protein') || 0,
      carbsPer100g: num('carbs') || 0,
      fatPer100g: num('fat') || 0,
      fiberPer100g: nutrients.fiber,
      nutrientsPer100g: Object.keys(nutrients).length ? nutrients : undefined,
      servings: sg > 0 ? [{ label: 'מנה', grams: sg }] : undefined,
      barcode: prefill?.barcode,
    };
    StorageService.saveFoodItem(food);
    onCreated(food);
  };

  const field = (label: string, k: string) => (
    <div>
      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      <input type="number" inputMode="decimal" className="gym-input-box" value={vals[k] ?? ''} onChange={set(k)} />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <label style={labelStyle}>שם המאכל</label>
      <input type="text" className="gym-input-box" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
      {prefill?.barcode && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8, direction: 'ltr', textAlign: 'end' }}>ברקוד {prefill.barcode}</p>}
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>ערכים ל-100 גרם (מהתווית):</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {field('קלוריות *', 'kcal')}
        {field('חלבון (גר׳)', 'protein')}
        {field('פחמימות (גר׳)', 'carbs')}
        {field('שומן (גר׳)', 'fat')}
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>לא חובה:</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {field('סיבים (גר׳)', 'fiber')}
        {field('סוכרים (גר׳)', 'sugars')}
        {field('שומן רווי (גר׳)', 'satFat')}
        {field('נתרן (מ״ג)', 'sodium')}
      </div>
      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>גודל מנה בגרמים (לא חובה)</label>
      <input type="number" inputMode="decimal" className="gym-input-box" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} style={{ marginBottom: 14 }} />
      <button className="btn-primary" style={{ width: '100%' }} onClick={create} disabled={!name.trim() || !(num('kcal')! > 0)}>
        <Save size={16} /> שמירה והמשך לכמות
      </button>
    </div>
  );
};

// ===== יעדים ומטרה (מאחורי גלגל השיניים) =====

const GoalsSheet: React.FC<{
  settings: UserSettings;
  goals: NutritionGoals;
  analysis: NutritionAnalysis;
  onClose: () => void;
  onSaveSettings: (s: UserSettings, g: NutritionGoals | null) => void;
  onSaveGoals: (g: NutritionGoals) => void;
}> = ({ settings, goals, analysis, onClose, onSaveSettings, onSaveGoals }) => {
  const [view, setView] = useState<'menu' | 'profile' | 'manual' | 'sources'>('menu');
  if (view === 'profile') return <GoalProfileModal settings={settings} onClose={onClose} onSave={onSaveSettings} />;
  if (view === 'manual') return <GoalsEditorModal goals={goals} onClose={onClose} onSave={onSaveGoals} />;
  if (view === 'sources') return <BrainExplainSheet analysis={analysis} onClose={onClose} />;
  const item = (title: string, sub: string, onClick: () => void) => (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'start', background: 'var(--bg-surface-2)', border: 'none', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', color: 'var(--text-main)', marginBottom: 8 }}>
      <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{title}</div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </button>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>יעדים</h3>
          <button onClick={onClose} style={closeButton}><X size={18} /></button>
        </div>
        <div style={{ fontSize: '0.8rem', marginBottom: 12, color: 'var(--text-muted)' }}>
          כרגע: {goals.calories.toLocaleString()} קלוריות · חלבון {goals.protein} · פחמימות {goals.carbs} · שומן {goals.fat} גר׳
        </div>
        {item('המטרה שלי', 'חיטוב / מסה / שמירה, קצב, פעילות יומיומית - והיעדים מחושבים אוטומטית', () => setView('profile'))}
        {item('עריכה ידנית', 'לקבוע קלוריות ומאקרו בעצמך', () => setView('manual'))}
        {item('על מה מבוססים היעדים', 'השיטה והמחקרים שעליהם החישוב נשען', () => setView('sources'))}
      </div>
    </div>
  );
};

const stepper: React.CSSProperties = { width: 34, flex: '0 0 34px', padding: 0, height: 42, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' };

// ===== "איך זה מחושב" + המקורות =====

const BrainExplainSheet: React.FC<{ analysis: NutritionAnalysis; onClose: () => void }> = ({ analysis, onClose }) => {
  const e = analysis.estimate;
  const t = analysis.targets;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(ev) => ev.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 85)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 10 }}>איך מוח התזונה עובד</h3>
        <ol style={{ fontSize: '0.8rem', lineHeight: 1.6, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <li>
            <b>נקודת פתיחה:</b> חילוף חומרים במנוחה לפי משוואת Mifflin-St Jeor, כפול רמת הפעילות שלך.
            {e && <> כרגע: {e.formulaTdee.toLocaleString()} קלוריות.</>}
          </li>
          <li>
            <b>לומד מהגוף שלך:</b> אחרי 10+ ימים מתועדים במלואם ו-5+ שקילות, האפליקציה מחשבת כמה אתה שורף בפועל: הצריכה הממוצעת פחות השינוי במאגרי הגוף.
            קילו שירד או עלה מחושב לפי הרכב הגוף (שומן ≈ 9,440 קל׳, רקמה רזה ≈ 1,820), לא לפי "7,700 לקילו" קבוע.
            {e?.adaptiveTdee && <> לפי הנתונים שלך: {e.adaptiveTdee.toLocaleString()} קלוריות ({e.completeDays} ימים).</>}
          </li>
          <li>
            <b>ימים חלקיים לא נספרים:</b> יום שתועד פחות ממחצית מהיעד כנראה חסר ארוחה, והוא היה מוריד את היעד בטעות.
            דיווח חסר עקבי (כמו שמן שלא נשקל) מתקזז מעצמו, כי היעד נגזר מהצריכה המדווחת שלך.
          </li>
          <li>
            <b>היעד:</b> לפי המטרה והקצב - חיטוב 0.25%-1% ממשקל הגוף בשבוע, מסה 0.25%-0.5% בשבוע. אף פעם לא מתחת ל-1,200 קלוריות לנשים / 1,500 לגברים או מתחת לחילוף החומרים במנוחה.
            {t && <> כרגע: {t.calories.toLocaleString()} קלוריות.</>}
          </li>
          <li>
            <b>מאקרו:</b> חלבון לפי מסת הגוף הרזה (יותר בחיטוב), שומן 25% (לא פחות מ-20%), השאר פחמימות. סיבים: 14 גרם לכל 1,000 קלוריות.
          </li>
          <li>
            <b>עדכון שבועי:</b> פעם בשבוע לכל היותר מוצע עדכון, עד 250 קלוריות בכל פעם - ורק באישור שלך.
          </li>
        </ol>

        <div style={{ fontSize: '0.74rem', background: 'var(--color-orange-bg)', borderRadius: 10, padding: 10, marginBottom: 14, lineHeight: 1.5 }}>
          ההמלצות מיועדות למבוגרים בריאים. בהריון או הנקה, בסוכרת או בטיפול תרופתי, עם היסטוריה של הפרעות אכילה, או מתחת לגיל 18 - התייעץ עם רופא/ה או דיאטן/ית קליני/ת.
        </div>

        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: 6 }}>המקורות ({Object.keys(EVIDENCE).length})</h4>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          רק מטא-אנליזות, סקירות שיטתיות, הנחיות קליניות ועמדות רשמיות. נבדק לאחרונה: {new Date(EVIDENCE_REVIEWED_AT).toLocaleDateString('he-IL')}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {Object.values(EVIDENCE).map((src) => (
            <div key={src.id} style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.5, marginBottom: 4 }}>{src.finding}</div>
              <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.68rem', color: 'var(--color-blue)', display: 'inline-flex', gap: 4, alignItems: 'center', direction: 'ltr' }}>
                <ExternalLink size={11} /> {src.citation}
              </a>
            </div>
          ))}
        </div>
        <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>סגירה</button>
      </div>
    </div>
  );
};

// ===== "המטרה שלי": מטרה, קצב, פעילות ונתוני בסיס =====

const GoalProfileModal: React.FC<{
  settings: UserSettings;
  onClose: () => void;
  onSave: (settings: UserSettings, newGoals: NutritionGoals | null) => void;
}> = ({ settings, onClose, onSave }) => {
  const experience = settings.experienceLevel ?? 'beginner';
  const [mode, setMode] = useState<NutritionGoalMode>(settings.nutritionGoalMode ?? goalModeFromGoals(settings.goals));
  const [rate, setRate] = useState<number>(settings.weeklyRatePercent ?? defaultWeeklyRate(mode, experience));
  const [activity, setActivity] = useState<ActivityLevel>(settings.activityLevel ?? defaultActivityLevel(settings.trainingDaysPerWeek));
  const [gender, setGender] = useState<'male' | 'female' | undefined>(settings.gender);
  const [age, setAge] = useState(settings.ageYears ? String(settings.ageYears) : '');
  const [height, setHeight] = useState(settings.heightCm ? String(settings.heightCm) : '');
  const weight = currentWeight(StorageService.getBodyWeightLog(), Date.now());

  const changeMode = (m: NutritionGoalMode) => {
    setMode(m);
    setRate(defaultWeeklyRate(m, experience));
  };

  const draft: UserSettings = {
    ...settings,
    nutritionGoalMode: mode,
    weeklyRatePercent: clampRate(mode, rate),
    activityLevel: activity,
    gender,
    ageYears: parseInt(age, 10) || undefined,
    heightCm: parseInt(height, 10) || undefined,
  };
  const draftAnalysis = analyzeNutrition(draft, StorageService.getBodyWeightLog(), StorageService.getAllNutritionEntries(), StorageService.getNutritionGoals());
  const profile = draftAnalysis.profile;
  const preview = draftAnalysis.targets;
  const limits = mode === 'maintain' ? null : RATE_LIMITS[mode];
  const weeklyKg = profile && mode !== 'maintain' ? ((profile.weeklyRatePercent / 100) * profile.weightKg).toFixed(2) : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 88)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 12 }}>המטרה שלי</h3>

        <label style={labelStyle}>מטרה</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {(Object.keys(MODE_LABELS) as NutritionGoalMode[]).map((m) => (
            <button key={m} className={`filter-chip ${mode === m ? 'active' : ''}`} style={{ textAlign: 'start' }} onClick={() => changeMode(m)}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {limits && (
          <>
            <label style={labelStyle}>
              קצב: {clampRate(mode, rate)}% ממשקל הגוף בשבוע{weeklyKg ? ` (כ-${weeklyKg} ק״ג)` : ''}
            </label>
            <input
              type="range"
              min={limits.min}
              max={limits.max}
              step={0.05}
              value={clampRate(mode, rate)}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              style={{ width: '100%', marginBottom: 4 }}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              {mode === 'lose' && 'המחקר: 0.5%-1% בשבוע שומר הכי טוב על השריר. מהר יותר = יותר שריר הולך.'}
              {mode === 'recomp' && 'גירעון קטן עם חלבון גבוה - יורדים בשומן ובונים שריר במקביל, לאט.'}
              {mode === 'gain' && 'המחקר: 0.25%-0.5% בשבוע. מתחילים בצד הגבוה, מתקדמים בצד הנמוך - מעבר לזה זה בעיקר שומן.'}
            </p>
          </>
        )}

        <label style={labelStyle}>פעילות יומיומית (מחוץ לאימונים)</label>
        <select className="gym-input-box" value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} style={{ marginBottom: 12 }}>
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
            <option key={a} value={a}>
              {ACTIVITY_LABELS[a]} (×{ACTIVITY_PAL[a]})
            </option>
          ))}
        </select>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>מין</label>
            <select className="gym-input-box" value={gender ?? ''} onChange={(e) => setGender((e.target.value || undefined) as 'male' | 'female' | undefined)}>
              <option value="">-</option>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>גיל</label>
            <input type="number" className="gym-input-box" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>גובה (ס״מ)</label>
            <input type="number" className="gym-input-box" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
        </div>
        {!weight && <p style={{ fontSize: '0.74rem', color: 'var(--color-orange)', marginBottom: 12 }}>הוסף שקילה במסך "משקל גוף" כדי שאפשר יהיה לחשב יעדים.</p>}

        {preview && (
          <div style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: 10, fontSize: '0.78rem', marginBottom: 12, lineHeight: 1.6 }}>
            <b>יעד יומי לפי הבחירות:</b> {preview.calories.toLocaleString()} קלוריות · חלבון {preview.protein} · פחמימות {preview.carbs} · שומן {preview.fat} גר׳ · סיבים {preview.fiber} גר׳
            {preview.flooredAtMinimum && <div style={{ color: 'var(--color-orange)' }}>הוגבל לרצפה הבטוחה.</div>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => onSave(draft, null)}>שמור בלי לשנות יעד</button>
          <button
            className="btn-primary"
            style={{ flex: 1 }}
            disabled={!preview}
            onClick={() => preview && onSave(draft, { calories: preview.calories, protein: preview.protein, carbs: preview.carbs, fat: preview.fat })}
          >
            <Save size={16} /> עדכן יעד
          </button>
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = { fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 };

// ===== עריכת יעדים תזונתיים =====

const GoalsEditorModal: React.FC<{ goals: NutritionGoals; onClose: () => void; onSave: (g: NutritionGoals) => void }> = ({ goals, onClose, onSave }) => {
  const [calories, setCalories] = useState(String(goals.calories));
  const [protein, setProtein] = useState(String(goals.protein));
  const [carbs, setCarbs] = useState(String(goals.carbs));
  const [fat, setFat] = useState(String(goals.fat));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 14 }}>יעדים יומיים</h3>

        <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>קלוריות</label>
        <input type="number" className="gym-input-box" value={calories} onChange={(e) => setCalories(e.target.value)} style={{ marginBottom: 10 }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>חלבון (גר׳)</label>
            <input type="number" className="gym-input-box" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>פחמימה (גר׳)</label>
            <input type="number" className="gym-input-box" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>שומן (גר׳)</label>
            <input type="number" className="gym-input-box" value={fat} onChange={(e) => setFat(e.target.value)} />
          </div>
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={() => onSave({
            calories: parseFloat(calories) || 0,
            protein: parseFloat(protein) || 0,
            carbs: parseFloat(carbs) || 0,
            fat: parseFloat(fat) || 0,
          })}
        >
          <Save size={16} /> שמירה
        </button>
      </div>
    </div>
  );
};
