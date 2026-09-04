import React, { useState } from 'react';
import { ChevronLeft, Target, Plus, Trash2, Pencil } from 'lucide-react';
import { BodyWeightEntry } from '../types';
import { StorageService } from '../services/storage';
import { TrendChart } from './TrendChart';

interface BodyWeightViewProps {
  onBack: () => void;
}

export const BodyWeightView: React.FC<BodyWeightViewProps> = ({ onBack }) => {
  const [entries, setEntries] = useState<BodyWeightEntry[]>(() => StorageService.getBodyWeightLog());
  const [targetWeight, setTargetWeight] = useState<number | null>(() => StorageService.getTargetWeight());
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [newWeightInput, setNewWeightInput] = useState('');

  const refresh = () => {
    setEntries(StorageService.getBodyWeightLog());
  };

  const handleAddEntry = () => {
    const val = parseFloat(newWeightInput);
    if (!val || val <= 0) return;
    StorageService.addBodyWeightEntry(val);
    setNewWeightInput('');
    refresh();
  };

  const handleSaveTarget = () => {
    const val = parseFloat(targetInput);
    const newTarget = val > 0 ? val : null;
    StorageService.saveTargetWeight(newTarget);
    setTargetWeight(newTarget);
    setEditingTarget(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('למחוק את הרשומה הזו?')) return;
    StorageService.deleteBodyWeightEntry(id);
    refresh();
  };

  const chartPoints = entries.map((e) => ({ id: e.id, date: e.date, value: e.weightKg }));

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const trend = latest && first && entries.length > 1 ? latest.weightKg - first.weightKg : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 70, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ChevronLeft size={24} />
        </button>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>משקל גוף</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(var(--safe-bottom) + 24px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Target Weight */}
        <div className="ios-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={18} color="var(--color-blue)" />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>משקל יעד</span>
            </div>
            {!editingTarget && (
              <button
                onClick={() => { setTargetInput(targetWeight ? String(targetWeight) : ''); setEditingTarget(true); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 700 }}
              >
                <Pencil size={13} /> {targetWeight ? 'עריכה' : 'קביעת יעד'}
              </button>
            )}
          </div>

          {editingTarget ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                className="gym-input-box"
                placeholder="ק״ג"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={handleSaveTarget}>
                שמירה
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 8, color: targetWeight ? 'var(--color-blue)' : 'var(--text-muted)' }}>
              {targetWeight ? `${targetWeight} ק"ג` : 'לא נקבע יעד'}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="ios-card" style={{ padding: 14 }}>
          {entries.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{latest.weightKg} ק"ג</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>משקל אחרון</div>
              </div>
              {entries.length > 1 && (
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: trend > 0 ? 'var(--color-orange)' : trend < 0 ? 'var(--color-blue)' : 'var(--text-muted)' }}>
                    {trend > 0 ? '+' : ''}{trend.toFixed(1)} ק"ג
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>מגמה מתחילת המעקב</div>
                </div>
              )}
            </div>
          )}

          {entries.length > 0 ? (
            <TrendChart points={chartPoints} targetValue={targetWeight} />
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              עדיין אין נתוני משקל. הוסף את המדידה הראשונה שלך למטה.
            </div>
          )}
        </div>

        {/* Quick Add */}
        <div className="ios-card" style={{ padding: 14 }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>הוספת משקל נוכחי</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              className="gym-input-box"
              placeholder="לדוגמה: 78.5"
              value={newWeightInput}
              onChange={(e) => setNewWeightInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" style={{ width: 'auto', padding: '0 16px' }} onClick={handleAddEntry}>
              <Plus size={16} /> הוספה
            </button>
          </div>
        </div>

        {/* History List */}
        {entries.length > 0 && (
          <div className="ios-card" style={{ padding: 14 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'block', marginBottom: 10 }}>היסטוריית מדידות</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.slice().reverse().map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(e.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700 }}>{e.weightKg} ק"ג</span>
                    <button onClick={() => handleDelete(e.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', display: 'flex' }}>
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
