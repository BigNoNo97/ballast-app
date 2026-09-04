import React, { useState, useMemo } from 'react';
import { Trophy, TrendingUp, Calculator, Dumbbell, Award, Flame, BarChart3, Activity } from 'lucide-react';
import { WorkoutSession, Exercise, PersonalRecord } from '../types';
import { StorageService, calculateEstimated1RM } from '../services/storage';
import { MUSCLE_GROUP_LABELS } from '../data/exercises';
import { TrendChart } from './TrendChart';

interface AnalyticsViewProps {
  history: WorkoutSession[];
  allExercises: Exercise[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ history, allExercises }) => {
  // Default selected exercise to bench press or first exercise with history
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('bench-press-barbell');
  const [calcWeight, setCalcWeight] = useState<number>(80);
  const [calcReps, setCalcReps] = useState<number>(8);

  const personalRecords = useMemo(() => StorageService.getPersonalRecords(), [history]);

  // נפח אימון שבועי (סך ק"ג × חזרות שהורם) לאורך זמן
  const weeklyVolume = useMemo(() => {
    const completed = history.filter((h) => h.isCompleted && h.totalVolumeKg > 0);
    const byWeek = new Map<number, number>();
    completed.forEach((h) => {
      const d = new Date(h.startTime);
      const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
      const key = weekStart.getTime();
      byWeek.set(key, (byWeek.get(key) || 0) + h.totalVolumeKg);
    });
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([date, value]) => ({ id: String(date), date, value: Math.round(value) }));
  }, [history]);

  // תדירות אימון לפי קבוצת שריר ב-30 הימים האחרונים
  const muscleFrequency = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const exerciseMuscleMap = new Map(allExercises.map((e) => [e.id, e.muscle]));
    const counts: Record<string, number> = {};
    history
      .filter((h) => h.isCompleted && h.startTime >= cutoff)
      .forEach((h) => {
        const musclesThisSession = new Set<string>();
        h.exercises.forEach((ex) => {
          const hasLoggedSet = ex.sets.some((s) => s.completed || s.weightKg > 0);
          if (!hasLoggedSet) return;
          const muscle = exerciseMuscleMap.get(ex.exerciseId);
          if (muscle) musclesThisSession.add(muscle);
        });
        musclesThisSession.forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
      });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [history, allExercises]);
  const maxMuscleCount = Math.max(1, ...muscleFrequency.map(([, c]) => c));

  // Extract timeline data for the selected exercise
  const exerciseProgressData = useMemo(() => {
    const points: {
      date: number;
      dateStr: string;
      weight: number;
      reps: number;
      e1rm: number;
      workoutTitle: string;
    }[] = [];

    // Chronological order (oldest to newest for chart)
    const reversedHistory = [...history].sort((a, b) => a.startTime - b.startTime);

    reversedHistory.forEach((w) => {
      const found = w.exercises.find((e) => e.exerciseId === selectedExerciseId);
      if (found) {
        let maxW = 0;
        let maxR = 0;
        found.sets.forEach((s) => {
          if (s.completed && s.weightKg > maxW) {
            maxW = s.weightKg;
            maxR = s.reps;
          }
        });

        if (maxW > 0) {
          const d = new Date(w.startTime);
          points.push({
            date: w.startTime,
            dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
            weight: maxW,
            reps: maxR,
            e1rm: calculateEstimated1RM(maxW, maxR),
            workoutTitle: w.title,
          });
        }
      }
    });

    return points;
  }, [history, selectedExerciseId]);

  const selectedExercise = allExercises.find((e) => e.id === selectedExerciseId);
  const selectedPR = personalRecords[selectedExerciseId];

  // 1RM Calculation
  const estimated1RM = calculateEstimated1RM(calcWeight, calcReps);
  const percentages = [
    { pct: 95, reps: 2 },
    { pct: 90, reps: 4 },
    { pct: 85, reps: 6 },
    { pct: 80, reps: 8 },
    { pct: 75, reps: 10 },
    { pct: 70, reps: 12 },
  ];

  // Maximum weight for SVG chart scaling
  const maxChartWeight = Math.max(...exerciseProgressData.map((p) => p.e1rm), 100);
  const minChartWeight = Math.max(0, Math.min(...exerciseProgressData.map((p) => p.weight)) - 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>התקדמות ושיאים אישיים</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          מעקב גרפי אחר עליית המשקלים, כוח מקסימלי (1RM) ולוח שיאים
        </p>
      </div>

      {/* Exercise Progress Section */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={18} color="var(--color-blue)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>גרף התקדמות בתרגיל</h3>
          </div>
        </div>

        {/* Exercise Picker */}
        <select
          value={selectedExerciseId}
          onChange={(e) => setSelectedExerciseId(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            fontWeight: 700,
            marginBottom: 14,
            outline: 'none',
          }}
        >
          {allExercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.nameHe}
            </option>
          ))}
        </select>

        {/* Stats Row for Selected Exercise */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '10px 8px',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>שיא משקל</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-blue)', marginTop: 2 }}>
              {selectedPR ? `${selectedPR.maxWeight} ק״ג` : '-'}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '10px 8px',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>1RM משוער</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-green)', marginTop: 2 }}>
              {selectedPR ? `${selectedPR.estimated1RM} ק״ג` : '-'}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '10px 8px',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>אימונים שתועדו</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-purple)', marginTop: 2 }}>
              {exerciseProgressData.length}
            </div>
          </div>
        </div>

        {/* Visual Line / Bar Progress Chart */}
        {exerciseProgressData.length > 0 ? (
          <div>
            <div
              style={{
                height: 160,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 4px 0 4px',
                borderBottom: '2px solid var(--border-strong)',
                marginBottom: 8,
              }}
            >
              {exerciseProgressData.map((pt, idx) => {
                const heightPct = Math.max(
                  20,
                  ((pt.weight - minChartWeight) / (maxChartWeight - minChartWeight || 1)) * 100
                );

                return (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-blue)', marginBottom: 4 }}>
                      {pt.weight}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 32,
                        height: `${heightPct}%`,
                        background: 'linear-gradient(180deg, var(--color-blue), rgba(110, 124, 245, 0.4))',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 400ms ease-out',
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Dates row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
              {exerciseProgressData.map((pt, idx) => (
                <span key={idx} style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center', flex: 1 }}>
                  {pt.dateStr}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            טרם תועדו סטים עבור תרגיל זה. בצע אותו באימון הבא ותראה כאן את גרף העלייה במשקלים!
          </div>
        )}
      </div>

      {/* Weekly Training Volume */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <BarChart3 size={18} color="var(--color-purple)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>נפח אימון שבועי</h3>
        </div>
        {weeklyVolume.length > 0 ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>
                {weeklyVolume[weeklyVolume.length - 1].value.toLocaleString()} ק״ג
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>נפח השבוע האחרון (משקל × חזרות בכל הסטים)</div>
            </div>
            <TrendChart points={weeklyVolume} color="var(--color-purple)" />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            אחרי כמה אימונים תראה כאן את מגמת הנפח הכולל שלך לאורך זמן.
          </div>
        )}
      </div>

      {/* Muscle Group Frequency */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Activity size={18} color="var(--color-green)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>תדירות אימון לפי שריר</h3>
        </div>
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          כמה פעמים אימנת כל קבוצת שריר ב-30 הימים האחרונים
        </p>
        {muscleFrequency.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {muscleFrequency.map(([muscle, count]) => (
              <div key={muscle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', width: 88, flexShrink: 0 }}>
                  {MUSCLE_GROUP_LABELS[muscle as keyof typeof MUSCLE_GROUP_LABELS]?.he || muscle}
                </span>
                <div style={{ flex: 1, background: 'var(--bg-surface-2)', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(count / maxMuscleCount) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--color-green), rgba(47, 217, 180, 0.6))',
                      borderRadius: 6,
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, width: 20, textAlign: 'left' }}>{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            אין עדיין אימונים ב-30 הימים האחרונים.
          </div>
        )}
      </div>

      {/* 1RM Strength Calculator */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Calculator size={18} color="var(--color-orange)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>מחשבון כוח (1RM)</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              משקל (ק״ג):
            </label>
            <input
              type="number"
              className="gym-input-box"
              value={calcWeight}
              onChange={(e) => setCalcWeight(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
              חזרות שבוצעו:
            </label>
            <input
              type="number"
              className="gym-input-box"
              value={calcReps}
              onChange={(e) => setCalcReps(parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </div>

        {/* 1RM Result Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 159, 10, 0.15), rgba(255, 214, 10, 0.1))',
            border: '1px solid rgba(255, 159, 10, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            textAlign: 'center',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--color-orange)', fontWeight: 700 }}>
            משקל מקסימלי משוער לחזרה אחת (1RM):
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', marginTop: 2 }}>
            {estimated1RM} <span style={{ fontSize: '1rem' }}>ק״ג</span>
          </div>
        </div>

        {/* Percentage Table */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {percentages.map((p) => {
            const targetWeight = Math.round(estimated1RM * (p.pct / 100));
            return (
              <div
                key={p.pct}
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: '8px 4px',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {p.pct}% (~{p.reps} חז׳)
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: 2 }}>
                  {targetWeight} ק״ג
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Personal Records Trophy Board */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Trophy size={18} color="var(--color-yellow)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>לוח שיאים אישיים (PR) 🏆</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.values(personalRecords).length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              טרם נרשמו שיאים. השלם אימון ראשון והשיאים יופיעו כאן!
            </p>
          ) : (
            Object.values(personalRecords).map((pr, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-surface-2)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700 }}>{pr.exerciseNameHe}</h4>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                    {pr.repsAtMaxWeight} חזרות
                  </span>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--color-yellow)' }}>
                    {pr.maxWeight} ק״ג
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    1RM: {pr.estimated1RM} ק״ג
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
