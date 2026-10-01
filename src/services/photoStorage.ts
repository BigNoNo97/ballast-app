// שמירת תמונות התקדמות ב-IndexedDB (לא ב-localStorage, כדי לא לגמור את המכסה הקטנה שלו)

const DB_NAME = 'gym_tracker_photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';
const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.75;

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

export const PhotoStorage = {
  async savePhoto(id: string, file: File): Promise<void> {
    const blob = await compressImage(file);
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getPhotoUrl(id: string): Promise<string | null> {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return blob ? URL.createObjectURL(blob) : null;
  },

  async deletePhoto(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  // מנקה את כל התמונות (logout על מכשיר משותף / איפוס נתונים מלא) - בלי זה בלובים
  // נשארים "יתומים" ב-IndexedDB לצמיתות אחרי שה-metadata שמצביע עליהם כבר נמחק.
  async clearAll(): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
