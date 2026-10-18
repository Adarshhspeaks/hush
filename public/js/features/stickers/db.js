// IndexedDB storage for custom client-side stickers
const DB_NAME = 'hush_stickers_db';
const DB_VERSION = 1;
const STORE_NAME = 'stickers';
export const MAX_CUSTOM_STICKERS = 60;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getSavedStickers() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to load custom stickers:', err);
    return [];
  }
}

export async function saveCustomSticker(blob, mime = 'image/webp') {
  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result >= MAX_CUSTOM_STICKERS) {
        return reject(
          new Error(`Sticker storage is full (max ${MAX_CUSTOM_STICKERS} stickers). Delete some to save new ones.`)
        );
      }
      const putReq = store.put({ hash, blob, mime, createdAt: Date.now() });
      putReq.onsuccess = () => resolve({ ok: true, hash });
      putReq.onerror = () => reject(putReq.error);
    };
    countReq.onerror = () => reject(countReq.error);
  });
}

export async function deleteCustomSticker(hash) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(hash);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
