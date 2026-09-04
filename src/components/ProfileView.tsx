import React, { useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Settings as SettingsIcon, ChevronRight, ChevronLeft, Flame, CalendarPlus, CalendarClock, Scale, Trash2, X, Ruler, Camera, Mail, ShieldAlert, Loader2 } from 'lucide-react';
import { WorkoutSession, Exercise, UserSettings } from '../types';
import { AddPastWorkoutModal } from './AddPastWorkoutModal';
import { WeeklyScheduleModal } from './WeeklyScheduleModal';
import { BodyWeightView } from './BodyWeightView';
import { MeasurementsView } from './MeasurementsView';
import { ProgressPhotosView } from './ProgressPhotosView';

interface ProfileViewProps {
  history: WorkoutSession[];
  allExercises: Exercise[];
  settings: UserSettings;
  onUpdateSettings: (s: UserSettings) => void;
  onOpenSettings: () => void;
  onSaveRetroactiveWorkout: (session: WorkoutSession) => void;
  onAddCustomExercise: (ex: Exercise) => void;
  onDeleteWorkout: (id: string) => void;
  user: User;
  onDeleteAccount: () => Promise<{ error: string | null }>;
}

const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const ProfileView: React.FC<ProfileViewProps> = ({
  history,
  allExercises,
  settings,
  onUpdateSettings,
  onOpenSettings,
  onSaveRetroactiveWorkout,
  onAddCustomExercise,
  onDeleteWorkout,
  user,
  onDeleteAccount,
}) => {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [showAddPast, setShowAddPast] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showBodyWeight, setShowBodyWeight] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  const displayName: string =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : 'משתמש');
  const avatarUrl: string | undefined =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined);
  const provider = user.app_metadata?.provider;
  const providerLabel = provider === 'google' ? 'Google' : provider === 'email' ? 'אימייל וסיסמה' : provider || '';
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const exerciseMap = useMemo(() => new Map(allExercises.map((e) => [e.id, e])), [allExercises]);

  const workoutsByDay = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    history
      .filter((h) => h.isCompleted)
      .forEach((h) => {
        const d = new Date(h.startTime);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(h);
      });
    return map;
  }, [history]);

  const totalWorkouts = history.filter((h) => h.isCompleted).length;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const today = new Date();

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const dateKeyFor = (day: number) => `${year}-${month}-${day}`;
  const toDateInputValue = (day: number) => {
    const d = new Date(year, month, day);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  const handleDayClick = (day: number) => {
    const key = dateKeyFor(day);
    if (workoutsByDay.has(key)) {
      setSelectedDayKey(key);
    } else {
      setPrefillDate(toDateInputValue(day));
      setShowAddPast(true);
    }
  };

  const scheduleSummary = settings.scheduledWeekdays.length
    ? settings.scheduledWeekdays.map((d) => DAY_LABELS[d]).join(', ')
    : 'לא נקבע';

  const selectedDayWorkouts = selectedDayKey ? workoutsByDay.get(selectedDayKey) || [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>פרופיל</h1>
        <button
          onClick={onOpenSettings}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          title="הגדרות"
        >
          <SettingsIcon size={22} />
        </button>
      </div>

      {/* Account */}
      <div className="ios-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'var(--bg-surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              fontWeight: 800,
              color: 'var(--color-blue)',
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          {user.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              <Mail size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">
                {user.email}
              </span>
            </div>
          )}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {providerLabel && `התחברות עם ${providerLabel}`}
            {memberSince && ` · חבר מאז ${memberSince}`}
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="ios-card" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{totalWorkouts}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>אימונים שהושלמו</div>
        </div>
      </div>

      {/* Calendar */}
      <div className="ios-card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronRight size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: '1rem' }}>{monthLabel}</span>
            <button
              onClick={() => setViewDate(new Date())}
              style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              היום
            </button>
          </div>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {WEEKDAY_LETTERS.map((l) => (
            <div key={l} style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {l}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, idx) => {
            if (day === null) return <div key={`blank-${idx}`} />;
            const key = dateKeyFor(day);
            const dayWorkouts = workoutsByDay.get(key);
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const weekday = new Date(year, month, day).getDay();
            const isScheduled = settings.scheduledWeekdays.includes(weekday);

            return (
              <div key={day} style={{ display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
                <button
                  onClick={() => handleDayClick(day)}
                  style={{
                    position: 'relative',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: isToday && !dayWorkouts ? '1.5px solid var(--color-blue)' : 'none',
                    background: dayWorkouts ? 'linear-gradient(135deg, #FF9500, #FF3B30)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {dayWorkouts && <Flame size={26} color="#fff" style={{ position: 'absolute', opacity: 0.3 }} />}
                  <span style={{ fontSize: '0.76rem', fontWeight: 800, color: dayWorkouts ? '#fff' : isToday ? 'var(--color-blue)' : 'var(--text-main)', zIndex: 1 }}>
                    {day}
                  </span>
                  {isScheduled && !dayWorkouts && (
                    <span style={{ position: 'absolute', bottom: -2, width: 4, height: 4, borderRadius: '50%', background: 'var(--color-blue)' }} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Rows */}
      <button
        className="ios-card"
        onClick={() => { setPrefillDate(undefined); setShowAddPast(true); }}
        style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarPlus size={20} color="var(--color-blue)" />
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>הוספת אימון בדיעבד</span>
        </div>
        <ChevronLeft size={18} color="var(--text-muted)" />
      </button>

      <button
        className="ios-card"
        onClick={() => setShowSchedule(true)}
        style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarClock size={20} color="var(--color-blue)" />
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', display: 'block' }}>ימי אימון שבועיים</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{scheduleSummary}</span>
          </div>
        </div>
        <ChevronLeft size={18} color="var(--text-muted)" />
      </button>

      <button
        className="ios-card"
        onClick={() => setShowBodyWeight(true)}
        style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Scale size={20} color="var(--color-purple)" />
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>משקל גוף</span>
        </div>
        <ChevronLeft size={18} color="var(--text-muted)" />
      </button>

      <button
        className="ios-card"
        onClick={() => setShowMeasurements(true)}
        style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ruler size={20} color="var(--color-orange)" />
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>מדידות גוף נוספות</span>
        </div>
        <ChevronLeft size={18} color="var(--text-muted)" />
      </button>

      <button
        className="ios-card"
        onClick={() => setShowPhotos(true)}
        style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'right', border: 'none', background: 'var(--bg-surface-1)', color: 'var(--text-main)', font: 'inherit', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Camera size={20} color="var(--color-green)" />
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>תמונות התקדמות</span>
        </div>
        <ChevronLeft size={18} color="var(--text-muted)" />
      </button>

      {/* Day Detail Sheet */}
      {selectedDayKey && (
        <div className="modal-overlay" onClick={() => setSelectedDayKey(null)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                {new Date(selectedDayWorkouts[0]?.startTime || Date.now()).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <button
                onClick={() => setSelectedDayKey(null)}
                style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedDayWorkouts.map((w) => (
                <div key={w.id} className="ios-card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{w.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {w.exercises.length} תרגילים • {w.completedSetsCount} סטים
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onDeleteWorkout(w.id);
                        const remaining = selectedDayWorkouts.filter((x) => x.id !== w.id);
                        if (remaining.length === 0) setSelectedDayKey(null);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {w.exercises.slice(0, 4).map((ex, i) => (
                      <span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {exerciseMap.get(ex.exerciseId)?.nameHe || 'תרגיל'}
                      </span>
                    ))}
                    {w.exercises.length > 4 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ועוד {w.exercises.length - 4}...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="ios-card" style={{ padding: 14, borderColor: 'rgba(255, 69, 58, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <ShieldAlert size={18} color="var(--color-red)" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>אזור מסוכן</h3>
        </div>
        <button
          className="btn-secondary"
          style={{ color: 'var(--color-red)', borderColor: 'rgba(255, 69, 58, 0.3)' }}
          onClick={() => setShowDeleteAccount(true)}
        >
          <Trash2 size={16} />
          מחיקת החשבון לצמיתות
        </button>
      </div>

      {showDeleteAccount && (
        <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} onConfirm={onDeleteAccount} />
      )}

      {showAddPast && (
        <AddPastWorkoutModal
          allExercises={allExercises}
          onAddCustomExercise={onAddCustomExercise}
          onClose={() => setShowAddPast(false)}
          onSave={onSaveRetroactiveWorkout}
          initialDate={prefillDate}
        />
      )}

      {showSchedule && (
        <WeeklyScheduleModal
          selectedDays={settings.scheduledWeekdays}
          onClose={() => setShowSchedule(false)}
          onSave={(days) => onUpdateSettings({ ...settings, scheduledWeekdays: days })}
        />
      )}

      {showBodyWeight && <BodyWeightView onBack={() => setShowBodyWeight(false)} />}
      {showMeasurements && <MeasurementsView onBack={() => setShowMeasurements(false)} />}
      {showPhotos && <ProgressPhotosView onBack={() => setShowPhotos(false)} />}
    </div>
  );
};

const DELETE_CONFIRM_WORD = 'מחק';

const DeleteAccountModal: React.FC<{
  onClose: () => void;
  onConfirm: () => Promise<{ error: string | null }>;
}> = ({ onClose, onConfirm }) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === DELETE_CONFIRM_WORD;

  const handleConfirm = async () => {
    if (!canDelete || loading) return;
    setLoading(true);
    setError(null);
    const result = await onConfirm();
    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
    // בהצלחה - האפליקציה עצמה תעבור למסך התחברות אוטומטית (המשתמש כבר לא מחובר)
  };

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <ShieldAlert size={22} color="var(--color-red)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>מחיקת חשבון לצמיתות</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          פעולה זו תמחק לצמיתות את החשבון שלך ואת <b style={{ color: 'var(--text-main)' }}>כל</b> הנתונים
          המשויכים אליו - היסטוריית אימונים, תוכניות, מדידות, תזונה והגדרות. אי אפשר לשחזר את זה.
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: 8 }}>
          כדי לאשר, הקלד <b>{DELETE_CONFIRM_WORD}</b> בשדה למטה:
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={DELETE_CONFIRM_WORD}
          style={{
            width: '100%',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            fontSize: '0.95rem',
            color: 'var(--text-main)',
            outline: 'none',
            marginBottom: 12,
            textAlign: 'center',
          }}
          disabled={loading}
        />
        {error && (
          <div style={{ color: 'var(--color-red)', fontSize: '0.82rem', marginBottom: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            ביטול
          </button>
          <button
            className="btn-primary"
            style={{
              flex: 1,
              background: canDelete ? 'var(--color-red)' : 'var(--bg-surface-3)',
              color: canDelete ? '#fff' : 'var(--text-muted)',
              cursor: canDelete ? 'pointer' : 'not-allowed',
            }}
            onClick={handleConfirm}
            disabled={!canDelete || loading}
          >
            {loading ? <Loader2 size={18} className="spin" /> : 'מחק את החשבון'}
          </button>
        </div>
      </div>
    </div>
  );
};
