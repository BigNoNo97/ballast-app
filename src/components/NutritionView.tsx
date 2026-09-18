import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, Trash2, X, Search, Settings, Save, Coffee, Sun, Moon, Apple, Flame } from 'lucide-react';
import { FoodItem, NutritionEntry, NutritionGoals, MealType } from '../types';
import { StorageService } from '../services/storage';
import { computeAdaptiveTarget } from '../services/nutritionAdaptation';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנוש',
};
const MEAL_ICONS: Record<MealType, React.ReactNode> = {
  breakfast: <Coffee size={16} />,
  lunch: <Sun size={16} />,
  dinner: <Moon size={16} />,
  snack: <Apple size={16} />,
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function entryTotals(e: { grams: number; caloriesPer100g: number; proteinPer100g: number; carbsPer100g: number; fatPer100g: number }) {
  const factor = e.grams / 100;
  return {
    calories: Math.round(e.caloriesPer100g * factor),
    protein: Math.round(e.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(e.carbsPer100g * factor * 10) / 10,
    fat: Math.round(e.fatPer100g * factor * 10) / 10,
  };
}

export const NutritionView: React.FC = () => {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [entries, setEntries] = useState<NutritionEntry[]>(() => StorageService.getAllNutritionEntries());
  const [goals, setGoals] = useState<NutritionGoals>(() => StorageService.getNutritionGoals());
  const [addingMeal, setAddingMeal] = useState<MealType | null>(null);
  const [showGoals, setShowGoals] = useState(false);
  const [settings, setSettings] = useState(() => StorageService.getSettings());
  const [suggestion, setSuggestion] = useState(() =>
    computeAdaptiveTarget(StorageService.getBodyWeightLog(), StorageService.getAllNutritionEntries(), StorageService.getNutritionGoals(), settings.goals, settings)
  );

  const applySuggestion = () => {
    if (!suggestion) return;
    const newGoals: NutritionGoals = { calories: suggestion.calories, protein: suggestion.protein, carbs: suggestion.carbs, fat: suggestion.fat };
    StorageService.saveNutritionGoals(newGoals);
    setGoals(newGoals);
    const updatedSettings = { ...settings, lastNutritionAdaptationPromptAt: Date.now() };
    StorageService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setSuggestion(null);
  };

  const dismissSuggestion = () => {
    const updatedSettings = { ...settings, lastNutritionAdaptationPromptAt: Date.now() };
    StorageService.saveSettings(updatedSettings);
    setSettings(updatedSettings);
    setSuggestion(null);
  };

  const refresh = () => setEntries(StorageService.getAllNutritionEntries());

  const key = dayKey(viewDate);
  const dayEntries = useMemo(() => entries.filter((e) => dayKey(new Date(e.date)) === key), [entries, key]);

  const dayTotals = useMemo(() => {
    return dayEntries.reduce(
      (acc, e) => {
        const t = entryTotals(e);
        acc.calories += t.calories;
        acc.protein += t.protein;
        acc.carbs += t.carbs;
        acc.fat += t.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayEntries]);

  const isToday = dayKey(new Date()) === key;
  const dateLabel = viewDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

  const handleDelete = (id: string) => {
    if (!window.confirm('למחוק את הרשומה הזו?')) return;
    StorageService.deleteNutritionEntry(id);
    refresh();
  };

  const macroBar = (label: string, value: number, goal: number, color: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>
          {value}
          <span style={{ color: 'var(--text-muted)' }}>{' / '}{goal} גר׳</span>
        </span>
      </div>
      <div style={{ background: 'var(--bg-surface-2)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (value / (goal || 1)) * 100)}%`, height: '100%', background: color, borderRadius: 6 }} />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>תזונה</h1>
        <button
          onClick={() => setShowGoals(true)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          title="יעדים"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Date Navigator */}
      <div className="ios-card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 1))} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}>
          <ChevronRight size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{isToday ? 'היום' : dateLabel}</span>
          {!isToday && (
            <button onClick={() => setViewDate(new Date())} style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
              היום
            </button>
          )}
        </div>
        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + 1))} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={20} />
        </button>
      </div>

      {/* הצעת עדכון יעד אדפטיבי - לפי מעקב משקל/קלוריות בפועל, לא נכפה בלי אישור */}
      {suggestion && (
        <div className="ios-card" style={{ padding: 14, border: '1px solid var(--color-blue)', background: 'var(--color-blue-bg)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 4 }}>
            עדכון מוצע ליעד היומי: {goals.calories.toLocaleString()} ← {suggestion.calories.toLocaleString()} קלוריות
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{suggestion.rationale}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={applySuggestion} className="btn-primary" style={{ flex: 1, padding: 8, fontSize: '0.85rem' }}>
              עדכן
            </button>
            <button onClick={dismissSuggestion} className="btn-secondary" style={{ flex: 1, padding: 8, fontSize: '0.85rem' }}>
              לא כרגע
            </button>
          </div>
        </div>
      )}

      {/* Daily Summary */}
      <div className="ios-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Flame size={18} color="var(--color-orange)" />
          <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{dayTotals.calories.toLocaleString()}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>/ {goals.calories.toLocaleString()} קלוריות</span>
        </div>
        <div style={{ background: 'var(--bg-surface-2)', borderRadius: 8, height: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div
            style={{
              width: `${Math.min(100, (dayTotals.calories / (goals.calories || 1)) * 100)}%`,
              height: '100%',
              background: dayTotals.calories > goals.calories ? 'var(--color-red)' : 'linear-gradient(90deg, var(--color-orange), var(--color-yellow))',
              borderRadius: 8,
            }}
          />
        </div>
        {macroBar('חלבון', dayTotals.protein, goals.protein, 'var(--color-blue)')}
        {macroBar('פחמימות', dayTotals.carbs, goals.carbs, 'var(--color-green)')}
        {macroBar('שומן', dayTotals.fat, goals.fat, 'var(--color-purple)')}
      </div>

      {/* Meals */}
      {MEAL_TYPES.map((meal) => {
        const mealEntries = dayEntries.filter((e) => e.mealType === meal);
        const mealCalories = mealEntries.reduce((sum, e) => sum + entryTotals(e).calories, 0);
        return (
          <div key={meal} className="ios-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mealEntries.length ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--color-orange)' }}>{MEAL_ICONS[meal]}</span>
                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{MEAL_LABELS[meal]}</span>
                {mealCalories > 0 && <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>· {mealCalories} קל׳</span>}
              </div>
              <button onClick={() => setAddingMeal(meal)} style={{ background: 'rgba(255, 159, 10, 0.15)', border: '1px solid rgba(255, 159, 10, 0.3)', color: 'var(--color-orange)', padding: '4px 10px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <Plus size={13} /> הוספה
              </button>
            </div>

            {mealEntries.map((e) => {
              const t = entryTotals(e);
              return (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{e.foodName}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {e.grams} גר׳ · {t.calories} קל׳ · {t.protein}ג׳ חלבון
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {addingMeal && (
        <AddFoodEntryModal
          mealType={addingMeal}
          date={viewDate.getTime()}
          onClose={() => setAddingMeal(null)}
          onAdded={() => { setAddingMeal(null); refresh(); }}
        />
      )}

      {showGoals && (
        <GoalsEditorModal
          goals={goals}
          onClose={() => setShowGoals(false)}
          onSave={(g) => { StorageService.saveNutritionGoals(g); setGoals(g); setShowGoals(false); }}
        />
      )}
    </div>
  );
};

// ===== הוספת פריט מזון לארוחה =====

const AddFoodEntryModal: React.FC<{
  mealType: MealType;
  date: number;
  onClose: () => void;
  onAdded: () => void;
}> = ({ mealType, date, onClose, onAdded }) => {
  const [foodItems, setFoodItems] = useState<FoodItem[]>(() => StorageService.getFoodItems());
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState('100');

  // New food form
  const [newName, setNewName] = useState('');
  const [newCal, setNewCal] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newCarbs, setNewCarbs] = useState('');
  const [newFat, setNewFat] = useState('');

  const filtered = foodItems.filter((f) => f.name.includes(search));

  const logEntry = (food: FoodItem, gramsVal: number) => {
    const entry: NutritionEntry = {
      id: `nut-${Date.now()}`,
      date,
      mealType,
      foodId: food.id,
      foodName: food.name,
      grams: gramsVal,
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
    };
    StorageService.addNutritionEntry(entry);
    onAdded();
  };

  const handleConfirmPick = () => {
    const g = parseFloat(grams);
    if (!selectedFood || !g || g <= 0) return;
    logEntry(selectedFood, g);
  };

  const handleCreateAndLog = () => {
    const cal = parseFloat(newCal);
    if (!newName.trim() || !cal) return;
    const food: FoodItem = {
      id: `food-${Date.now()}`,
      name: newName.trim(),
      caloriesPer100g: cal,
      proteinPer100g: parseFloat(newProtein) || 0,
      carbsPer100g: parseFloat(newCarbs) || 0,
      fatPer100g: parseFloat(newFat) || 0,
    };
    StorageService.saveFoodItem(food);
    logEntry(food, parseFloat(grams) || 100);
  };

  if (selectedFood) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-handle" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 4 }}>{selectedFood.name}</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            ל-100 גר׳: {selectedFood.caloriesPer100g} קל׳ · {selectedFood.proteinPer100g}ג׳ חלבון · {selectedFood.carbsPer100g}ג׳ פחמימה · {selectedFood.fatPer100g}ג׳ שומן
          </p>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>כמות (גרם)</label>
          <input type="number" className="gym-input-box" value={grams} onChange={(e) => setGrams(e.target.value)} style={{ marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedFood(null)}>חזרה</button>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirmPick}>הוספה</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 80)', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>הוספה ל{MEAL_LABELS[mealType]}</h3>
          <button onClick={onClose} style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={`filter-chip ${mode === 'pick' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setMode('pick')}>מהמאגר שלי</button>
          <button className={`filter-chip ${mode === 'new' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setMode('new')}>פריט חדש</button>
        </div>

        {mode === 'pick' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={16} style={{ position: 'absolute', right: 12, top: 12, color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="gym-input-box"
                placeholder="חיפוש..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingRight: 36 }}
              />
            </div>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
                {foodItems.length === 0 ? 'המאגר שלך ריק - עבור ל"פריט חדש" כדי להוסיף מאכל ראשון.' : 'לא נמצאו תוצאות.'}
              </p>
            ) : (
              filtered.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFood(f)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{f.caloriesPer100g} קל׳ / 100 גר׳</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>שם המאכל</label>
            <input type="text" className="gym-input-box" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 10 }} />

            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6 }}>ערכים תזונתיים ל-100 גרם:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>קלוריות</label>
                <input type="number" className="gym-input-box" value={newCal} onChange={(e) => setNewCal(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>חלבון (גר׳)</label>
                <input type="number" className="gym-input-box" value={newProtein} onChange={(e) => setNewProtein(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>פחמימה (גר׳)</label>
                <input type="number" className="gym-input-box" value={newCarbs} onChange={(e) => setNewCarbs(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>שומן (גר׳)</label>
                <input type="number" className="gym-input-box" value={newFat} onChange={(e) => setNewFat(e.target.value)} />
              </div>
            </div>

            <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>כמות שאכלת (גרם)</label>
            <input type="number" className="gym-input-box" value={grams} onChange={(e) => setGrams(e.target.value)} style={{ marginBottom: 14 }} />

            <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreateAndLog}>
              <Save size={16} /> שמירה והוספה
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

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
