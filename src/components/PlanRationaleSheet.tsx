import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { RoutineTemplate } from '../types';
import { TRAINING_EVIDENCE, TRAINING_EVIDENCE_REVIEWED_AT } from '../services/training/evidence';

/** "למה התוכנית ככה": כל ההחלטות שמוח האימונים קיבל לפי מה שהזנת, עם המקורות */
export const PlanRationaleSheet: React.FC<{ routine: RoutineTemplate; onClose: () => void }> = ({ routine, onClose }) => {
  const decisions = routine.planRationale || [];
  const usedSources = [...new Set(decisions.flatMap((d) => d.evidence))].map((id) => TRAINING_EVIDENCE[id]).filter(Boolean);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 85)', overflowY: 'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>למה התוכנית ככה</h3>
          <button
            onClick={onClose}
            style={{ background: 'var(--bg-surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          כל מה שהזנת השפיע על התוכנית. כך זה נבנה:
        </p>
        {decisions.length === 0 ? (
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>התוכנית נבנתה בגרסה קודמת. היא תקבל הסבר מלא בתחילת המחזור הבא.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {decisions.map((d) => (
              <li key={d.id} style={{ background: d.id.startsWith('injury') || d.id === 'pain-rule' ? 'var(--color-orange-bg)' : 'var(--bg-surface-2)', borderRadius: 10, padding: '9px 11px', fontSize: '0.8rem', lineHeight: 1.55 }}>
                {d.text}
              </li>
            ))}
          </ul>
        )}
        {usedSources.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, marginBottom: 4 }}>המקורות ({usedSources.length})</h4>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              סקירות שיטתיות, מטא-אנליזות ועמדות רשמיות. נבדק לאחרונה: {new Date(TRAINING_EVIDENCE_REVIEWED_AT).toLocaleDateString('he-IL')}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {usedSources.map((src) => (
                <div key={src.id} style={{ background: 'var(--bg-surface-2)', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: '0.76rem', lineHeight: 1.5, marginBottom: 4 }}>{src.finding}</div>
                  <a href={src.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.66rem', color: 'var(--color-blue)', display: 'inline-flex', gap: 4, alignItems: 'center', direction: 'ltr' }}>
                    <ExternalLink size={11} /> {src.citation}
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
        <button className="btn-secondary" style={{ width: '100%' }} onClick={onClose}>סגירה</button>
      </div>
    </div>
  );
};
