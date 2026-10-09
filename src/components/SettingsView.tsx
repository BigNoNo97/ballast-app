import React, { useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Vibrate,
  Smartphone,
  Download,
  Upload,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  Timer,
  LogOut,
  Heart,
  Flame,
  FileArchive,
  Loader2,
} from 'lucide-react';
import { UserSettings } from '../types';
import { StorageService } from '../services/storage';
import { AppleHealthService } from '../services/appleHealthService';
import { parseExternalExport } from '../services/importers';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onResetData: () => void;
  userEmail?: string;
  onLogout?: () => void;
  /** אחרי ייבוא היסטוריה מאפליקציה אחרת - לרענן את המסכים מהאחסון */
  onDataImported?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetData,
  userEmail,
  onLogout,
  onDataImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const externalInputRef = useRef<HTMLInputElement>(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalStatus, setExternalStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const handleToggleAppleHealth = async () => {
    setHealthError(null);

    if (settings.appleHealthSyncEnabled) {
      // כיבוי הסנכרון מהצד שלנו בלבד - את ההרשאה עצמה אפשר לבטל רק דרך אפליקציית ההגדרות של אייפון
      onUpdateSettings({ ...settings, appleHealthSyncEnabled: false });
      return;
    }

    setHealthBusy(true);
    const result = await AppleHealthService.requestPermissions();
    setHealthBusy(false);

    if (result.success) {
      onUpdateSettings({ ...settings, appleHealthSyncEnabled: true });
    } else {
      setHealthError(result.error || 'לא ניתן היה להתחבר ל-Apple Health.');
    }
  };

  const handleExport = () => {
    const jsonStr = StorageService.exportData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ironlog_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = StorageService.importData(content);
        if (ok) {
          setImportStatus('הנתונים שוחזרו בהצלחה! מרענן...');
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          setImportStatus('שגיאה בייבוא הקובץ. אנא ודא שזהו קובץ גיבוי תקין.');
        }
      }
    };
    reader.readAsText(file);
  };

  // ייבוא מאפליקציה אחרת (Planfit): מציגים קודם מה נמצא בקובץ, ומייבאים רק אחרי אישור
  const handleExternalSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (list.length === 0) return;
    setExternalBusy(true);
    setExternalStatus(null);
    try {
      const known = new Set(StorageService.getExercises().map((x) => x.id));
      const result = await parseExternalExport(list, known);
      const r = result.report;
      const created = [...r.customExercisesCreated, ...r.unknownExercisesAutoCreated];
      const lines = [
        `נמצא ייצוא של ${result.source}:`,
        `• ${r.workouts} אימונים`,
        `• ${r.sets.toLocaleString('he-IL')} סטים ב-${r.exerciseEntries - r.cardioEntries} תרגילים`,
        r.cardioEntries > 0 ? `• ${r.cardioEntries} פעילויות קרדיו (יירשמו בהערת האימון עם משך הזמן)` : '',
        created.length > 0 ? `• ${created.length} תרגילים שאין להם מקבילה ייווצרו כתרגילים אישיים` : '',
        r.skippedFiles.length > 0 ? `\nלא ייובאו (אין להם מקום ב-Ballast): צעדים יומיים ופרטי פרופיל.` : '',
        '\nהאימונים יתווספו להיסטוריה שלך (שום דבר קיים לא יימחק). לייבא?',
      ].filter(Boolean);
      if (!window.confirm(lines.join('\n'))) return;
      const { added, skipped } = StorageService.importExternalHistory(result.workouts, result.customExercises);
      onDataImported?.();
      setExternalStatus({
        ok: true,
        text:
          `יובאו ${added} אימונים מ-${result.source}` +
          (skipped > 0 ? ` (${skipped} כבר היו קיימים ודולגו)` : '') +
          '. הם מופיעים בהיסטוריה, בניתוח ובשיאים.',
      });
    } catch (err) {
      setExternalStatus({ ok: false, text: err instanceof Error ? err.message : 'הייבוא נכשל.' });
    } finally {
      setExternalBusy(false);
    }
  };

  const restTimeOptions = [45, 60, 90, 120, 150, 180];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>הגדרות</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          התאמה אישית של האפליקציה וגיבוי נתונים
        </p>
      </div>

      {/* App Preferences */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 14 }}>העדפות אימון</h3>

        {/* Theme Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {settings.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>ערכת נושא</span>
          </div>

          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface-2)', padding: 3, borderRadius: 'var(--radius-full)' }}>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
              style={{
                background: settings.theme === 'dark' ? 'var(--color-blue)' : 'transparent',
                color: settings.theme === 'dark' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              כהה (חדר כושר)
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, theme: 'light' })}
              style={{
                background: settings.theme === 'light' ? 'var(--color-blue)' : 'transparent',
                color: settings.theme === 'light' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              בהיר
            </button>
          </div>
        </div>

        {/* Default Rest Time */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>זמן מנוחה ברירת מחדל בין סטים</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-blue)' }}>
              {settings.defaultRestSeconds} שניות
            </span>
          </div>

          <div className="filter-chip-row">
            {restTimeOptions.map((secs) => (
              <button
                key={secs}
                className={`filter-chip ${settings.defaultRestSeconds === secs ? 'active' : ''}`}
                onClick={() => onUpdateSettings({ ...settings, defaultRestSeconds: secs })}
              >
                {secs} שנ׳
              </button>
            ))}
          </div>
        </div>

        {/* Auto Rest Timer on Set Completion Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Timer size={18} color="var(--color-blue)" />
            <div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block' }}>
                טיימר מנוחה אוטומטי בסיום סט
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                מקפיץ את הטיימר אוטומטית בכל סימון ✓
              </span>
            </div>
          </div>

          <button
            className={`btn-secondary`}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: settings.autoRestTimerEnabled ? 'rgba(110, 124, 245, 0.15)' : 'var(--bg-surface-2)',
              color: settings.autoRestTimerEnabled ? 'var(--color-blue)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              fontWeight: 700,
            }}
            onClick={() =>
              onUpdateSettings({
                ...settings,
                autoRestTimerEnabled: !settings.autoRestTimerEnabled,
              })
            }
          >
            {settings.autoRestTimerEnabled ? 'פעיל ✓' : 'כבוי'}
          </button>
        </div>

        {/* Sound Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {settings.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>צפצוף טיימר מנוחה</span>
          </div>

          <button
            className={`btn-secondary`}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: settings.soundEnabled ? 'var(--color-green-bg)' : 'var(--bg-surface-2)',
              color: settings.soundEnabled ? 'var(--color-green)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
            onClick={() => onUpdateSettings({ ...settings, soundEnabled: !settings.soundEnabled })}
          >
            {settings.soundEnabled ? 'פעיל ✓' : 'כבוי'}
          </button>
        </div>

        {/* Desktop iPhone Frame Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={18} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>מסגרת אייפון במחשב</span>
          </div>

          <button
            className={`btn-secondary`}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: settings.showIphoneFrameOnDesktop ? 'var(--color-blue-bg)' : 'var(--bg-surface-2)',
              color: settings.showIphoneFrameOnDesktop ? 'var(--color-blue)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
            onClick={() =>
              onUpdateSettings({
                ...settings,
                showIphoneFrameOnDesktop: !settings.showIphoneFrameOnDesktop,
              })
            }
          >
            {settings.showIphoneFrameOnDesktop ? 'מוצגת' : 'מסך רחב'}
          </button>
        </div>
      </div>

      {/* התאמת תזונה אדפטיבית - מעדכן יעד קלוריות/מאקרו לפי מעקב משקל בפועל, לא נוסחה סטטית */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>תזונה אדפטיבית</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45 }}>
          כשיש מספיק היסטוריית משקל ותזונה, נציע לעדכן את יעד הקלוריות/מאקרו שלך לפי איך שהגוף שלך הגיב בפועל - עם אישור שלך בכל פעם, לא באופן שקוף.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={18} color="var(--color-orange)" />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>הצעות עדכון יעד אוטומטיות</span>
          </div>
          <button
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              background: settings.nutritionAutoAdjustEnabled !== false ? 'var(--color-green-bg)' : 'var(--bg-surface-2)',
              color: settings.nutritionAutoAdjustEnabled !== false ? 'var(--color-green)' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
            onClick={() => onUpdateSettings({ ...settings, nutritionAutoAdjustEnabled: settings.nutritionAutoAdjustEnabled === false })}
          >
            {settings.nutritionAutoAdjustEnabled !== false ? 'פעיל ✓' : 'כבוי'}
          </button>
        </div>
      </div>

      {/* Apple Health Sync - מוצג רק באפליקציית ה-iOS הנייטיבית, אין טעם להראות את זה ב-PWA/דסקטופ */}
      {AppleHealthService.isSupported() && (
        <div className="ios-card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>Apple Health</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.45 }}>
            סנכרון אוטומטי של אימונים שהושלמו ומדידות משקל לאפליקציית הבריאות של אפל.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Heart size={18} color="var(--color-red)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>סנכרון עם Apple Health</span>
            </div>

            <button
              className="btn-secondary"
              disabled={healthBusy}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: settings.appleHealthSyncEnabled ? 'var(--color-green-bg)' : 'var(--bg-surface-2)',
                color: settings.appleHealthSyncEnabled ? 'var(--color-green)' : 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                opacity: healthBusy ? 0.6 : 1,
              }}
              onClick={handleToggleAppleHealth}
            >
              {healthBusy ? 'מתחבר...' : settings.appleHealthSyncEnabled ? 'פעיל ✓' : 'כבוי'}
            </button>
          </div>

          {healthError && (
            <div
              style={{
                marginTop: 10,
                background: 'var(--color-red-bg)',
                color: 'var(--color-red)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
              }}
            >
              {healthError}
            </div>
          )}
        </div>
      )}

      {/* Backup & Data Management */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>גיבוי ושחזור נתונים</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          כל המידע שלך נשמר מקומית על המכשיר. מומלץ לייצא גיבוי מדי פעם.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={16} />
            ייצוא גיבוי לקובץ
          </button>

          <button className="btn-secondary" onClick={handleImportClick}>
            <Upload size={16} />
            ייבוא משחזור
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        <button
          className="btn-secondary"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={() => externalInputRef.current?.click()}
          disabled={externalBusy}
        >
          {externalBusy ? <Loader2 size={16} className="spin" /> : <FileArchive size={16} />}
          ייבוא מאפליקציה אחרת (Planfit)
        </button>
        <input
          type="file"
          ref={externalInputRef}
          accept=".zip,.csv,application/zip,text/csv"
          multiple
          style={{ display: 'none' }}
          onChange={handleExternalSelected}
        />
        {externalStatus && (
          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              color: externalStatus.ok ? 'var(--color-green)' : 'var(--color-red)',
              textAlign: 'center',
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            {externalStatus.text}
          </div>
        )}

        {importStatus && (
          <div
            style={{
              background: 'var(--bg-surface-2)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              color: 'var(--color-green)',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            {importStatus}
          </div>
        )}

        <button
          className="btn-secondary"
          style={{ width: '100%', color: 'var(--color-red)', fontSize: '0.8rem' }}
          onClick={() => {
            if (window.confirm('האם אתה בטוח שברצונך לאפס את כל הנתונים לנתוני ברירת מחדל?')) {
              onResetData();
            }
          }}
        >
          <RotateCcw size={14} />
          איפוס נתונים לברירת מחדל
        </button>
      </div>

      {/* Account */}
      {onLogout && (
        <div className="ios-card" style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 10 }}>חשבון</h3>
          {userEmail && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              מחובר כ-{userEmail}
            </p>
          )}
          <button
            className="btn-secondary"
            style={{ color: 'var(--color-red)' }}
            onClick={onLogout}
          >
            <LogOut size={16} />
            התנתק
          </button>
        </div>
      )}

      {/* Attribution for exercise images (CC-BY-SA) */}
      <div className="ios-card" style={{ padding: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 6 }}>קרדיטים</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          תמונות ההדגמה של התרגילים באפליקציה לקוחות מהמאגר הפתוח של{' '}
          <a href="https://wger.de" target="_blank" rel="noreferrer" style={{ color: 'var(--color-blue)' }}>wger.de</a>
          {' '}ומופצות תחת רישיון Creative Commons BY-SA. תודה לתורמים: 54str, AlucardEvil40, anto.kreegyr, ataraxie67, BFad07, benjamin.yildiz, carlos3c, clafal, cshep442, fabrice, flori, Franpol, lhegedus, nate303303, nishant0712, novadani, polloperro, roneydya, sebk, sistab2, Tierrasverdes, YYCfit ולצוות wger.de.
        </p>
      </div>
    </div>
  );
};
