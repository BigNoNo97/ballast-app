import React, { useEffect, useState } from 'react';
import {
  List,
  Settings,
  ChevronDown,
  Dumbbell,
  Clock,
  Flame,
  Play,
  Check,
  Layers,
  Sparkles,
} from 'lucide-react';
import { RoutineTemplate, RoutineDay } from '../types';

interface WorkoutHomeViewProps {
  routines: RoutineTemplate[];
  activeRoutine: RoutineTemplate;
  selectedDayNumber: number;
  onSelectRoutine: (routine: RoutineTemplate) => void;
  onSelectDay: (dayNumber: number) => void;
  onStartWorkoutClick: (routine: RoutineTemplate, day: RoutineDay) => void;
  onStartEmptyWorkout: () => void;
  onOpenRoutinesMenu: () => void;
  onOpenSettings: () => void;
  onModalOpenChange?: (open: boolean) => void;
}

export const WorkoutHomeView: React.FC<WorkoutHomeViewProps> = ({
  routines,
  activeRoutine,
  selectedDayNumber,
  onSelectRoutine,
  onSelectDay,
  onStartWorkoutClick,
  onStartEmptyWorkout,
  onOpenRoutinesMenu,
  onOpenSettings,
  onModalOpenChange,
}) => {
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);

  // מסתירים את סרגל התחתית כשגיליון נפתח, כדי שלא "יקפוץ" מעל התוכן שלו
  useEffect(() => {
    onModalOpenChange?.(showDayPicker || showRoutinePicker);
    return () => onModalOpenChange?.(false);
  }, [showDayPicker, showRoutinePicker, onModalOpenChange]);

  // Find active day data
  const currentDays = activeRoutine.days && activeRoutine.days.length > 0
    ? activeRoutine.days
    : [
        {
          dayNumber: 1,
          dayTitle: 'יום 1',
          targetMuscles: 'כל הגוף',
          estimatedCalories: 300,
          estimatedMinutes: 45,
          exercises: activeRoutine.exercises,
        },
      ];

  const currentDay = currentDays.find((d) => d.dayNumber === selectedDayNumber) || currentDays[0];

  // Calculate total sets in current day
  const totalSets = currentDay.exercises.reduce((acc, ex) => acc + (ex.targetSets || 3), 0);
  const totalExercises = currentDay.exercises.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {/* Top Header Bar (Matching Image 1: Workout on left, List icon on right) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 4px 4px 4px',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)' }}>
          אימון
        </h1>

        <button
          onClick={onOpenRoutinesMenu}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-main)',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="כל התוכניות"
        >
          <List size={26} />
        </button>
      </div>

      {/* Routine Title and Settings Gear */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          onClick={() => setShowRoutinePicker(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {activeRoutine.title}
          </h2>
          <ChevronDown size={18} color="var(--text-muted)" />
        </div>

        <button
          onClick={onOpenSettings}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
          }}
          title="הגדרות"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Day Selector Pill: אימון [שם האימון] ⌄ */}
      <div>
        <button
          onClick={() => setShowDayPicker(true)}
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: '0.95rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span>
            אימון{' '}
            {currentDay.dayTitle
              ? currentDay.dayTitle.replace(/^Day\s*\d+\s*[\(-:]?\s*/i, '').replace(/[\)]$/, '').trim() || currentDay.dayTitle
              : ''}
          </span>
          <ChevronDown size={16} color="var(--text-muted)" />
        </button>
      </div>

      {/* Hero Workout Card: gradient "photo" header + stats + CTA */}
      <div
        style={{
          borderRadius: 26,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: '20px 20px 22px 20px',
            background: 'radial-gradient(120% 160% at 15% 0%, #6E7CF5 0%, #4B5FE0 46%, #2E3AA8 100%)',
            overflow: 'hidden',
          }}
        >
          <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="none">
            <path d="M0 100 Q100 50 200 85 T400 65 V140 H0 Z" fill="rgba(255,255,255,0.08)" />
            <path d="M0 125 Q120 85 250 108 T400 92 V140 H0 Z" fill="rgba(255,255,255,0.06)" />
          </svg>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              {currentDay.targetMuscles ? `מיקוד: ${currentDay.targetMuscles}` : 'מיקוד: כל הגוף'}
            </span>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
              {currentDay.dayTitle || 'אימון היום'}
            </span>
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface-1)', padding: '18px 20px 20px 20px' }}>
          {/* 3 Stat Columns (Exercises, Sets, Calories) */}
          <div
            style={{
              display: 'flex',
              marginBottom: 18,
            }}
          >
            <div style={{ flex: 1, textAlign: 'center', borderInlineStart: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Dumbbell size={18} color="var(--text-muted)" />
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>{totalExercises}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>תרגילים</span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', borderInlineStart: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Clock size={18} color="var(--text-muted)" />
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>{totalSets}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>סטים</span>
            </div>
            <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Flame size={18} color="var(--text-muted)" />
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>{currentDay.estimatedCalories || 297}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>קלוריות</span>
            </div>
          </div>

          {/* Start Workout Button */}
          <button
            onClick={() => onStartWorkoutClick(activeRoutine, currentDay)}
            className="btn-primary"
            style={{ fontSize: '1.05rem', padding: '15px' }}
          >
            <Play size={17} fill="#fff" />
            התחל אימון
          </button>
        </div>
      </div>

      {/* Start with an empty workout Card */}
      <div
        onClick={onStartEmptyWorkout}
        className="ios-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          marginBottom: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid var(--color-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-blue)',
            flexShrink: 0,
          }}
        >
          <Play size={15} fill="var(--color-blue)" style={{ marginLeft: 2 }} />
        </div>

        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
          התחל אימון ללא תוכנית
        </span>
      </div>

      {/* Day Picker Action Sheet */}
      {showDayPicker && (
        <div className="modal-overlay" onClick={() => setShowDayPicker(false)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 14 }}>
              בחר יום אימון ({activeRoutine.title})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {currentDays.map((d) => {
                const isSelected = d.dayNumber === selectedDayNumber;
                return (
                  <div
                    key={d.dayNumber}
                    onClick={() => {
                      onSelectDay(d.dayNumber);
                      setShowDayPicker(false);
                    }}
                    style={{
                      background: isSelected ? 'var(--color-blue-bg)' : 'var(--bg-surface-2)',
                      border: isSelected ? '1px solid var(--color-blue)' : '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: isSelected ? 'var(--color-blue)' : 'var(--text-main)' }}>
                        {d.dayTitle}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        מיקוד: {d.targetMuscles} • {d.exercises.length} תרגילים
                      </div>
                    </div>

                    {isSelected && <Check size={20} color="var(--color-blue)" strokeWidth={3} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Routine Picker Modal */}
      {showRoutinePicker && (
        <div className="modal-overlay" onClick={() => setShowRoutinePicker(false)}>
          <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 14 }}>
              החלף תוכנית אימון
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {routines.map((r) => {
                const isSelected = r.id === activeRoutine.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      onSelectRoutine(r);
                      setShowRoutinePicker(false);
                    }}
                    style={{
                      background: isSelected ? 'var(--color-blue-bg)' : 'var(--bg-surface-2)',
                      border: isSelected ? '1px solid var(--color-blue)' : '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: isSelected ? 'var(--color-blue)' : 'var(--text-main)' }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {r.description}
                      </div>
                    </div>

                    {isSelected && <Check size={20} color="var(--color-blue)" strokeWidth={3} />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
