import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Sparkles, X } from 'lucide-react';
import { Exercise } from '../types';
import { StorageService } from '../services/storage';
import { AI_IMPORT_ERROR_TEXT, AiImportError, importWithAi } from '../services/importers/aiImport';
import type { ImportResult } from '../services/importers/generic';

interface AiImportSheetProps {
  onClose: () => void;
  onImported: (summary: string) => void;
}

/** ייבוא מצילום של מחברת / צילום מסך, או מטקסט שהודבק: קריאה עם AI, תצוגה מקדימה, ואז ייבוא */
export const AiImportSheet: React.FC<AiImportSheetProps> = ({ onClose, onImported }) => {
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ result: ImportResult; unreadable: string; library: Exercise[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const library = StorageService.getExercises();
      const { result, unreadable } = await importWithAi({ images, text }, library);
      setPreview({ result, unreadable, library });
    } catch (e) {
      if (e instanceof AiImportError) {
        setError(e.code === 'unreadable' && e.detail ? `${AI_IMPORT_ERROR_TEXT.unreadable} ${e.detail}` : AI_IMPORT_ERROR_TEXT[e.code]);
      } else setError(AI_IMPORT_ERROR_TEXT.failed);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!preview) return;
    try {
      const { added, skipped } = StorageService.importExternalHistory(preview.result.workouts, preview.result.customExercises);
      onImported(`יובאו ${added} אימונים${skipped ? ` (${skipped} כבר היו קיימים ודולגו)` : ''}. הם מופיעים בהיסטוריה, בניתוח ובשיאים.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : AI_IMPORT_ERROR_TEXT.failed);
    }
  };

  const nameOf = (id: string) =>
    preview?.result.customExercises.find((e) => e.id === id)?.nameHe ?? preview?.library.find((e) => e.id === id)?.nameHe ?? id;
  const isNew = (id: string) => !!preview?.result.customExercises.some((e) => e.id === id);

  return (
    <div className="modal-overlay" style={{ zIndex: 240 }} onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'calc(var(--app-vh, 1vh) * 90)', overflowY: 'auto', textAlign: 'right' }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Sparkles size={18} color="var(--color-blue)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>ייבוא מצילום או טקסט</h3>
          <button
            onClick={onClose}
            aria-label="סגירה"
            style={{ border: 'none', background: 'var(--bg-surface-2)', color: 'var(--text-main)', width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {!preview ? (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              צלם עמוד ממחברת האימונים, צילום מסך מאפליקציה אחרת, או הדבק טקסט. ה-AI יקרא את התרגילים, המשקלים והחזרות, ותראה הכול לפני שמשהו נשמר. הקריאה
              נספרת כשאלה אחת ממכסת ה-AI החודשית. התמונה נשלחת לעיבוד ב-Anthropic ולא נשמרת.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {previews.map((src, i) => (
                <div key={src} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface-2)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                    aria-label="הסרת תמונה"
                    style={{ position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {images.length < 4 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ width: 72, height: 72, borderRadius: 10, border: '1.5px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700 }}
                >
                  <Camera size={20} />
                  תמונה
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                e.target.value = '';
                setImages((list) => [...list, ...picked].slice(0, 4));
              }}
            />

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 8000))}
              placeholder={'או הדבק כאן טקסט, למשל:\n12.10 חזה\nלחיצת חזה 80x8x3\nפרפר 20: 12, 12, 10'}
              rows={5}
              className="gym-input-box"
              style={{ width: '100%', textAlign: 'right', fontSize: '0.85rem', padding: 10, resize: 'vertical', marginBottom: 12 }}
            />

            {error && <div style={{ color: 'var(--color-red)', fontSize: '0.8rem', marginBottom: 10 }}>{error}</div>}
            <button className="btn-primary" style={{ width: '100%' }} disabled={busy || (!images.length && !text.trim())} onClick={read}>
              {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {busy ? 'קורא...' : 'קרא עם AI'}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              בדוק שהכול נקרא נכון. אפשר לערוך כל אימון אחרי הייבוא מההיסטוריה.
            </p>
            {preview.unreadable && (
              <div style={{ fontSize: '0.8rem', background: 'var(--color-orange-bg)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 10 }}>
                לא נקרא: {preview.unreadable}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {preview.result.workouts.map((w) => (
                <div key={w.id} style={{ background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                    {new Date(w.startTime).toLocaleDateString('he-IL')} · {w.title.replace(/^AI · /, '') || 'אימון'}
                  </div>
                  {w.exercises.map((x, i) => (
                    <div key={i} style={{ fontSize: '0.78rem', marginTop: 4, color: 'var(--text-main)' }}>
                      {nameOf(x.exerciseId)}
                      {isNew(x.exerciseId) && <span style={{ color: 'var(--color-orange)', fontWeight: 700 }}> (תרגיל חדש)</span>}
                      <span style={{ color: 'var(--text-muted)', direction: 'ltr', unicodeBidi: 'isolate' }}>
                        {' '}
                        {x.sets.map((s) => (s.weightKg ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {error && <div style={{ color: 'var(--color-red)', fontSize: '0.8rem', marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPreview(null)}>
                חזרה
              </button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={save}>
                ייבוא {preview.result.workouts.length} אימונים
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
