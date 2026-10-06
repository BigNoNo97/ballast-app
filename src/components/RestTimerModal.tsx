import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Minus, Bell, BellOff, TimerOff } from 'lucide-react';
import { playTimerWarningBeep, playTimerFinishBeep, triggerHaptic } from '../services/sound';
import { scheduleRestEndNotification, cancelRestEndNotification } from '../services/restNotification';

interface RestTimerModalProps {
  initialSeconds: number;
  isOpen: boolean;
  onClose: () => void;
  onDisableAutoTimer?: () => void;
  soundEnabled?: boolean;
}

export const RestTimerModal: React.FC<RestTimerModalProps> = ({
  initialSeconds,
  isOpen,
  onClose,
  onDisableAutoTimer,
  soundEnabled = true,
}) => {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [totalTime, setTotalTime] = useState(initialSeconds);
  const [isMuted, setIsMuted] = useState(!soundEnabled);
  // מתי המנוחה נגמרת לפי השעון האמיתי. לא סופרים "טיקים": כשהמסך נעול ה-JS מושהה, וספירה לפי
  // טיקים הייתה קופאת ומראה בחזרה זמן שגוי. כך הזמן תמיד נכון, גם אחרי נעילה.
  const endsAtRef = useRef(Date.now() + initialSeconds * 1000);
  const lastAlertedRef = useRef<number | null>(null);
  const notificationCancelledRef = useRef(false);

  const remainingSeconds = () => Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));

  const restartNotification = () => {
    notificationCancelledRef.current = false;
    scheduleRestEndNotification(new Date(endsAtRef.current));
  };

  useEffect(() => {
    if (!isOpen) {
      cancelRestEndNotification();
      return;
    }
    endsAtRef.current = Date.now() + initialSeconds * 1000;
    lastAlertedRef.current = null;
    setTimeLeft(initialSeconds);
    setTotalTime(initialSeconds);
    restartNotification();
    return () => cancelRestEndNotification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSeconds]);

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      // האפליקציה פתוחה ממש לפני הסוף - מצפצפים כאן, אז מבטלים את ההתראה כדי שלא תופיע גם היא
      if (!notificationCancelledRef.current && endsAtRef.current - Date.now() < 1500 && document.visibilityState === 'visible') {
        notificationCancelledRef.current = true;
        cancelRestEndNotification();
      }
      setTimeLeft(remainingSeconds());
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || lastAlertedRef.current === timeLeft) return;
    lastAlertedRef.current = timeLeft;
    // חזרה לאפליקציה הרבה אחרי שהמנוחה נגמרה (ההתראה כבר הוצגה) - בלי צפצוף מאוחר
    const endedLongAgo = Date.now() - endsAtRef.current > 2000;
    if (timeLeft <= 0) {
      if (!endedLongAgo) {
        if (!isMuted) playTimerFinishBeep();
        triggerHaptic([100, 100, 200]);
      }
      return;
    }
    // Beep on 3, 2, 1
    if (timeLeft <= 3 && !isMuted) {
      playTimerWarningBeep();
      triggerHaptic(40);
    }
  }, [isOpen, timeLeft, isMuted]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const progressPercent = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 100;

  const addTime = (secs: number) => {
    const now = Date.now();
    endsAtRef.current = Math.max(now, endsAtRef.current) + secs * 1000;
    if (endsAtRef.current < now) endsAtRef.current = now;
    const next = remainingSeconds();
    lastAlertedRef.current = null;
    setTimeLeft(next);
    setTotalTime((prev) => Math.max(prev, next));
    if (next > 0) restartNotification();
    else cancelRestEndNotification();
  };

  const handleDisableAuto = () => {
    if (onDisableAutoTimer) {
      onDisableAutoTimer();
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button
            className="btn-secondary"
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.76rem' }}
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
            <span>{isMuted ? 'מושתק' : 'צליל פעיל'}</span>
          </button>

          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>טיימר מנוחה</h3>

          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface-2)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Circular / Progress Indicator */}
        <div className="timer-radial-container">
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: '50%',
              background: `conic-gradient(var(--color-blue) ${progressPercent}%, var(--bg-surface-2) 0%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 10,
              boxShadow: '0 8px 32px rgba(110, 124, 245, 0.25)',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'var(--bg-surface-1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="timer-digits" style={{ color: timeLeft === 0 ? 'var(--color-blue)' : 'var(--text-main)' }}>
                {formattedTime}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {timeLeft === 0 ? 'המנוחה הסתיימה! 💪' : 'מנוחה בין סטים'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Time Adjustment Buttons */}
        <div className="step-button-group">
          <button className="step-btn" onClick={() => addTime(-15)}>
            <Minus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
            15- שנ׳
          </button>
          <button className="step-btn" onClick={() => addTime(30)}>
            <Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
            30+ שנ׳
          </button>
          <button className="step-btn" onClick={() => addTime(60)}>
            <Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 2 }} />
            60+ שנ׳
          </button>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn-success"
            onClick={onClose}
            style={{ width: '100%' }}
          >
            {timeLeft === 0 ? 'המשך לסט הבא 🚀' : 'דלג על המנוחה'}
          </button>

          {/* Option to completely disable auto-timer */}
          <button
            onClick={handleDisableAuto}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '6px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            <TimerOff size={14} />
            בטל טיימר אוטומטי בין סטים (להחזרה בהגדרות)
          </button>
        </div>
      </div>
    </div>
  );
};
