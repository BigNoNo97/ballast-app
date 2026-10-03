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
import { AppleHealthService } from './services/appleHealthService';
import { buildRoutine } from './services/programGenerator';
import { processFinishedWorkout } from './services/progressionEngine';
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
import { NoRoutineWorkoutView } from './components/NoRoutineWorkoutView';
import { ProgramGeneratingLoader } from './components/ProgramGeneratingLoader';
import { supabase } from './services/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { WatchBridge } from './plugins/watchBridge';
import {
  applyWatchCommand,
  buildWatchState,
  getWatchAck,
  isWatchSyncSupported,
  loadOrphanCommands,
  orderWatchCommands,
  parseWatchCommands,
  saveOrphanCommands,
  sessionFromWatchStart,
  setLastEndedWorkout,
  setWatchAck,
  type WatchCommand,
} from './services/watchSync';
import { buildFinishedSession } from './services/workoutEdits';
import { buildWorkoutExercisesForDay } from './services/workoutBuilder';

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

  // התחברות עם Google/Apple באפליקציה הטבעית נפתחת בדפדפן חיצוני (Browser.open) כי
  // WebView מוטמע נחסם/לא מהימן אצל ספקי OAuth - אפל מחזירה אותנו לכאן דרך ה-URL
  // scheme המותאם-אישית, לא דרך ניווט רגיל בדף, אז צריך להאזין לזה ולהשלים את ההתחברות ידנית.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('auth-callback')) return;
      await Browser.close().catch(() => {});

      // ה-client עובד ב-implicit flow (ברירת המחדל של supabase-js) - הטוקנים מגיעים
      // ב-hash. אם יום אחד נעבור ל-PKCE, יגיע ?code= ב-query במקום.
      const parsed = new URL(url);
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = parsed.searchParams.get('code');
      const errorDescription =
        hashParams.get('error_description') || parsed.searchParams.get('error_description');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) alert('ההתחברות נכשלה: ' + error.message);
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) alert('ההתחברות נכשלה: ' + error.message);
      } else if (errorDescription) {
        alert('ההתחברות נכשלה: ' + errorDescription);
      }
    });
    return () => {
      listenerPromise.then((l) => l.remove());
    };
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
      setExercises(StorageService.getExercises());
      const freshRoutines = StorageService.getRoutines();
      setRoutines(freshRoutines);
      setHistory(StorageService.getWorkoutHistory());
      setActiveWorkout(StorageService.getActiveWorkout());

      // חשבון שכבר סיים אונבורדינג לפני שהתכונה הזו (מעקב מפורש אחר תוכנית פעילה) קיימת -
      // "מגייר" אותו לתוכנית הראשונה שהוא ממילא היה משתמש בה (ההתנהגות ההיסטורית), במקום
      // לגרור אותו רטרואקטיבית למסך "עוד אין לך תוכנית" שהוא לא ציפה לו.
      if (loadedSettings.activeRoutineId === undefined && loadedSettings.onboardingCompleted) {
        loadedSettings = { ...loadedSettings, activeRoutineId: freshRoutines[0]?.id ?? null };
        StorageService.saveSettings(loadedSettings);
      }
      setSettings(loadedSettings);

      const routineId = loadedSettings.activeRoutineId;
      const resolvedRoutine =
        routineId === null
          ? null
          : routineId
          ? freshRoutines.find((r) => r.id === routineId) || freshRoutines[0] || null
          : freshRoutines[0] || null;
      setActiveRoutine(resolvedRoutine);
      if (resolvedRoutine) {
        setSelectedDayNumber(StorageService.getSelectedDayNumber(resolvedRoutine.id));
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

  // Selected routine and day (persisted per routine) - null = אין למשתמש תוכנית פעילה
  // (הערך האמיתי נקבע סופית ב-hydrateFromCloud לפי settings.activeRoutineId; זה רק placeholder לפני זה)
  const [activeRoutine, setActiveRoutine] = useState<RoutineTemplate | null>(() => routines[0] || StorageService.getRoutines()[0] || null);
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(() => {
    const defaultRot = routines[0] || StorageService.getRoutines()[0];
    return defaultRot ? StorageService.getSelectedDayNumber(defaultRot.id) : 1;
  });

  // Navigation state
  const [currentTab, setCurrentTab] = useState<NavigationTab>('workout');
  const [previewingDay, setPreviewingDay] = useState<RoutineDay | null>(null);
  const [summarySession, setSummarySession] = useState<WorkoutSession | null>(null);
  const [coachNote, setCoachNote] = useState<string | null>(null);
  const [healthSync, setHealthSync] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingDeleteWorkout, setPendingDeleteWorkout] = useState<WorkoutSession | null>(null);
  const [isGeneratingProgram, setIsGeneratingProgram] = useState(false);
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

  // שלט לאימון בשעון: כל שינוי באימון נשלח לשעון, ופקודות מהשעון מיושמות כאן. ה-refs
  // נחוצים כי פקודות מגיעות מאירוע נייטיבי, מחוץ למחזור הרינדור הרגיל.
  const activeWorkoutRef = useRef(activeWorkout);
  activeWorkoutRef.current = activeWorkout;
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const routinesRef = useRef(routines);
  routinesRef.current = routines;
  const activeRoutineRef = useRef(activeRoutine);
  activeRoutineRef.current = activeRoutine;
  const selectedDayRef = useRef(selectedDayNumber);
  selectedDayRef.current = selectedDayNumber;
  const drainWatchCommandsRef = useRef<(() => void) | null>(null);
  // handleFinishWorkout תלוי בתוכניות/הגדרות עדכניות, ופקודות מהשעון מעובדות מתוך effect
  // שנרשם פעם אחת - לכן קוראים לגרסה האחרונה דרך ref (מתעדכן אחרי שהפונקציה מוגדרת למטה).
  const finishWorkoutRef = useRef<((session: WorkoutSession) => void) | null>(null);

  const sendStateToWatch = () => {
    if (!isWatchSyncSupported()) return;
    const state = buildWatchState(activeWorkoutRef.current, exercisesRef.current, settingsRef.current, {
      routine: activeRoutineRef.current,
      nextDayNumber: selectedDayRef.current,
    });
    WatchBridge.sendState({ state: JSON.stringify(state) }).catch(() => {});
  };

  useEffect(() => {
    sendStateToWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeWorkout,
    exercises,
    routines,
    activeRoutine,
    selectedDayNumber,
    settings.defaultRestSeconds,
    settings.autoRestTimerEnabled,
    settings.appleHealthSyncEnabled,
  ]);

  // אימון חדש מתחיל -> פותחים את אפליקציית השעון עם סשן אימון (דופק/קלוריות). רק כשסנכרון
  // Health פעיל, כי הסשן עצמו נשמר ב-Health. פעם אחת לכל אימון.
  const watchLaunchedForWorkout = useRef<string | null>(null);
  useEffect(() => {
    const id = activeWorkout?.id;
    if (!id || watchLaunchedForWorkout.current === id || !isWatchSyncSupported()) return;
    watchLaunchedForWorkout.current = id;
    if (!activeWorkout?.healthRecordedByWatch && !activeWorkout?.startedOnWatch) AppleHealthService.startWatchWorkout();
  }, [activeWorkout?.id, activeWorkout?.healthRecordedByWatch, activeWorkout?.startedOnWatch]);

  useEffect(() => {
    if (!isWatchSyncSupported()) return;
    const drainWatchCommands = async () => {
      let raw: string[] = [];
      try {
        raw = (await WatchBridge.takePendingCommands()).commands;
      } catch {
        return;
      }
      const commands = orderWatchCommands([...loadOrphanCommands(), ...parseWatchCommands(raw)]);
      if (commands.length === 0) return;

      const finishedIds = new Set(StorageService.getWorkoutHistory().map((w) => w.id));
      let workout = activeWorkoutRef.current;
      let changed = false;
      const orphans: WatchCommand[] = [];

      for (const cmd of commands) {
        // פקודות של אימון שכבר הסתיים ונשמר (למשל הגיעו פעמיים) - לא מחיים אותו מחדש
        if (finishedIds.has(cmd.workoutId)) continue;

        if (cmd.type === 'startWorkout') {
          if (workout?.id === cmd.workoutId) continue;
          if (workout) {
            // האייפון באמצע אימון אחר - שומרים, ויקלט כשהאימון הנוכחי יסתיים
            orphans.push(cmd);
            continue;
          }
          const adopted = sessionFromWatchStart(cmd, routinesRef.current);
          if (!adopted) continue;
          workout = adopted;
          changed = true;
          setWatchAck(adopted.id, Math.max(getWatchAck(adopted.id), cmd.seq));
          continue;
        }

        if (!workout || cmd.workoutId !== workout.id) {
          orphans.push(cmd);
          continue;
        }
        if (cmd.seq <= getWatchAck(workout.id)) continue;
        setWatchAck(workout.id, cmd.seq);

        if (cmd.type === 'finishWorkout') {
          // סיום מהשעון עובר בדיוק באותו מסלול כמו "סיים אימון" באייפון (שיאים, היסטוריה,
          // Health, מסך סיכום) - עם שעת הסיום מהשעון, גם אם האייפון עיבד את זה רק אחר כך.
          activeWorkoutRef.current = null;
          finishWorkoutRef.current?.(buildFinishedSession(workout, exercisesRef.current, cmd.at));
          finishedIds.add(workout.id);
          workout = null;
          changed = false;
          continue;
        }

        workout = applyWatchCommand(workout, cmd);
        changed = true;
      }

      saveOrphanCommands(orphans);
      if (changed && workout) {
        activeWorkoutRef.current = workout;
        handleUpdateActiveWorkout(workout);
      }
      sendStateToWatch();
    };
    drainWatchCommandsRef.current = drainWatchCommands;

    drainWatchCommands();
    const listeners = [
      WatchBridge.addListener('commandsAvailable', drainWatchCommands),
      CapacitorApp.addListener('resume', () => {
        // גם כשאין פקודות - לשלוח מצב עדכני, למקרה שעדכון קודם לא הגיע לשעון
        drainWatchCommands();
        sendStateToWatch();
      }),
    ];
    return () => {
      listeners.forEach((p) => p.then((l) => l.remove()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1 -> Step 2: Clicking "Start Workout" on Screen 1 opens Screen 2 (Preview / Reorder)
  const handleOpenWorkoutDetail = (routine: RoutineTemplate, day: RoutineDay) => {
    setActiveRoutine(routine);
    if (settings.activeRoutineId !== routine.id) {
      handleUpdateSettings({ ...settings, activeRoutineId: routine.id });
    }
    setPreviewingDay(day);
  };

  // Step 2 -> Step 3: Clicking "Get Started" on Screen 2 begins Live Active Workout
  const handleGetStartedFromPreview = (configuredExercises: RoutineDayExercise[]) => {
    if (!activeRoutine) return; // לא אמור לקרות - המסך הזה נגיש רק כשיש תוכנית פעילה
    const newWorkoutExercises = buildWorkoutExercisesForDay(configuredExercises);

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
    // אימון שהתחיל בשעון בזמן שהאייפון היה באמצע אימון אחר מחכה בתור - נקלט עכשיו
    setTimeout(() => drainWatchCommandsRef.current?.(), 0);
    StorageService.saveWorkout(finishedSession);
    setHealthSync(null);
    // אם השעון הריץ סשן אימון של Apple, הוא שומר את האימון ב-Health בעצמו (עם דופק וקלוריות
    // אמיתיים) כשהוא מקבל את הסיום - האייפון לא שומר עותק נוסף. אחרת שומרים מהאייפון כרגיל.
    const watchSaves = Boolean(finishedSession.healthRecordedByWatch) && AppleHealthService.isEnabled();
    setLastEndedWorkout({
      workoutId: finishedSession.id,
      endTime: finishedSession.endTime || Date.now(),
      outcome: 'finished',
      phoneSaved: !watchSaves && AppleHealthService.isEnabled(),
    });
    if (watchSaves) {
      setHealthSync({ ok: true, message: 'האימון נשמר ב-Apple Health דרך השעון, עם הדופק והקלוריות שהוא מדד' });
    } else {
      AppleHealthService.syncWorkout(finishedSession).then((result) => {
        if (result.status === 'saved') setHealthSync({ ok: true, message: 'האימון נשמר ב-Apple Health' });
        if (result.status === 'failed') setHealthSync({ ok: false, message: result.error });
      });
    }
    setHistory(StorageService.getWorkoutHistory());
    setActiveWorkout(null);
    setSummarySession(finishedSession);
    setCoachNote(null);
    setCurrentTab('community'); // History view

    // Auto-advance to next day in chronological order! חשוב: לא נופלים חזרה ל-activeRoutine
    // כשלסשן עצמו אין routineId (אימון חופשי / חזרה על אימון ישן) - אחרת אימון חופשי בזמן
    // שתוכנית אוטומטית פעילה היה נספר בטעות כאימון שלה (מקדם שבוע/מחזור ומעדכן את יום ה-
    // "הבא" שלה, למרות שהמשתמש כלל לא ביצע את התרגילים שהתוכנית קבעה).
    const targetRoutineId = finishedSession.routineId;
    let targetRoutine = targetRoutineId ? routines.find((r) => r.id === targetRoutineId) : undefined;

    // אימון חופשי בלי שום תוכנית מעורבת - אין "יום הבא" להתקדם אליו, פשוט מסיימים כאן.
    if (!targetRoutine || !targetRoutineId) {
      return;
    }

    // מנוע ההתקדמות המחזורי - רק לתוכניות שהמערכת בנתה, ורק אם היו סטים לתעד בכלל.
    if (targetRoutine.isGenerated && finishedSession.completedSetsCount > 0) {
      const { updatedRoutine, stalledExerciseIds, didRollover } = processFinishedWorkout(
        finishedSession,
        targetRoutine,
        settings,
        exercises
      );
      targetRoutine = updatedRoutine;
      StorageService.saveRoutine(updatedRoutine);
      const freshRoutines = StorageService.getRoutines();
      setRoutines(freshRoutines);
      if (activeRoutine?.id === updatedRoutine.id) setActiveRoutine(updatedRoutine);

      if (didRollover) {
        setCoachNote(`התוכנית שלך עברה למחזור אימון חדש (מחזור ${updatedRoutine.mesocycle?.cycleNumber}) - נפח מעט גבוה יותר, ותרגילים מגוונים יותר 💪`);
      } else if (stalledExerciseIds.length > 0) {
        const names = stalledExerciseIds
          .map((id) => exercises.find((e) => e.id === id)?.nameHe)
          .filter(Boolean)
          .join(', ');
        if (names) setCoachNote(`שים לב: לא הייתה התקדמות ב-${names} כמה אימונים ברצף - שווה לבדוק טכניקה, לנוח יותר ביניהם, או להחליף לתרגיל חלופי.`);
      }
    }

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

  finishWorkoutRef.current = handleFinishWorkout;

  // Cancel Workout
  const handleCancelWorkout = () => {
    if (activeWorkout) {
      setLastEndedWorkout({ workoutId: activeWorkout.id, endTime: Date.now(), outcome: 'cancelled', phoneSaved: false });
    }
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

  const deleteWorkoutLocally = (id: string) => {
    StorageService.deleteWorkout(id);
    setHistory(StorageService.getWorkoutHistory());
  };

  // באייפון שואלים אם למחוק גם מ-Apple Health; בדפדפן אין Health, אז מוחקים מיד כמו קודם
  const handleDeleteWorkout = (id: string) => {
    const workout = history.find((w) => w.id === id);
    if (workout && workout.endTime && AppleHealthService.isSupported()) {
      setPendingDeleteWorkout(workout);
      return;
    }
    deleteWorkoutLocally(id);
  };

  const confirmDeleteWorkout = async (alsoFromHealth: boolean) => {
    const workout = pendingDeleteWorkout;
    if (!workout) return;
    setPendingDeleteWorkout(null);
    deleteWorkoutLocally(workout.id);
    if (!alsoFromHealth) return;
    const result = await AppleHealthService.deleteWorkout(workout);
    if (result.status === 'failed') {
      alert(result.error);
    } else if (result.count === 0) {
      alert('האימון נמחק מהאפליקציה. ב-Apple Health לא נמצא אימון של Ballast בשעה הזו - ייתכן שהוא לא סונכרן לשם, או שכבר נמחק.');
    }
  };

  // Save a workout logged retroactively (does not touch the active routine/day rotation)
  const handleSaveRetroactiveWorkout = (session: WorkoutSession) => {
    StorageService.saveWorkout(session);
    AppleHealthService.syncWorkout(session).then((result) => {
      if (result.status === 'failed') alert(result.error);
    });
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
          settings={settings}
          onComplete={(updatedSettings) => {
            setSettings(updatedSettings);
            const freshRoutines = StorageService.getRoutines();
            setRoutines(freshRoutines);
            // finish()/skipAll() כבר קבעו activeRoutineId מפורש (מזהה אמיתי, או null אם דולג) -
            // לא נופלים סתם על routines[0] כאן, אחרת מסך "עוד אין לך תוכנית" לעולם לא יוצג.
            const id = updatedSettings.activeRoutineId;
            const resolved = id ? freshRoutines.find((r) => r.id === id) || null : null;
            setActiveRoutine(resolved);
            if (resolved) {
              setSelectedDayNumber(StorageService.getSelectedDayNumber(resolved.id));
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
            paddingTop: activeWorkout ? 0 : 'calc(var(--safe-top) + 14px)',
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
          ) : previewingDay && activeRoutine ? (
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
                isGeneratingProgram ? (
                  <ProgramGeneratingLoader />
                ) : activeRoutine ? (
                  /* Screen 1: Workout Main Home (Matching Image 1) */
                  <WorkoutHomeView
                    routines={routines}
                    activeRoutine={activeRoutine}
                    selectedDayNumber={selectedDayNumber}
                    onSelectRoutine={(r) => {
                      setActiveRoutine(r);
                      handleUpdateSettings({ ...settings, activeRoutineId: r.id });
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
                ) : (
                  /* אין למשתמש תוכנית פעילה - להציע לבנות אחת, לתת למערכת, או להתחיל בלי תוכנית */
                  <NoRoutineWorkoutView
                    onChooseSystem={() => {
                      // בונה תוכנית אישית אמיתית לפי נתוני המשתמש (ימים בשבוע, ציוד, רמת ניסיון,
                      // מטרות, משך אימון) - עם מחזור אימון ומנוע התקדמות משלה, לא תבנית קבועה.
                      // מסך טעינה קצר במקום הופעה מיידית - כדי שיהיה ברור שבפועל בונים תוכנית
                      // מותאמת ולא רק מציגים דבר קבוע מראש.
                      setIsGeneratingProgram(true);
                      setTimeout(() => {
                        const { routine, progressStates } = buildRoutine(settings, exercises);
                        StorageService.saveRoutine(routine);
                        StorageService.saveExerciseProgressStates(progressStates);
                        setRoutines(StorageService.getRoutines());
                        setActiveRoutine(routine);
                        handleUpdateSettings({ ...settings, activeRoutineId: routine.id });
                        setSelectedDayNumber(StorageService.getSelectedDayNumber(routine.id));
                        setIsGeneratingProgram(false);
                      }, 1300);
                    }}
                    onOpenRoutinesMenu={() => setShowRoutinesManagerModal(true)}
                    onStartEmptyWorkout={handleStartEmptyWorkout}
                    onOpenSettings={() => setShowSettingsScreen(true)}
                  />
                )
              )}

              {currentTab === 'analysis' && (
                <AnalyticsView history={history} allExercises={exercises} />
              )}

              {currentTab === 'community' && (
                <HistoryView
                  history={history}
                  allExercises={exercises}
                  onRepeatWorkout={handleRepeatWorkout}
                  onDeleteWorkout={handleDeleteWorkout}
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
                  onDeleteWorkout={handleDeleteWorkout}
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
                  handleUpdateSettings({ ...settings, activeRoutineId: r.id });
                  setSelectedDayNumber(StorageService.getSelectedDayNumber(r.id));
                  setShowRoutinesManagerModal(false);
                }}
                onStartRoutine={(r) => {
                  setActiveRoutine(r);
                  handleUpdateSettings({ ...settings, activeRoutineId: r.id });
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
                  if (activeRoutine && r.id === activeRoutine.id) {
                    setActiveRoutine(r);
                  }
                }}
                onDeleteRoutine={(id) => {
                  StorageService.deleteRoutine(id);
                  const remaining = StorageService.getRoutines();
                  setRoutines(remaining);
                  if (activeRoutine && activeRoutine.id === id) {
                    // אם זו הייתה התוכנית האחרונה שנמחקה - חוזרים למסך "עוד אין לך תוכנית",
                    // לא נשארים עם הפניה לתוכנית שכבר לא קיימת.
                    const next = remaining[0] || null;
                    setActiveRoutine(next);
                    handleUpdateSettings({ ...settings, activeRoutineId: next ? next.id : null });
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

        {pendingDeleteWorkout && (
          <div className="modal-overlay" onClick={() => setPendingDeleteWorkout(null)}>
            <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', marginBottom: 6 }}>למחוק את האימון?</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 18 }}>
                {pendingDeleteWorkout.title} ·{' '}
                {new Date(pendingDeleteWorkout.startTime).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn-primary"
                  style={{ background: 'var(--color-red)', boxShadow: 'none' }}
                  onClick={() => confirmDeleteWorkout(true)}
                >
                  מחק מהאפליקציה ומ-Apple Health
                </button>
                <button className="btn-secondary" style={{ padding: '12px' }} onClick={() => confirmDeleteWorkout(false)}>
                  מחק רק מהאפליקציה
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: '12px', background: 'transparent', border: 'none' }}
                  onClick={() => setPendingDeleteWorkout(null)}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workout Summary Celebration Modal */}
        {summarySession && (
          <WorkoutSummaryModal
            session={summarySession}
            isOpen={true}
            onClose={() => {
              setSummarySession(null);
              setHealthSync(null);
            }}
            soundEnabled={settings.soundEnabled}
            coachNote={coachNote || undefined}
            healthSync={healthSync || undefined}
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
                padding: 'calc(var(--safe-top) + 14px) 16px 14px 16px',
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
