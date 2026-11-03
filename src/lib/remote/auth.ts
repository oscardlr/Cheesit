import { createClient, isAuthRetryableFetchError, type SupabaseClient, type User } from '@supabase/supabase-js';
import { RemoteConnectionError } from './errors';
import { normalizeUsername, USERNAME_TAKEN, validateIdentity } from '../account-profile';
import { authReturnInfo } from './oauth';

let client: SupabaseClient | undefined;
let returned: ReturnType<typeof authReturnInfo> | undefined;

export function authRedirect() {
  if (typeof window !== 'undefined') returned ??= authReturnInfo(window.location.href);
  return returned;
}

/** No secret keys belong in these variables. Null means account services are not configured. */
export function remoteClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (key.startsWith('sb_secret_')) throw new Error('Configura únicamente la clave publicable de Supabase.');
  if (key.split('.').length === 3) {
    try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') throw new Error('No se permite una clave administrativa en el navegador.'); }
    catch (error) { if (error instanceof Error && error.message.includes('administrativa')) throw error; }
  }
  authRedirect();
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const client = remoteClient();
  if (!client) throw new Error('La cuenta no está configurada.');
  const { data, error } = await client.rpc('cheesit_username_available', { p_username: normalizeUsername(username) });
  if (error || typeof data !== 'boolean') throw new Error('No se ha podido comprobar el nombre de usuario. Comprueba tu conexión y reintenta.');
  return data;
}

export async function verifiedUser(): Promise<User> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  // getUser contacts Auth and verifies the token, unlike trusting the local session.
  const { data, error } = await supabase.auth.getUser();
  if (isAuthRetryableFetchError(error)) {
    if (!error.status) throw new RemoteConnectionError();
    throw new Error('El servicio de acceso no responde. Tus cambios se conservan; vuelve a intentar sincronizar.');
  }
  if (error || !data.user) throw new Error('Vuelve a iniciar sesión para sincronizar.');
  return data.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.code === 'email_not_confirmed' ? 'Confirma tu correo antes de iniciar sesión. Puedes solicitar otro enlace.' : 'No se ha podido iniciar sesión. Revisa los datos o inténtalo de nuevo.');
  return verifiedUser();
}

export async function signUp(email: string, password: string, redirectTo: string, displayName: string, username: string): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  username = normalizeUsername(username);
  validateIdentity(displayName, username);
  if (!await usernameAvailable(username)) throw new Error(USERNAME_TAKEN);
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { display_name: displayName.trim(), username } } });
  if (error) {
    // Auth can hide trigger errors; check again to explain a concurrent claim.
    if (!await usernameAvailable(username)) throw new Error(USERNAME_TAKEN);
    throw new Error('No se ha podido completar el registro. Inténtalo de nuevo.');
  }
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  // Present the same message regardless of account existence.
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error?.status === 429) throw new Error('Demasiados intentos. Espera unos minutos antes de solicitar otro correo.');
  if (error && (!error.status || error.status >= 500)) throw new Error('No se ha podido contactar con el servicio. Inténtalo de nuevo.');
}

export async function updatePassword(password: string): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error('El enlace ha caducado o no se ha podido cambiar la contraseña.');
}

export async function signOut(): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error('No se ha podido cerrar la sesión.');
}

export async function resendConfirmation(email: string, redirectTo: string): Promise<void> {
  const client = remoteClient(); if (!client) throw new Error('La cuenta no está configurada.');
  const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
  if (error) throw new Error('No se pudo enviar el enlace. Espera un momento y vuelve a intentarlo.');
}

export async function googleSignInUrl(redirectTo: string): Promise<string> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  // Check live availability so an unfinished provider setup never sends people to a JSON error page.
  let response: Response;
  try {
    response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! }, signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
  } catch { throw new RemoteConnectionError(); }
  if (!response.ok) throw new Error('No se pudo comprobar el acceso con Google. Inténtalo de nuevo.');
  let settings: { external?: { google?: boolean } } | null;
  try { settings = await response.json(); } catch { throw new Error('No se pudo comprobar el acceso con Google. Inténtalo de nuevo.'); }
  if (settings?.external?.google !== true) throw new Error('El acceso con Google aún no está disponible. Puedes entrar con correo y contraseña.');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
    redirectTo, scopes: 'openid email profile', queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true,
  } });
  if (error || !data.url) throw new Error('No se pudo iniciar el acceso con Google. Inténtalo de nuevo.');
  return data.url;
}
