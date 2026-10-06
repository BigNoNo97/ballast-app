// תמונות התקדמות: עותק מקומי ב-IndexedDB (לא ב-localStorage, כדי לא לגמור את המכסה הקטנה שלו)
// ועותק בענן ב-Supabase Storage (bucket פרטי "progress-photos", כל משתמש רק בתיקייה שלו -
// ראו ה-policies ב-migrations). העותק המקומי משמש מטמון: במכשיר חדש / אחרי התקנה מחדש
// התמונה יורדת מהענן בפעם הראשונה שצריך אותה ונשמרת מקומית.
// העלאה או מחיקה שנכשלו (אין קליטה) נשמרות ברשימת "ממתינים" ונשלחות שוב בסנכרון הבא.

import { supabase } from './supabaseClient';
import { getCloudUser } from './cloudSync';

const DB_NAME = 'gym_tracker_photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.75;
const BUCKET = 'progress-photos';
const PENDING_KEY = 'gym_tracker_photo_sync_v1';
// תמונות שצולמו לפני שהיה גיבוי לענן נמצאות רק במכשיר - מעלים אותן פעם אחת לכל משתמש
const BACKFILL_KEY = 'gym_tracker_photo_backfill_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// מכווץ את התמונה לפני השמירה כדי לחסוך מקום
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas context')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob); else reject(new Error('compression failed'));
      }, 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

async function getLocalBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putLocalBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteLocalBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===================== ענן =====================

const cloudPath = (userId: string, id: string) => `${userId}/${id}.jpg`;

interface PendingPhotoOps {
  upload: string[];
  delete: string[];
}

function loadPending(): PendingPhotoOps {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { upload: parsed.upload || [], delete: parsed.delete || [] };
    }
  } catch {}
  return { upload: [], delete: [] };
}

function savePending(ops: PendingPhotoOps) {
  if (ops.upload.length === 0 && ops.delete.length === 0) localStorage.removeItem(PENDING_KEY);
  else localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
}

function updatePending(change: (ops: PendingPhotoOps) => void) {
  const ops = loadPending();
  change(ops);
  ops.upload = Array.from(new Set(ops.upload));
  ops.delete = Array.from(new Set(ops.delete));
  savePending(ops);
}

async function uploadToCloud(id: string): Promise<boolean> {
  const userId = getCloudUser();
  if (!userId) return false;
  const blob = await getLocalBlob(id);
  if (!blob) return true; // אין מה להעלות (נמחקה בינתיים) - לא נשאר בתור לנצח
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(cloudPath(userId, id), blob, { contentType: 'image/jpeg', upsert: false });
  // כבר קיימת בענן (למשל ניסיון קודם הצליח אבל התשובה לא הגיעה) - זו הצלחה
  if (error && !/exists|duplicate/i.test(error.message)) {
    console.warn('[photoStorage] upload failed - will retry', error);
    return false;
  }
  return true;
}

async function deleteFromCloud(id: string): Promise<boolean> {
  const userId = getCloudUser();
  if (!userId) return false;
  const { error } = await supabase.storage.from(BUCKET).remove([cloudPath(userId, id)]);
  if (error) {
    console.warn('[photoStorage] delete failed - will retry', error);
    return false;
  }
  return true;
}

let flushing: Promise<void> | null = null;
// הגיעה בקשה חדשה בזמן שסבב קודם רץ (למשל צילום תמונה בזמן הסנכרון של הכניסה) - מריצים
// סבב נוסף מיד בסיום, כדי שהפעולה החדשה לא תחכה לסנכרון הבא
let flushAgain = false;

export const PhotoStorage = {
  async savePhoto(id: string, file: File): Promise<void> {
    const blob = await compressImage(file);
    await putLocalBlob(id, blob);
    if (!getCloudUser()) return;
    updatePending((ops) => ops.upload.push(id));
    this.flushPending();
  },

  /** מקומי אם יש, אחרת מוריד מהענן ושומר מקומית. null = אין תמונה (או אין רשת כרגע) */
  async getPhotoUrl(id: string): Promise<string | null> {
    try {
      const local = await getLocalBlob(id);
      if (local) return URL.createObjectURL(local);
    } catch {}
    const userId = getCloudUser();
    if (!userId) return null;
    const { data, error } = await supabase.storage.from(BUCKET).download(cloudPath(userId, id));
    if (error || !data) return null;
    putLocalBlob(id, data).catch(() => {});
    return URL.createObjectURL(data);
  },

  async deletePhoto(id: string): Promise<void> {
    await deleteLocalBlob(id).catch(() => {});
    if (!getCloudUser()) return;
    updatePending((ops) => {
      ops.upload = ops.upload.filter((x) => x !== id);
      ops.delete.push(id);
    });
    this.flushPending();
  },

  /**
   * שולח לענן העלאות ומחיקות שממתינות. knownPhotoIds - כל התמונות שברשימה, כדי להעלות פעם אחת
   * גם תמונות ישנות שנשמרו לפני שהיה גיבוי (הן קיימות רק במכשיר הזה).
   */
  flushPending(knownPhotoIds?: string[]): Promise<void> {
    if (flushing) {
      flushAgain = true;
      return flushing;
    }
    flushAgain = false;
    flushing = (async () => {
      try {
        const userId = getCloudUser();
        if (!userId) return;
        if (knownPhotoIds && localStorage.getItem(BACKFILL_KEY) !== userId) {
          const localIds: string[] = [];
          for (const id of knownPhotoIds) {
            if (await getLocalBlob(id).catch(() => undefined)) localIds.push(id);
          }
          updatePending((ops) => ops.upload.push(...localIds));
          localStorage.setItem(BACKFILL_KEY, userId);
        }
        const ops = loadPending();
        for (const id of ops.upload) {
          if (getCloudUser() !== userId) return;
          if (await uploadToCloud(id)) updatePending((p) => (p.upload = p.upload.filter((x) => x !== id)));
        }
        for (const id of ops.delete) {
          if (getCloudUser() !== userId) return;
          if (await deleteFromCloud(id)) updatePending((p) => (p.delete = p.delete.filter((x) => x !== id)));
        }
      } finally {
        flushing = null;
        if (flushAgain) this.flushPending();
      }
    })();
    return flushing;
  },

  /** כמה פעולות על תמונות עוד לא הגיעו לענן */
  pendingCount(): number {
    const ops = loadPending();
    return ops.upload.length + ops.delete.length;
  },

  /** איפוס מלא: מוחק את כל התמונות של המשתמש בענן (גם כאלה שהועלו ממכשירים אחרים) */
  async deleteAllInCloud(): Promise<void> {
    const userId = getCloudUser();
    if (!userId) return;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
      if (error || !data || data.length === 0) return;
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(data.map((f) => `${userId}/${f.name}`));
      if (removeError) return;
    }
  },

  // מנקה את כל התמונות מהמכשיר (logout על מכשיר משותף / איפוס נתונים מלא) - בלי זה בלובים
  // נשארים "יתומים" ב-IndexedDB לצמיתות אחרי שה-metadata שמצביע עליהם כבר נמחק.
  // בענן הן נשארות (חוץ מבאיפוס, שמוחק גם שם) - ויורדות מחדש בכניסה הבאה.
  async clearAll(): Promise<void> {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(BACKFILL_KEY);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
