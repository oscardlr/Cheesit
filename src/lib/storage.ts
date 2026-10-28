import { emptyData, type AppData } from './model';

const DB = 'entrenos-local';
const STORE = 'state';
const KEY = 'local';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se puede abrir el almacenamiento local'));
    request.onblocked = () => reject(new Error('El almacenamiento está bloqueado por otra pestaña'));
  });
}

export async function loadData(): Promise<AppData> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? emptyData());
      request.onerror = () => reject(request.error ?? new Error('No se pudieron recuperar los datos'));
    });
  } finally { db.close(); }
}

/** Resolve only after the IndexedDB transaction commits, not when put() is queued. */
let lastSave: Promise<void> = Promise.resolve();

export function saveData(data: AppData): Promise<void> {
  // Capture the requested state immediately and serialize writes from this tab.
  // An older, slower database open must not overwrite a more recent change.
  const snapshot = structuredClone(data);
  const save = lastSave.catch(() => undefined).then(() => commitData(snapshot));
  lastSave = save;
  return save;
}

async function commitData(data: AppData): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudieron guardar los datos'));
      tx.onabort = () => reject(tx.error ?? new Error('Se canceló el guardado'));
    });
  } finally { db.close(); }
}
