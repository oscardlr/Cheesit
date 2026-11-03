import { normalizeUsername } from '../account-profile';
import { remoteClient, verifiedUser } from './auth';
import type { Workout } from '../model';
import type { ActivitySummary } from '../social-activity';
import { socialActivitySummary } from '../social-activity';
import { accountTransport } from './account-sync';

export type SocialList = 'followers' | 'following';
export type SocialRoute = { owner: string | null; list: SocialList | null; query: string; workout?: string | null; source?: 'notifications' };
export type SocialProfile = {
  owner_id: string; username: string; display_name: string; photo: string | null; bio: string;
  followers: number; following: number; is_following: boolean; follows_you: boolean;
  activity_shared?: boolean;
};
export const SOCIAL_PAGE_SIZE = 20;
export const validSocialQuery = (value: string) => /^[a-z0-9_][a-z0-9._]{0,29}$/.test(normalizeUsername(value));
const failure = 'No se ha podido confirmar la operación. Comprueba la conexión y reintenta para consultar el estado del servidor.';

export async function readSocial(route: SocialRoute, offset = 0, signal?: AbortSignal): Promise<SocialProfile[]> {
  const client = remoteClient();
  if (!client) throw new Error('Necesitas una cuenta para usar las funciones sociales.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const request = client.rpc('cheesit_read_social', { p_query: normalizeUsername(route.query), p_owner: route.owner, p_list: route.list, p_offset: offset });
  try {
    const { data, error } = await request.abortSignal(controller.signal);
    if (error || !Array.isArray(data)) throw new Error(failure);
    return data as SocialProfile[];
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export type SocialActivity = { shared: boolean; summary: ActivitySummary | null; workouts: Workout[] };

export async function readActivity(owner: string, workout: string | null = null, offset = 0, signal?: AbortSignal): Promise<SocialActivity | null> {
  const client = remoteClient();
  if (!client) throw new Error('Necesitas una cuenta para consultar la actividad.');
  const { data, error } = await client.rpc('cheesit_read_activity', { p_owner: owner, p_workout: workout, p_offset: offset }).abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000));
  if (error) throw new Error('No se ha podido cargar la actividad. Comprueba la conexión y reintenta.');
  return data as SocialActivity | null;
}

export async function shareActivity(owner: string, shared: boolean) {
  if ((await verifiedUser()).id !== owner) throw new Error('La cuenta activa ha cambiado.');
  const client = remoteClient()!;
  if (shared) {
    // Seed derived XP for existing accounts without exposing their physical data.
    const transport = accountTransport(owner);
    const snapshot = await transport.download();
    const { data, revision, tombstones, migrations } = snapshot;
    const { data: result, error } = await client.rpc('cheesit_commit_account', { p_expected_owner: owner, p_operation_id: crypto.randomUUID(), p_base_revision: revision, p_document: { data, tombstones, migrations, socialSummary: socialActivitySummary(data) } }).abortSignal(AbortSignal.timeout(15000));
    if (error || result?.status !== 'applied') throw new Error('La cuenta ha cambiado o no hay conexión. Reintenta para compartir la actividad sincronizada.');
  }
  const { data, error } = await client.from('cheesit_social_profiles').update({ activity_shared: shared }).eq('owner_id', owner).select('activity_shared').abortSignal(AbortSignal.timeout(15000)).single();
  if (error || data?.activity_shared !== shared) throw new Error('No se ha confirmado el cambio de privacidad. Comprueba la conexión y reintenta.');
  return shared;
}

/** Idempotent desired state, with owner verified over Auth before writing.
 * A lost response never produces a local success; retry reads the server first. */
export async function setFollow(owner: string, target: string, following: boolean): Promise<SocialProfile> {
  const user = await verifiedUser();
  if (user.id !== owner || owner === target) throw new Error('La sesión ha cambiado. Vuelve a abrir el perfil.');
  const client = remoteClient()!;
  const route = { owner: target, list: null, query: '' };
  const [before] = await readSocial(route);
  if (!before) throw new Error('Este perfil ya no está disponible.');
  if (before.is_following !== following) {
    const result = following
      ? await client.from('cheesit_follows').insert({ follower_id: owner, followed_id: target }).abortSignal(AbortSignal.timeout(15000))
      : await client.from('cheesit_follows').delete().eq('follower_id', owner).eq('followed_id', target).abortSignal(AbortSignal.timeout(15000));
    // A concurrent insertion is safe to reconcile by reading the actual state.
    if (result.error && !(following && result.error.code === '23505')) throw new Error(failure);
  }
  const [confirmed] = await readSocial(route);
  if (!confirmed || confirmed.is_following !== following) throw new Error(failure);
  return confirmed;
}
