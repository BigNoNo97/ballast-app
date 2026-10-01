import React, { useEffect, useState } from 'react';
import { Dumbbell, Mail, Lock, User, Loader2, Sparkles, Check } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';

// ב-iOS/Android, ספקי OAuth (בעיקר Google) חוסמים התחברות בתוך WebView מוטמע -
// חייבים לפתוח דפדפן חיצוני אמיתי ולחזור לאפליקציה דרך URL scheme מותאם-אישית
// (נתפס ב-App.tsx's appUrlOpen listener), ולא לסמוך על ניווט-חזרה רגיל בדף.
const NATIVE_OAUTH_REDIRECT = 'co.brainslead.ballast://auth-callback';

const GoogleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.88-3c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.92H1.3v3.09A11.99 11.99 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.31 14.32a7.2 7.2 0 0 1 0-4.64V6.59H1.3a12 12 0 0 0 0 10.82l4.01-3.09Z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.3 6.59l4.01 3.09C6.25 6.85 8.89 4.75 12 4.75Z" />
  </svg>
);

const AppleIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path
      fill="#fff"
      d="M16.365 1.43c0 1.14-.468 2.033-1.11 2.68-.673.687-1.79 1.207-2.75 1.14-.13-1.1.42-2.07 1.07-2.72.72-.75 1.98-1.32 2.79-1.1Zm2.79 6.5c-1.54.06-2.36.9-3.53.9-1.19 0-2.13-.87-3.5-.85-1.8.03-3.46 1.04-4.38 2.65-1.87 3.24-.48 8.03 1.34 10.66.89 1.29 1.95 2.72 3.34 2.67 1.34-.05 1.84-.86 3.46-.86 1.62 0 2.06.86 3.48.83 1.44-.02 2.35-1.3 3.24-2.6.72-1.06 1.16-2.15 1.4-2.87-3.68-1.4-4.24-6.34-.6-8.05-1.06-1.35-2.56-1.5-3.2-1.48Z"
    />
  </svg>
);

export const AuthView: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  // אם המשתמש חוזר לאפליקציה מהדפדפן החיצוני בלי להשלים התחברות (ביטל/חזר עם כפתור
  // "חזרה") - מאפסים את מצב הטעינה, אחרת הכפתור נשאר תקוע עם ספינר לצמיתות.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) setOauthLoading(null);
    });
    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, []);

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);
    const { error: demoError } = await supabase.auth.signInWithPassword({
      email: 'test@test.com',
      password: '123456',
    });
    if (demoError) {
      setError('החשבון הדמו לא זמין כרגע: ' + demoError.message);
      setDemoLoading(false);
    }
    // בהצלחה - זה בדיוק אותו flow של התחברות רגילה, אז ה-sync לענן קורה אוטומטית
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError(null);
    setOauthLoading(provider);
    const isNative = Capacitor.isNativePlatform();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: isNative ? NATIVE_OAUTH_REDIRECT : window.location.origin,
        skipBrowserRedirect: isNative,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setOauthLoading(null);
      return;
    }
    if (isNative && data.url) {
      await Browser.open({ url: data.url });
    }
    // בהצלחה - הדפדפן עובר לספק ואז חוזר לכאן אוטומטית (באינטרנט ישירות, באפליקציה
    // דרך appUrlOpen ב-App.tsx), אין צורך בטיפול נוסף כאן
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('נא למלא אימייל וסיסמה.');
      return;
    }
    // הסף המחמיר (8) חל רק בהרשמה - לא על התחברות, כדי לא לנעול בטעות משתמשים קיימים
    // שכבר נרשמו עם סיסמה קצרה יותר מלפני שהסף הזה הוחמר.
    if (mode === 'signup' && password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('נא למלא שם מלא.');
      return;
    }
    if (mode === 'signup' && !agreedToTerms) {
      setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות כדי להירשם.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;
        setSignupDone(true);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'משהו השתבש, נסה שוב.';
      if (msg.includes('Invalid login credentials')) {
        setError('אימייל או סיסמה שגויים.');
      } else if (msg.includes('User already registered')) {
        setError('כבר יש חשבון עם האימייל הזה - נסה להתחבר במקום.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (signupDone) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={logoWrap}>
            <Dumbbell size={32} color="var(--color-blue)" />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 10 }}>נרשמת בהצלחה!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 20 }}>
            שלחנו לך מייל אימות ל-{email}. תלחץ על הקישור במייל, ואז תוכל להתחבר.
          </p>
          <button
            className="btn-secondary"
            style={{ padding: '10px 24px' }}
            onClick={() => {
              setSignupDone(false);
              setMode('login');
            }}
          >
            חזרה להתחברות
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={logoWrap}>
            <Dumbbell size={32} color="var(--color-blue)" />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Ballast</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            {mode === 'login' ? 'התחבר כדי לראות את הנתונים שלך' : 'צור חשבון כדי להתחיל לעקוב'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={oauthLoading !== null}
          style={appleButtonStyle}
        >
          {oauthLoading === 'apple' ? <Loader2 size={18} className="spin" color="#fff" /> : <AppleIcon />}
          המשך עם Apple
        </button>

        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={oauthLoading !== null}
          style={{ ...oauthButtonStyle, marginBottom: 20 }}
        >
          {oauthLoading === 'google' ? <Loader2 size={18} className="spin" /> : <GoogleIcon />}
          המשך עם Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>או עם אימייל</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        {mode === 'signup' && (
          <div style={fieldWrap}>
            <User size={18} color="var(--text-muted)" />
            <input
              type="text"
              autoCapitalize="words"
              placeholder="שם מלא"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
              dir="rtl"
            />
          </div>
        )}

        <div style={fieldWrap}>
          <Mail size={18} color="var(--text-muted)" />
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="אימייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            dir="ltr"
          />
        </div>

        <div style={fieldWrap}>
          <Lock size={18} color="var(--text-muted)" />
          <input
            type="password"
            placeholder={mode === 'signup' ? 'סיסמה (8 תווים לפחות)' : 'סיסמה'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            dir="ltr"
          />
        </div>

        {mode === 'signup' && (
          <button
            type="button"
            onClick={() => setAgreedToTerms((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: 'transparent',
              border: 'none',
              padding: '4px 2px 14px',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'start',
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                flexShrink: 0,
                marginTop: 1,
                background: agreedToTerms ? 'var(--color-blue)' : 'transparent',
                border: agreedToTerms ? 'none' : '1.5px solid var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {agreedToTerms && <Check size={13} color="#fff" strokeWidth={3} />}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              אני מסכימ/ה ל
              <a
                href="/terms.html"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-blue)', fontWeight: 700 }}
              >
                תנאי השימוש
              </a>{' '}
              ול
              <a
                href="/privacy.html"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'var(--color-blue)', fontWeight: 700 }}
              >
                מדיניות הפרטיות
              </a>
            </span>
          </button>
        )}

        {error && (
          <div style={{ color: 'var(--color-red)', fontSize: '0.82rem', marginBottom: 14, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          style={{ width: '100%', marginBottom: 14 }}
          disabled={loading || (mode === 'signup' && !agreedToTerms)}
        >
          {loading ? (
            <Loader2 size={18} className="spin" />
          ) : mode === 'login' ? (
            'התחבר'
          ) : (
            'הרשם'
          )}
        </button>

        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {mode === 'login' ? (
            <>
              אין לך חשבון?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                style={linkButtonStyle}
              >
                הרשם עכשיו
              </button>
            </>
          ) : (
            <>
              כבר יש לך חשבון?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                style={linkButtonStyle}
              >
                התחבר
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>או</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={demoLoading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'transparent',
            border: '1px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {demoLoading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          לשימוש בחשבון דמו
        </button>
      </form>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 20px',
};

const oauthButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: 'var(--bg-surface-1)',
  color: 'var(--text-main)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: 10,
};

// עיצוב "התחבר עם Apple" הוא קבוע (שחור עם טקסט לבן) בכל ערכת נושא -
// זו אחת מסגנונות הכפתור הרשמיים שאפל מחייבת, לא צבע מהמערכת שלנו.
// הגבול קבוע (לא var(--border-subtle)) כי ברקע הכהה שלנו הוא כמעט שחור בעצמו -
// גבול תלוי-ערכת-נושא שם היה נבלע לגמרי והכפתור נראה "נעלם".
const appleButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: '#000',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  fontSize: '0.9rem',
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: 10,
};

const logoWrap: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 20,
  background: 'var(--bg-surface-1)',
  border: '1px solid var(--border-subtle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 14px auto',
};

const fieldWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-main)',
  fontSize: '0.95rem',
  textAlign: 'right',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-blue)',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: '0.85rem',
  padding: 0,
};
