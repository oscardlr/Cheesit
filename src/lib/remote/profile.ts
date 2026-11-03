import { remoteClient } from './auth';
import { normalizeUsername, USERNAME_TAKEN, validateIdentity, validateInitialProfile } from '../account-profile';
import type { AthleteProfile } from '../strength';

export type AccountIdentity = { owner_id: string; username: string; completed_at: string | null };
export async function fetchIdentity(owner: string): Promise<AccountIdentity | null> {
  const client = remoteClient();
  if (!client) throw new Error('La cuenta no está configurada.');
  const { data, error } = await client.from('cheesit_identities').select('owner_id,username,completed_at').eq('owner_id', owner).maybeSingle();
  if (error) throw new Error('No se pudo recuperar tu perfil de la nube. Comprueba la conexión y reintenta.');
  return data;
}
export async function completeProfile(owner: string, displayName: string, username: string, profile?: AthleteProfile): Promise<AccountIdentity> {
  validateIdentity(displayName, username);
  if (profile) validateInitialProfile(profile);
  const client = remoteClient();
  if (!client) throw new Error('La cuenta no está configurada.');
  const { data, error } = await client.rpc('cheesit_complete_profile', { p_expected_owner: owner, p_display_name: displayName.trim(), p_username: normalizeUsername(username), p_profile: profile ?? null });
  if (error) throw new Error(error.code === '23505' ? USERNAME_TAKEN : 'No se ha confirmado el guardado del perfil. Comprueba la conexión y vuelve a intentarlo.');
  if (!data?.completed_at || data.owner_id !== owner) throw new Error('El servidor no ha confirmado tu perfil. Reintenta.');
  return data;
}
