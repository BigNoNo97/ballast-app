import React, { useEffect, useState } from 'react';
import { History, Loader2, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react';
import {
  endRelation,
  getMyTrainerRelation,
  getRecentActivity,
  joinTrainer,
  normalizeCode,
  previewTrainerCode,
  setNutritionSharing,
  TrainerActivity,
  TrainerError,
  TrainerRelation,
} from '../../services/trainer';
import { requestPushPermission } from '../../services/push';
import { ChatThread } from './ChatThread';
import { Card, daysAgoLabel, ErrorNote, inputStyle, Muted, RowButton, Screen, SectionTitle, Toggle } from './trainerUi';

const msg = (e: unknown) => (e instanceof TrainerError ? e.message : 'משהו השתבש. נסה שוב.');

/** מה המאמן רואה ומנהל - מוצג לפני ההצטרפות ובמסך המאמן שלי */
const MANAGED_ITEMS = [
  'תוכניות האימון: לבנות, לשנות סדר תרגילים, משקלים, חזרות ומנוחה',
  'האימונים שרשמת: לתקן משקלים וחזרות, או למחוק',
  'פרופיל ומטרות: גיל, גובה, מטרות, ניסיון, פציעות ואזורי מיקוד',
  'משקל גוף, מדידות ויעדי תזונה',
];

const TABLE_LABELS: Record<string, string> = {
  routines: 'התוכנית',
  workouts: 'אימון',
  custom_exercises: 'תרגיל',
  body_weight_entries: 'שקילה',
  measurement_categories: 'מדידות',
  measurement_entries: 'מדידה',
  exercise_progress: 'משקלי העבודה',
  nutrition_entries: 'יומן האכילה',
  user_settings: 'הפרופיל והיעדים',
};
const ACTION_LABELS: Record<TrainerActivity['action'], string> = { insert: 'הוסיף', update: 'עדכן', delete: 'מחק' };

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
      // עכשיו יש סיבה ברורה להתראות: הודעות ועדכונים מהמאמן
      requestPushPermission();
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

      <SectionTitle>המאמן ינהל עבורך</SectionTitle>
      <Card>
        <Muted style={{ marginBottom: 8 }}>{trainer.display_name} יוכל לראות ולשנות:</Muted>
        <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem', lineHeight: 1.5 }}>
          {MANAGED_ITEMS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>יומן האכילה</div>
            <Muted>מה אכלת, קלוריות ומאקרו (אופציונלי)</Muted>
          </div>
          <Toggle on={shareNutrition} onChange={setShareNutrition} />
        </div>
      </Card>
      <Muted style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        כל שינוי של המאמן מופיע אצלך במסך "המאמן שלי". תמונות התקדמות, הגדרות אישיות והסכמות (כמו המאמן החכם) נשארים רק שלך. אפשר להפסיק בכל רגע, והגישה נחסמת מיד.
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
  unread: number;
  onBack: () => void;
  onChanged: () => void;
}> = ({ meId, unread, onBack, onChanged }) => {
  const [data, setData] = useState<{ relation: TrainerRelation; trainerName: string; trainerBio: string | null } | null | undefined>(undefined);
  const [activity, setActivity] = useState<TrainerActivity[]>([]);
  const [view, setView] = useState<'home' | 'chat'>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rel, act] = await Promise.all([getMyTrainerRelation(meId), getRecentActivity(meId)]);
        setData(rel);
        setActivity(rel ? act.filter((a) => a.trainer_id === rel.relation.trainer_id) : []);
      } catch (e) {
        setError(msg(e));
        setData(null);
      }
    })();
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

  // רצף שינויים באותה טבלה בתוך דקה = שורה אחת ("המאמן עדכן את התוכנית")
  const grouped = activity.reduce<TrainerActivity[]>((acc, a) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.table_name === a.table_name && Math.abs(new Date(prev.created_at).getTime() - new Date(a.created_at).getTime()) < 60_000) return acc;
    acc.push(a);
    return acc;
  }, []);

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

      <SectionTitle>שינויים אחרונים של המאמן</SectionTitle>
      {grouped.length === 0 ? (
        <Muted>המאמן עוד לא שינה כלום.</Muted>
      ) : (
        <Card>
          {grouped.slice(0, 12).map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.82rem', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <History size={13} color="var(--text-muted)" />
                {trainerName} {ACTION_LABELS[a.action]} {TABLE_LABELS[a.table_name] ?? a.table_name}
              </span>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{daysAgoLabel(a.created_at)}</span>
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>מה המאמן מנהל</SectionTitle>
      <Card>
        <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.82rem', lineHeight: 1.5 }}>
          {MANAGED_ITEMS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>יומן האכילה</div>
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
          if (!window.confirm(`להפסיק את הליווי של ${trainerName}? המאמן לא יוכל יותר לראות או לשנות את הנתונים שלך. מה שהוא כבר שינה נשאר.`)) return;
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
        הפסקת הליווי של המאמן
      </button>
    </Screen>
  );
};
