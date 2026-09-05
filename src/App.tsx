import React, { useState, useEffect, useRef } from 'react';
import {
  Dumbbell,
  TrendingUp,
  Users,
  User,
  Play,
  Calendar,
  Layers,
  Settings as SettingsIcon,
  ChevronLeft,
  Utensils,
} from 'lucide-react';
import {
  WorkoutSession,
  RoutineTemplate,
  RoutineDay,
  RoutineDayExercise,
  Exercise,
  UserSettings,
  WorkoutExercise,
  WorkoutSet,
} from './types';
import { StorageService } from './services/storage';
import { WorkoutHomeView } from './components/WorkoutHomeView';
import { WorkoutDetailPreview } from './components/WorkoutDetailPreview';
import { ActiveWorkout } from './components/ActiveWorkout';
import { RoutinesView } from './components/RoutinesView';
import { HistoryView } from './components/HistoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { ExerciseLibraryView } from './components/ExerciseLibraryView';
import { SettingsView } from './components/SettingsView';
import { ProfileView } from './components/ProfileView';
import { NutritionView } from './components/NutritionView';
import { WorkoutSummaryModal } from './components/WorkoutSummaryModal';
import { ExerciseProfileView } from './components/ExerciseProfileView';
import { IPhonePreviewFrame } from './components/IPhonePreviewFrame';
import { AuthView } from './components/AuthView';
import { OnboardingFlow } from './components/OnboardingFlow';
import { supabase } from './services/supabaseClient';
import type { Session } from '@supabase/supabase-js';

type NavigationTab = 'workout' | 'analysis' | 'community' | 'nutrition' | 'profile';

export const App: React.FC = () => {
  // Initialize storage
  useEffect(() => {
    StorageService.init();
  }, []);

  // Auth: session === undefined means "still checking", null means "logged out"
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [dataReady, setDataReady] = useState(false);
  const lastHydratedUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // מוריד/מעלה את הנתונים מהענן בכל כניסה/יציאה אמיתית של משתמש (לא ברענון טוקן רגיל)
  useEffect(() => {
    if (session === undefined) return;
    const userId = session ? session.user.id : null;
    if (lastHydratedUserId.current === userId) return;
    lastHydratedUserId.current = userId;

    if (userId === null) {
      StorageService.clearLocalDataOnLogout();
      setDataReady(false);
      return;
    }

    setDataReady(false);
    StorageService.hydrateFromCloud(userId).then(() => {
      let loadedSettings = StorageService.getSettings();
      // חשבון בלי דגל אונבורדינג בכלל: אם הוא נוצר עכשיו ממש (הרשמה טרייה) - נציג את
      // תהליך ההיכרות; אם הוא ישן (חשבון מלפני התכונה הזו) - נסמן כבוצע בלי להציג כלום.
      if (loadedSettings.onboardingCompleted === undefined && session) {
        const createdAtMs = new Date(session.user.created_at).getTime();
        const isFreshSignup = Date.now() - createdAtMs < 10 * 60 * 1000;
        loadedSettings = { ...loadedSettings, onboardingCompleted: !isFreshSignup };
        StorageService.saveSettings(loadedSettings);
      }
      setSettings(loadedSettings);
      setExercises(StorageService.getExercises());
      const freshRoutines = StorageService.getRoutines();
      setRoutines(freshRoutines);
      setHistory(StorageService.getWorkoutHistory());
      setActiveWorkout(StorageService.getActiveWorkout());
      const firstRoutine = freshRoutines[0];
      if (firstRoutine) {
        setActiveRoutine(firstRoutine);
        setSelectedDayNumber(StorageService.getSelectedDayNumber(firstRoutine.id));
      }
      setDataReady(true);
    });
  }, [session]);

  const [settings, setSettings] = useState<UserSettings>(() => StorageService.getSettings());
  const [exercises, setExercises] = useState<Exercise[]>(() => StorageService.getExercises());
  const [routines, setRoutines] = useState<RoutineTemplate[]>(() => StorageService.getRoutines());
  const [history, setHistory] = useState<WorkoutSession[]>(() => StorageService.getWorkoutHistory());
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession | null>(() =>
    StorageService.getActiveWorkout()
  );

  // Selected routine and day (persisted per routine)
  const [activeRoutine, setActiveRoutine] = useState<RoutineTemplate>(() => routines[0] || StorageService.getRoutines()[0]);
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(() => {
    const defaultRot = routines[0] || StorageService.getRoutines()[0];
    return defaultRot ? StorageService.getSelectedDayNumber(defaultRot.id) : 1;
  });

  // Navigation state
  const [currentTab, setCurrentTab] = useState<NavigationTab>('workout');
  const [previewingDay, setPreviewingDay] = useState<RoutineDay | null>(null);
  const [summarySession, setSummarySession] = useState<WorkoutSession | null>(null);
  const [showAddExerciseToActiveModal, setShowAddExerciseToActiveModal] = useState(false);
  const [showRoutinesManagerModal, setShowRoutinesManagerModal] = useState(false);
  const [showSettingsScreen, setShowSettingsScreen] = useState(false);
  const [viewingExerciseId, setViewingExerciseId] = useState<string | null>(null);
  const [homeModalOpen, setHomeModalOpen] = useState(false);

  // Theme synchronization
  useEffect(() => {
    document.body.className = settings.theme === 'dark' ? 'dark-theme' : 'light-theme';
  }, [settings.theme]);

  // גובה מסך אמיתי לתפריטים תחתונים - vh/dvh לא תמיד אמינים בספארי כשסרגל הכתובת זז,
  // אז מודדים ישירות דרך visualViewport ושומרים כמשתנה CSS שמתעדכן בזמן אמת.
  useEffect(() => {
    const setAppVh = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-vh', `${height / 100}px`);
    };
    setAppVh();
    window.visualViewport?.addEventListener('resize', setAppVh);
    window.addEventListener('resize', setAppVh);
    window.addEventListener('orientationchange', setAppVh);
    return () => {
      window.visualViewport?.removeEventListener('resize', setAppVh);
      window.removeEventListener('resize', setAppVh);
      window.removeEventListener('orientationchange', setAppVh);
    };
  }, []);

  // Persist Active Workout
  const handleUpdateActiveWorkout = (updated: WorkoutSession) => {
    setActiveWorkout(updated);
    StorageService.saveActiveWorkout(updated);
  };

  // Step 1 -> Step 2: Clicking "Start Workout" on Screen 1 opens Screen 2 (Preview / Reorder)
  const handleOpenWorkoutDetail = (routine: RoutineTemplate, day: RoutineDay) => {
    setActiveRoutine(routine);
    setPreviewingDay(day);
  };

  // Step 2 -> Step 3: Clicking "Get Started" on Screen 2 begins Live Active Workout
  const handleGetStartedFromPreview = (configuredExercises: RoutineDayExercise[]) => {
    const newWorkoutExercises: WorkoutExercise[] = configuredExercises.map((item) => {
      const lastPerf = StorageService.getLastExercisePerformance(item.exerciseId);

      const targetSetsCount =
        lastPerf && lastPerf.sets && lastPerf.sets.length > 0
          ? lastPerf.sets.length
          : item.targetSets || 3;

      // item.suggestedWeight / item.targetReps כבר עברו חישוב התקדמות (ראו WorkoutDetailPreview)
      const sets: WorkoutSet[] = Array.from({ length: targetSetsCount }).map((_, idx) => {
        const lastSet = lastPerf?.sets[idx] || lastPerf?.sets[0];
        return {
          id: `set-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          setNumber: idx + 1,
          type: 'normal',
          weightKg: item.suggestedWeight ?? lastSet?.weightKg ?? 0,
          reps: item.targetReps ?? lastSet?.reps ?? 10,
          completed: false,
          previousWeight: lastSet?.weightKg,
          previousReps: lastSet?.reps,
        };
      });

      return {
        exerciseId: item.exerciseId,
        sets,
        supersetGroupId: item.supersetGroupId,
        notes: StorageService.getNoteForExercise(item.exerciseId),
      };
    });

    const newSession: WorkoutSession = {
      id: `workout-${Date.now()}`,
      title: `${activeRoutine.title} - יום ${selectedDayNumber}`,
      routineId: activeRoutine.id,
      dayNumber: selectedDayNumber,
      targetMuscles: previewingDay?.targetMuscles,
      startTime: Date.now(),
      durationSec: 0,
      exercises: newWorkoutExercises,
      isCompleted: false,
      totalVolumeKg: 0,
      completedSetsCount: 0,
    };

    setActiveWorkout(newSession);
    StorageService.saveActiveWorkout(newSession);
    setPreviewingDay(null);
  };

  // Start an empty free workout
  const handleStartEmptyWorkout = () => {
    const newSession: WorkoutSession = {
      id: `workout-${Date.now()}`,
      title: 'אימון חופשי',
      startTime: Date.now(),
      durationSec: 0,
      exercises: [],
      isCompleted: false,
      totalVolumeKg: 0,
      completedSetsCount: 0,
    };

    setActiveWorkout(newSession);
    StorageService.saveActiveWorkout(newSession);
    setPreviewingDay(null);
  };

  // Finish Workout
  const handleFinishWorkout = (finishedSession: WorkoutSession) => {
    StorageService.saveWorkout(finishedSession);
    setHistory(StorageService.getWorkoutHistory());
    setActiveWorkout(null);
    setSummarySession(finishedSession);
    setCurrentTab('community'); // History view

    // Auto-advance to next day in chronological order!
    const targetRoutineId = finishedSession.routineId || activeRoutine.id;
    const targetRoutine = routines.find((r) => r.id === targetRoutineId) || activeRoutine;

    // אם התוכנית דורשת תיעוד לפני התקדמות, ולא נרשם אף סט - השאר את אותו יום להבא
    if (targetRoutine.requireLogToAdvance && finishedSession.completedSetsCount === 0) {
      return;
    }

    const totalDays = targetRoutine.days?.length || 5;
    const completedDay = finishedSession.dayNumber || selectedDayNumber;
    const nextDay = completedDay >= totalDays ? 1 : completedDay + 1;

    setSelectedDayNumber(nextDay);
    StorageService.saveSelectedDayNumber(targetRoutineId, nextDay);
  };

  // Cancel Workout
  const handleCancelWorkout = () => {
    StorageService.clearActiveWorkout();
    setActiveWorkout(null);
  };

  // Repeat a past workout
  const handleRepeatWorkout = (pastWorkout: WorkoutSession) => {
    const newWorkoutExercises: WorkoutExercise[] = pastWorkout.exercises.map((ex) => {
      const sets: WorkoutSet[] = ex.sets.map((s, idx) => ({
        id: `set-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        setNumber: idx + 1,
        type: s.type,
        weightKg: s.weightKg,
        reps: s.reps,
        completed: false,
        previousWeight: s.weightKg,
        previousReps: s.reps,
      }));

      return {
        exerciseId: ex.exerciseId,
        sets,
        supersetGroupId: ex.supersetGroupId,
        notes: StorageService.getNoteForExercise(ex.exerciseId) || ex.notes,
      };
    });

    const newSession: WorkoutSession = {
      id: `workout-${Date.now()}`,
      title: pastWorkout.title,
      startTime: Date.now(),
      durationSec: 0,
      exercises: newWorkoutExercises,
      isCompleted: false,
      totalVolumeKg: 0,
      completedSetsCount: 0,
    };

    setActiveWorkout(newSession);
    StorageService.saveActiveWorkout(newSession);
    setCurrentTab('workout');
    setPreviewingDay(null);
  };

  // Add Exercise to Active Workout
  const handleAddExerciseToActive = (exercise: Exercise) => {
    if (!activeWorkout) return;
    const lastPerf = StorageService.getLastExercisePerformance(exercise.id);

    const newSets: WorkoutSet[] = Array.from({ length: exercise.defaultSets || 3 }).map((_, idx) => {
      const lastSet = lastPerf?.sets[idx] || lastPerf?.sets[0];
      return {
        id: `set-${Date.now()}-${idx}`,
        setNumber: idx + 1,
        type: 'normal',
        weightKg: lastSet ? lastSet.weightKg : 0,
        reps: lastSet ? lastSet.reps : exercise.defaultReps || 10,
        completed: false,
        previousWeight: lastSet?.weightKg,
        previousReps: lastSet?.reps,
      };
    });

    handleUpdateActiveWorkout({
      ...activeWorkout,
      exercises: [
        ...activeWorkout.exercises,
        {
          exerciseId: exercise.id,
          sets: newSets,
          notes: StorageService.getNoteForExercise(exercise.id),
        },
      ],
    });

    setShowAddExerciseToActiveModal(false);
  };

  // Update User Settings
  const handleUpdateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
  };

  // Save a workout logged retroactively (does not touch the active routine/day rotation)
  const handleSaveRetroactiveWorkout = (session: WorkoutSession) => {
    StorageService.saveWorkout(session);
    setHistory(StorageService.getWorkoutHistory());
  };

  // מחיקת חשבון לצמיתות - קוראת ל-Edge Function שמזהה את המשתמש מהטוקן שלו
  // ומוחקת אותו (ובעקבותיו נמחקים בשרשור כל הנתונים שלו בענן).
  const handleDeleteAccount = async (): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.functions.invoke('delete-account');
    if (error) {
      return { error: error.message || 'מחיקת החשבון נכשלה, נסה שוב.' };
    }
    if (data?.error) {
      return { error: data.error };
    }
    StorageService.clearLocalDataOnLogout();
    await supabase.auth.signOut();
    return { error: null };
  };

  const handleResetData = () => {
    StorageService.resetAllData();
    setSettings(StorageService.getSettings());
    setExercises(StorageService.getExercises());
    setRoutines(StorageService.getRoutines());
    setHistory(StorageService.getWorkoutHistory());
    setActiveWorkout(null);
    setPreviewingDay(null);
  };

  // עדיין בודקים אם המשתמש כבר מחובר
  if (session === undefined) {
    return (
      <IPhonePreviewFrame showFrameOnDesktop={settings.showIphoneFrameOnDesktop}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Dumbbell size={32} color="var(--color-blue)" className="spin" />
        </div>
      </IPhonePreviewFrame>
    );
  }

  // לא מחובר - מציגים מסך התחברות/הרשמה בלבד
  if (session === null) {
    return (
      <IPhonePreviewFrame showFrameOnDesktop={settings.showIphoneFrameOnDesktop}>
        <AuthView />
      </IPhonePreviewFrame>
    );
  }

  // מחוברים, אבל עדיין מסנכרנים את הנתונים מהענן למכשיר
  if (!dataReady) {
    return (
      <IPhonePreviewFrame showFrameOnDesktop={settings.showIphoneFrameOnDesktop}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Dumbbell size={32} color="var(--color-blue)" className="spin" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>טוען את הנתונים שלך...</span>
        </div>
      </IPhonePreviewFrame>
    );
  }

  // חשבון חדש שעדיין לא עבר את תהליך ההיכרות
  if (!settings.onboardingCompleted) {
    return (
      <IPhonePreviewFrame showFrameOnDesktop={settings.showIphoneFrameOnDesktop}>
        <OnboardingFlow
          user={session.user}
          settings={settings}
          routines={routines}
          onComplete={(updatedSettings) => {
            setSettings(updatedSettings);
            setRoutines(StorageService.getRoutines());
            const firstRoutine = StorageService.getRoutines()[0];
            if (firstRoutine) {
              setActiveRoutine(firstRoutine);
              setSelectedDayNumber(StorageService.getSelectedDayNumber(firstRoutine.id));
            }
          }}
        />
      </IPhonePreviewFrame>
    );
  }

  return (
    <IPhonePreviewFrame showFrameOnDesktop={settings.showIphoneFrameOnDesktop}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* Main Content Area */}
        <main
          className="app-content-scroll"
          style={{
            padding: activeWorkout ? 0 : '14px 16px',
            paddingBottom: activeWorkout ? 0 : 'calc(var(--safe-bottom) + 80px)',
          }}
        >
          {/* Active Workout Screen (Live tracking) */}
          {activeWorkout ? (
            <ActiveWorkout
              workout={activeWorkout}
              allExercises={exercises}
              onUpdateWorkout={handleUpdateActiveWorkout}
              onFinishWorkout={handleFinishWorkout}
              onCancelWorkout={handleCancelWorkout}
              onAddExerciseClick={() => setShowAddExerciseToActiveModal(true)}
              defaultRestSec={settings.defaultRestSeconds}
              autoRestTimerEnabled={settings.autoRestTimerEnabled}
              onDisableAutoTimer={() => handleUpdateSettings({ ...settings, autoRestTimerEnabled: false })}
              onOpenExerciseProfile={setViewingExerciseId}
            />
          ) : previewingDay ? (
            /* Screen 2: Workout Preview & Reorder (Matching Image 2) */
            <WorkoutDetailPreview
              routine={activeRoutine}
              day={previewingDay}
              allExercises={exercises}
              onBack={() => setPreviewingDay(null)}
              onGetStarted={handleGetStartedFromPreview}
              onOpenExerciseProfile={setViewingExerciseId}
            />
          ) : (
            /* Standard Tab Views */
            <>
              {currentTab === 'workout' && (
                /* Screen 1: Workout Main Home (Matching Image 1) */
                <WorkoutHomeView
                  routines={routines}
                  activeRoutine={activeRoutine}
                  selectedDayNumber={selectedDayNumber}
                  onSelectRoutine={(r) => {
                    setActiveRoutine(r);
                    const savedDay = StorageService.getSelectedDayNumber(r.id);
                    setSelectedDayNumber(savedDay);
                  }}
                  onSelectDay={(dayNum) => {
                    setSelectedDayNumber(dayNum);
                    StorageService.saveSelectedDayNumber(activeRoutine.id, dayNum);
                  }}
                  onStartWorkoutClick={handleOpenWorkoutDetail}
                  onStartEmptyWorkout={handleStartEmptyWorkout}
                  onOpenRoutinesMenu={() => setShowRoutinesManagerModal(true)}
                  onOpenSettings={() => setShowSettingsScreen(true)}
                  onModalOpenChange={setHomeModalOpen}
                />
              )}

              {currentTab === 'analysis' && (
                <AnalyticsView history={history} allExercises={exercises} />
              )}

              {currentTab === 'community' && (
                <HistoryView
                  history={history}
                  allExercises={exercises}
                  onRepeatWorkout={handleRepeatWorkout}
                  onDeleteWorkout={(id) => {
                    StorageService.deleteWorkout(id);
                    setHistory(StorageService.getWorkoutHistory());
                  }}
                />
              )}

              {currentTab === 'nutrition' && <NutritionView />}

              {currentTab === 'profile' && (
                <ProfileView
                  history={history}
                  allExercises={exercises}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onOpenSettings={() => setShowSettingsScreen(true)}
                  onSaveRetroactiveWorkout={handleSaveRetroactiveWorkout}
                  onAddCustomExercise={(newEx) => {
                    StorageService.saveExercise(newEx);
                    setExercises(StorageService.getExercises());
                  }}
                  onDeleteWorkout={(id) => {
                    StorageService.deleteWorkout(id);
                    setHistory(StorageService.getWorkoutHistory());
                  }}
                  user={session.user}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </>
          )}
        </main>

        {/* Bottom Tab Bar */}
        {!activeWorkout && !previewingDay && !homeModalOpen && (
          <nav className="ios-tab-bar">
            <button
              className={`tab-button ${currentTab === 'workout' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('workout');
                setPreviewingDay(null);
              }}
            >
              <span className="tab-icon-chip"><Dumbbell size={20} /></span>
              <span>אימון</span>
            </button>

            <button
              className={`tab-button ${currentTab === 'analysis' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('analysis');
                setPreviewingDay(null);
              }}
            >
              <span className="tab-icon-chip"><TrendingUp size={20} /></span>
              <span>ניתוח</span>
            </button>

            <button
              className={`tab-button ${currentTab === 'community' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('community');
                setPreviewingDay(null);
              }}
            >
              <span className="tab-icon-chip"><Calendar size={20} /></span>
              <span>היסטוריה</span>
            </button>

            <button
              className={`tab-button ${currentTab === 'nutrition' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('nutrition');
                setPreviewingDay(null);
              }}
            >
              <span className="tab-icon-chip"><Utensils size={20} /></span>
              <span>תזונה</span>
            </button>

            <button
              className={`tab-button ${currentTab === 'profile' ? 'active' : ''}`}
              onClick={() => {
                setCurrentTab('profile');
                setPreviewingDay(null);
              }}
            >
              <span className="tab-icon-chip"><User size={20} /></span>
              <span>פרופיל</span>
            </button>
          </nav>
        )}

        {/* All Routines Manager Modal */}
        {showRoutinesManagerModal && (
          <div className="modal-overlay" onClick={() => setShowRoutinesManagerModal(false)}>
            <div
              className="action-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{ height: 'calc(var(--app-vh, 1vh) * 88)', overflowY: 'auto' }}
            >
              <div className="sheet-handle" />
              <RoutinesView
                routines={routines}
                activeRoutine={activeRoutine}
                allExercises={exercises}
                onSelectActiveRoutine={(r) => {
                  setActiveRoutine(r);
                  setSelectedDayNumber(StorageService.getSelectedDayNumber(r.id));
                  setShowRoutinesManagerModal(false);
                }}
                onStartRoutine={(r) => {
                  setActiveRoutine(r);
                  setSelectedDayNumber(1);
                  setShowRoutinesManagerModal(false);
                  const firstDay = r.days?.[0] || {
                    dayNumber: 1,
                    dayTitle: 'יום 1',
                    targetMuscles: 'כל הגוף',
                    estimatedCalories: 300,
                    estimatedMinutes: 45,
                    exercises: r.exercises,
                  };
                  handleOpenWorkoutDetail(r, firstDay);
                }}
                onStartEmptyWorkout={() => {
                  setShowRoutinesManagerModal(false);
                  handleStartEmptyWorkout();
                }}
                onSaveRoutine={(r) => {
                  StorageService.saveRoutine(r);
                  setRoutines(StorageService.getRoutines());
                  if (r.id === activeRoutine.id) {
                    setActiveRoutine(r);
                  }
                }}
                onDeleteRoutine={(id) => {
                  StorageService.deleteRoutine(id);
                  const remaining = StorageService.getRoutines();
                  setRoutines(remaining);
                  if (activeRoutine.id === id && remaining.length > 0) {
                    setActiveRoutine(remaining[0]);
                  }
                }}
                onClose={() => setShowRoutinesManagerModal(false)}
                onOpenExerciseProfile={setViewingExerciseId}
              />
            </div>
          </div>
        )}

        {/* Add Exercise Modal (while workout is active) */}
        {showAddExerciseToActiveModal && (
          <div className="modal-overlay" onClick={() => setShowAddExerciseToActiveModal(false)}>
            <div
              className="action-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{ height: 'calc(var(--app-vh, 1vh) * 85)', overflowY: 'auto' }}
            >
              <div className="sheet-handle" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>הוסף תרגיל לאימון הנוכחי</h3>
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={() => setShowAddExerciseToActiveModal(false)}
                >
                  סגור
                </button>
              </div>

              <ExerciseLibraryView
                allExercises={exercises}
                onAddCustomExercise={(newEx) => {
                  StorageService.saveExercise(newEx);
                  setExercises(StorageService.getExercises());
                }}
                onSelectExerciseForWorkout={handleAddExerciseToActive}
                onOpenExerciseProfile={setViewingExerciseId}
              />
            </div>
          </div>
        )}

        {/* Workout Summary Celebration Modal */}
        {summarySession && (
          <WorkoutSummaryModal
            session={summarySession}
            isOpen={true}
            onClose={() => setSummarySession(null)}
            soundEnabled={settings.soundEnabled}
          />
        )}

        {/* Settings Screen (opened via the gear icon, separate from the Profile tab) */}
        {showSettingsScreen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'var(--bg-app)',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setShowSettingsScreen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}
              >
                <ChevronLeft size={24} />
              </button>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>הגדרות</h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(var(--safe-bottom) + 24px)' }}>
              <SettingsView
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onResetData={handleResetData}
                userEmail={session?.user?.email}
                onLogout={() => supabase.auth.signOut()}
              />
            </div>
          </div>
        )}

        {/* Exercise Profile Page (image, instructions, history) */}
        {viewingExerciseId && (() => {
          const viewedExercise = exercises.find((e) => e.id === viewingExerciseId);
          if (!viewedExercise) return null;
          return (
            <ExerciseProfileView
              exercise={viewedExercise}
              history={history}
              onClose={() => setViewingExerciseId(null)}
            />
          );
        })()}
      </div>
    </IPhonePreviewFrame>
  );
};
