import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { getThread, markThreadRead, sendMessage, TrainerError, TrainerMessage } from '../../services/trainer';
import { ErrorNote, formatTime, Muted } from './trainerUi';

/** שיחה בין מאמן למתאמן. משותפת לשני הצדדים; הודעות חדשות מגיעות בזמן אמת. */
export const ChatThread: React.FC<{
  trainerId: string;
  clientId: string;
  meId: string;
  otherName: string;
  /** false = הקשר הסתיים: אפשר לקרוא את ההיסטוריה אבל לא לשלוח */
  canSend: boolean;
  onRead?: () => void;
}> = ({ trainerId, clientId, meId, otherName, canSend, onRead }) => {
  const [messages, setMessages] = useState<TrainerMessage[] | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    let alive = true;
    const markRead = () => markThreadRead(trainerId, clientId).then(() => onReadRef.current?.());
    getThread(trainerId, clientId)
      .then((list) => {
        if (!alive) return;
        setMessages(list);
        if (list.some((m) => !m.read_at && m.sender_id !== meId)) markRead();
      })
      .catch((e) => alive && setError(e instanceof TrainerError ? e.message : 'לא הצלחנו לטעון את ההודעות.'));

    const channel = supabase
      .channel(`thread-${trainerId}-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trainer_messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const m = payload.new as TrainerMessage;
          if (m.trainer_id !== trainerId) return;
          setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
          if (m.sender_id !== meId) markRead();
        }
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [trainerId, clientId, meId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const m = await sendMessage(trainerId, clientId, meId, body);
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
      setInput('');
    } catch (e) {
      setError(e instanceof TrainerError ? e.message : 'ההודעה לא נשלחה. נסה שוב.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 2px 10px' }}>
        {messages === null && !error && (
          <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="spin" />
          </div>
        )}
        {messages?.length === 0 && <Muted style={{ textAlign: 'center', margin: 'auto 0' }}>עוד אין הודעות. כתוב ל{otherName} 👋</Muted>}
        {messages?.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-start' : 'flex-end',
                maxWidth: '82%',
                background: mine ? 'var(--color-blue)' : 'var(--bg-surface-2)',
                color: mine ? '#fff' : 'var(--text-main)',
                borderRadius: 16,
                padding: '8px 12px',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.body}
              <div style={{ fontSize: '0.64rem', opacity: 0.7, marginTop: 3 }}>
                {formatTime(m.created_at)}
                {mine && m.read_at ? ' · נקרא' : ''}
              </div>
            </div>
          );
        })}
      </div>
      <ErrorNote text={error} />
      {canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 8 }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`הודעה ל${otherName}...`}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 40,
              maxHeight: 110,
              padding: '10px 12px',
              borderRadius: 20,
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-surface-2)',
              color: 'var(--text-main)',
              fontSize: '16px',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            aria-label="שליחה"
            disabled={!input.trim() || sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: input.trim() ? 'var(--color-blue)' : 'var(--bg-surface-3)',
              color: input.trim() ? '#fff' : 'var(--text-dim)',
            }}
          >
            {sending ? <Loader2 size={17} className="spin" /> : <ArrowUp size={19} />}
          </button>
        </form>
      ) : (
        <Muted style={{ textAlign: 'center', paddingTop: 8 }}>השיתוף הסתיים - אפשר לקרוא את ההיסטוריה בלבד.</Muted>
      )}
    </div>
  );
};
