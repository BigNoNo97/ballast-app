import React, { useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { ActivityLevel, BodyWeightEntry, ExperienceLevel, InjuryArea, MuscleGroup, NutritionGoals, OnboardingGoal, UserSettings, WorkoutSession } from '../../types';
import { ACTIVITY_LABELS } from '../../services/nutrition/engine';
import {
  ClientSnapshot,
  deleteClientRows,
  patchClientSettings,
  recomputeWorkoutTotals,
  saveClientRows,
  TrainerError,
} from '../../services/trainer';
import { BodyAreaPicker } from '../BodyAreaPicker';
import { Card, daysAgoLabel, ErrorNote, EXPERIENCE_LABELS, GOAL_LABELS, inputStyle, Muted, Screen, SectionTitle } from './trainerUi';

// העורכים של המאמן: כל שמירה נכתבת ישר לנתונים של המתאמן בשרת, והאפליקציה שלו מתעדכנת.

const msg = (e: unknown) => (e instanceof TrainerError ? e.message : 'השמירה נכשלה. נסה שוב.');
const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button className={`filter-chip ${active ? 'active' : ''}`} onClick={onClick} type="button">
    {children}
  </button>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    {children}
  </label>
);

// ===================== פרופיל המתאמן =====================

export const ProfileEditorScreen: React.FC<{
  clientId: string;
  clientName: string;
  snap: ClientSnapshot;
  onBack: () => void;
  onSaved: () => void;
}> = ({ clientId, clientName, snap, onBack, onSaved }) => {
  const s = snap.settings;
  const [gender, setGender] = useState<UserSettings['gender']>(s.gender);
  const [age, setAge] = useState(s.ageYears?.toString() ?? '');
  const [height, setHeight] = useState(s.heightCm?.toString() ?? '');
  const [target, setTarget] = useState(snap.targetWeight?.toString() ?? '');
  const [experience, setExperience] = useState<ExperienceLevel | undefined>(s.experienceLevel);
  const [goals, setGoals] = useState<OnboardingGoal[]>(s.goals ?? []);
  const [days, setDays] = useState<number | undefined>(s.trainingDaysPerWeek);
  const [minutes, setMinutes] = useState<number | undefined>(s.sessionDurationMinutes);
  const [activity, setActivity] = useState<ActivityLevel | undefined>(s.activityLevel);
  const [injuries, setInjuries] = useState<InjuryArea[]>(s.injuries ?? []);
  const [focus, setFocus] = useState<MuscleGroup[]>(s.focusMuscles ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const ageN = num(age);
    const heightN = num(height);
    const targetN = num(target);
    if ((ageN !== undefined && (ageN < 10 || ageN > 100)) || (heightN !== undefined && (heightN < 100 || heightN > 230))) {
      setError('בדוק את הגיל והגובה.');
      return;
    }
    if (targetN !== undefined && (targetN < 30 || targetN > 300)) {
      setError('משקל היעד לא נראה תקין.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchClientSettings(clientId, {
        settings: {
          gender,
          ageYears: ageN,
          heightCm: heightN,
          experienceLevel: experience,
          goals,
          trainingDaysPerWeek: days,
          sessionDurationMinutes: minutes,
          activityLevel: activity,
          injuries,
          focusMuscles: focus,
        },
        targetWeight: targetN ?? null,
      });
      onSaved();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="פרופיל ומטרות" subtitle={clientName} onBack={onBack}>
      <SectionTitle>גוף</SectionTitle>
      <div style={{ display: 'flex', gap: 8 }}>
        <Chip active={gender === 'male'} onClick={() => setGender('male')}>גבר</Chip>
        <Chip active={gender === 'female'} onClick={() => setGender('female')}>אישה</Chip>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="גיל">
          <input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} style={inputStyle} />
        </Field>
        <Field label='גובה (ס"מ)'>
          <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} style={inputStyle} />
        </Field>
        <Field label='משקל יעד (ק"ג)'>
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} placeholder="—" />
        </Field>
      </div>

      <SectionTitle>מטרות</SectionTitle>
      <div className="filter-chip-row">
        {(Object.keys(GOAL_LABELS) as OnboardingGoal[]).map((g) => (
          <Chip key={g} active={goals.includes(g)} onClick={() => setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]))}>
            {GOAL_LABELS[g]}
          </Chip>
        ))}
      </div>

      <SectionTitle>ניסיון</SectionTitle>
      <div className="filter-chip-row">
        {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((l) => (
          <Chip key={l} active={experience === l} onClick={() => setExperience(l)}>
            {EXPERIENCE_LABELS[l]}
          </Chip>
        ))}
      </div>

      <SectionTitle>ימי אימון בשבוע</SectionTitle>
      <div className="filter-chip-row">
        {[2, 3, 4, 5, 6].map((d) => (
          <Chip key={d} active={days === d} onClick={() => setDays(d)}>
            {d}
          </Chip>
        ))}
      </div>

      <SectionTitle>משך אימון</SectionTitle>
      <div className="filter-chip-row">
        {[30, 45, 60, 75, 90].map((m) => (
          <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
            {m} דק׳
          </Chip>
        ))}
      </div>

      <SectionTitle>פעילות יומיומית (מחוץ לאימונים)</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
          <Chip key={a} active={activity === a} onClick={() => setActivity(a)}>
            {ACTIVITY_LABELS[a]}
          </Chip>
        ))}
      </div>

      <SectionTitle>אזורי מיקוד (עד 3)</SectionTitle>
      <BodyAreaPicker mode="focus" selected={focus} onChange={setFocus} max={3} />
      <SectionTitle>פציעות / אזורים רגישים</SectionTitle>
      <BodyAreaPicker mode="injury" selected={injuries} onChange={setInjuries} />

      <ErrorNote text={error} />
      <button className="btn-primary" style={{ padding: '12px 0', marginTop: 4 }} disabled={busy} onClick={save}>
        {busy ? <Loader2 size={18} className="spin" /> : 'שמירה'}
      </button>
    </Screen>
  );
};

// ===================== אימון שנרשם =====================

export const WorkoutEditCard: React.FC<{
  clientId: string;
  workout: WorkoutSession;
  nameOf: (id: string) => string;
  onChanged: () => void;
}> = ({ clientId, workout, nameOf, onChanged }) => {
  const [draft, setDraft] = useState<WorkoutSession>(workout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(workout);

  const setSet = (xi: number, si: number, patch: { weightKg?: number; reps?: number; completed?: boolean }) =>
    setDraft((w) => ({
      ...w,
      exercises: w.exercises.map((x, i) => (i !== xi ? x : { ...x, sets: x.sets.map((st, j) => (j !== si ? st : { ...st, ...patch })) })),
    }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveClientRows(clientId, 'workouts', [recomputeWorkoutTotals(draft)]);
      onChanged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`למחוק את האימון "${workout.title}" מההיסטוריה של המתאמן?`)) return;
    setBusy(true);
    try {
      await deleteClientRows(clientId, 'workouts', [workout.id]);
      onChanged();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      {draft.exercises.map((x, xi) => (
        <div key={`${x.exerciseId}-${xi}`}>
          <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: 4 }}>{nameOf(x.exerciseId)}</div>
          {x.sets.map((st, si) => (
            <div key={st.id ?? si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 18, fontSize: '0.74rem', color: 'var(--text-muted)' }}>{si + 1}</span>
              <input
                inputMode="decimal"
                aria-label="משקל"
                value={st.weightKg}
                onChange={(e) => setSet(xi, si, { weightKg: num(e.target.value) ?? 0 })}
                style={{ ...inputStyle, padding: '7px 8px', width: 72, textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>ק"ג ×</span>
              <input
                inputMode="numeric"
                aria-label="חזרות"
                value={st.reps}
                onChange={(e) => setSet(xi, si, { reps: Math.round(num(e.target.value) ?? 0) })}
                style={{ ...inputStyle, padding: '7px 8px', width: 56, textAlign: 'center' }}
              />
              <button
                type="button"
                aria-label={st.completed ? 'בוצע' : 'לא בוצע'}
                onClick={() => setSet(xi, si, { completed: !st.completed })}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid var(--border-strong)',
                  background: st.completed ? 'var(--color-green)' : 'transparent',
                  color: st.completed ? '#fff' : 'var(--text-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={16} />
              </button>
            </div>
          ))}
        </div>
      ))}
      <ErrorNote text={error} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1, padding: '9px 0' }} disabled={!dirty || busy} onClick={save}>
          {busy ? <Loader2 size={16} className="spin" /> : 'שמירת השינויים'}
        </button>
        <button className="btn-secondary" style={{ color: 'var(--color-red)', padding: '9px 14px' }} disabled={busy} onClick={remove} aria-label="מחיקת האימון">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

// ===================== משקל גוף =====================

export const BodyWeightEditor: React.FC<{
  clientId: string;
  log: BodyWeightEntry[];
  onChanged: () => void;
}> = ({ clientId, log, onChanged }) => {
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const value = num(kg);
    if (!value || value < 30 || value > 300) {
      setError('הזן משקל תקין.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // צהריים של היום שנבחר - כדי שאזור זמן לא יזיז את השקילה ליום הקודם
      const at = new Date(`${date}T12:00:00`).getTime();
      await saveClientRows(clientId, 'body_weight_entries', [{ id: newId('bw'), date: at, weightKg: value }]);
      setKg('');
      onChanged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: BodyWeightEntry) => {
    if (!window.confirm(`למחוק את השקילה (${entry.weightKg} ק"ג)?`)) return;
    try {
      await deleteClientRows(clientId, 'body_weight_entries', [entry.id]);
      onChanged();
    } catch (e) {
      setError(msg(e));
    }
  };

  const recent = [...log].sort((a, b) => b.date - a.date).slice(0, 15);
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 8 }}>שקילות</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
        <Field label='משקל (ק"ג)'>
          <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="תאריך">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>
        <button className="btn-primary" style={{ padding: '11px 12px' }} disabled={busy} onClick={add} aria-label="הוספת שקילה">
          {busy ? <Loader2 size={16} className="spin" /> : <Plus size={18} />}
        </button>
      </div>
      <ErrorNote text={error} />
      {recent.length === 0 ? (
        <Muted>אין שקילות.</Muted>
      ) : (
        recent.map((e) => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.84rem' }}>
            <span>{e.weightKg} ק"ג</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
              {daysAgoLabel(e.date)}
              <button onClick={() => remove(e)} aria-label="מחיקה" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))
      )}
    </Card>
  );
};

// ===================== יעדי תזונה =====================

export const NutritionGoalsEditor: React.FC<{
  clientId: string;
  goals: NutritionGoals | null;
  onChanged: () => void;
}> = ({ clientId, goals, onChanged }) => {
  const [v, setV] = useState({
    calories: goals?.calories?.toString() ?? '',
    protein: goals?.protein?.toString() ?? '',
    carbs: goals?.carbs?.toString() ?? '',
    fat: goals?.fat?.toString() ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const next = { calories: num(v.calories), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) };
    if (!next.calories || next.calories < 1000 || next.calories > 6000) {
      setError('יעד קלוריות צריך להיות בין 1,000 ל-6,000.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchClientSettings(clientId, {
        nutritionGoals: Object.fromEntries(Object.entries(next).filter(([, x]) => x !== undefined)) as Partial<NutritionGoals>,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChanged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const kcalFromMacros = (num(v.protein) ?? 0) * 4 + (num(v.carbs) ?? 0) * 4 + (num(v.fat) ?? 0) * 9;
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 8 }}>יעדים יומיים</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="קלוריות">
          <input inputMode="numeric" value={v.calories} onChange={(e) => setV({ ...v, calories: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="חלבון (גר׳)">
          <input inputMode="numeric" value={v.protein} onChange={(e) => setV({ ...v, protein: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="פחמימה (גר׳)">
          <input inputMode="numeric" value={v.carbs} onChange={(e) => setV({ ...v, carbs: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="שומן (גר׳)">
          <input inputMode="numeric" value={v.fat} onChange={(e) => setV({ ...v, fat: e.target.value })} style={inputStyle} />
        </Field>
      </div>
      {kcalFromMacros > 0 && <Muted style={{ marginTop: 6 }}>המאקרו שווים לכ-{Math.round(kcalFromMacros).toLocaleString('he-IL')} קק"ל</Muted>}
      <Muted style={{ marginTop: 4 }}>אם ההתאמה האוטומטית פעילה אצל המתאמן, המנוע עשוי להציע לו לעדכן את היעד בהמשך לפי מה שקורה בפועל.</Muted>
      <ErrorNote text={error} />
      <button className="btn-primary" style={{ width: '100%', padding: '10px 0', marginTop: 10 }} disabled={busy} onClick={save}>
        {busy ? <Loader2 size={16} className="spin" /> : saved ? 'נשמר ✓' : 'שמירת היעדים'}
      </button>
    </Card>
  );
};
