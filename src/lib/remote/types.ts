export type EntityType = 'session' | 'routine' | 'exercise';
export type EntityPayload = { id: string; [key: string]: unknown };
export type Action = 'upsert' | 'delete';
export type Receipt = {
  status: 'applied' | 'conflict' | 'invalid';
  revision?: number;
  reason?: string;
  entity?: RemoteEntity | null;
};
export type RemoteEntity = {
  owner_id: string; entity_type: EntityType; id: string; revision: number;
  payload: EntityPayload; deleted: boolean; created_at: string; updated_at: string;
};
export type LocalEntity = {
  owner: string; type: EntityType; id: string; payload: EntityPayload;
  deleted: boolean; revision: number; conflict?: Receipt;
};
export type Operation = {
  owner: string; operationId: string; deviceId: string; type: EntityType; entityId: string;
  action: Action; payload: EntityPayload | null; order: number;
  // Once sent, baseRevision and content never change, even if the response is lost.
  baseRevision: number | null; state: 'queued' | 'sending' | 'blocked'; receipt?: Receipt;
};
