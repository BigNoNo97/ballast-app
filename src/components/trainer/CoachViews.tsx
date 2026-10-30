import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Dumbbell, Library, Loader2, Pencil, RefreshCw, Share2, UserMinus } from 'lucide-react';
import type { Exercise, RoutineTemplate, UserSettings, WorkoutSession } from '../../types';
import { weeklyMuscleTargets } from '../../services/programGenerator';
import { loadSuggestions, weeklyLoad } from '../../services/muscleLoad';
import { MuscleLoadCard } from '../MuscleLoadCard';
import { currentWeight, weightTrend } from '../../services/nutrition/engine';
import { injuryLabel } from '../../services/training/injuries';
import { MUSCLE_GROUP_LABELS } from '../../data/exercises';
import {
  activeRoutineOf,
  assignProgram,
  becomeTrainer,
  ClientSnapshot,
  closeTrainerAccount,
  deleteClientRows,
  endRelation,
  getClientSnapshot,
  getMyClients,
  getRecentClientWorkouts,
  getTrainerStatus,
  patchClientSettings,
  rotateInviteCode,
  routineWithCurrentLoads,
  saveClientRoutine,
  TrainerError,
  TrainerProfile,
  TrainerRelation,
  TrainerStatus,
  updateTrainerProfile,
} from '../../services/trainer';
import { notifyClientUpdated } from '../../services/push';
import { RoutinesView } from '../RoutinesView';
import { ChatThread } from './ChatThread';
import { BodyWeightEditor, NutritionGoalsEditor, ProfileEditorScreen, WorkoutEditCard } from './ClientEditors';
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
            <li>ניהול מלא של כל מתאמן: תוכניות, סדר תרגילים, משקלים וחזרות, אימונים שנרשמו, משקל גוף, פרופיל ויעדי תזונה</li>
            <li>כל שינוי מתעדכן מיד באפליקציה של המתאמן</li>
            <li>הודעות עם כל מתאמן</li>
          </ul>
          <Muted style={{ marginTop: 8 }}>בחשבון החינמי אפשר ללוות עד 5 מתאמנים. מנוי מאמן ללא הגבלה - בקרוב.</Muted>
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
          {status.plan !== 'trainer' && ' · בחשבון החינמי אפשר עד 5 מתאמנים. מנוי מאמן ללא הגבלה - בקרוב.'}
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

type Tab = 'overview' | 'workouts' | 'program' | 'body' | 'nutrition' | 'messages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'program', label: 'תוכנית' },
  { id: 'workouts', label: 'אימונים' },
  { id: 'body', label: 'גוף' },
  { id: 'nutrition', label: 'תזונה' },
  { id: 'messages', label: 'הודעות' },
];

export const ClientDetailScreen: React.FC<{
  trainerId: string;
  trainerName: string;
  relation: TrainerRelation;
  allExercises: Exercise[];
  myRoutines: RoutineTemplate[];
  unread: number;
  onBack: () => void;
  onRead: () => void;
  onRemoved: () => void;
}> = ({ trainerId, trainerName, relation, allExercises, myRoutines, unread, onBack, onRead, onRemoved }) => {
  const isActive = relation.status === 'active';
  const clientId = relation.client_id;
  const [tab, setTab] = useState<Tab>(isActive ? 'overview' : 'messages');
  const [snap, setSnap] = useState<ClientSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<'profile' | 'routines' | 'assign' | null>(null);

  const load = async () => {
    if (!isActive) return;
    try {
      setSnap(await getClientSnapshot(relation));
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  };
  useEffect(() => {
    load();
  }, [clientId]);

  /** אחרי כל שינוי: טוענים מחדש ומודיעים למתאמן (פוש מרוכז - לא על כל שמירה) */
  const changed = () => {
    load();
    notifyClientUpdated(clientId);
  };

  const library = useMemo(() => {
    const map = new Map<string, Exercise>();
    [...allExercises, ...(snap?.customExercises ?? [])].forEach((e) => map.set(e.id, e));
    return [...map.values()];
  }, [allExercises, snap]);
  const nameOf = useMemo(() => {
    const lib = new Map(library.map((e) => [e.id, e.nameHe]));
    return (id: string) => lib.get(id) ?? id;
  }, [library]);

  const name = relation.client_display_name;

  if (snap && overlay === 'profile') {
    return (
      <ProfileEditorScreen
        clientId={clientId}
        clientName={name}
        snap={snap}
        onBack={() => setOverlay(null)}
        onSaved={() => {
          setOverlay(null);
          changed();
        }}
      />
    );
  }
  if (snap && overlay === 'assign') {
    return (
      <AssignProgramScreen
        clientName={name}
        myRoutines={myRoutines}
        nameOf={nameOf}
        onBack={() => setOverlay(null)}
        onAssign={async (routine) => {
          await assignProgram(clientId, trainerName, routine, allExercises, snap);
          setOverlay(null);
          setTab('program');
          changed();
        }}
      />
    );
  }

  return (
    <Screen title={name} subtitle={isActive ? syncedLabel(snap) : 'השיתוף הסתיים'} onBack={onBack} noScroll={tab === 'messages'}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
        {TABS.filter((t) => isActive || t.id === 'messages').map((t) => (
          <button key={t.id} className={`filter-chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} style={{ flexShrink: 0 }}>
            {t.label}
            {t.id === 'messages' && unread > 0 && (
              <span style={{ marginInlineStart: 4 }}>
                <Badge count={unread} />
              </span>
            )}
          </button>
        ))}
      </div>
      <ErrorNote text={error} />

      {tab === 'messages' ? (
        <ChatThread trainerId={trainerId} clientId={clientId} meId={trainerId} otherName={name} canSend={isActive} onRead={onRead} />
      ) : !snap ? (
        !error && <Loader2 size={20} className="spin" style={{ margin: '40px auto' }} />
      ) : tab === 'overview' ? (
        <Overview
          snap={snap}
          library={library}
          relation={relation}
          onEditProfile={() => setOverlay('profile')}
          onRemove={async () => {
            if (!window.confirm(`להסיר את ${name} מרשימת המתאמנים? הגישה לנתונים שלו תיחסם מיד, והוא לא יוכל להצטרף שוב לבד.`)) return;
            try {
              await endRelation(trainerId, clientId);
              onRemoved();
            } catch (e) {
              setError(msg(e));
            }
          }}
        />
      ) : tab === 'workouts' ? (
        <WorkoutsTab clientId={clientId} workouts={snap.workouts} nameOf={nameOf} onChanged={changed} />
      ) : tab === 'program' ? (
        <ProgramTab snap={snap} nameOf={nameOf} onEdit={() => setOverlay('routines')} onAssign={() => setOverlay('assign')} />
      ) : tab === 'body' ? (
        <BodyWeightEditor clientId={clientId} log={snap.weightLog} onChanged={changed} />
      ) : (
        <NutritionTab snap={snap} clientId={clientId} shared={relation.share_nutrition} onChanged={changed} />
      )}

      {snap && overlay === 'routines' && (
        <div className="modal-overlay" style={{ zIndex: 230 }} onClick={() => setOverlay(null)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ height: 'calc(var(--app-vh, 1vh) * 90)', overflowY: 'auto' }}>
            <div className="sheet-handle" />
            <Muted style={{ marginBottom: 8 }}>עורכים את התוכניות של {name}. כל שמירה מתעדכנת אצלו באפליקציה.</Muted>
            <RoutinesView
              routines={snap.routines.map((r) => routineWithCurrentLoads(r, snap))}
              activeRoutine={(() => {
                const a = activeRoutineOf(snap);
                return a ? routineWithCurrentLoads(a, snap) : null;
              })()}
              allExercises={library}
              onSelectActiveRoutine={async (r) => {
                try {
                  await patchClientSettings(clientId, { settings: { activeRoutineId: r.id } });
                  changed();
                } catch (e) {
                  setError(msg(e));
                }
              }}
              onSaveRoutine={async (r) => {
                try {
                  await saveClientRoutine(clientId, r, snap);
                  changed();
                } catch (e) {
                  setError(msg(e));
                }
              }}
              onDeleteRoutine={async (id) => {
                try {
                  await deleteClientRows(clientId, 'routines', [id]);
                  if (snap.settings.activeRoutineId === id) await patchClientSettings(clientId, { settings: { activeRoutineId: null } });
                  changed();
                } catch (e) {
                  setError(msg(e));
                }
              }}
              onStartRoutine={() => {}}
              onStartEmptyWorkout={() => {}}
              onClose={() => setOverlay(null)}
            />
          </div>
        </div>
      )}
    </Screen>
  );
};

function syncedLabel(snap: ClientSnapshot | null): string | undefined {
  if (!snap?.lastSyncedAt) return undefined;
  // עדכון אחרון בשרת - מהמכשיר של המתאמן או מעריכה של המאמן
  return `עודכן לאחרונה ${daysAgoLabel(snap.lastSyncedAt)}, ${new Date(snap.lastSyncedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.84rem', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontWeight: 600, textAlign: 'left' }}>{value}</span>
  </div>
);

const Overview: React.FC<{
  snap: ClientSnapshot;
  library: Exercise[];
  relation: TrainerRelation;
  onEditProfile: () => void;
  onRemove: () => void;
}> = ({
  snap,
  library,
  relation,
  onEditProfile,
  onRemove,
}) => {
  const s = snap.settings;
  const now = Date.now();
  const weight = currentWeight(snap.weightLog, now);
  const trend = weightTrend(snap.weightLog, now, 28);
  const last7 = snap.workouts.filter((w) => w.startTime >= now - 7 * DAY_MS).length;
  const last28 = snap.workouts.filter((w) => w.startTime >= now - 28 * DAY_MS).length;
  const planned = s.trainingDaysPerWeek ?? s.scheduledWeekdays?.length;
  // עומס השרירים של המתאמן השבוע, מול היעדים של התוכנית הפעילה שלו
  const load = useMemo(() => {
    const active = snap.routines.find((r) => r.id === s.activeRoutineId) ?? (s.activeRoutineId === undefined ? snap.routines[0] : null);
    const targets = weeklyMuscleTargets(s as UserSettings, active, weight ?? undefined);
    const rows = weeklyLoad(snap.workouts, library, targets);
    return { rows, suggestions: loadSuggestions(rows, library, active) };
  }, [snap, library, s, weight]);
  return (
    <>
      <Card>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>עקביות</div>
        <Fact label="אימון אחרון" value={daysAgoLabel(snap.workouts[0]?.startTime)} />
        <Fact label="7 ימים אחרונים" value={`${last7}${planned ? ` מתוך ${planned} מתוכננים` : ''}`} />
        <Fact label="4 שבועות אחרונים" value={`${last28} אימונים`} />
      </Card>
      <MuscleLoadCard
        rows={load.rows}
        suggestions={load.suggestions}
        subtitle="הסטים שהמתאמן השלים השבוע לכל שריר, מול היעד השבועי של התוכנית שלו. שריר משני נספר כחצי סט."
        emptyText="המתאמן עוד לא השלים סטים השבוע."
      />
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>גוף ומטרות</div>
          <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={onEditProfile}>
            <Pencil size={13} /> עריכה
          </button>
        </div>
        <Fact label="משקל (מגמה)" value={weight ? `${weight.toFixed(1)} ק"ג` : '—'} />
        {trend && trend.weighIns >= 3 && (
          <Fact label="שינוי ב-4 שבועות" value={`${trend.slopeKgPerDay * 28 >= 0 ? '+' : ''}${(trend.slopeKgPerDay * 28).toFixed(1)} ק"ג`} />
        )}
        {snap.targetWeight && <Fact label="משקל יעד" value={`${snap.targetWeight} ק"ג`} />}
        <Fact label="מטרות" value={s.goals?.map((g) => GOAL_LABELS[g]).join(', ') || '—'} />
        <Fact label="ניסיון" value={s.experienceLevel ? EXPERIENCE_LABELS[s.experienceLevel] : '—'} />
        <Fact label="גיל · גובה" value={`${s.ageYears ?? '—'} · ${s.heightCm ? `${s.heightCm} ס"מ` : '—'}`} />
        <Fact label="ימי אימון בשבוע" value={s.trainingDaysPerWeek ?? '—'} />
        {!!s.injuries?.length && <Fact label="פציעות / מגבלות" value={s.injuries.map(injuryLabel).join(', ')} />}
        {!!s.focusMuscles?.length && <Fact label="אזורי מיקוד" value={s.focusMuscles.map((m) => MUSCLE_GROUP_LABELS[m]?.he ?? m).join(', ')} />}
      </Card>
      <Muted>
        הצטרף/ה {new Date(relation.consented_at).toLocaleDateString('he-IL')} · תזונה {relation.share_nutrition ? 'משותפת' : 'לא משותפת'}
      </Muted>
      <button className="btn-secondary" style={{ color: 'var(--color-red)', marginTop: 6 }} onClick={onRemove}>
        <UserMinus size={16} /> הסרת המתאמן
      </button>
    </>
  );
};

const WorkoutsTab: React.FC<{ clientId: string; workouts: WorkoutSession[]; nameOf: (id: string) => string; onChanged: () => void }> = ({
  clientId,
  workouts,
  nameOf,
  onChanged,
}) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!workouts.length) return <Muted>עוד אין אימונים.</Muted>;
  return (
    <>
      <Muted>לחיצה על אימון פותחת אותו לעריכה: משקלים, חזרות, סימון סטים, או מחיקה.</Muted>
      {workouts.slice(0, 30).map((w) => (
        <Card key={w.id} style={{ padding: 12 }}>
          <button onClick={() => setOpen(open === w.id ? null : w.id)} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{w.title}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{new Date(w.startTime).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</span>
            </div>
            <Muted>
              {Math.round(w.durationSec / 60)} דק׳ · {w.completedSetsCount} סטים · {Math.round(w.totalVolumeKg).toLocaleString('he-IL')} ק"ג נפח
            </Muted>
          </button>
          {open === w.id && (
            <WorkoutEditCard
              clientId={clientId}
              workout={w}
              nameOf={nameOf}
              onChanged={() => {
                setOpen(null);
                onChanged();
              }}
            />
          )}
        </Card>
      ))}
    </>
  );
};

const ProgramTab: React.FC<{ snap: ClientSnapshot; nameOf: (id: string) => string; onEdit: () => void; onAssign: () => void }> = ({
  snap,
  nameOf,
  onEdit,
  onAssign,
}) => {
  const routine = activeRoutineOf(snap);
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ flex: 1, padding: '11px 0' }} onClick={onEdit}>
          <Pencil size={15} /> עריכת התוכניות
        </button>
        <button className="btn-secondary" style={{ flex: 1, padding: '11px 0' }} onClick={onAssign}>
          <Library size={15} /> תוכנית מהספרייה שלי
        </button>
      </div>
      <SectionTitle>התוכנית הפעילה</SectionTitle>
      {routine ? (
        <>
          <Muted>
            {routine.title}
            {routine.assignedByTrainer ? ` · מאת ${routine.assignedByTrainer}` : routine.isGenerated ? ' · נבנתה ע"י מנוע האפליקציה' : ''}
          </Muted>
          <RoutinePreview routine={routineWithCurrentLoads(routine, snap)} nameOf={nameOf} />
        </>
      ) : (
        <Muted>אין תוכנית פעילה.</Muted>
      )}
    </>
  );
};

const NutritionTab: React.FC<{ snap: ClientSnapshot; clientId: string; shared: boolean; onChanged: () => void }> = ({ snap, clientId, shared, onChanged }) => {
  const startToday = new Date(new Date().toDateString()).getTime();
  const est = snap.nutrition?.estimate;
  return (
    <>
      <NutritionGoalsEditor clientId={clientId} goals={snap.nutritionGoals} onChanged={onChanged} />
      {est && (
        <Muted>
          הוצאה יומית משוערת: {Math.round(est.tdee).toLocaleString('he-IL')} קק"ל{est.adaptiveTdee ? ' (מהנתונים בפועל)' : ' (מנוסחה)'}
        </Muted>
      )}
      {!shared || !snap.nutritionEntries ? (
        <Muted>המתאמן לא שיתף את יומן האכילה. הוא יכול להפעיל את זה במסך "המאמן שלי".</Muted>
      ) : (
        <Card>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 6 }}>7 ימים אחרונים</div>
          {Array.from({ length: 7 }, (_, i) => {
            const start = startToday - i * DAY_MS;
            const items = snap.nutritionEntries!.filter((e) => e.date >= start && e.date < start + DAY_MS);
            const sum = (f: (e: (typeof items)[number]) => number) => Math.round(items.reduce((a, e) => a + (f(e) * e.grams) / 100, 0));
            return (
              <Fact
                key={start}
                label={daysAgoLabel(start)}
                value={
                  items.length ? (
                    `${sum((e) => e.caloriesPer100g).toLocaleString('he-IL')} קק"ל · ${sum((e) => e.proteinPer100g)} גר׳ חלבון`
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>לא תועד</span>
                  )
                }
              />
            );
          })}
        </Card>
      )}
    </>
  );
};

// ===================== תוכנית מהספרייה של המאמן =====================

const AssignProgramScreen: React.FC<{
  clientName: string;
  myRoutines: RoutineTemplate[];
  nameOf: (id: string) => string;
  onBack: () => void;
  onAssign: (routine: RoutineTemplate) => Promise<void>;
}> = ({ clientName, myRoutines, nameOf, onBack, onAssign }) => {
  const [selected, setSelected] = useState<RoutineTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selected) {
    return (
      <Screen title={selected.title} subtitle={`ל${clientName}`} onBack={() => setSelected(null)}>
        <RoutinePreview routine={selected} nameOf={nameOf} />
        <Muted>התוכנית תועתק ל{clientName} ותהפוך לתוכנית הפעילה שלו. התוכנית הקודמת שלו נשארת שמורה, ואפשר לערוך את העותק שלו בנפרד.</Muted>
        <ErrorNote text={error} />
        <button
          className="btn-primary"
          style={{ padding: '12px 0' }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onAssign(selected);
            } catch (e) {
              setError(msg(e));
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 size={18} className="spin" /> : 'הפעלת התוכנית אצל המתאמן'}
        </button>
      </Screen>
    );
  }

  const usable = myRoutines.filter((r) => r.days.some((d) => d.exercises.length > 0));
  return (
    <Screen title="תוכנית מהספרייה שלי" subtitle={clientName} onBack={onBack}>
      <Muted>התוכניות שבנית בחשבון שלך (לשונית אימון ← התוכניות שלי). אפשר גם לערוך ישירות את התוכניות של המתאמן בלשונית "תוכנית".</Muted>
      {usable.length === 0 ? (
        <Card>
          <Muted>אין לך עדיין תוכניות עם תרגילים.</Muted>
        </Card>
      ) : (
        usable.map((r) => (
          <RowButton
            key={r.id}
            icon={<Dumbbell size={18} color="var(--color-blue)" />}
            title={r.title}
            subtitle={`${r.days.length} ימים · ${r.days.reduce((a, d) => a + d.exercises.length, 0)} תרגילים`}
            onClick={() => setSelected(r)}
          />
        ))
      )}
    </Screen>
  );
};
