import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getPendingPrograms, getUnreadCounts, subscribeTrainerInbox } from '../../services/trainer';
import type { TrainerInbox } from './TrainerHub';

/** מוני "מאמנים" לכל האפליקציה: הודעות שלא נקראו ותוכניות שממתינות. מתעדכן בזמן אמת,
 *  ובכל חזרה של האפליקציה לחזית (Realtime לא רץ כשהאפליקציה ברקע). */
export function useTrainerInbox(userId: string | null): TrainerInbox & { total: number } {
  const [unreadByThread, setUnread] = useState<Map<string, number>>(new Map());
  const [pendingPrograms, setPending] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!userId) return;
    // כמה אירועים ברצף (הודעה + סימון כנקרא) -> רענון אחד
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const [counts, programs] = await Promise.all([
        getUnreadCounts(userId),
        getPendingPrograms(userId).catch(() => []),
      ]);
      setUnread(counts);
      setPending(programs.length);
    }, 250);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUnread(new Map());
      setPending(0);
      return;
    }
    refresh();
    const channel = subscribeTrainerInbox(userId, refresh);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId, refresh]);

  let total = pendingPrograms;
  unreadByThread.forEach((n) => (total += n));
  return { unreadByThread, pendingPrograms, refresh, total };
}
