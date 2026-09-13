import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Check } from 'lucide-react';
import { ExperienceLevel, OnboardingGoal, UserSettings } from '../types';
import { StorageService } from '../services/storage';
import { AppleHealthService } from '../services/appleHealthService';

type Gender = 'male' | 'female';

const STEP_IDS = [
  'welcome',
  'gender',
  'age',
  'height',
  'weight',
  'goal',
  'level',
  'success',
] as const;
type StepId = (typeof STEP_IDS)[number];

const REST_SECONDS_BY_LEVEL: Record<ExperienceLevel, number> = {
  beginner: 60,
  intermediate: 90,
  advanced: 120,
};

interface OnboardingFlowProps {
  settings: UserSettings;
  onComplete: (settings: UserSettings) => void;
}

const GOAL_CALORIE_ADJUST: Record<OnboardingGoal, number> = {
  lose_weight: -500,
  gain_muscle: 300,
  strength: 150,
  maintain: 0,
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ settings, onComplete }) => {
  const steps: StepId[] = [...STEP_IDS];

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const dotSteps: StepId[] = steps.filter((s) => s !== 'welcome' && s !== 'success');
  const dotIndex = dotSteps.indexOf(step);

  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(75);
  const [goals, setGoals] = useState<OnboardingGoal[]>([]);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [saving, setSaving] = useState(false);

  const goNext = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = async () => {
    if (saving) return;
    setSaving(true);

    if (weight > 0) {
      StorageService.addBodyWeightEntry(weight);
      AppleHealthService.syncBodyWeight(weight);
    }

    if (goals.length > 0) {
      const bmr =
        gender === 'female'
          ? 10 * weight + 6.25 * height - 5 * age - 161
          : 10 * weight + 6.25 * height - 5 * age + 5;
      const tdee = bmr * 1.45; // פעילות מתונה כברירת מחדל
      // כשנבחרו כמה מטרות (למשל גם ירידה במשקל וגם עלייה בכוח) - ממוצע ההתאמות
      // הקלוריות של כולן, במקום לבחור מטרה אחת שרירותית.
      const adjust = Math.round(
        goals.reduce((sum, g) => sum + GOAL_CALORIE_ADJUST[g], 0) / goals.length
      );
      const calories = Math.round(tdee + adjust);
      const protein = Math.round(weight * 2);
      const fat = Math.round((calories * 0.25) / 9);
      const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
      StorageService.saveNutritionGoals({ calories, protein, carbs, fat });
    }

    const newSettings: UserSettings = {
      ...settings,
      onboardingCompleted: true,
      // תמיד null בסיום ההיכרות - תוכניות הן אישיות לכל משתמש, אף אחת לא מוצעת מראש.
      // המסך "עוד אין לך תוכנית" בטאב אימון יציע לבנות אחת, לתת למערכת, או להתחיל בלי תוכנית.
      activeRoutineId: null,
      gender,
      ageYears: age,
      heightCm: height,
      goals: goals.length > 0 ? goals : settings.goals,
      experienceLevel: level ?? settings.experienceLevel,
      defaultRestSeconds: level ? REST_SECONDS_BY_LEVEL[level] : settings.defaultRestSeconds,
    };
    StorageService.saveSettings(newSettings);
    onComplete(newSettings);
  };

  const skipAll = () => {
    const newSettings: UserSettings = { ...settings, onboardingCompleted: true, activeRoutineId: null };
    StorageService.saveSettings(newSettings);
    onComplete(newSettings);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {step !== 'welcome' && step !== 'success' && (
        <Header dotCount={dotSteps.length} dotIndex={dotIndex} onSkip={skipAll} />
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {step === 'welcome' && <WelcomeStep onStart={goNext} onSkip={skipAll} />}
        {step === 'gender' && <GenderStep value={gender} onChange={setGender} />}
        {step === 'age' && <NumberPickerStep title="מה הגיל שלך?" subtitle="בשנים. אפשר תמיד לשנות את זה מאוחר יותר" min={14} max={90} value={age} onChange={setAge} />}
        {step === 'height' && <NumberPickerStep title="מה הגובה שלך?" subtitle="בסנטימטרים. אפשר תמיד לשנות את זה מאוחר יותר" min={130} max={220} value={height} onChange={setHeight} />}
        {step === 'weight' && <NumberPickerStep title="מה המשקל שלך?" subtitle="בקילוגרם. ייכנס כרשומה הראשונה בגרף המשקל שלך" min={35} max={200} value={weight} onChange={setWeight} />}
        {step === 'goal' && <GoalStep value={goals} onChange={setGoals} />}
        {step === 'level' && <LevelStep value={level} onChange={setLevel} />}
        {step === 'success' && <SuccessStep saving={saving} onDone={finish} />}
      </div>

      {step !== 'welcome' && step !== 'success' && (
        <Footer onBack={stepIdx === 0 ? undefined : goBack} onContinue={goNext} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const Header: React.FC<{ dotCount: number; dotIndex: number; onSkip: () => void; onBack?: () => void }> = ({ dotCount, dotIndex, onSkip, onBack }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 4px' }}>
    {onBack ? (
      <button
        onClick={onBack}
        style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--bg-surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-main)', cursor: 'pointer' }}
      >
        <ChevronRight size={20} />
      </button>
    ) : (
      <div style={{ width: 36 }} />
    )}
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: dotCount }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: i === dotIndex ? 'var(--color-blue)' : 'var(--bg-surface-3)',
          }}
        />
      ))}
    </div>
    <button
      onClick={onSkip}
      style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
    >
      דלג
    </button>
  </div>
);

const Footer: React.FC<{ onBack?: () => void; onContinue: () => void }> = ({ onBack, onContinue }) => (
  <div style={{ display: 'flex', gap: 10, padding: '12px 24px 32px' }}>
    <button
      onClick={onBack}
      disabled={!onBack}
      className="btn-secondary"
      style={{ flex: 1, opacity: onBack ? 1 : 0.4 }}
    >
      חזרה
    </button>
    <button onClick={onContinue} className="btn-primary" style={{ flex: 2 }}>
      המשך
    </button>
  </div>
);

const WelcomeStep: React.FC<{ onStart: () => void; onSkip: () => void }> = ({ onStart, onSkip }) => (
  <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ width: 84, height: 84, borderRadius: 22, overflow: 'hidden', marginBottom: 22, boxShadow: '0 6px 16px rgba(75,95,224,0.35)' }}>
        <svg width="84" height="84" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="onbBgGrad" cx="15%" cy="0%" r="140%">
              <stop offset="0%" stopColor="#6E7CF5" />
              <stop offset="46%" stopColor="#4B5FE0" />
              <stop offset="100%" stopColor="#2E3AA8" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="1024" height="1024" fill="url(#onbBgGrad)" />
          <g fill="#ffffff">
            <path d="M 340,250 A 30,30 0 0 1 370,220 L 450,220 A 30,30 0 0 1 480,250 L 480,800 L 340,800 Z" />
            <circle cx="550" cy="615" r="210" />
          </g>
          <circle cx="640" cy="615" r="100" fill="url(#onbBgGrad)" />
        </svg>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: 10 }}>Ballast</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 10 }}>בואו נכיר אותך</div>
      <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 280 }}>
        כמה שאלות קצרות שיעזרו לנו להתאים לך יעדי תזונה ותוכנית אימון מתאימה - הכל אפשר לדלג ולשנות מאוחר יותר.
      </div>
    </div>
    <div style={{ padding: '20px 24px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button onClick={onStart} className="btn-primary" style={{ width: '100%' }}>
        בואו נתחיל
      </button>
      <button onClick={onSkip} style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
        דלג, אני כבר מכיר את זה
      </button>
    </div>
  </>
);

const GenderStep: React.FC<{ value: Gender; onChange: (g: Gender) => void }> = ({ value, onChange }) => (
  <>
    <div style={{ padding: '24px 24px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>מה המין שלך?</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>עוזר לנו לחשב יעד קלורי מדויק יותר בהמשך</div>
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      {(['male', 'female'] as Gender[]).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: value === g ? 'var(--color-blue)' : 'var(--bg-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: value === g ? '0 6px 18px rgba(75,95,224,0.35)' : 'none',
            }}
          >
            {g === 'male' ? (
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={value === g ? '#fff' : 'var(--text-dim)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="14" r="6" />
                <path d="M14.5 9.5L20 4" />
                <path d="M15 4h5v5" />
              </svg>
            ) : (
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={value === g ? '#fff' : 'var(--text-dim)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="9" r="6" />
                <path d="M12 15v7" />
                <path d="M8.5 19h7" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: '0.92rem', fontWeight: value === g ? 800 : 700, color: value === g ? 'var(--text-main)' : 'var(--text-muted)' }}>
            {g === 'male' ? 'זכר' : 'נקבה'}
          </div>
        </button>
      ))}
    </div>
  </>
);

const NumberPickerStep: React.FC<{ title: string; subtitle: string; min: number; max: number; value: number; onChange: (v: number) => void }> = ({
  title,
  subtitle,
  min,
  max,
  value,
  onChange,
}) => {
  const ROW_H = 42;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const scrollTimeout = useRef<number | undefined>(undefined);
  const didMountRef = useRef(false);

  // כל שינוי ב-value (מגלילה, מלחיצה על שורה, או מבחוץ) חייב לגרור את הגלגלת
  // למרכז החדש - לא רק בטעינה הראשונית. בלי זה, לחיצה על מספר שאינו במרכז
  // (dist 1/2) עדכנה את הערך אבל השאירה את הגלגלת מצוירת במקום הישן.
  // (אין צורך להתגונן מפני החזרה-לאחור של האירוע שהגלילה הזו עצמה יוצרת -
  // handleScroll כבר בודק v !== value ולא יריץ onChange שוב על אותו ערך.)
  useEffect(() => {
    if (!scrollerRef.current) return;
    const top = (value - min) * ROW_H;
    if (!didMountRef.current) {
      scrollerRef.current.scrollTop = top;
      didMountRef.current = true;
    } else {
      scrollerRef.current.scrollTo({ top, behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min]);

  const handleScroll = () => {
    window.clearTimeout(scrollTimeout.current);
    scrollTimeout.current = window.setTimeout(() => {
      if (!scrollerRef.current) return;
      const idx = Math.round(scrollerRef.current.scrollTop / ROW_H);
      const v = min + idx;
      if (v >= min && v <= max && v !== value) onChange(v);
    }, 80);
  };

  return (
    <>
      <div style={{ padding: '24px 24px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', height: ROW_H * 5, width: 160 }}>
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            style={{ height: '100%', overflowY: 'auto', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
          >
            <div style={{ height: ROW_H * 2 }} />
            {values.map((v) => {
              const dist = Math.abs(v - value);
              return (
                <div
                  key={v}
                  onClick={() => onChange(v)}
                  style={{
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    scrollSnapAlign: 'center',
                    cursor: 'pointer',
                    fontSize: dist === 0 ? '2.1rem' : dist === 1 ? '1.2rem' : '1rem',
                    fontWeight: dist === 0 ? 800 : 600,
                    color: dist === 0 ? 'var(--color-blue)' : dist === 1 ? 'var(--text-muted)' : 'var(--text-dim)',
                  }}
                >
                  {v}
                </div>
              );
            })}
            <div style={{ height: ROW_H * 2 }} />
          </div>
          <div style={{ position: 'absolute', top: ROW_H * 2, left: '50%', transform: 'translateX(-50%)', width: 130, borderTop: '1.5px solid var(--border-strong)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: ROW_H * 3, left: '50%', transform: 'translateX(-50%)', width: 130, borderBottom: '1.5px solid var(--border-strong)', pointerEvents: 'none' }} />
        </div>
      </div>
    </>
  );
};

const GOAL_OPTIONS: { id: OnboardingGoal; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'lose_weight',
    title: 'ירידה במשקל',
    desc: 'גירעון קלורי מבוקר, ירידה הדרגתית ובריאה',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 17l-8.5-8.5-5 5L2 7" />
        <path d="M16 17h6v-6" />
      </svg>
    ),
  },
  {
    id: 'gain_muscle',
    title: 'עלייה במסת שריר',
    desc: 'עודף קלורי ודגש על אימוני כוח מתקדמים',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 17l8.5-8.5 5 5L22 7" />
        <path d="M16 7h6v6" />
      </svg>
    ),
  },
  {
    id: 'strength',
    title: 'שיפור כוח',
    desc: 'התמקדות בהעלאת משקלים ושיאים אישיים',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
      </svg>
    ),
  },
  {
    id: 'maintain',
    title: 'שמירה על כושר',
    desc: 'תחזוקה, בלי שינוי משמעותי במשקל',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.8 4.6c-1.6-1.6-4.2-1.6-5.8 0L12 7.6 9 4.6c-1.6-1.6-4.2-1.6-5.8 0-1.6 1.6-1.6 4.2 0 5.8L12 19l8.8-8.6c1.6-1.6 1.6-4.2 0-5.8z" />
      </svg>
    ),
  },
];

const GoalStep: React.FC<{ value: OnboardingGoal[]; onChange: (g: OnboardingGoal[]) => void }> = ({ value, onChange }) => {
  const toggle = (id: OnboardingGoal) => {
    onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id]);
  };
  return (
  <>
    <div style={{ padding: '24px 24px 6px' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>מה המטרה שלך?</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>אפשר לבחור יותר ממטרה אחת - נבחר לך יעד קלורי ותוכנית פתיחה שמתאימים</div>
    </div>
    <div style={{ flex: 1, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {GOAL_OPTIONS.map((opt) => {
        const selected = value.includes(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => toggle(opt.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: 16,
              background: selected ? 'var(--color-blue-bg)' : 'var(--bg-surface-1)',
              border: selected ? '1.5px solid var(--color-blue)' : '1px solid var(--border-subtle)',
              cursor: 'pointer',
              textAlign: 'start',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: selected ? 'var(--color-blue)' : 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: selected ? '#fff' : 'var(--text-main)' }}>
              {opt.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>{opt.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
            </div>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: selected ? 'var(--color-blue)' : 'transparent',
                border: selected ? 'none' : '1.5px solid var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {selected && <Check size={13} color="#fff" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  </>
  );
};

const LEVEL_OPTIONS: { id: ExperienceLevel; title: string; desc: string }[] = [
  { id: 'beginner', title: 'מתחיל', desc: 'עד חצי שנה של אימוני כוח' },
  { id: 'intermediate', title: 'בינוני', desc: 'בין חצי שנה לשנתיים של ניסיון סדיר' },
  { id: 'advanced', title: 'מתקדם', desc: 'מעל שנתיים, מכיר את הטכניקות והתרגילים' },
];

const LevelStep: React.FC<{ value: ExperienceLevel | null; onChange: (l: ExperienceLevel) => void }> = ({ value, onChange }) => (
  <>
    <div style={{ padding: '24px 24px 6px' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 6 }}>מה הניסיון שלך?</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>זה קובע איזו תוכנית נציע לך, וזמן מנוחה כברירת מחדל בין סטים.</div>
    </div>
    <div style={{ flex: 1, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {LEVEL_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              padding: '16px 18px',
              borderRadius: 14,
              background: selected ? 'var(--color-blue-bg)' : 'var(--bg-surface-1)',
              border: selected ? '1.5px solid var(--color-blue)' : '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              textAlign: 'start',
            }}
          >
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: selected ? 800 : 700, color: 'var(--text-main)' }}>{opt.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
            </div>
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: selected ? 'none' : '1.5px solid var(--border-strong)', background: selected ? 'var(--color-blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {selected && <Check size={13} color="#fff" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  </>
);

const SuccessStep: React.FC<{ saving: boolean; onDone: () => void }> = ({ saving, onDone }) => (
  <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--color-green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--color-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={30} color="#fff" strokeWidth={3} />
        </div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 10 }}>מוכן להתחיל!</div>
      <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 270 }}>
        הגדרנו בשבילך יעדי תזונה, את המשקל ההתחלתי, ותוכנית אימון. אפשר לשנות הכל בכל שלב מההגדרות.
      </div>
    </div>
    <div style={{ padding: '20px 24px 36px' }}>
      <button onClick={onDone} className="btn-primary" style={{ width: '100%' }} disabled={saving}>
        {saving ? 'שומר...' : 'לעמוד הבית'}
      </button>
    </div>
  </>
);
