import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { getUnreadCounts, subscribeTrainerInbox } from '../../services/trainer';
import type { TrainerInbox } from './TrainerHub';

/** מוני הודעות שלא נקראו לכל האפליקציה, בזמן אמת ובכל חזרה לחזית (Realtime לא רץ ברקע).
 *  onMyDataChanged נקרא כשהמאמן שינה משהו בנתונים של המשתמש - כדי למשוך אותם מיד. */
export function useTrainerInbox(userId: string | null, onMyDataChanged: () => void): TrainerInbox & { total: number } {
  const [unreadByThread, setUnread] = useState<Map<string, number>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataChanged = useRef(onMyDataChanged);
  dataChanged.current = onMyDataChanged;

  const refresh = useCallback(() => {
    if (!userId) return;
    // כמה אירועים ברצף (הודעה + סימון כנקרא) -> רענון אחד
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => setUnread(await getUnreadCounts(userId)), 250);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUnread(new Map());
      return;
    }
    refresh();
    let pullTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = subscribeTrainerInbox(userId, refresh, () => {
      // המאמן שומר כמה רשומות ברצף - מושכים פעם אחת אחרי שהרצף נגמר
      if (pullTimer) clearTimeout(pullTimer);
      pullTimer = setTimeout(() => dataChanged.current(), 1500);
    });
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (pullTimer) clearTimeout(pullTimer);
    };
  }, [userId, refresh]);

  let total = 0;
  unreadByThread.forEach((n) => (total += n));
  return { unreadByThread, refresh, total };
}
