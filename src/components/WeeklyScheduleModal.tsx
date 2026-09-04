import React, { useState } from 'react';
import { X } from 'lucide-react';

interface WeeklyScheduleModalProps {
  selectedDays: number[]; // 0 = ראשון ... 6 = שבת
  onClose: () => void;
  onSave: (days: number[]) => void;
}

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const WeeklyScheduleModal: React.FC<WeeklyScheduleModalProps> = ({
  selectedDays,
  onClose,
  onSave,
}) => {
  const [days, setDays] = useState<number[]>(selectedDays);

  const toggleDay = (idx: number) => {
    setDays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>ימי אימון שבועיים</h3>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          בחר את הימים שבהם אתה בדרך כלל מתאמן. זה לא קובע איזה אימון תעשה - רק תזכורת אישית.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {DAY_LABELS.map((label, idx) => {
            const active = days.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${active ? 'var(--color-blue)' : 'var(--border-subtle)'}`,
                  background: active ? 'rgba(110, 124, 245, 0.12)' : 'var(--bg-surface-2)',
                  color: active ? 'var(--color-blue)' : 'var(--text-main)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                {label}
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: `1.5px solid ${active ? 'var(--color-blue)' : 'var(--border-subtle)'}`,
                    background: active ? 'var(--color-blue)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    color: '#fff',
                  }}
                >
                  {active ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>

        <button className="btn-primary" style={{ width: '100%' }} onClick={() => { onSave(days); onClose(); }}>
          שמירה
        </button>
      </div>
    </div>
  );
};
