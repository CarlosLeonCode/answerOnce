/**
 * Persists ONLY the FileSystemDirectoryHandle of the profile folder in
 * IndexedDB (handles are structured-cloneable). No personal data is stored here.
 */

// Legacy "hire" database name (the product's former name): renaming it would lose the saved folder handle.
const DB_NAME = 'hire';
const STORE = 'handles';
// Key and picker id (legacy "hire-vault") kept from earlier versions so existing installs keep their folder.
const KEY = 'vault-directory';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const directoryHandleStore = {
  async get(): Promise<FileSystemDirectoryHandle | null> {
    const value = await tx<unknown>('readonly', (s) => s.get(KEY));
    return (value as FileSystemDirectoryHandle | undefined) ?? null;
  },
  async set(handle: FileSystemDirectoryHandle): Promise<void> {
    await tx('readwrite', (s) => s.put(handle, KEY));
  },
  async clear(): Promise<void> {
    await tx('readwrite', (s) => s.delete(KEY));
  },
};

/** Opens the native directory picker. Must be called from a user gesture. */
export async function pickVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ id: 'hire-vault', mode: 'readwrite', startIn: 'documents' });
  await directoryHandleStore.set(handle);
  return handle;
}

/**
 * Ensures read/write permission for this session. requestPermission needs a
 * user gesture, so call this first thing inside a click handler.
 */
export async function ensureDirectoryPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  // Throws where prompting is not allowed (the panel framed inside a web page).
  return (await handle.requestPermission(opts).catch(() => 'denied')) === 'granted';
}
