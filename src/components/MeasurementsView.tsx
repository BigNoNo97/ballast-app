import React, { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Ruler } from 'lucide-react';
import { MeasurementCategory, MeasurementEntry } from '../types';
import { StorageService } from '../services/storage';
import { TrendChart } from './TrendChart';

interface MeasurementsViewProps {
  onBack: () => void;
}

const SUGGESTED_CATEGORIES: { name: string; unit: string }[] = [
  { name: 'היקף מותן', unit: 'ס״מ' },
  { name: 'היקף חזה', unit: 'ס״מ' },
  { name: 'היקף זרוע', unit: 'ס״מ' },
  { name: 'היקף ירך', unit: 'ס״מ' },
  { name: 'אחוז שומן', unit: '%' },
];

export const MeasurementsView: React.FC<MeasurementsViewProps> = ({ onBack }) => {
  const [categories, setCategories] = useState<MeasurementCategory[]>(() => StorageService.getMeasurementCategories());
  const [selected, setSelected] = useState<MeasurementCategory | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('ס״מ');

  const refreshCategories = () => setCategories(StorageService.getMeasurementCategories());

  const handleAddCategory = (name: string, unit: string) => {
    if (!name.trim() || !unit.trim()) return;
    const category: MeasurementCategory = { id: `cat-${Date.now()}`, name: name.trim(), unit: unit.trim(), createdAt: Date.now() };
    StorageService.saveMeasurementCategory(category);
    refreshCategories();
    setShowAddCategory(false);
    setNewName('');
    setSelected(category);
  };

  const handleDeleteCategory = (id: string) => {
    if (!window.confirm('למחוק את המדד הזה ואת כל ההיסטוריה שלו?')) return;
    StorageService.deleteMeasurementCategory(id);
    refreshCategories();
    if (selected?.id === id) setSelected(null);
  };

  if (selected) {
    return (
      <CategoryDetail
        category={selected}
        onBack={() => setSelected(null)}
        onDeleteCategory={() => handleDeleteCategory(selected.id)}
      />
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 70, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(var(--safe-top) + 14px) 16px 14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ChevronLeft size={24} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>מדידות גוף</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(var(--safe-bottom) + 24px)' }}>
        {categories.length === 0 ? (
          <div className="ios-card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Ruler size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
            <p style={{ fontSize: '0.85rem' }}>עדיין לא הוספת מדדים. הוסף מדד כמו היקף מותן או אחוז שומן כדי להתחיל לעקוב.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className="ios-card"
                onClick={() => setSelected(cat)}
                style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{cat.name}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{cat.unit}</span>
              </button>
            ))}
          </div>
        )}

        {showAddCategory ? (
          <div className="ios-card" style={{ padding: 14 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: 10 }}>מדד חדש</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {SUGGESTED_CATEGORIES.filter((s) => !categories.some((c) => c.name === s.name)).map((s) => (
                <button
                  key={s.name}
                  onClick={() => handleAddCategory(s.name, s.unit)}
                  className="filter-chip"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                className="gym-input-box"
                placeholder="שם המדד"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                type="text"
                className="gym-input-box"
                placeholder="יחידה"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleAddCategory(newName, newUnit)}>
                הוספה
              </button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddCategory(false)}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setShowAddCategory(true)}>
            <Plus size={16} /> הוספת מדד חדש
          </button>
        )}
      </div>
    </div>
  );
};

const CategoryDetail: React.FC<{ category: MeasurementCategory; onBack: () => void; onDeleteCategory: () => void }> = ({
  category,
  onBack,
  onDeleteCategory,
}) => {
  const [entries, setEntries] = useState<MeasurementEntry[]>(() => StorageService.getMeasurementEntries(category.id));
  const [newValue, setNewValue] = useState('');

  const refresh = () => setEntries(StorageService.getMeasurementEntries(category.id));

  const handleAdd = () => {
    const val = parseFloat(newValue);
    // אין יחידה אחידה (ס"מ/אחוז/ק"ג לפי הקטגוריה) אז הגבול העליון סתם מונע ערך שבור לגמרי
    if (!val || val <= 0 || val > 10000) return;
    StorageService.addMeasurementEntry(category.id, val);
    setNewValue('');
    refresh();
  };

  const handleDeleteEntry = (id: string) => {
    if (!window.confirm('למחוק את הרשומה הזו?')) return;
    StorageService.deleteMeasurementEntry(id);
    refresh();
  };

  const chartPoints = entries.map((e) => ({ id: e.id, date: e.date, value: e.value }));
  const latest = entries[entries.length - 1];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 70, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(var(--safe-top) + 14px) 16px 14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ChevronLeft size={24} />
          </button>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{category.name}</h2>
        </div>
        <button onClick={onDeleteCategory} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Trash2 size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(var(--safe-bottom) + 24px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="ios-card" style={{ padding: 14 }}>
          {entries.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{latest.value} {category.unit}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>מדידה אחרונה</div>
            </div>
          )}

          {entries.length > 0 ? (
            <TrendChart points={chartPoints} color="var(--color-purple)" />
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              עדיין אין מדידות. הוסף את הראשונה למטה.
            </div>
          )}
        </div>

        <div className="ios-card" style={{ padding: 14 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>הוספת מדידה ({category.unit})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10000"
              inputMode="decimal"
              className="gym-input-box"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={handleAdd}>
              <Plus size={16} /> הוספה
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="ios-card" style={{ padding: 14 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: 10 }}>היסטוריה</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.slice().reverse().map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(e.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700 }}>{e.value} {category.unit}</span>
                    <button onClick={() => handleDeleteEntry(e.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', display: 'flex' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
