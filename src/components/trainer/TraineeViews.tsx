import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react';
import type { Exercise, RoutineTemplate } from '../../types';
import {
  endRelation,
  getMyTrainerRelation,
  getPendingPrograms,
  joinTrainer,
  normalizeCode,
  previewTrainerCode,
  ProgramOffer,
  respondToProgram,
  routineFromOffer,
  setNutritionSharing,
  TrainerError,
  TrainerRelation,
} from '../../services/trainer';
import { ChatThread } from './ChatThread';
import { Badge, Card, ErrorNote, inputStyle, Muted, RoutinePreview, RowButton, Screen, SectionTitle, Toggle } from './trainerUi';

const msg = (e: unknown) => (e instanceof TrainerError ? e.message : 'משהו השתבש. נסה שוב.');

/** מה המאמן רואה - מוצג לפני ההצטרפות ובמסך המאמן שלי */
const SHARED_ITEMS = [
  'פרופיל: גיל, מין, גובה, מטרות, ניסיון, פציעות ואזורי מיקוד',
  'התוכניות והאימונים שלך, כולל משקלים וחזרות',
  'משקל גוף ומדידות',
];

// ===================== הצטרפות עם קוד =====================

export const JoinTrainerScreen: React.FC<{
  defaultName: string;
  onBack: () => void;
  onJoined: () => void;
}> = ({ defaultName, onBack, onJoined }) => {
  const [code, setCode] = useState('');
  const [trainer, setTrainer] = useState<{ display_name: string; bio: string | null } | null>(null);
  const [name, setName] = useState(defaultName);
  const [shareNutrition, setShareNutrition] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    if (normalizeCode(code).length !== 8) {
      setError('הקוד מורכב מ-8 תווים.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const t = await previewTrainerCode(code);
      if (!t) setError('הקוד לא נמצא. בדוק שהקלדת אותו נכון.');
      setTrainer(t);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinTrainer(code, name, shareNutrition);
      onJoined();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  if (!trainer) {
    return (
      <Screen title="הצטרפות למאמן" onBack={onBack}>
        <Muted>הזן את הקוד שקיבלת מהמאמן שלך (8 תווים).</Muted>
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 8))}
          placeholder="לדוגמה: K7M2QX9P"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{ ...inputStyle, direction: 'ltr', textAlign: 'center', letterSpacing: 4, fontSize: '1.3rem', fontWeight: 800 }}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <ErrorNote text={error} />
        <button className="btn-primary" style={{ padding: '12px 0' }} disabled={busy} onClick={lookup}>
          {busy ? <Loader2 size={18} className="spin" /> : 'המשך'}
        </button>
      </Screen>
    );
  }

  return (
    <Screen title={`הצטרפות ל${trainer.display_name}`} onBack={() => setTrainer(null)}>
      <Card style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <UserCheck size={28} color="var(--color-blue)" />
        <div>
          <div style={{ fontWeight: 800 }}>{trainer.display_name}</div>
          {trainer.bio && <Muted>{trainer.bio}</Muted>}
        </div>
      </Card>

      <SectionTitle>איך המאמן יראה אותך</SectionTitle>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="השם שלך" style={inputStyle} />

      <SectionTitle>מה ישותף עם המאמן</SectionTitle>
      <Card>
        <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem', lineHeight: 1.5 }}>
          {SHARED_ITEMS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>יומן התזונה</div>
            <Muted>מה אכלת, קלוריות ומאקרו (אופציונלי)</Muted>
          </div>
          <Toggle on={shareNutrition} onChange={setShareNutrition} />
        </div>
      </Card>
      <Muted style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        המאמן רק רואה - הוא לא יכול לשנות או למחוק שום דבר שלך. תמונות התקדמות לא משותפות. אפשר להפסיק את השיתוף בכל רגע, והגישה נחסמת מיד.
      </Muted>
      <ErrorNote text={error} />
      <button className="btn-primary" style={{ padding: '12px 0' }} disabled={busy || !name.trim()} onClick={join}>
        {busy ? <Loader2 size={18} className="spin" /> : 'מאשר ומצטרף'}
      </button>
    </Screen>
  );
};

// ===================== המאמן שלי =====================

export const MyTrainerScreen: React.FC<{
  meId: string;
  allExercises: Exercise[];
  unread: number;
  onBack: () => void;
  onChanged: () => void;
  onAcceptProgram: (routine: RoutineTemplate, customExercises: Exercise[]) => void;
}> = ({ meId, allExercises, unread, onBack, onChanged, onAcceptProgram }) => {
  const [data, setData] = useState<{ relation: TrainerRelation; trainerName: string; trainerBio: string | null } | null | undefined>(undefined);
  const [programs, setPrograms] = useState<ProgramOffer[]>([]);
  const [view, setView] = useState<'home' | 'chat' | { program: ProgramOffer }>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [rel, progs] = await Promise.all([getMyTrainerRelation(meId), getPendingPrograms(meId)]);
      setData(rel);
      setPrograms(progs);
    } catch (e) {
      setError(msg(e));
      setData(null);
    }
  };
  useEffect(() => {
    load();
  }, [meId]);

  if (data === undefined) {
    return (
      <Screen title="המאמן שלי" onBack={onBack}>
        <Loader2 size={20} className="spin" style={{ margin: '40px auto' }} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="המאמן שלי" onBack={onBack}>
        <ErrorNote text={error} />
        <Muted>אין לך מאמן פעיל כרגע.</Muted>
      </Screen>
    );
  }

  const { relation, trainerName, trainerBio } = data;

  if (view === 'chat') {
    return (
      <Screen title={trainerName} subtitle="הודעות" onBack={() => setView('home')} noScroll>
        <ChatThread trainerId={relation.trainer_id} clientId={meId} meId={meId} otherName={trainerName} canSend onRead={onChanged} />
      </Screen>
    );
  }

  if (typeof view === 'object') {
    const offer = view.program;
    const lib = new Map([...allExercises, ...offer.custom_exercises].map((e) => [e.id, e.nameHe]));
    const respond = async (accept: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await respondToProgram(offer.id, accept);
        if (accept) onAcceptProgram(routineFromOffer(offer, trainerName), offer.custom_exercises);
        setPrograms((p) => p.filter((x) => x.id !== offer.id));
        setView('home');
        onChanged();
      } catch (e) {
        setError(msg(e));
      } finally {
        setBusy(false);
      }
    };
    return (
      <Screen title={offer.routine.title} subtitle={`תוכנית מ${trainerName}`} onBack={() => setView('home')}>
        {offer.note && (
          <Card style={{ background: 'var(--color-blue-bg)' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-blue)', marginBottom: 4 }}>הערה מהמאמן</div>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{offer.note}</div>
          </Card>
        )}
        <RoutinePreview routine={offer.routine} nameOf={(id) => lib.get(id) ?? id} />
        <Muted>קבלת התוכנית תוסיף אותה לתוכניות שלך ותגדיר אותה כפעילה. התוכנית הקודמת נשארת שמורה.</Muted>
        <ErrorNote text={error} />
        <button className="btn-primary" style={{ padding: '12px 0' }} disabled={busy} onClick={() => respond(true)}>
          {busy ? <Loader2 size={18} className="spin" /> : 'קבלת התוכנית'}
        </button>
        <button className="btn-secondary" style={{ padding: '10px 0' }} disabled={busy} onClick={() => respond(false)}>
          לא עכשיו
        </button>
      </Screen>
    );
  }

  return (
    <Screen title="המאמן שלי" onBack={onBack}>
      <Card style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <UserCheck size={28} color="var(--color-blue)" />
        <div>
          <div style={{ fontWeight: 800 }}>{trainerName}</div>
          {trainerBio && <Muted>{trainerBio}</Muted>}
        </div>
      </Card>

      <RowButton icon={<MessageCircle size={20} color="var(--color-blue)" />} title="הודעות" badge={unread} onClick={() => setView('chat')} />

      {programs.length > 0 && (
        <>
          <SectionTitle>תוכניות חדשות מהמאמן</SectionTitle>
          {programs.map((p) => (
            <RowButton
              key={p.id}
              icon={<Badge count={1} />}
              title={p.routine.title}
              subtitle={`${p.routine.days.length} ימים · נשלחה ${new Date(p.created_at).toLocaleDateString('he-IL')}`}
              onClick={() => setView({ program: p })}
            />
          ))}
        </>
      )}

      <SectionTitle>מה משותף</SectionTitle>
      <Card>
        <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.82rem', lineHeight: 1.5 }}>
          {SHARED_ITEMS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>יומן התזונה</div>
          <Toggle
            on={relation.share_nutrition}
            disabled={busy}
            onChange={async (v) => {
              setBusy(true);
              try {
                await setNutritionSharing(relation.trainer_id, v);
                setData({ ...data, relation: { ...relation, share_nutrition: v } });
              } catch (e) {
                setError(msg(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </Card>
      <ErrorNote text={error} />
      <button
        className="btn-secondary"
        style={{ color: 'var(--color-red)', marginTop: 8 }}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`להפסיק את השיתוף עם ${trainerName}? המאמן לא יראה יותר את הנתונים שלך.`)) return;
          setBusy(true);
          try {
            await endRelation(relation.trainer_id, meId);
            onChanged();
            onBack();
          } catch (e) {
            setError(msg(e));
            setBusy(false);
          }
        }}
      >
        הפסקת השיתוף עם המאמן
      </button>
    </Screen>
  );
};
