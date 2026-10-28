import { emptyData, snapshotLoadConventions, type AppData } from './model';

const DB = 'entrenos-local';
const STORE = 'state';
const KEY = 'local';
const REVISION_KEY = 'local-revision';
const CHANGE_KEY = 'cheesit-storage-revision';

export class StorageConflictError extends Error {
  constructor() {
    super('Otra pestaña ha guardado cambios. Exporta lo pendiente y recarga esta pestaña antes de seguir editando.');
    this.name = 'StorageConflictError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error('No se puede abrir el almacenamiento local'));
    request.onblocked = () => reject(new Error('El almacenamiento está bloqueado por otra pestaña'));
  });
}

/** Each browser tab has its own expected revision; IDB serializes the atomic compare-and-write. */
export function createStorageClient(onCommit?: (revision: number) => void) {
  let revision: number | undefined;
  let pending: AppData | null = null;
  let lastSave: Promise<void> = Promise.resolve();
  const inflight = new WeakMap<AppData, Promise<void>>();

  async function loadData(): Promise<AppData> {
    const db = await openDatabase();
    try {
      const stored = await new Promise<{ data: AppData; revision: number }>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const data = tx.objectStore(STORE).get(KEY);
        const currentRevision = tx.objectStore(STORE).get(REVISION_KEY);
        tx.oncomplete = () => resolve({ data: data.result ?? emptyData(), revision: currentRevision.result ?? 0 });
        tx.onerror = () => reject(tx.error ?? new Error('No se pudieron recuperar los datos'));
        tx.onabort = () => reject(tx.error ?? new Error('Se canceló la lectura de los datos'));
      });
      revision = stored.revision;
      pending = null;
      // Freeze the meaning of legacy loads before later profile edits can reinterpret them.
      return snapshotLoadConventions(stored.data);
    } finally { db.close(); }
  }

  function stageData(data: AppData) {
    pending = data;
  }

  async function commitData(data: AppData): Promise<void> {
    if (revision === undefined) throw new Error('Carga los datos locales antes de guardar.');
    const db = await openDatabase();
    try {
      const nextRevision = await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' });
        const store = tx.objectStore(STORE);
        let conflict = false;
        let next = revision! + 1;
        const current = store.get(REVISION_KEY);
        current.onsuccess = () => {
          if ((current.result ?? 0) !== revision) { conflict = true; tx.abort(); return; }
          next = revision! + 1;
          store.put(data, KEY);
          store.put(next, REVISION_KEY);
        };
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => reject(tx.error ?? new Error('No se pudieron guardar los datos'));
        tx.onabort = () => reject(conflict ? new StorageConflictError() : tx.error ?? new Error('Se canceló el guardado'));
      });
      revision = nextRevision;
      // A notification failure must never turn an already committed write into a reported failure.
      try { onCommit?.(nextRevision); } catch {}
    } finally { db.close(); }
  }

  /** Resolves only after the complete transaction commits. A failed save remains available to retry/export. */
  function saveData(data: AppData): Promise<void> {
    stageData(data);
    const existing = inflight.get(data);
    if (existing) return existing;
    // Snapshot before any asynchronous work so later UI edits cannot mutate a queued write.
    const snapshot = structuredClone(data);
    const save = lastSave.catch(() => undefined).then(() => commitData(snapshot)).then(() => {
      if (pending === data) pending = null;
    });
    inflight.set(data, save);
    // Both branches remove the in-flight entry without creating an unhandled rejecting promise.
    void save.then(() => inflight.delete(data), () => inflight.delete(data));
    lastSave = save;
    return save;
  }

  return {
    loadData, saveData, stageData,
    flushData: () => pending ? saveData(pending) : lastSave,
    hasPendingData: () => pending !== null,
    getPendingData: () => pending,
    getRevision: () => revision,
  };
}

const listeners = new Set<(revision: number) => void>();
let channel: BroadcastChannel | undefined;
let listening = false;
function listenForChanges() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const notify = (revision: unknown) => {
    // An already-observed commit may arrive late through either advisory channel.
    if (typeof revision === 'number' && revision > (client.getRevision() ?? -1)) listeners.forEach(listener => listener(revision));
  };
  if ('BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANGE_KEY);
      channel.onmessage = event => notify(event.data?.revision);
    } catch { /* Storage events and the atomic IDB check still coordinate this browser. */ }
  }
  window.addEventListener('storage', event => {
    if (event.key !== CHANGE_KEY || !event.newValue) return;
    try { notify(JSON.parse(event.newValue).revision); } catch { /* The IDB revision remains authoritative. */ }
  });
}

const client = createStorageClient(revision => {
  listenForChanges();
  // Coordination is advisory; the transaction revision check remains safe when either API is unavailable.
  try { channel?.postMessage({ revision }); } catch {}
  try { if (typeof window !== 'undefined') localStorage.setItem(CHANGE_KEY, JSON.stringify({ revision, at: Date.now() })); } catch {}
});
export const { loadData, saveData, stageData, flushData, hasPendingData, getPendingData } = client;
export function subscribeStorageChanges(listener: (revision: number) => void): () => void {
  listenForChanges(); listeners.add(listener);
  return () => { listeners.delete(listener); };
}
