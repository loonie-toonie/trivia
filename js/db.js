/**
 * IndexedDB wrapper.
 *
 * Two object stores:
 *   kv    — arbitrary JSON, used for the whole game document under key "game"
 *   media — Blobs for uploaded images / video / audio, keyed by media id
 *
 * IndexedDB is used instead of localStorage because localStorage caps out
 * around 5 MB and cannot hold Blobs — a single trivia video would blow it.
 */

const DB_NAME = 'trivia-night';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_MEDIA = 'media';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab'));
  });

  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('transaction aborted'));
      })
  );
}

/* ── Key/value ─────────────────────────────────────────────── */

export const kvGet = (key) => tx(STORE_KV, 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => tx(STORE_KV, 'readwrite', (s) => s.put(value, key));
export const kvDel = (key) => tx(STORE_KV, 'readwrite', (s) => s.delete(key));

/* ── Media blobs ───────────────────────────────────────────── */

export const mediaGet = (id) => tx(STORE_MEDIA, 'readonly', (s) => s.get(id));
export const mediaPut = (id, blob) => tx(STORE_MEDIA, 'readwrite', (s) => s.put(blob, id));
export const mediaDel = (id) => tx(STORE_MEDIA, 'readwrite', (s) => s.delete(id));
export const mediaKeys = () => tx(STORE_MEDIA, 'readonly', (s) => s.getAllKeys());

/** Remove media blobs no longer referenced by any question. */
export async function mediaPrune(keepIds) {
  const keep = new Set(keepIds);
  const all = await mediaKeys();
  await Promise.all(all.filter((id) => !keep.has(id)).map(mediaDel));
}

/** Rough on-disk usage, when the browser exposes it. */
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
    return { used, quota };
  } catch {
    return null;
  }
}

/**
 * Ask the browser to make storage persistent so it is not evicted under
 * pressure. Best-effort: Safari and some Chromium profiles decline silently.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function isSupported() {
  return typeof indexedDB !== 'undefined';
}
