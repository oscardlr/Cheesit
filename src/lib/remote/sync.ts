import { remoteClient, verifiedUser } from './auth';
import { mergeRemote, prepareOperation, readOwner, recordReceipt } from './queue';
import type { Receipt, RemoteEntity } from './types';

/** Fetch while the app is open. This does not declare a complete backup. */
export async function downloadRemote(owner: string): Promise<number> {
  const client = remoteClient();
  if (!client || (await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
  let from = 0, count = 0;
  for (;;) {
    const { data, error } = await client.from('entrenos_entities').select('*').eq('owner_id', owner)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 199);
    if (error) throw new Error('No se han podido descargar los datos de la cuenta.');
    if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
    const rows = (data ?? []) as RemoteEntity[];
    await mergeRemote(owner, rows); count += rows.length;
    if (rows.length < 200) return count;
    from += rows.length;
  }
}

/** Returns only after an acknowledgement is committed locally. Never sends another account's queue. */
async function flushUnlocked(owner: string): Promise<void> {
  const client = remoteClient();
  if (!client) throw new Error('La cuenta no está configurada.');
  if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
  const { operations } = await readOwner(owner);
  const blocked = new Set<string>();
  for (const original of operations) {
    const key = `${original.type}:${original.entityId}`;
    if (original.state === 'blocked') { blocked.add(key); continue; }
    if (blocked.has(key)) continue;
    if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
    const op = await prepareOperation(original);
    const { data, error } = await client.rpc('entrenos_apply_change', {
      p_operation_id: op.operationId, p_expected_owner: owner, p_device_id: op.deviceId,
      p_entity_type: op.type, p_entity_id: op.entityId, p_action: op.action,
      p_base_revision: op.baseRevision, p_payload: op.payload,
    });
    if (error) throw new Error('No se ha podido sincronizar. Los cambios siguen en el dispositivo.');
    const receipt = data as Receipt;
    if (!receipt || !['applied', 'conflict', 'invalid'].includes(receipt.status) || (receipt.status === 'applied' && typeof receipt.revision !== 'number')) {
      throw new Error('La respuesta del servidor no es válida; se conserva la operación.');
    }
    await recordReceipt(op, receipt);
    if (receipt.status !== 'applied') blocked.add(key);
  }
}

/** Web Locks prevents parallel tabs from changing the order of a user's operations. */
export async function flushQueue(owner: string): Promise<void> {
  if (!navigator.locks) throw new Error('Este navegador no permite coordinar la sincronización entre pestañas.');
  await navigator.locks.request(`entrenos-sync:${owner}`, () => flushUnlocked(owner));
}
