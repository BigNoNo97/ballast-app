import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Dumbbell, Loader2, RefreshCw, Send, Share2, UserMinus, Users } from 'lucide-react';
import type { Exercise, RoutineTemplate } from '../../types';
import { currentWeight, weightTrend } from '../../services/nutrition/engine';
import { injuryLabel } from '../../services/training/injuries';
import { MUSCLE_GROUP_LABELS } from '../../data/exercises';
import {
  activeRoutineOf,
  becomeTrainer,
  ClientSnapshot,
  closeTrainerAccount,
  endRelation,
  getClientSnapshot,
  getMyClients,
  getProgramsForClient,
  getRecentClientWorkouts,
  getTrainerStatus,
  ProgramOffer,
  rotateInviteCode,
  sendProgram,
  TrainerError,
  TrainerProfile,
  TrainerRelation,
  TrainerStatus,
  updateTrainerProfile,
} from '../../services/trainer';
import type { WorkoutSession } from '../../types';
import { ChatThread } from './ChatThread';
import {
  Badge,
  Card,
  daysAgoLabel,
  ErrorNote,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  inputStyle,
  Muted,
  RoutinePreview,
  RowButton,
  Screen,
  SectionTitle,
} from './trainerUi';

const msg = (e: unknown) => (e instanceof TrainerError ? e.message : 'משהו השתבש. נסה שוב.');
const DAY_MS = 24 * 60 * 60 * 1000;

// ===================== פתיחת חשבון מאמן =====================

export const BecomeTrainerScreen: React.FC<{
  defaultName: string;
  existing?: TrainerProfile | null;
  onBack: () => void;
  onDone: (p: TrainerProfile | null) => void;
}> = ({ defaultName, existing, onBack, onDone }) => {
  const [name, setName] = useState(existing?.display_name ?? defaultName);
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setError('השם צריך להיות לפחות 2 תווים.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await updateTrainerProfile(existing.user_id, name, bio);
        onDone({ ...existing, display_name: name.trim(), bio: bio.trim() || null });
      } else {
        onDone(await becomeTrainer(name, bio));
      }
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  return (
    <Screen title={existing ? 'פרופיל המאמן' : 'חשבון מאמן'} onBack={onBack}>
      {!existing && (
        <Card>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>מנהלים את כל המתאמנים מאותה אפליקציה</div>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.84rem', lineHeight: 1.5 }}>
            <li>קוד הזמנה אישי שאפשר לשלוח לכל מתאמן</li>
            <li>מעקב אחרי האימונים, התוכנית, המשקל והתזונה של כל מתאמן (מה שהוא בחר לשתף)</li>
            <li>שליחת תוכניות אימון ישירות לאפליקציה שלו</li>
            <li>הודעות עם כל מתאמן</li>
          </ul>
          <Muted style={{ marginTop: 8 }}>בחשבון החינמי אפשר ללוות עד 2 מתאמנים. מנוי מאמן ללא הגבלה - בקרוב.</Muted>
        </Card>
      )}
      <SectionTitle>השם שהמתאמנים יראו</SectionTitle>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} style={inputStyle} placeholder="לדוגמה: דני כהן - אימון כוח" />
      <SectionTitle>כמה מילים עליך (לא חובה)</SectionTitle>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value.slice(0, 500))}
        rows={3}
        style={{ ...inputStyle, resize: 'none' }}
        placeholder="התמחות, ניסיון, איפה אתה מאמן..."
      />
      <ErrorNote text={error} />
      <button className="btn-primary" style={{ padding: '12px 0' }} disabled={busy} onClick={save}>
        {busy ? <Loader2 size={18} className="spin" /> : existing ? 'שמירה' : 'פתיחת חשבון מאמן'}
      </button>
      {existing && (
        <button
          className="btn-secondary"
          style={{ color: 'var(--color-red)', marginTop: 16 }}
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('לסגור את חשבון המאמן? כל המתאמנים ינותקו והגישה לנתונים שלהם תיחסם. ההודעות יישמרו לקריאה.')) return;
            setBusy(true);
            try {
              await closeTrainerAccount();
              onDone(null);
            } catch (e) {
              setError(msg(e));
              setBusy(false);
            }
          }}
        >
          סגירת חשבון המאמן
        </button>
      )}
    </Screen>
  );
};

// ===================== לוח המאמן =====================

export const TrainerDashboard: React.FC<{
  profile: TrainerProfile;
  unreadByThread: Map<string, number>;
  onBack: () => void;
  onEditProfile: () => void;
  onOpenClient: (relation: TrainerRelation) => void;
  onProfileChanged: (p: TrainerProfile) => void;
}> = ({ profile, unreadByThread, onBack, onEditProfile, onOpenClient, onProfileChanged }) => {
  const [clients, setClients] = useState<TrainerRelation[] | null>(null);
  const [recent, setRecent] = useState<Map<string, WorkoutSession[]>>(new Map());
  const [status, setStatus] = useState<TrainerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEnded, setShowEnded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, st] = await Promise.all([getMyClients(profile.user_id), getTrainerStatus()]);
        setClients(list);
        setStatus(st);
        setRecent(await getRecentClientWorkouts(list.filter((c) => c.status === 'active').map((c) => c.client_id)));
      } catch (e) {
        setError(msg(e));
        setClients((c) => c ?? []);
      }
    })();
  }, [profile.user_id]);

  const inviteText = `מוזמן/ת להתאמן איתי ב-Ballast 💪\nמורידים את האפליקציה, ובמסך "פרופיל" ← "מאמנים" מזינים את הקוד:\n${profile.invite_code}`;

  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text: inviteText });
        return;
      } catch {
        // המשתמש ביטל את חלון השיתוף - נופלים להעתקה
      }
    }
    await copy();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('לא הצלחנו להעתיק. אפשר להעתיק את הקוד ידנית.');
    }
  };
  const rotate = async () => {
    if (!window.confirm('ליצור קוד חדש? הקוד הנוכחי יפסיק לעבוד. מתאמנים שכבר הצטרפו לא יושפעו.')) return;
    try {
      onProfileChanged({ ...profile, invite_code: await rotateInviteCode() });
    } catch (e) {
      setError(msg(e));
    }
  };

  const active = clients?.filter((c) => c.status === 'active') ?? [];
  const ended = clients?.filter((c) => c.status === 'ended') ?? [];
  const weekAgo = Date.now() - 7 * DAY_MS;

  return (
    <Screen title="לוח המאמן" subtitle={profile.display_name} onBack={onBack}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>קוד ההזמנה שלך</div>
          <button onClick={rotate} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.74rem', display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
            <RefreshCw size={13} /> קוד חדש
          </button>
        </div>
        <div style={{ direction: 'ltr', textAlign: 'center', fontSize: '1.7rem', fontWeight: 900, letterSpacing: 6, padding: '6px 0 10px', userSelect: 'all' }}>
          {profile.invite_code}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-primary" style={{ flex: 1, padding: '10px 0' }} onClick={share}>
            <Share2 size={16} /> שליחה למתאמן
          </button>
          <button className="btn-secondary" style={{ flex: 1, padding: '10px 0' }} onClick={copy}>
            <Copy size={16} /> {copied ? 'הועתק ✓' : 'העתקה'}
          </button>
        </div>
      </Card>

      {status && (
        <Muted>
          {status.active_clients}/{status.client_limit} מתאמנים פעילים
          {status.plan !== 'trainer' && ' · בחשבון החינמי אפשר עד 2 מתאמנים. מנוי מאמן ללא הגבלה - בקרוב.'}
        </Muted>
      )}
      <ErrorNote text={error} />

      <SectionTitle>המתאמנים שלי</SectionTitle>
      {clients === null ? (
        <Loader2 size={20} className="spin" style={{ margin: '20px auto' }} />
      ) : active.length === 0 ? (
        <Card>
          <Muted>עוד אין מתאמנים. שלח להם את הקוד, וכשיצטרפו הם יופיעו כאן.</Muted>
        </Card>
      ) : (
        active.map((c) => {
          const ws = recent.get(c.client_id) ?? [];
          const thisWeek = ws.filter((w) => w.startTime >= weekAgo).length;
          return (
            <RowButton
              key={c.client_id}
              icon={<Dumbbell size={20} color={ws.length ? 'var(--color-green)' : 'var(--text-muted)'} />}
              title={c.client_display_name}
              subtitle={`אימון אחרון: ${ws[0] ? daysAgoLabel(ws[0].startTime) : 'אין בשבועיים האחרונים'} · השבוע: ${thisWeek}`}
              badge={unreadByThread.get(`${profile.user_id}:${c.client_id}`)}
              onClick={() => onOpenClient(c)}
            />
          );
        })
      )}

      {ended.length > 0 && (
        <>
          <button onClick={() => setShowEnded((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'right', cursor: 'pointer', padding: '4px 2px' }}>
            {showEnded ? '▾' : '▸'} מתאמנים לשעבר ({ended.length})
          </button>
          {showEnded &&
            ended.map((c) => (
              <RowButton key={c.client_id} title={c.client_display_name} subtitle={`השיתוף הסתיים ${daysAgoLabel(c.ended_at)}`} onClick={() => onOpenClient(c)} />
            ))}
        </>
      )}

      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={onEditProfile}>
        עריכת פרופיל המאמן
      </button>
    </Screen>
  );
};

// ===================== מתאמן אחד =====================

type Tab = 'overview' | 'workouts' | 'program' | 'nutrition' | 'messages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'workouts', label: 'אימונים' },
  { id: 'program', label: 'תוכנית' },
  { id: 'nutrition', label: 'תזונה' },
  { id: 'messages', label: 'הודעות' },
];

export const ClientDetailScreen: React.FC<{
  trainerId: string;
  relation: TrainerRelation;
  allExercises: Exercise[];
  myRoutines: RoutineTemplate[];
  unread: number;
  onBack: () => void;
  onRead: () => void;
  onRemoved: () => void;
}> = ({ trainerId, relation, allExercises, myRoutines, unread, onBack, onRead, onRemoved }) => {
  const isActive = relation.status === 'active';
  const [tab, setTab] = useState<Tab>(isActive ? 'overview' : 'messages');
  const [snap, setSnap] = useState<ClientSnapshot | null>(null);
  const [programs, setPrograms] = useState<ProgramOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!isActive) return;
    try {
      const [s, p] = await Promise.all([getClientSnapshot(relation), getProgramsForClient(trainerId, relation.client_id)]);
      setSnap(s);
      setPrograms(p);
    } catch (e) {
      setError(msg(e));
    }
  };
  useEffect(() => {
    load();
  }, [relation.client_id]);

  const nameOf = useMemo(() => {
    const lib = new Map([...allExercises, ...(snap?.customExercises ?? [])].map((e) => [e.id, e.nameHe]));
    return (id: string) => lib.get(id) ?? id;
  }, [allExercises, snap]);

  if (sending && snap) {
    return (
      <SendProgramScreen
        trainerId={trainerId}
        relation={relation}
        myRoutines={myRoutines}
        allExercises={allExercises}
        nameOf={nameOf}
        onBack={() => setSending(false)}
        onSent={() => {
          setSending(false);
          load();
        }}
      />
    );
  }

  const name = relation.client_display_name;
  return (
    <Screen title={name} subtitle={isActive ? undefined : 'השיתוף הסתיים'} onBack={onBack} noScroll={tab === 'messages'}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
        {TABS.filter((t) => isActive || t.id === 'messages').map((t) => (
          <button key={t.id} className={`filter-chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} style={{ flexShrink: 0 }}>
            {t.label}
            {t.id === 'messages' && unread > 0 && <span style={{ marginInlineStart: 4 }}><Badge count={unread} /></span>}
          </button>
        ))}
      </div>
      <ErrorNote text={error} />

      {tab === 'messages' ? (
        <ChatThread trainerId={trainerId} clientId={relation.client_id} meId={trainerId} otherName={name} canSend={isActive} onRead={onRead} />
      ) : !snap ? (
        !error && <Loader2 size={20} className="spin" style={{ margin: '40px auto' }} />
      ) : tab === 'overview' ? (
        <Overview snap={snap} relation={relation} onRemove={async () => {
          if (!window.confirm(`להסיר את ${name} מרשימת המתאמנים? הגישה לנתונים שלו תיחסם מיד, והוא לא יוכל להצטרף שוב לבד.`)) return;
          try {
            await endRelation(trainerId, relation.client_id);
            onRemoved();
          } catch (e) {
            setError(msg(e));
          }
        }} />
      ) : tab === 'workouts' ? (
        <WorkoutsTab workouts={snap.workouts} nameOf={nameOf} />
      ) : tab === 'program' ? (
        <ProgramTab snap={snap} programs={programs} nameOf={nameOf} onSend={() => setSending(true)} />
      ) : (
        <NutritionTab snap={snap} shared={relation.share_nutrition} />
      )}
    </Screen>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.84rem', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontWeight: 600, textAlign: 'left' }}>{value}</span>
  </div>
);

const Overview: React.FC<{ snap: ClientSnapshot; relation: TrainerRelation; onRemove: () => void }> = ({ snap, relation, onRemove }) => {
  const s = snap.settings;
  const now = Date.now();
  const weight = currentWeight(snap.weightLog, now);
  const trend = weightTrend(snap.weightLog, now, 28);
  const last7 = snap.workouts.filter((w) => w.startTime >= now - 7 * DAY_MS).length;
  const last28 = snap.workouts.filter((w) => w.startTime >= now - 28 * DAY_MS).length;
  const planned = s.trainingDaysPerWeek ?? s.scheduledWeekdays?.length;
  return (
    <>
      <Card>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>עקביות</div>
        <Fact label="אימון אחרון" value={daysAgoLabel(snap.workouts[0]?.startTime)} />
        <Fact label="7 ימים אחרונים" value={`${last7}${planned ? ` מתוך ${planned} מתוכננים` : ''}`} />
        <Fact label="4 שבועות אחרונים" value={`${last28} אימונים`} />
      </Card>
      <Card>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>גוף ומטרות</div>
        <Fact label="משקל (מגמה)" value={weight ? `${weight.toFixed(1)} ק"ג` : '—'} />
        {trend && trend.weighIns >= 3 && (
          <Fact label="שינוי ב-4 שבועות" value={`${trend.slopeKgPerDay * 28 >= 0 ? '+' : ''}${(trend.slopeKgPerDay * 28).toFixed(1)} ק"ג`} />
        )}
        {snap.targetWeight && <Fact label="משקל יעד" value={`${snap.targetWeight} ק"ג`} />}
        <Fact label="מטרות" value={s.goals?.map((g) => GOAL_LABELS[g]).join(', ') || '—'} />
        <Fact label="ניסיון" value={s.experienceLevel ? EXPERIENCE_LABELS[s.experienceLevel] : '—'} />
        <Fact label="גיל · גובה" value={`${s.ageYears ?? '—'} · ${s.heightCm ? `${s.heightCm} ס"מ` : '—'}`} />
        <Fact label="ימי אימון בשבוע" value={s.trainingDaysPerWeek ?? '—'} />
      </Card>
      {(s.injuries?.length || s.focusMuscles?.length) ? (
        <Card style={{ background: s.injuries?.length ? 'var(--color-orange-bg)' : undefined }}>
          {!!s.injuries?.length && <Fact label="פציעות / מגבלות" value={s.injuries.map(injuryLabel).join(', ')} />}
          {!!s.focusMuscles?.length && <Fact label="אזורי מיקוד" value={s.focusMuscles.map((m) => MUSCLE_GROUP_LABELS[m]?.he ?? m).join(', ')} />}
        </Card>
      ) : null}
      <Muted>
        הצטרף/ה {new Date(relation.consented_at).toLocaleDateString('he-IL')} · תזונה {relation.share_nutrition ? 'משותפת' : 'לא משותפת'}
      </Muted>
      <button className="btn-secondary" style={{ color: 'var(--color-red)', marginTop: 6 }} onClick={onRemove}>
        <UserMinus size={16} /> הסרת המתאמן
      </button>
    </>
  );
};

const WorkoutsTab: React.FC<{ workouts: WorkoutSession[]; nameOf: (id: string) => string }> = ({ workouts, nameOf }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!workouts.length) return <Muted>עוד אין אימונים.</Muted>;
  return (
    <>
      {workouts.slice(0, 30).map((w) => (
        <Card key={w.id} style={{ padding: 12 }}>
          <button
            onClick={() => setOpen(open === w.id ? null : w.id)}
            style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{w.title}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{new Date(w.startTime).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</span>
            </div>
            <Muted>
              {Math.round(w.durationSec / 60)} דק׳ · {w.completedSetsCount} סטים · {Math.round(w.totalVolumeKg).toLocaleString('he-IL')} ק"ג נפח
            </Muted>
          </button>
          {open === w.id && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {w.exercises.map((x, i) => {
                const done = x.sets.filter((st) => st.completed);
                return (
                  <li key={`${x.exerciseId}-${i}`} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{nameOf(x.exerciseId)}</span>
                    <span style={{ color: 'var(--text-muted)', direction: 'ltr' }}>{done.map((st) => `${st.weightKg}×${st.reps}`).join('  ') || '—'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}
    </>
  );
};

const PROGRAM_STATUS: Record<ProgramOffer['status'], string> = { sent: 'ממתינה לאישור', accepted: 'התקבלה', declined: 'נדחתה' };

const ProgramTab: React.FC<{ snap: ClientSnapshot; programs: ProgramOffer[]; nameOf: (id: string) => string; onSend: () => void }> = ({ snap, programs, nameOf, onSend }) => {
  const routine = activeRoutineOf(snap);
  return (
    <>
      <button className="btn-primary" style={{ padding: '11px 0' }} onClick={onSend}>
        <Send size={16} /> שליחת תוכנית
      </button>
      <SectionTitle>התוכנית הפעילה</SectionTitle>
      {routine ? (
        <>
          <Muted>
            {routine.title}
            {routine.assignedByTrainer ? ` · נשלחה ע"י ${routine.assignedByTrainer}` : routine.isGenerated ? ' · נבנתה ע"י מנוע האפליקציה' : ''}
          </Muted>
          <RoutinePreview routine={routine} nameOf={nameOf} />
        </>
      ) : (
        <Muted>אין תוכנית פעילה.</Muted>
      )}
      {programs.length > 0 && (
        <>
          <SectionTitle>תוכניות ששלחת</SectionTitle>
          {programs.map((p) => (
            <Card key={p.id} style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 700 }}>{p.routine.title}</span>
              <span style={{ fontSize: '0.76rem', color: p.status === 'accepted' ? 'var(--color-green)' : 'var(--text-muted)' }}>
                {PROGRAM_STATUS[p.status]} · {daysAgoLabel(p.created_at)}
              </span>
            </Card>
          ))}
        </>
      )}
    </>
  );
};

const NutritionTab: React.FC<{ snap: ClientSnapshot; shared: boolean }> = ({ snap, shared }) => {
  if (!shared || !snap.nutritionEntries) return <Muted>המתאמן לא שיתף את יומן התזונה. הוא יכול להפעיל את זה במסך "המאמן שלי".</Muted>;
  const goals = snap.nutritionGoals;
  const startToday = new Date(new Date().toDateString()).getTime();
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = startToday - i * DAY_MS;
    const items = snap.nutritionEntries!.filter((e) => e.date >= start && e.date < start + DAY_MS);
    const sum = (f: (e: (typeof items)[number]) => number) => Math.round(items.reduce((a, e) => a + (f(e) * e.grams) / 100, 0));
    return { start, n: items.length, kcal: sum((e) => e.caloriesPer100g), protein: sum((e) => e.proteinPer100g) };
  });
  const est = snap.nutrition?.estimate;
  return (
    <>
      {goals && (
        <Card>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>יעדים יומיים</div>
          <Fact label="קלוריות" value={goals.calories.toLocaleString('he-IL')} />
          <Fact label="חלבון · פחמימה · שומן" value={`${goals.protein} · ${goals.carbs} · ${goals.fat} גר׳`} />
          {est && <Fact label="הוצאה יומית משוערת" value={`${Math.round(est.tdee).toLocaleString('he-IL')} קק"ל${est.adaptiveTdee ? ' (מהנתונים בפועל)' : ' (מנוסחה)'}`} />}
        </Card>
      )}
      <Card>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>7 ימים אחרונים</div>
        {days.map((d) => (
          <Fact
            key={d.start}
            label={daysAgoLabel(d.start)}
            value={d.n ? `${d.kcal.toLocaleString('he-IL')} קק"ל · ${d.protein} גר׳ חלבון` : <span style={{ color: 'var(--text-muted)' }}>לא תועד</span>}
          />
        ))}
      </Card>
    </>
  );
};

// ===================== שליחת תוכנית =====================

const SendProgramScreen: React.FC<{
  trainerId: string;
  relation: TrainerRelation;
  myRoutines: RoutineTemplate[];
  allExercises: Exercise[];
  nameOf: (id: string) => string;
  onBack: () => void;
  onSent: () => void;
}> = ({ trainerId, relation, myRoutines, allExercises, nameOf, onBack, onSent }) => {
  const [selected, setSelected] = useState<RoutineTemplate | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await sendProgram(trainerId, relation.client_id, selected, allExercises, note);
      onSent();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <Screen title={selected.title} subtitle={`שליחה ל${relation.client_display_name}`} onBack={() => setSelected(null)}>
        <RoutinePreview routine={selected} nameOf={nameOf} />
        <SectionTitle>הערה למתאמן (לא חובה)</SectionTitle>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 1000))}
          rows={3}
          style={{ ...inputStyle, resize: 'none' }}
          placeholder="למשל: מתחילים ביום ראשון, משקלים לפי RPE 8"
        />
        <Muted>המתאמן יקבל את התוכנית באפליקציה ויוכל לאשר אותה. אחרי האישור היא תהפוך לתוכנית הפעילה שלו.</Muted>
        <ErrorNote text={error} />
        <button className="btn-primary" style={{ padding: '12px 0' }} disabled={busy} onClick={send}>
          {busy ? <Loader2 size={18} className="spin" /> : 'שליחה'}
        </button>
      </Screen>
    );
  }

  const sendable = myRoutines.filter((r) => r.days.some((d) => d.exercises.length > 0));
  return (
    <Screen title="שליחת תוכנית" subtitle={relation.client_display_name} onBack={onBack}>
      <Muted>בחר אחת מהתוכניות שלך. כדי לבנות תוכנית חדשה, צור אותה קודם במסך התוכניות שלך (לשונית אימון ← התוכניות שלי) ואז חזור לכאן.</Muted>
      {sendable.length === 0 ? (
        <Card>
          <Muted>אין לך עדיין תוכניות עם תרגילים.</Muted>
        </Card>
      ) : (
        sendable.map((r) => (
          <RowButton
            key={r.id}
            icon={<Users size={18} color="var(--color-blue)" />}
            title={r.title}
            subtitle={`${r.days.length} ימים · ${r.days.reduce((a, d) => a + d.exercises.length, 0)} תרגילים`}
            onClick={() => setSelected(r)}
          />
        ))
      )}
    </Screen>
  );
};
