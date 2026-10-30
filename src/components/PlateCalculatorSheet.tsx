import React, { useMemo, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import { calculatePlates, DEFAULT_PLATES_KG, formatKg, PlateLoad, PlateSetup, plateColor, plateHeight } from '../services/plateMath';
import { triggerHaptic } from '../services/sound';

const BARS: { kg: number; label: string }[] = [
  { kg: 20, label: 'אולימפי 20' },
  { kg: 15, label: 'נשים 15' },
  { kg: 10, label: 'EZ / קל 10' },
  { kg: 0, label: 'בלי מוט' },
];

const MAX_PLATE_PX = 118;

/** המוט עם הצלחות משני הצדדים. הכבדות קרובות למרכז, כמו שמעמיסים באמת. */
const BarbellView: React.FC<{ load: PlateLoad | null; barKg: number; onRemove: (kg: number) => void }> = ({ load, barKg, onRemove }) => {
  const plates = load?.perSide ?? [];
  const plate = (kg: number, i: number, side: 'l' | 'r') => {
    const c = plateColor(kg);
    const h = Math.round(MAX_PLATE_PX * plateHeight(kg));
    const w = kg >= 20 ? 22 : kg >= 10 ? 18 : kg >= 5 ? 15 : 12;
    return (
      <button
        key={`${side}-${i}`}
        onClick={() => onRemove(kg)}
        aria-label={`הסרת ${formatKg(kg)} ק"ג מכל צד`}
        style={{
          width: w,
          height: h,
          background: c.fill,
          color: c.text,
          border: kg >= 5 && kg < 10 ? '1px solid rgba(0,0,0,0.18)' : 'none',
          borderRadius: 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.6rem',
          fontWeight: 800,
          writingMode: 'vertical-rl',
          padding: 0,
          cursor: 'pointer',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
      >
        {formatKg(kg)}
      </button>
    );
  };
  return (
    <div dir="ltr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: MAX_PLATE_PX + 8, gap: 0, overflowX: 'auto' }}>
      <div style={{ width: 14, height: 10, background: 'var(--text-dim)', borderRadius: 3, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{[...plates].reverse().map((kg, i) => plate(kg, i, 'l'))}</div>
      <div style={{ width: 6, height: 30, background: 'var(--text-muted)', borderRadius: 2, flexShrink: 0, margin: '0 2px' }} />
      <div
        style={{
          flex: '1 1 90px',
          minWidth: 70,
          maxWidth: 150,
          height: 9,
          background: 'linear-gradient(180deg, var(--text-muted), var(--text-dim))',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.58rem',
          fontWeight: 800,
          color: 'var(--bg-app)',
        }}
      >
        {barKg > 0 ? `${formatKg(barKg)}` : ''}
      </div>
      <div style={{ width: 6, height: 30, background: 'var(--text-muted)', borderRadius: 2, flexShrink: 0, margin: '0 2px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{plates.map((kg, i) => plate(kg, i, 'r'))}</div>
      <div style={{ width: 14, height: 10, background: 'var(--text-dim)', borderRadius: 3, flexShrink: 0 }} />
    </div>
  );
};

/** מחשבון צלחות: כמה צלחות לשים על כל צד של המוט כדי להגיע למשקל של הסט. */
export const PlateCalculatorSheet: React.FC<{
  initialKg: number;
  setup?: PlateSetup;
  onSaveSetup: (setup: PlateSetup) => void;
  onApply: (kg: number) => void;
  onClose: () => void;
}> = ({ initialKg, setup: savedSetup, onSaveSetup, onApply, onClose }) => {
  const [setup, setSetup] = useState<PlateSetup>(savedSetup ?? { barKg: 20, plates: DEFAULT_PLATES_KG });
  const [target, setTarget] = useState<number>(initialKg > 0 ? initialKg : setup.barKg || 20);
  const [targetText, setTargetText] = useState<string>(formatKg(initialKg > 0 ? initialKg : setup.barKg || 20));
  const [customBar, setCustomBar] = useState<string>(BARS.some((b) => b.kg === setup.barKg) ? '' : formatKg(setup.barKg));

  const result = useMemo(() => calculatePlates(target, setup), [target, setup]);
  const shown = result.exact ?? result.below ?? (result.underBar ? { perSide: [], totalKg: setup.barKg } : null);
  const sortedPlates = [...setup.plates].sort((a, b) => b - a);

  const setTargetKg = (kg: number) => {
    const v = Math.max(0, Math.min(500, Math.round(kg * 4) / 4));
    setTarget(v);
    setTargetText(formatKg(v));
  };
  const updateSetup = (next: PlateSetup) => {
    setSetup(next);
    onSaveSetup(next);
  };
  const togglePlate = (kg: number) => {
    const has = setup.plates.includes(kg);
    if (has && setup.plates.length === 1) return; // חייבת להישאר לפחות צלחת אחת
    updateSetup({ ...setup, plates: has ? setup.plates.filter((p) => p !== kg) : [...setup.plates, kg] });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      <div className="action-sheet" dir="rtl" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 90)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>מחשבון צלחות</h3>
          <button
            onClick={onClose}
            aria-label="סגירה"
            style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* המשקל הכולל */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6 }}>
          <button className="btn-secondary" aria-label="פחות 2.5" style={stepBtn} onClick={() => setTargetKg(target - 2.5)}>
            <Minus size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <input
              id="plate-target"
              inputMode="decimal"
              value={targetText}
              onChange={(e) => {
                setTargetText(e.target.value);
                const v = parseFloat(e.target.value.replace(',', '.'));
                if (Number.isFinite(v)) setTarget(Math.max(0, Math.min(500, v)));
              }}
              onBlur={() => setTargetText(formatKg(target))}
              aria-label='משקל כולל בק"ג'
              style={{ width: 110, textAlign: 'center', fontSize: '2rem', fontWeight: 900, background: 'transparent', border: 'none', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}
            />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>ק"ג</span>
          </div>
          <button className="btn-secondary" aria-label="עוד 2.5" style={stepBtn} onClick={() => setTargetKg(target + 2.5)}>
            <Plus size={18} />
          </button>
        </div>

        <BarbellView load={shown} barKg={setup.barKg} onRemove={(kg) => setTargetKg(target - kg * 2)} />

        {/* מה שמים על כל צד */}
        <div style={{ textAlign: 'center', minHeight: 44, marginTop: 6 }}>
          {result.underBar ? (
            <p style={{ color: 'var(--color-orange)', fontSize: '0.86rem' }}>המשקל קטן מהמוט עצמו ({formatKg(setup.barKg)} ק"ג).</p>
          ) : result.exact ? (
            result.exact.perSide.length ? (
              // שבבים ולא שורת טקסט: רצף מספרים עם "+" בתוך משפט עברי מתבלגן בכיווניות
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 700 }}>לכל צד:</span>
                {result.exact.perSide.map((kg, i) => (
                  <span
                    key={i}
                    style={{
                      background: plateColor(kg).fill,
                      color: plateColor(kg).text,
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                      border: kg >= 5 && kg < 10 ? '1px solid var(--border-strong)' : 'none',
                    }}
                  >
                    {formatKg(kg)}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.92rem', fontWeight: 700 }}>רק המוט</p>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <p style={{ fontSize: '0.84rem', color: 'var(--color-orange)' }}>אי אפשר להרכיב בדיוק {formatKg(target)} ק"ג עם הצלחות שיש. הכי קרוב:</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {[result.below, result.above].filter((x): x is PlateLoad => !!x).map((l) => (
                  <button key={l.totalKg} className="filter-chip" onClick={() => setTargetKg(l.totalKg)}>
                    {formatKg(l.totalKg)} ק"ג
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p style={label}>הוספה לכל צד</p>
        <div className="filter-chip-row">
          {sortedPlates.map((kg) => (
            <button key={kg} className="filter-chip" onClick={() => setTargetKg(Math.max(target, setup.barKg) + kg * 2)}>
              +{formatKg(kg)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>הקשה על צלחת במוט מורידה אותה.</p>

        <p style={label}>הצלחות שיש במכון</p>
        <div className="filter-chip-row">
          {DEFAULT_PLATES_KG.map((kg) => (
            <button key={kg} className={`filter-chip ${setup.plates.includes(kg) ? 'active' : ''}`} onClick={() => togglePlate(kg)} aria-pressed={setup.plates.includes(kg)}>
              {formatKg(kg)}
            </button>
          ))}
        </div>

        <p style={label}>מוט</p>
        <div className="filter-chip-row" style={{ alignItems: 'center' }}>
          {BARS.map((b) => (
            <button
              key={b.kg}
              className={`filter-chip ${setup.barKg === b.kg && !customBar ? 'active' : ''}`}
              onClick={() => {
                setCustomBar('');
                updateSetup({ ...setup, barKg: b.kg });
              }}
            >
              {b.label}
            </button>
          ))}
          <input
            id="plate-custom-bar"
            inputMode="decimal"
            placeholder="אחר"
            value={customBar}
            onChange={(e) => {
              setCustomBar(e.target.value);
              const v = parseFloat(e.target.value.replace(',', '.'));
              if (Number.isFinite(v) && v >= 0 && v <= 50) updateSetup({ ...setup, barKg: v });
            }}
            aria-label='משקל מוט מותאם בק"ג'
            style={{ width: 64, padding: '7px 10px', borderRadius: 999, border: `1px solid ${customBar ? 'var(--color-blue)' : 'var(--border-strong)'}`, background: 'var(--bg-surface-2)', color: 'var(--text-main)', fontSize: '16px', textAlign: 'center' }}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%', padding: '13px 0', marginTop: 18 }}
          disabled={!result.exact}
          onClick={() => {
            if (!result.exact) return;
            triggerHaptic(30);
            onApply(result.exact.totalKg);
          }}
        >
          <Check size={18} /> {result.exact ? `${formatKg(result.exact.totalKg)} ק"ג לסט` : 'בחר משקל שאפשר להרכיב'}
        </button>
      </div>
    </div>
  );
};

const stepBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const label: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', margin: '14px 0 6px' };
