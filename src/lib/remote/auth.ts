import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** No secret keys belong in these variables. Null means account services are not configured. */
export function remoteClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function verifiedUser(): Promise<User> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  // getUser contacts Auth and verifies the token, unlike trusting the local session.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Vuelve a iniciar sesión para sincronizar.');
  return data.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('No se ha podido iniciar sesión. Revisa los datos o inténtalo de nuevo.');
  return verifiedUser();
}

export async function signUp(email: string, password: string, redirectTo: string): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if (error) throw new Error('No se ha podido completar el registro. Inténtalo de nuevo.');
}

export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const supabase = remoteClient();
  if (!supabase) throw new Error('La cuenta no está configurada.');
  // Present the same message regardless of account existence.
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error('No se ha podido cerrar la sesión.');
}
