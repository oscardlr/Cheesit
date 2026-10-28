import type { Action, EntityPayload, EntityType, LocalEntity, Operation, Receipt } from './types';

const DB = 'entrenos-remote-v1';
const ENTITIES = 'entities';
const OPERATIONS = 'operations';
const META = 'meta';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(ENTITIES, { keyPath: ['owner', 'type', 'id'] });
      req.result.createObjectStore(OPERATIONS, { keyPath: ['owner', 'operationId'] });
      req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se puede abrir el almacenamiento.'));
    req.onblocked = () => reject(new Error('El almacenamiento está bloqueado por otra pestaña.'));
  });
}
function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se ha podido guardar en el dispositivo.'));
    tx.onabort = () => reject(tx.error ?? new Error('Se ha cancelado el guardado.'));
  });
}

/** Commits the visible snapshot and its operation together. Owner must be the last verified account. */
export async function queueChange(owner: string, deviceId: string, type: EntityType, payload: EntityPayload, action: Action = 'upsert'): Promise<void> {
  const snapshot = structuredClone(payload);
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS, META], 'readwrite');
    const done = complete(tx);
    const entities = tx.objectStore(ENTITIES), ops = tx.objectStore(OPERATIONS), meta = tx.objectStore(META);
    const key = [owner, type, snapshot.id];
    const previous = await result<LocalEntity | undefined>(entities.get(key));
    const counter = (await result<number | undefined>(meta.get('counter')) ?? 0) + 1;
    const current: LocalEntity = { owner, type, id: snapshot.id, payload: snapshot, deleted: action === 'delete', revision: previous?.revision ?? 0, conflict: previous?.conflict };
    const operation: Operation = { owner, operationId: crypto.randomUUID(), deviceId, type, entityId: snapshot.id, action, payload: action === 'delete' ? null : snapshot, order: counter, baseRevision: null, state: 'queued' };
    entities.put(current); ops.put(operation); meta.put(counter, 'counter');
    await done;
  } finally { db.close(); }
}

export async function readOwner(owner: string): Promise<{ entities: LocalEntity[]; operations: Operation[] }> {
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS], 'readonly');
    const done = complete(tx);
    const [entities, operations] = await Promise.all([
      result<LocalEntity[]>(tx.objectStore(ENTITIES).getAll()), result<Operation[]>(tx.objectStore(OPERATIONS).getAll()),
    ]);
    await done;
    return { entities: entities.filter(e => e.owner === owner), operations: operations.filter(o => o.owner === owner).sort((a, b) => a.order - b.order) };
  } finally { db.close(); }
}

/** Lock in the base revision before the first network attempt, keeping retries byte-equivalent. */
export async function prepareOperation(op: Operation): Promise<Operation> {
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS], 'readwrite');
    const done = complete(tx);
    const entities = tx.objectStore(ENTITIES), operations = tx.objectStore(OPERATIONS);
    const stored = await result<Operation | undefined>(operations.get([op.owner, op.operationId]));
    if (!stored || stored.state === 'blocked') { tx.abort(); await done.catch(() => undefined); throw new Error('La operación ya no está disponible.'); }
    const entity = await result<LocalEntity | undefined>(entities.get([op.owner, op.type, op.entityId]));
    if (!entity) { tx.abort(); await done.catch(() => undefined); throw new Error('Falta la copia local.'); }
    if (stored.baseRevision === null) stored.baseRevision = entity.revision;
    stored.state = 'sending'; operations.put(stored);
    await done;
    return stored;
  } finally { db.close(); }
}

export async function recordReceipt(op: Operation, receipt: Receipt): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS], 'readwrite');
    const done = complete(tx);
    const entities = tx.objectStore(ENTITIES), operations = tx.objectStore(OPERATIONS);
    const current = await result<LocalEntity | undefined>(entities.get([op.owner, op.type, op.entityId]));
    if (!current) { tx.abort(); await done.catch(() => undefined); throw new Error('Falta la copia local.'); }
    if (receipt.status === 'applied' && typeof receipt.revision === 'number') {
      current.revision = receipt.revision;
      operations.delete([op.owner, op.operationId]);
    } else {
      op.state = 'blocked'; op.receipt = receipt; current.conflict = receipt;
      operations.put(op);
    }
    entities.put(current);
    await done;
  } finally { db.close(); }
}

/** Explicitly resolve a revision conflict; date collisions and tombstones require separate UX. */
export async function resolveRevision(owner: string, operationId: string, choice: 'server' | 'local', deviceId: string): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS, META], 'readwrite');
    const done = complete(tx);
    const entities = tx.objectStore(ENTITIES), operations = tx.objectStore(OPERATIONS), meta = tx.objectStore(META);
    const op = await result<Operation | undefined>(operations.get([owner, operationId]));
    const remote = op?.receipt?.entity;
    if (!op || op.state !== 'blocked' || op.receipt?.reason !== 'revision' || !remote || remote.deleted || remote.id !== op.entityId || remote.owner_id !== owner) {
      tx.abort(); await done.catch(() => undefined); throw new Error('Este conflicto requiere atención específica.');
    }
    const local = await result<LocalEntity | undefined>(entities.get([owner, op.type, op.entityId]));
    if (!local) { tx.abort(); await done.catch(() => undefined); throw new Error('Falta la copia local.'); }
    const all = await result<Operation[]>(operations.getAll());
    for (const pending of all) if (pending.owner === owner && pending.type === op.type && pending.entityId === op.entityId) operations.delete([owner, pending.operationId]);
    local.revision = remote.revision; delete local.conflict;
    if (choice === 'server') { local.payload = remote.payload; local.deleted = remote.deleted; }
    else {
      const counter = (await result<number | undefined>(meta.get('counter')) ?? 0) + 1;
      const replacement: Operation = { owner, operationId: crypto.randomUUID(), deviceId, type: op.type, entityId: op.entityId, action: local.deleted ? 'delete' : 'upsert', payload: local.deleted ? null : local.payload, order: counter, baseRevision: remote.revision, state: 'queued' };
      operations.put(replacement); meta.put(counter, 'counter');
    }
    entities.put(local);
    await done;
  } finally { db.close(); }
}
/** Merge a server page without overwriting any entity with local operations. */
export async function mergeRemote(owner: string, rows: import('./types').RemoteEntity[]): Promise<void> {
  const db = await database();
  try {
    const tx = db.transaction([ENTITIES, OPERATIONS], 'readwrite');
    const done = complete(tx);
    const entities = tx.objectStore(ENTITIES), ops = tx.objectStore(OPERATIONS);
    const pending = await result<Operation[]>(ops.getAll());
    for (const row of rows) {
      if (row.owner_id !== owner) { tx.abort(); await done.catch(() => undefined); throw new Error('La respuesta pertenece a otra cuenta.'); }
      if (pending.some(op => op.owner === owner && op.type === row.entity_type && op.entityId === row.id)) continue;
      const current = await result<LocalEntity | undefined>(entities.get([owner, row.entity_type, row.id]));
      if (!current || row.revision >= current.revision) entities.put({ owner, type: row.entity_type, id: row.id, payload: row.payload, deleted: row.deleted, revision: row.revision } satisfies LocalEntity);
    }
    await done;
  } finally { db.close(); }
}
