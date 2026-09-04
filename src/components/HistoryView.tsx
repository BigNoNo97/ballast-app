import React, { useState } from 'react';
import { Calendar, Clock, Dumbbell, Trophy, Trash2, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import { WorkoutSession, Exercise } from '../types';

interface HistoryViewProps {
  history: WorkoutSession[];
  allExercises: Exercise[];
  onRepeatWorkout: (workout: WorkoutSession) => void;
  onDeleteWorkout: (workoutId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  allExercises,
  onRepeatWorkout,
  onDeleteWorkout,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(history[0]?.id || null);

  const exerciseMap = new Map<string, Exercise>();
  allExercises.forEach((e) => exerciseMap.set(e.id, e));

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('he-IL', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>יומן היסטוריית אימונים</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          מעקב מדויק אחר כל האימונים, הסטים והמשקלים שהרמת בעבר
        </p>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <Calendar size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
          <p>עדיין אין אימונים שמורים בהיסטוריה.</p>
          <p style={{ fontSize: '0.78rem', marginTop: 4 }}>
            התחל אימון ראשון דרך טאב "אימון" ותראה אותו כאן מיד!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((workout) => {
            const isExpanded = expandedId === workout.id;
            const durationMin = Math.round((workout.durationSec || 0) / 60);

            return (
              <div key={workout.id} className="ios-card" style={{ padding: '16px' }}>
                {/* Workout Card Top */}
                <div
                  onClick={() => toggleExpand(workout.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.76rem', color: 'var(--color-blue)', fontWeight: 700 }}>
                      {formatDate(workout.startTime)}
                    </span>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: 2 }}>
                      {workout.title}
                    </h3>
                  </div>

                  <button
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Stat Badges Row */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 10,
                    marginBottom: isExpanded ? 14 : 0,
                  }}
                >
                  <span className="pill-badge pill-gray">
                    <Clock size={11} />
                    {durationMin} דקות
                  </span>
                  <span className="pill-badge pill-orange">
                    <Dumbbell size={11} />
                    {workout.totalVolumeKg.toLocaleString()} ק״ג
                  </span>
                  <span className="pill-badge pill-green">
                    {workout.completedSetsCount} סטים
                  </span>
                  {workout.newPRs && workout.newPRs.length > 0 && (
                    <span className="pill-badge pill-purple">
                      <Trophy size={11} />
                      {workout.newPRs.length} שיאים!
                    </span>
                  )}
                </div>

                {/* Expanded Detailed Breakdown */}
                {isExpanded && (
                  <div
                    style={{
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {workout.notes && (
                      <div
                        style={{
                          background: 'var(--bg-surface-2)',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        💬 הערה: {workout.notes}
                      </div>
                    )}

                    {workout.exercises.map((exItem, eIdx) => {
                      const ex = exerciseMap.get(exItem.exerciseId);
                      return (
                        <div
                          key={eIdx}
                          style={{
                            background: 'var(--bg-surface-2)',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 12px',
                          }}
                        >
                          <h4 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 6 }}>
                            {ex?.nameHe || 'תרגיל'}
                          </h4>

                          {/* Sets detail */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {exItem.sets.map((s, sIdx) => (
                              <span
                                key={sIdx}
                                style={{
                                  background: 'var(--bg-surface-3)',
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-xs)',
                                  fontSize: '0.76rem',
                                  fontWeight: 600,
                                  color: 'var(--text-main)',
                                }}
                              >
                                סט {s.setNumber}: {s.weightKg} ק״ג × {s.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Actions: Repeat Workout or Delete */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        className="btn-primary"
                        style={{ flex: 1, padding: '9px', fontSize: '0.82rem' }}
                        onClick={() => onRepeatWorkout(workout)}
                      >
                        <Repeat size={14} />
                        חזור על אימון זה
                      </button>

                      <button
                        className="btn-secondary"
                        style={{ color: 'var(--color-red)', padding: '9px 12px' }}
                        onClick={() => onDeleteWorkout(workout.id)}
                        title="מחק מההיסטוריה"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
