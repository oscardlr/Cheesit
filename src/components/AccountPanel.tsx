'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { remoteClient, resendConfirmation, requestPasswordReset, signIn, signOut, signUp, updatePassword } from '../lib/remote/auth';

type Props = { ownerId?: string; email?: string; hasPending: boolean; recovery?: boolean; onRecovered?: () => void; beforeSignOut?: () => Promise<boolean>; onAuthenticated: (ownerId: string) => void; onSignedOut: () => void };
type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'recovery';

/** Standalone account form; callers own account transitions and must not mix local data. */
export function AccountPanel({ ownerId, email: accountEmail, hasPending, recovery, onRecovered, beforeSignOut, onAuthenticated, onSignedOut }: Props) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = !!remoteClient();
  useEffect(() => { if (recovery) setMode('recovery'); }, [recovery]);
  useEffect(() => {
    const client = remoteClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setMode('recovery'); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const redirect = window.location.origin + window.location.pathname;
      if (mode === 'sign-in') onAuthenticated((await signIn(email.trim(), password)).id);
      if (mode === 'sign-up') { await signUp(email.trim(), password, redirect); setMessage('Si procede, recibirás un correo para confirmar el acceso.'); }
      if (mode === 'forgot') { await requestPasswordReset(email.trim(), redirect + '?recovery=1'); setMessage('Si es posible, recibirás un correo con los pasos para recuperar el acceso.'); }
      if (mode === 'recovery') { await updatePassword(password); setPassword(''); setMessage('Contraseña actualizada.'); setMode('sign-in'); onRecovered?.(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se ha podido completar la operación.'); }
    finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true); setMessage('');
    try {
      if (beforeSignOut && !await beforeSignOut()) { setMessage('Guarda o descarta la edición abierta antes de cerrar sesión.'); return; }
      if (hasPending && !window.confirm('Hay cambios pendientes de subir. Se conservarán vinculados a esta cuenta en este navegador y se enviarán al volver a iniciar sesión con ella. No aparecerán en otra cuenta. ¿Cerrar sesión y conservarlos aquí?')) return;
      await signOut(); onSignedOut(); setPassword('');
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se ha podido cerrar la sesión.'); }
    finally { setBusy(false); }
  }
  if (!configured) return <p>La cuenta y la sincronización aún no están configuradas.</p>;
  if (ownerId && mode !== 'recovery' && !recovery) return <section aria-label="Cuenta"><p>{accountEmail || 'Sesión iniciada'}</p>{hasPending && <p>Hay cambios pendientes de sincronizar.</p>}<button type="button" disabled={busy} onClick={leave}>Cerrar sesión</button><p role="status">{message}</p></section>;
  return <section aria-label="Acceso a la cuenta">
    <h2>{mode === 'sign-in' ? 'Iniciar sesión' : mode === 'sign-up' ? 'Crear cuenta' : mode === 'forgot' ? 'Recuperar acceso' : 'Nueva contraseña'}</h2>
    <form onSubmit={submit}>
      {mode !== 'recovery' && <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {mode !== 'forgot' && <label>Contraseña<input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      <button type="submit" disabled={busy}>{mode === 'sign-in' ? 'Entrar' : mode === 'sign-up' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar correo' : 'Guardar contraseña'}</button>
    </form>
    {mode !== 'sign-in' && mode !== 'recovery' && <button type="button" onClick={() => { setMode('sign-in'); setMessage(''); }}>Volver a iniciar sesión</button>}
    {mode === 'recovery' && <button type="button" disabled={busy} onClick={() => { setMode('forgot'); setPassword(''); setMessage('Solicita un nuevo enlace si el anterior ha caducado.'); }}>Solicitar otro enlace</button>}
    {mode === 'sign-in' && <><button type="button" onClick={() => { setMode('sign-up'); setMessage(''); }}>Crear cuenta</button><button type="button" onClick={() => { setMode('forgot'); setMessage(''); }}>He olvidado mi contraseña</button></>}
    {mode === 'sign-in' && <button type="button" disabled={busy || !email.trim()} onClick={() => { setBusy(true); void resendConfirmation(email.trim(), window.location.origin + window.location.pathname).then(() => setMessage('Si procede, recibirás un nuevo correo de confirmación.')).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Reenviar confirmación</button>}
    <p role="status">{message}</p>
  </section>;
}
