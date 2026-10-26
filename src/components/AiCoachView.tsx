import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, ShieldCheck, Sparkles, Square, Trash2, X } from 'lucide-react';
import { UserSettings } from '../types';
import { StorageService } from '../services/storage';
import { CoachError, CoachErrorCode, CoachMessage, streamCoachReply } from '../services/aiCoach';

const SUGGESTIONS = [
  'כמה חלבון אני צריך ביום?',
  'למה יעד הקלוריות שלי כזה?',
  'איך להמשיך להתקדם בלחיצת חזה?',
  'מה כדאי לאכול לפני אימון?',
];

const ERROR_TEXT: Record<CoachErrorCode, string> = {
  quota: 'הגעת למכסת השאלות להיום. המכסה מתחדשת בחצות.',
  not_configured: 'המאמן עוד לא הופעל. הוא יהיה זמין בקרוב.',
  busy: 'המאמן עמוס כרגע. נסה שוב בעוד רגע.',
  network: 'אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.',
  auth: 'פג תוקף ההתחברות. התחבר מחדש ונסה שוב.',
  refusal: 'על השאלה הזו אני לא יכול לענות. אפשר לנסח אחרת או לשאול משהו אחר על אימונים ותזונה.',
  failed: 'משהו השתבש. נסה שוב.',
};

/** תצוגה בטוחה של markdown מצומצם (פסקאות, "- " רשימות, **מודגש**) - בלי innerHTML */
function renderInline(text: string, keyBase: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>
    )
  );
}

function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} style={{ margin: '2px 0', paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush(`ul-${i}`);
    if (line) blocks.push(<p key={`p-${i}`} style={{ margin: 0 }}>{renderInline(line.replace(/^#+\s*/, ''), `p-${i}`)}</p>);
  });
  flush('ul-end');
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{blocks}</div>;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

interface Props {
  settings: UserSettings;
  onUpdateSettings: (s: UserSettings) => void;
  onClose: () => void;
}

export const AiCoachView: React.FC<Props> = ({ settings, onUpdateSettings, onClose }) => {
  const [messages, setMessages] = useState<CoachMessage[]>(() => StorageService.getAiChat());
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [shareData, setShareData] = useState(settings.aiCoachShareData !== false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = streaming !== null;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming, error]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const userMsg: CoachMessage = { id: newId(), role: 'user', content: text, createdAt: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setError(null);
    setStreaming('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const contextSettings = settings.aiCoachShareData === false ? null : settings;
      const { text: reply, remaining: left } = await streamCoachReply(history, contextSettings, setStreaming, controller.signal);
      const done = [...history, { id: newId(), role: 'assistant' as const, content: reply, createdAt: Date.now() }];
      setMessages(done);
      StorageService.saveAiChat(done);
      setRemaining(left);
    } catch (e) {
      // ההודעה שלא נענתה חוזרת לתיבת הכתיבה - כך השיחה נשארת תקינה (משתמש/מאמן לסירוגין)
      setMessages(messages);
      setInput(text);
      if (!controller.signal.aborted) {
        setError(e instanceof CoachError ? ERROR_TEXT[e.code] : ERROR_TEXT.failed);
      }
    } finally {
      setStreaming(null);
      abortRef.current = null;
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    StorageService.saveAiChat([]);
    setError(null);
  };

  const consented = !!settings.aiCoachConsentAt;

  return (
    <div
      dir="rtl"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'var(--safe-top, env(safe-area-inset-top))',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} color="var(--color-blue)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem' }}>המאמן</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>מבוסס מחקר · מידע כללי, לא ייעוץ רפואי</div>
        </div>
        {consented && messages.length > 0 && (
          <button aria-label="ניקוי השיחה" onClick={clearChat} style={iconButton}>
            <Trash2 size={17} />
          </button>
        )}
        <button aria-label="סגירה" onClick={onClose} style={iconButton}>
          <X size={18} />
        </button>
      </header>

      {!consented ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ShieldCheck size={40} color="var(--color-blue)" />
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, textAlign: 'center' }}>לפני שמתחילים</h2>
          <p style={consentText}>
            המאמן עונה על שאלות אימונים ותזונה בעזרת Claude, מודל בינה מלאכותית של חברת Anthropic. כדי לענות, השאלות שלך נשלחות ל-Anthropic לעיבוד.
            Anthropic לא משתמשת בהן לאימון המודלים שלה.
          </p>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--bg-surface-2)', borderRadius: 12, padding: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={shareData} onChange={(e) => setShareData(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span style={{ fontSize: '0.84rem', lineHeight: 1.55 }}>
              לצרף לשאלות גם את הנתונים שלי באפליקציה - פרופיל, פציעות, תוכנית האימונים, אימונים אחרונים, משקל ותזונה - כדי לקבל תשובות מותאמות אישית.
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: 4 }}>
                לא נשלחים שם, אימייל או תמונות. אפשר לשנות בכל עת בהגדרות.
              </span>
            </span>
          </label>
          <p style={{ ...consentText, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            התשובות הן מידע כללי ואינן תחליף לרופא, דיאטנית או פיזיותרפיסט. בכאב חד, סחרחורת או לחץ בחזה - הפסק להתאמן ופנה לטיפול רפואי.
          </p>
          <button
            className="btn-primary"
            style={{ padding: '12px 0', marginTop: 4 }}
            onClick={() => onUpdateSettings({ ...settings, aiCoachConsentAt: Date.now(), aiCoachShareData: shareData })}
          >
            מסכים, בוא נתחיל
          </button>
          <button className="btn-secondary" style={{ padding: '10px 0' }} onClick={onClose}>
            לא עכשיו
          </button>
        </div>
      ) : (
        <>
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && !busy && (
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 6 }}>
                  שאל כל דבר על אימונים, תזונה והתקדמות.
                  {settings.aiCoachShareData !== false && ' אני רואה את התוכנית, האימונים והתזונה שלך.'}
                </p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} style={suggestionStyle}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} text={m.content} />
            ))}
            {busy &&
              (streaming ? (
                <Bubble role="assistant" text={streaming} />
              ) : (
                <div style={{ ...bubbleBase, ...assistantBubble, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
                  <Loader2 size={15} className="spin" /> חושב...
                </div>
              ))}
            {error && (
              <div style={{ alignSelf: 'center', background: 'var(--color-orange-bg)', borderRadius: 10, padding: '8px 12px', fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center' }}>
                {error}
              </div>
            )}
            {remaining !== null && remaining <= 2 && !busy && (
              <div style={{ alignSelf: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {remaining === 0 ? 'זו הייתה השאלה האחרונה להיום' : `נשארו ${remaining} שאלות להיום`}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              padding: '8px 12px',
              paddingBottom: 'calc(8px + var(--safe-bottom, env(safe-area-inset-bottom)))',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-nav)',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="שאל את המאמן..."
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                maxHeight: 120,
                minHeight: 40,
                padding: '10px 12px',
                borderRadius: 20,
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-surface-2)',
                color: 'var(--text-main)',
                fontSize: '16px',
                fontFamily: 'inherit',
                lineHeight: 1.35,
              }}
            />
            {busy ? (
              <button type="button" aria-label="עצירה" onClick={() => abortRef.current?.abort()} style={sendButton(true)}>
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button type="submit" aria-label="שליחה" disabled={!input.trim()} style={sendButton(!!input.trim())}>
                <ArrowUp size={19} />
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
};

const Bubble: React.FC<{ role: 'user' | 'assistant'; text: string }> = ({ role, text }) => (
  <div style={{ ...bubbleBase, ...(role === 'user' ? userBubble : assistantBubble) }}>
    {role === 'assistant' ? <RichText text={text} /> : text}
  </div>
);

const bubbleBase: React.CSSProperties = {
  maxWidth: '88%',
  padding: '9px 13px',
  borderRadius: 16,
  fontSize: '0.9rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
const userBubble: React.CSSProperties = { alignSelf: 'flex-start', background: 'var(--color-blue)', color: '#fff', borderBottomRightRadius: 4 };
const assistantBubble: React.CSSProperties = { alignSelf: 'flex-end', background: 'var(--bg-surface-2)', borderBottomLeftRadius: 4, whiteSpace: 'normal' };
const iconButton: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: 'none',
  borderRadius: '50%',
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};
const consentText: React.CSSProperties = { fontSize: '0.88rem', lineHeight: 1.65, margin: 0 };
const suggestionStyle: React.CSSProperties = {
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 14,
  padding: '11px 14px',
  textAlign: 'right',
  color: 'var(--text-main)',
  fontSize: '0.86rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const sendButton = (active: boolean): React.CSSProperties => ({
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: 'none',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: active ? 'var(--color-blue)' : 'var(--bg-surface-3)',
  color: active ? '#fff' : 'var(--text-dim)',
  cursor: active ? 'pointer' : 'default',
});
