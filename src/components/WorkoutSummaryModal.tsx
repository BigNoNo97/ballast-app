import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Clock, Dumbbell, Flame, CheckCircle, Share2 } from 'lucide-react';
import { WorkoutSession } from '../types';
import { playWorkoutCompleteSound } from '../services/sound';
import { MuscleLoadRow } from '../services/muscleLoad';
import { LoadBar, LoadLegend, MuscleLoadMap, formatSets } from './MuscleLoadCard';

const prHeaderCell: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  paddingBottom: 6,
  borderBottom: '1px solid rgba(255, 214, 10, 0.25)',
};
const prBodyCell: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid rgba(255, 214, 10, 0.12)',
  lineHeight: 1.35,
};
const prNumberCell: React.CSSProperties = {
  color: 'var(--color-yellow)',
  fontWeight: 800,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

interface WorkoutSummaryModalProps {
  session: WorkoutSession;
  isOpen: boolean;
  onClose: () => void;
  soundEnabled?: boolean;
  coachNote?: string; // הודעה קצרה ממנוע ההתקדמות (למשל גלגול מחזור, או תרגיל שנתקע) - לא חוסמת
  healthSync?: { ok: boolean; message: string };
  /** עומס השרירים: הסטים שהאימון הזה הוסיף לכל שריר, והמצב השבועי אחריו */
  muscleLoad?: { workout: MuscleLoadRow[]; week: MuscleLoadRow[] };
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  session,
  isOpen,
  onClose,
  soundEnabled = true,
  coachNote,
  healthSync,
  muscleLoad,
}) => {
  useEffect(() => {
    if (isOpen) {
      if (soundEnabled) playWorkoutCompleteSound();

      // Launch Confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['var(--color-blue)', 'var(--color-green)', '#FF9F0A', '#BF5AF2', '#FFD60A'],
        });
      } catch (e) {
        console.debug('Confetti error:', e);
      }
    }
  }, [isOpen, soundEnabled]);

  if (!isOpen) return null;

  const durationMin = Math.round(session.durationSec / 60);

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: `סיימתי אימון: ${session.title}!`,
          text: `סיימתי אימון כושר באפליקציית Ballast!\n⏱️ משך: ${durationMin} דקות\n🏋️ משקל כולל: ${session.totalVolumeKg.toLocaleString()} ק״ג\n🔥 סטים: ${session.completedSetsCount}`,
        })
        .catch(() => {});
    }
  };

  return (
    <div className="modal-overlay">
      <div
        className="action-sheet"
        style={{
          textAlign: 'center',
          maxHeight: 'calc(var(--app-vh, 1vh) * 90)',
          overflowY: 'auto',
          animation: 'slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="sheet-handle" />

        {/* Celebration Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(47, 217, 180, 0.2), rgba(110, 124, 245, 0.2))',
            border: '2px solid var(--color-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            color: 'var(--color-green)',
          }}
        >
          <Trophy size={36} />
        </div>

        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 4 }}>
          אימון מעולה! כל הכבוד 💪
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: coachNote || healthSync ? 12 : 20 }}>
          {session.title} נשמר בהצלחה ביומן האימונים
        </p>

        {healthSync &&
          (healthSync.ok ? (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-green)', marginBottom: 12 }}>
              ✓ {healthSync.message}
            </div>
          ) : (
            <div
              style={{
                background: 'var(--color-orange-bg)',
                border: '1px solid var(--color-orange)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                marginBottom: 12,
                fontSize: '0.82rem',
                color: 'var(--text-main)',
                textAlign: 'start',
                lineHeight: 1.5,
              }}
            >
              ⚠️ {healthSync.message}
            </div>
          ))}

        {coachNote && (
          <div
            style={{
              background: 'var(--color-blue-bg)',
              border: '1px solid var(--color-blue)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: '0.82rem',
              color: 'var(--text-main)',
              textAlign: 'start',
              lineHeight: 1.5,
            }}
          >
            {coachNote}
          </div>
        )}

        {/* Highlight Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '14px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-blue)', marginBottom: 4 }}>
              <Clock size={16} />
              <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>זמן אימון</span>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{durationMin} דקות</div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '14px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-orange)', marginBottom: 4 }}>
              <Dumbbell size={16} />
              <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>נפח משקל כולל</span>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>
              {session.totalVolumeKg.toLocaleString()} <span style={{ fontSize: '0.8rem' }}>ק״ג</span>
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '14px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-green)', marginBottom: 4 }}>
              <CheckCircle size={16} />
              <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>סטים שהושלמו</span>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{session.completedSetsCount} סטים</div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '14px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-purple)', marginBottom: 4 }}>
              <Flame size={16} />
              <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>תרגילים שבוצעו</span>
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{session.exercises.length} תרגילים</div>
          </div>
        </div>

        {/* עומס שרירים: מה האימון הזה הוסיף, ואיפה כל שריר עומד מול היעד השבועי */}
        {muscleLoad && muscleLoad.workout.some((r) => r.sets > 0) && (
          <div
            style={{
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: 20,
              textAlign: 'right',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 2 }}>עומס שרירים</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              הצבע מראה איפה כל שריר עומד מול היעד השבועי שלך, כולל האימון הזה
            </div>
            <MuscleLoadMap rows={muscleLoad.week} size={104} />
            <div style={{ margin: '8px 0 12px' }}>
              <LoadLegend />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {muscleLoad.workout
                .filter((r) => r.sets > 0)
                .sort((a, b) => b.sets - a.sets)
                .map((r) => {
                  const week = muscleLoad.week.find((w) => w.muscle === r.muscle)!;
                  return (
                    <div key={r.muscle}>
                      <LoadBar row={week} />
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: -2, marginBottom: 2, paddingRight: 104 }}>
                        +{formatSets(r.sets)} סטים באימון הזה
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* PRs Section if any */}
        {session.newPRs && session.newPRs.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(255, 214, 10, 0.12), rgba(255, 159, 10, 0.08))',
              border: '1px solid rgba(255, 214, 10, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: 20,
              textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-yellow)', marginBottom: 10 }}>
              <Trophy size={16} />
              <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>שיאים אישיים חדשים (PR)! 🏆</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                columnGap: 14,
                alignItems: 'center',
                fontSize: '0.84rem',
              }}
            >
              {/* השיא = הסט הכבד ביותר באימון ומספר החזרות בו (לא סכום משקלי כל הסטים) */}
              <div style={prHeaderCell}>תרגיל</div>
              <div style={{ ...prHeaderCell, textAlign: 'center' }}>משקל</div>
              <div style={{ ...prHeaderCell, textAlign: 'center' }}>חזרות</div>
              {session.newPRs.map((pr, idx) => (
                <React.Fragment key={idx}>
                  <div style={{ ...prBodyCell, fontWeight: 700, color: 'var(--text-main)' }}>{pr.exerciseNameHe}</div>
                  <div style={{ ...prBodyCell, ...prNumberCell }}>{pr.maxWeight} ק״ג</div>
                  <div style={{ ...prBodyCell, ...prNumberCell }}>{pr.repsAtMaxWeight}</div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button className="btn-secondary" onClick={handleShare} style={{ width: '100%' }}>
              <Share2 size={16} />
              שתף תוצאות אימון
            </button>
          )}

          <button className="btn-success" onClick={onClose}>
            סגור וחזור לדף הבית
          </button>
        </div>
      </div>
    </div>
  );
};
