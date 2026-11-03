import { remoteClient, verifiedUser } from './auth';
import { validateData } from '../backup';
import { blankDocument, type CloudSnapshot } from './document';
import { RemoteValidationError, type Transport } from './account-store';
import { RemoteConnectionError } from './errors';
import { socialActivitySummary } from '../social-activity';

function snapshot(value: unknown): CloudSnapshot {
  const row = value as CloudSnapshot;
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0 || !Array.isArray(row.migrations) || !row.migrations.every(v => typeof v === 'string') || !Array.isArray(row.tombstones) || !row.tombstones.every(v => typeof v === 'string')) throw new Error('La respuesta de la nube no es válida.');
  validateData(row.data);
  return { revision: row.revision, data: row.data, tombstones: row.tombstones, migrations: row.migrations };
}
export function accountTransport(owner: string): Transport {
  async function client() {
    const c = remoteClient();
    if (!c || (await verifiedUser()).id !== owner) throw new Error('La sesión ha caducado o ha cambiado. Inicia sesión de nuevo para sincronizar.');
    return c;
  }
  return {
    async download() {
      const c = await client();
      const { data, error, status } = await c.from('cheesit_accounts').select('owner_id,revision,data,tombstones,migrations').eq('owner_id', owner).maybeSingle();
      if (error && status === 0) throw new RemoteConnectionError();
      if (error) throw new Error('No se pudo leer tu cuenta. Comprueba la conexión y que las migraciones de Cheesit estén aplicadas.');
      if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
      if (data && data.owner_id !== owner) throw new Error('La respuesta pertenece a otra cuenta.');
      return data ? snapshot(data) : { ...blankDocument(), revision: 0 };
    },
    async apply(op) {
      const c = await client();
      let response = await c.rpc('cheesit_commit_account', { p_expected_owner: owner, p_operation_id: op.operationId, p_base_revision: op.expectedRevision, p_document: { ...op.document, socialSummary: socialActivitySummary(op.document.data) } });
      // A pre-upgrade outbox may have reached the server before its response was
      // lost. Its receipt hashes the original envelope without the new summary.
      // Retry that exact persisted envelope; the server still rejects any reuse
      // of the operation ID with different account contents.
      if (response.error?.code === 'P0001' && response.error.message === 'operation id reused') {
        response = await c.rpc('cheesit_commit_account', { p_expected_owner: owner, p_operation_id: op.operationId, p_base_revision: op.expectedRevision, p_document: op.document });
      }
      const { data, error, status } = response;
      if (error && status === 0) throw new RemoteConnectionError();
      if (error && ['22023', 'P0001', '23514', '22P02'].includes(error.code)) throw new RemoteValidationError('La nube ha rechazado algunos campos o un premio histórico modificado. Revisa tus cambios; se conserva una copia recuperable y puedes corregirlos antes de reintentar.');
      if (error) throw new Error(error.code === '28000' || error.code === 'PGRST301' ? 'La sesión ha caducado. Vuelve a iniciar sesión.' : 'No se ha podido guardar en la nube. Tus cambios siguen pendientes en este dispositivo.');
      if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
      if (!data || !['applied', 'conflict'].includes(data.status)) throw new Error('El servidor no ha confirmado el guardado.');
      return { status: data.status, snapshot: snapshot(data.snapshot) };
    },
  };
}
