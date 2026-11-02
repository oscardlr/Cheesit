'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { remoteClient, resendConfirmation, requestPasswordReset, signIn, signOut, signUp, updatePassword, googleSignInUrl } from '../lib/remote/auth';
import { GOOGLE_PENDING, googleRedirectUrl } from '../lib/remote/oauth';
import { PasswordField } from './PasswordField';

type Props = { ownerId?: string; email?: string; hasPending: boolean; recovery?: boolean; onRecovered?: () => void; beforeSignOut?: () => Promise<boolean>; onAuthenticated: (ownerId: string) => void; onSignedOut: () => void };
type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'recovery';

/** Standalone account form; callers own account transitions and must not mix local data. */
export function AccountPanel({ ownerId, email: accountEmail, hasPending, recovery, onRecovered, beforeSignOut, onAuthenticated, onSignedOut }: Props) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const messageId = useId();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = !!remoteClient();
  function changeMode(next: Mode) { setMode(next); setMessage(''); setPassword(''); setConfirmation(''); setMismatch(false); }
  useEffect(() => { if (recovery) setMode('recovery'); }, [recovery]);
  useEffect(() => {
    const client = remoteClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setMode('recovery'); });
    const resumed = (event: PageTransitionEvent) => { if (event.persisted) { setBusy(false); setMessage(''); } };
    window.addEventListener('pageshow', resumed);
    return () => { data.subscription.unsubscribe(); window.removeEventListener('pageshow', resumed); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((mode === 'sign-up' || mode === 'recovery') && password !== confirmation) { setMismatch(true); setMessage('Las contraseñas no coinciden. Vuelve a escribirlas.'); return; }
    setMismatch(false); setBusy(true); setMessage('');
    try {
      const redirect = window.location.origin + window.location.pathname;
      if (mode === 'sign-in') onAuthenticated((await signIn(email.trim(), password)).id);
      if (mode === 'sign-up') { await signUp(email.trim(), password, redirect); setPassword(''); setConfirmation(''); setMessage('Si procede, recibirás un correo para confirmar el acceso.'); }
      if (mode === 'forgot') { await requestPasswordReset(email.trim(), redirect + '?recovery=1'); setMessage('Si es posible, recibirás un correo con los pasos para recuperar el acceso.'); }
      if (mode === 'recovery') { await updatePassword(password); changeMode('sign-in'); setMessage('Contraseña actualizada.'); onRecovered?.(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se ha podido completar la operación.'); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setMessage('Conectando con Google…'); setPassword(''); setConfirmation(''); setMismatch(false);
    try {
      const url = await googleSignInUrl(googleRedirectUrl(window.location.origin));
      // No credentials are stored. The marker only distinguishes Back/cancellation from an ordinary visit.
      try { sessionStorage.setItem(GOOGLE_PENDING, '1'); } catch { /* OAuth still works without browser storage. */ }
      window.location.assign(url);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No se pudo iniciar el acceso con Google.'); }
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
      {mode !== 'forgot' && <PasswordField key={mode} value={password} onChange={setPassword} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}/>}
      {(mode === 'sign-up' || mode === 'recovery') && <PasswordField label="Repetir contraseña" value={confirmation} onChange={value => { setConfirmation(value); if (mismatch) setMessage(''); setMismatch(false); }} autoComplete="new-password" invalid={mismatch} describedBy={messageId}/>}
      <button type="submit" disabled={busy}>{mode === 'sign-in' ? 'Entrar' : mode === 'sign-up' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar correo' : 'Guardar contraseña'}</button>
    </form>
    {(mode === 'sign-in' || mode === 'sign-up') && <><div className="account-divider"><span>o</span></div><button type="button" className="account-google" disabled={busy} onClick={() => void google()}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#ea4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg>Continuar con Google</button></>}
    {mode !== 'sign-in' && mode !== 'recovery' && <button type="button" disabled={busy} onClick={() => changeMode('sign-in')}>Volver a iniciar sesión</button>}
    {mode === 'recovery' && <button type="button" disabled={busy} onClick={() => { changeMode('forgot'); setMessage('Solicita un nuevo enlace si el anterior ha caducado.'); }}>Solicitar otro enlace</button>}
    {mode === 'sign-in' && <><button type="button" disabled={busy} onClick={() => changeMode('sign-up')}>Crear cuenta</button><button type="button" disabled={busy} onClick={() => changeMode('forgot')}>He olvidado mi contraseña</button></>}
    {mode === 'sign-in' && <button type="button" disabled={busy || !email.trim()} onClick={() => { setBusy(true); void resendConfirmation(email.trim(), window.location.origin + window.location.pathname).then(() => setMessage('Si procede, recibirás un nuevo correo de confirmación.')).catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Reenviar confirmación</button>}
    <p id={messageId} role={mismatch ? 'alert' : 'status'}>{message}</p>
  </section>;
}
