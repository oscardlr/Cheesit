import { emptyData, snapshotLoadConventions, type AppData } from '../model';
import { validateData } from '../backup';
import { StorageConflictError } from '../storage';
import { blankDocument, documentAfter, mergeDocuments, same, type AccountDocument, type CloudSnapshot } from './document';
import { RemoteConnectionError } from './errors';
import { resetAccountData } from '../account-reset';

const DB = 'cheesit-accounts-v2';
export class RemoteValidationError extends Error {}
export type Outbox = { operationId: string; expectedRevision: number; document: AccountDocument };
export type AccountCache = { version: number; base: CloudSnapshot; draft: AccountDocument; outbox?: Outbox; conflict?: CloudSnapshot; tabConflict?: { base: AccountDocument; local: AccountDocument; server: AccountDocument }; verified: boolean };
export type Transport = { download: () => Promise<CloudSnapshot>; apply: (op: Outbox) => Promise<{ status: 'applied' | 'conflict'; snapshot: CloudSnapshot }> };
export type SyncStatus = 'saving' | 'synced' | 'pending' | 'error' | 'conflict';
export const syncStatusLabel: Record<SyncStatus, string> = { saving: 'Guardando…', synced: 'Sincronizado con tu cuenta', pending: 'Pendiente de conexión · copia en este dispositivo', error: 'Error de guardado · reintenta', conflict: 'Hay cambios de otro dispositivo por revisar' };
const initial = (): AccountCache => ({ version: 0, base: { ...blankDocument(), revision: 0 }, draft: blankDocument(), verified: false });
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('accounts'); request.result.createObjectStore('meta'); };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cierra las otras pestañas y vuelve a intentarlo.'));
  });
}
export async function readCache(owner: string): Promise<AccountCache | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('accounts'); const req = tx.objectStore('accounts').get(owner); tx.oncomplete = () => resolve(req.result); tx.onabort = tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function writeCache(owner: string, expected: number, next: AccountCache): Promise<AccountCache> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite', { durability: 'strict' });
    const store = tx.objectStore('accounts'); const req = store.get(owner); let conflict = false;
    const value = structuredClone({ ...next, version: expected + 1 });
    req.onsuccess = () => { if ((req.result?.version ?? 0) !== expected) { conflict = true; tx.abort(); } else store.put(value, owner); };
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(conflict ? new StorageConflictError() : tx.error ?? new Error('No se ha podido guardar.'));
  }); } finally { db.close(); }
}
export async function metadata<T>(key: string, value?: T): Promise<T | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('meta', value === undefined ? 'readonly' : 'readwrite', { durability: 'strict' });
    const store = tx.objectStore('meta'); const req = value === undefined ? store.get(key) : store.put(value, key);
    tx.oncomplete = () => resolve(value === undefined ? req.result : value); tx.onabort = tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}

/** A store instance is bound to one account for its entire lifetime. It never
 * consults a mutable global owner when saving asynchronous work. */
export class AccountStore {
  private cache: AccountCache = initial();
  private pending: AppData | null = null;
  private view = blankDocument();
  private stages = new WeakMap<AppData, number>();
  private stageSequence = 0;
  private committedSequence = 0;
  private refreshRequired = false;
  private serial: Promise<unknown> = Promise.resolve();
  private active = true;
  private closing = false;
  private listeners = new Set<() => void>();
  private tabListeners = new Set<(version: number) => void>();
  private channel?: BroadcastChannel;
  status: SyncStatus = 'pending';
  error = '';
  constructor(readonly owner: string, private transport: Transport) {}
  async initialize() {
    this.cache = await readCache(this.owner) ?? initial();
    this.view = structuredClone(this.cache.draft);
    this.status = (this.cache.conflict || this.cache.tabConflict) ? 'conflict' : 'pending';
    if (typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined') {
      this.channel = new BroadcastChannel(`cheesit-account:${this.owner}`);
      this.channel.onmessage = event => { if (event.data > this.cache.version) this.tabListeners.forEach(fn => fn(event.data)); };
    }
    return this;
  }
  dispose() { this.active = false; this.channel?.close(); }
  async closePreservingPending() { this.closing = true; try { await this.flushData(); } finally { this.dispose(); } }
  private assertActive() { if (!this.active) throw new Error('La sesión ha cambiado. Vuelve a abrir tu cuenta.'); }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const work = this.serial.catch(() => undefined).then(() => { this.assertActive(); return fn(); });
    this.serial = work; return work;
  }
  private notify() { this.listeners.forEach(fn => fn()); }
  private async commit(value: AccountCache) {
    this.assertActive(); if (same(this.cache, value)) return; this.cache = await writeCache(this.owner, this.cache.version, value);
    this.channel?.postMessage(this.cache.version); this.notify();
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  subscribeStorageChanges = (fn: (version: number) => void) => { this.tabListeners.add(fn); return () => { this.tabListeners.delete(fn); }; };
  loadData = async () => { this.assertActive(); this.view = structuredClone(this.cache.draft); this.refreshRequired = false; return structuredClone(this.cache.draft.data); };
  consumeRefresh = () => { const refresh = this.refreshRequired; this.refreshRequired = false; return refresh; };
  stageData = (data: AppData) => {
    this.assertActive();
    if (!this.stages.has(data)) this.stages.set(data, ++this.stageSequence);
    if (this.stages.get(data)! <= this.committedSequence) return;
    this.pending = data; this.status = 'saving'; this.notify();
  };
  hasPendingData = () => this.pending !== null;
  hasUnsynced = () => this.pending !== null || !!this.cache.outbox || !!this.cache.conflict || !!this.cache.tabConflict || !same({ data: this.cache.base.data, tombstones: this.cache.base.tombstones, migrations: this.cache.base.migrations }, this.cache.draft);
  getPendingData = () => this.pending;
  getSnapshot = () => structuredClone(this.cache);
  saveData = (data: AppData): Promise<void> => {
    this.stageData(data);
    // JSON removes undefined fields exactly as the remote wire format does.
    const snapshot = JSON.parse(JSON.stringify(data)) as AppData;
    const sequence = this.stages.get(data)!;
    return this.run(async () => {
      if (sequence <= this.committedSequence) { if (this.pending === data) this.pending = null; return; }
      const base = this.view;
      const local = documentAfter(base, snapshot);
      // Validate without normalizing/re-awarding the stored economic ledger.
      validateData(snapshot);
      const merge = mergeDocuments(base, local, this.cache.draft);
      if (merge.unresolved.length) {
        await this.commit({ ...this.cache, tabConflict: { base, local, server: this.cache.draft } });
        if (this.pending === data) this.pending = null;
        this.status = 'conflict'; this.notify();
        throw new Error('Hay cambios concurrentes. Revisa ambas versiones antes de continuar.');
      }
      validateData(merge.document.data);
      await this.commit({ ...this.cache, draft: merge.document });
      this.view = local; this.committedSequence = sequence;
      if (!same(local, merge.document)) this.refreshRequired = true;
      if (this.pending === data) this.pending = null;
      this.status = (this.cache.conflict || this.cache.tabConflict) ? 'conflict' : this.hasUnsynced() ? 'pending' : 'synced'; this.notify();
    }).catch(error => { this.error = error instanceof Error ? error.message : 'No se ha podido guardar.'; this.status = this.cache.tabConflict ? 'conflict' : 'error'; this.notify(); throw error; });
  };
  flushData = async () => { if (this.pending) await this.saveData(this.pending); else await this.serial; };
  resetData = async (): Promise<AppData> => {
    await this.flushData();
    return this.run(async () => {
      if (this.cache.conflict || this.cache.tabConflict) throw new Error('Resuelve los conflictos de sincronización antes de resetear la cuenta.');
      const data = resetAccountData(this.cache.draft.data);
      const draft = documentAfter(this.cache.draft, data);
      draft.migrations = [...draft.migrations, `account-reset:${crypto.randomUUID()}`];
      await this.commit({ ...this.cache, draft });
      this.view = structuredClone(draft);
      this.committedSequence = ++this.stageSequence;
      this.pending = null;
      this.refreshRequired = false;
      this.status = 'pending'; this.notify();
      return structuredClone(data);
    });
  };
  /** Network failure leaves the exact request in IndexedDB. CAS and a receipt
   * make a lost response safe to retry, including after a browser restart. */
  private network?: Promise<boolean>;
  synchronize = (): Promise<boolean> => {
    if (this.network) return this.network;
    const work = this.syncNetwork(); this.network = work;
    void work.then(() => { this.network = undefined; }, () => { this.network = undefined; });
    return work;
  };
  private async syncNetwork(): Promise<boolean> {
    const previous = this.cache.draft;
    if (this.closing) return false;
    try {
      await this.run(async () => {
        const disk = await readCache(this.owner);
        if (disk && disk.version !== this.cache.version) throw new StorageConflictError();
      });
      if (this.pending) return false;
      if (this.cache.conflict || this.cache.tabConflict) { this.status = 'conflict'; this.notify(); return false; }
      this.status = 'saving'; this.error = ''; this.notify();
      let operation = this.cache.outbox;
      if (!operation) {
        // Network requests never hold the local write queue. Training and logout
        // can commit immediately even if this request stalls or loses coverage.
        const remote = await this.transport.download(); this.assertActive();
        await this.run(async () => {
          if (this.pending || this.closing) return;
          const merge = mergeDocuments(this.cache.base, this.cache.draft, remote);
          if (merge.unresolved.length) {
            await this.commit({ ...this.cache, conflict: remote, verified: true }); return;
          }
          validateData(merge.document.data);
          await this.commit({ ...this.cache, base: remote, draft: merge.document, verified: true });
          if (!same(merge.document, { data: remote.data, tombstones: remote.tombstones, migrations: remote.migrations })) {
            operation = { operationId: crypto.randomUUID(), expectedRevision: remote.revision, document: structuredClone(merge.document) };
            await this.commit({ ...this.cache, outbox: operation });
          }
        });
      }
      if (operation && !this.closing) {
        const op = operation;
        const response = await this.transport.apply(op); this.assertActive();
        await this.run(async () => {
          if (response.status === 'conflict') {
            const merge = mergeDocuments(this.cache.base, this.cache.draft, response.snapshot);
            if (!merge.unresolved.length) validateData(merge.document.data);
            await this.commit({ ...this.cache, outbox: undefined, ...(merge.unresolved.length ? { conflict: response.snapshot } : { base: response.snapshot, draft: merge.document }), verified: true });
          } else {
            if (!same(op.document, { data: response.snapshot.data, tombstones: response.snapshot.tombstones, migrations: response.snapshot.migrations })) throw new Error('El servidor no confirmó el contenido enviado. Se conserva la cola.');
            // Preserve edits committed locally while the operation was in flight.
            await this.commit({ ...this.cache, outbox: undefined, base: response.snapshot, verified: true });
          }
        });
      }
      this.status = this.cache.conflict || this.cache.tabConflict ? 'conflict' : this.pending ? 'saving' : this.hasUnsynced() ? 'pending' : 'synced';
      this.notify(); return !same(previous, this.cache.draft);
    } catch (error) {
      if (error instanceof RemoteValidationError && this.cache.outbox && this.active) {
        await this.run(async () => {
          await metadata(`recovery:${this.owner}:${Date.now()}`, { local: this.cache.outbox!.document });
          await this.commit({ ...this.cache, outbox: undefined });
        });
      }
      this.status = error instanceof RemoteConnectionError || (typeof navigator !== 'undefined' && !navigator.onLine) ? 'pending' : 'error';
      this.error = error instanceof Error ? error.message : 'No se ha podido sincronizar.'; this.notify(); throw error;
    }
  }
  conflicts = () => this.cache.tabConflict ? mergeDocuments(this.cache.tabConflict.base, this.cache.tabConflict.local, this.cache.tabConflict.server).conflicts : this.cache.conflict ? mergeDocuments(this.cache.base, this.cache.draft, this.cache.conflict).conflicts : [];
  resolve = (choices: Record<string, 'local' | 'server'>) => this.run(async () => {
    const tab = this.cache.tabConflict;
    if (!this.cache.conflict && !tab) return;
    const merge = tab ? mergeDocuments(tab.base, tab.local, tab.server, choices) : mergeDocuments(this.cache.base, this.cache.draft, this.cache.conflict!, choices);
    if (merge.unresolved.length) throw new Error('Elige cómo resolver cada conflicto.');
    validateData(merge.document.data);
    // Keep the losing branch locally, recoverable from the account panel.
    await metadata(`recovery:${this.owner}:${Date.now()}`, { local: tab?.local ?? this.cache.draft, server: tab?.server ?? this.cache.conflict });
    await this.commit({ ...this.cache, base: this.cache.conflict ?? this.cache.base, draft: merge.document, conflict: undefined, tabConflict: undefined, outbox: tab ? this.cache.outbox : undefined });
    this.status = 'pending'; this.notify();
  });
  /** Recover a stale tab in-app, preserving its staged edits as a merge branch. */
  recoverTab = () => this.run(async () => {
    const disk = await readCache(this.owner); if (!disk) return;
    const base = this.cache.draft;
    const local = this.pending ? documentAfter(base, this.pending) : base;
    const merge = mergeDocuments(base, local, disk.draft);
    this.cache = disk; this.pending = null;
    if (merge.unresolved.length) {
      await this.commit({ ...disk, tabConflict: { base, local, server: disk.draft } });
      this.status = 'conflict'; this.notify(); return;
    }
    await this.commit({ ...disk, draft: merge.document }); this.status = 'pending'; this.notify();
  });
  migrate = (data: AppData, migrationId: string) => this.run(async () => {
    if (this.cache.draft.migrations.includes(migrationId)) return;
    validateData(data);
    if (!same(this.cache.draft, blankDocument())) await metadata(`recovery:${this.owner}:${Date.now()}`, { local: this.cache.draft });
    await this.commit({ ...this.cache, draft: { ...documentAfter(this.cache.draft, data), migrations: [...this.cache.draft.migrations, migrationId] } });
    this.status = 'pending'; this.notify();
  });
}

export async function recoveryCopies(owner: string): Promise<{ key: string; local: AccountDocument; server?: AccountDocument }[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('meta'); const store = tx.objectStore('meta');
    const keys = store.getAllKeys(); const values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.flatMap((key, i) => String(key).startsWith(`recovery:${owner}:`) ? [{ key: String(key), ...values.result[i] }] : []));
    tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

export type LegacySource = { id: string; data: AppData; owner?: string };
/** Read the original database without running its write-on-read normalization. */
export async function legacySource(): Promise<LegacySource | undefined> {
  const existing = await metadata<LegacySource>('legacy'); if (existing) return existing;
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('entrenos-local', 1); r.onupgradeneeded = () => r.result.createObjectStore('state'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  let data: AppData | undefined;
  try { data = await new Promise((resolve, reject) => { const tx = db.transaction('state'); const r = tx.objectStore('state').get('local'); tx.oncomplete = () => resolve(r.result); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
  data ??= emptyData();
  if (!data.preferences && typeof localStorage !== 'undefined') { try { const p = JSON.parse(localStorage.getItem('entrenos-experience-v1') ?? 'null'); if (p) data.preferences = { effects: p.effects !== false, sound: p.sound === true }; } catch {} }
  if (!data.workouts.length && !data.routines.length && !data.customExercises.length && !data.game && !data.profile && !data.routineDraft && !data.preferences) return;
  data = snapshotLoadConventions(structuredClone(data));
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const id = `legacy:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')}`;
  const source = { id, data }; await metadata('legacy', source); return source;
}

/** Claim a legacy source atomically across accounts/tabs before enqueueing it. */
export async function claimLegacy(owner: string, source: LegacySource): Promise<LegacySource> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite', { durability: 'strict' }); const store = tx.objectStore('meta');
    const key = source.id.startsWith('legacy:') ? 'legacy' : `claim:${source.id}`;
    const req = store.get(key); let conflict = false; const claimed = { ...source, owner };
    req.onsuccess = () => { if (req.result?.owner && req.result.owner !== owner) { conflict = true; tx.abort(); } else store.put(claimed,key); };
    tx.oncomplete = () => resolve(claimed); tx.onerror = tx.onabort = () => reject(conflict ? new Error('Este historial ya está vinculado a otra cuenta. Inicia sesión en ella para continuar la incorporación.') : tx.error);
  }); } finally { db.close(); }
}
