import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Plus, Trash2, X, Camera } from 'lucide-react';
import { ProgressPhoto } from '../types';
import { StorageService } from '../services/storage';
import { PhotoStorage } from '../services/photoStorage';

interface ProgressPhotosViewProps {
  onBack: () => void;
}

export const ProgressPhotosView: React.FC<ProgressPhotosViewProps> = ({ onBack }) => {
  const [photos, setPhotos] = useState<ProgressPhoto[]>(() => StorageService.getProgressPhotos());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    (async () => {
      const entries = await Promise.all(
        photos.map(async (p) => {
          const url = await PhotoStorage.getPhotoUrl(p.id);
          if (url) {
            // ה-effect הזה כבר הוחלף (photos השתנה שוב) לפני שההבטחה הזו הספיקה להיפתר -
            // ה-cleanup של המופע הקודם כבר רץ (על objectUrls שהיה עדיין ריק באותו רגע),
            // אז אף אחד לא ישחרר את ה-URL הזה - משחררים אותו כאן מיד במקום שידלוף לצמיתות.
            if (cancelled) {
              URL.revokeObjectURL(url);
              return [p.id, null] as const;
            }
            objectUrls.push(url);
          }
          return [p.id, url] as const;
        })
      );
      if (!cancelled) {
        const map: Record<string, string> = {};
        entries.forEach(([id, url]) => { if (url) map[id] = url; });
        setUrls(map);
      }
    })();

    return () => {
      cancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photos]);

  const refresh = () => setPhotos(StorageService.getProgressPhotos());

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const id = `photo-${Date.now()}`;
    await PhotoStorage.savePhoto(id, file);
    StorageService.saveProgressPhotoMeta({ id, date: Date.now() });
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('למחוק את התמונה הזו?')) return;
    await PhotoStorage.deletePhoto(id);
    StorageService.deleteProgressPhotoMeta(id);
    setViewingId(null);
    refresh();
  };

  const viewingPhoto = photos.find((p) => p.id === viewingId);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 70, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(var(--safe-top) + 14px) 16px 14px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ChevronLeft size={24} />
          </button>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>תמונות התקדמות</h2>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ background: 'var(--color-blue)', border: 'none', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
        >
          <Plus size={20} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px calc(var(--safe-bottom) + 24px)' }}>
        {photos.length === 0 ? (
          <div className="ios-card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Camera size={28} style={{ marginBottom: 8, opacity: 0.6 }} />
            <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>עדיין אין תמונות התקדמות. תמונה כל כמה שבועות עוזרת לראות שינויים שקשה להבחין בהם יום-יום.</p>
            <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px', margin: '0 auto' }} onClick={() => fileInputRef.current?.click()}>
              <Plus size={16} /> הוספת תמונה ראשונה
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {photos.map((p) => (
              <button
                key={p.id}
                onClick={() => setViewingId(p.id)}
                style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: 'none', padding: 0, background: 'var(--bg-surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {urls[p.id] ? (
                  <img src={urls[p.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  // עוד יורדת מהענן, או שאין כרגע רשת
                  <Camera size={20} style={{ opacity: 0.35, color: 'var(--text-muted)' }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewingPhoto && (
        <div
          onClick={() => setViewingId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 80, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'calc(var(--safe-top) + 14px) 16px 14px 16px' }}>
            <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
              {new Date(viewingPhoto.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(viewingPhoto.id); }} style={{ background: 'transparent', border: 'none', color: 'var(--color-red)', cursor: 'pointer', display: 'flex' }}>
                <Trash2 size={20} />
              </button>
              <button onClick={() => setViewingId(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex' }}>
                <X size={22} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            {urls[viewingPhoto.id] && (
              <img
                src={urls[viewingPhoto.id]}
                alt=""
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
