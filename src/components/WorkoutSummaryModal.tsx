import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Clock, Dumbbell, Flame, CheckCircle, Share2 } from 'lucide-react';
import { WorkoutSession } from '../types';
import { playWorkoutCompleteSound } from '../services/sound';

interface WorkoutSummaryModalProps {
  session: WorkoutSession;
  isOpen: boolean;
  onClose: () => void;
  soundEnabled?: boolean;
  coachNote?: string; // הודעה קצרה ממנוע ההתקדמות (למשל גלגול מחזור, או תרגיל שנתקע) - לא חוסמת
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  session,
  isOpen,
  onClose,
  soundEnabled = true,
  coachNote,
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
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: coachNote ? 12 : 20 }}>
          {session.title} נשמר בהצלחה ביומן האימונים
        </p>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-yellow)', marginBottom: 6 }}>
              <Trophy size={16} />
              <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>שיאים אישיים חדשים (PR)! 🏆</span>
            </div>
            {session.newPRs.map((pr, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-main)',
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  • <strong>{pr.exerciseNameHe}</strong>:
                </div>
                <div style={{ color: 'var(--color-yellow)', fontWeight: 700 }}>
                  {pr.totalExerciseWeight ? `${pr.totalExerciseWeight} ק״ג סה״כ` : `${pr.maxWeight} ק״ג`} (
                  {pr.totalExerciseReps ? `${pr.totalExerciseReps} חזרות סה״כ` : `${pr.repsAtMaxWeight} חזרות`})
                </div>
              </div>
            ))}
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
