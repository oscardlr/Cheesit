'use client';

import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AccountVersion } from './AccountVersion';
import { AccountPanel } from './AccountPanel';
import EntrenosApp from './EntrenosApp';
import OfflineShell from './OfflineShell';
import { authRedirect, remoteClient, signOut } from '../lib/remote/auth';
import { GOOGLE_PENDING, oauthErrorMessage } from '../lib/remote/oauth';
import { AccountStore, claimLegacy, legacySource, recoveryCopies, syncStatusLabel, type LegacySource } from '../lib/remote/account-store';
import { accountTransport } from '../lib/remote/account-sync';
import type { BackupResolution } from '../lib/backup';
import { previewLegacy, type MigrationPreview } from '../lib/remote/migration';
import './account.css';
import { guestStore } from '../lib/guest-store';
import { fetchIdentity, type AccountIdentity } from '../lib/remote/profile';
import { metadata } from '../lib/remote/account-store';
import ProfileOnboarding from './ProfileOnboarding';



export default function AccountGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [guestStorage] = useState(guestStore);
  const [identity, setIdentity] = useState<AccountIdentity | null>();
  const [store, setStore] = useState<AccountStore | null>(null);
  const [generation, setGeneration] = useState(0);
  const [, redraw] = useState(0);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [legacy, setLegacy] = useState<LegacySource>();
  const [migrationPreview, setMigrationPreview] = useState<MigrationPreview>();
  const [migrationChoices, setMigrationChoices] = useState<Record<string, BackupResolution>>({});
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'local' | 'server'>>({});
  const [copies, setCopies] = useState<Awaited<ReturnType<typeof recoveryCopies>>>([]);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const syncing = useRef(false);
  const initialRefresh = useRef(false);
  const signingOut = useRef(false);
  const storeRef = useRef<AccountStore | null>(null);
  const configured = !!remoteClient();

  useEffect(() => {
    // Remember the explicit guest choice in this tab; data stays in its own store.
    try { if (sessionStorage.getItem('cheesit-access-mode') === 'guest') setGuest(true); } catch {}
    // The client captures only callback metadata before the SDK consumes the URL.
    const returned = authRedirect();
    let googlePending = false;
    try { googlePending = sessionStorage.getItem(GOOGLE_PENDING) === '1'; } catch { /* Storage may be unavailable. */ }
    if (returned?.recovery) setRecovery(true);
    if (returned?.error) setError(returned.google || googlePending ? oauthErrorMessage(returned.error) : 'El enlace no es válido o ha caducado. Solicita otro correo de acceso.');
    const client = remoteClient();
    if (!client) { setReady(true); return; }
    const { data } = client.auth.onAuthStateChange((event, value) => {
      if (event === 'INITIAL_SESSION') {
        if (!value && !returned?.error && (returned?.google || googlePending)) setError(oauthErrorMessage('access_denied'));
        try { sessionStorage.removeItem(GOOGLE_PENDING); } catch { /* No credentials are kept in the marker. */ }
        if (returned?.google) window.history.replaceState(null, '', window.location.pathname);
      }
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (storeRef.current && storeRef.current.owner !== value?.user.id) { const previous = storeRef.current; void previous.closePreservingPending().catch(() => undefined); storeRef.current = null; setStore(null); }
      setSession(value); setReady(true);
    });
    const backFromGoogle = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      try {
        if (sessionStorage.getItem(GOOGLE_PENDING)) { sessionStorage.removeItem(GOOGLE_PENDING); setError(oauthErrorMessage('access_denied')); }
      } catch { /* The provider also returns explicit cancellation errors. */ }
    };
    window.addEventListener('pageshow', backFromGoogle);
    return () => { data.subscription.unsubscribe(); window.removeEventListener('pageshow', backFromGoogle); };
  }, []);

  useEffect(() => {
    if (!session?.user.id || recovery) return;
    let active = true; let current: AccountStore | undefined;
    setError(''); setGuest(false); setIdentity(undefined); setStore(null); setLegacy(undefined); setMigrationPreview(undefined); setConflictChoices({}); setCopies([]); setMigrationChoices({});
    const owner = session.user.id;
    initialRefresh.current = false;
    void (async () => {
      current = await new AccountStore(owner, accountTransport(owner)).initialize();
      if (!active) { current.dispose(); return; }
      storeRef.current = current; setStore(current);
      // A previously confirmed identity can open the verified account cache
      // immediately, while the cloud refresh retries in the background.
      const cachedIdentity = await metadata<AccountIdentity>(`identity:${owner}`);
      if (!active) return;
      if (cachedIdentity?.owner_id === owner && cachedIdentity.completed_at) setIdentity(cachedIdentity);
      try {
        const changed = await current.synchronize();
        if (active && changed) {
          // A verified cache can mount the app before the first download ends.
          // Refresh that mounted view, while preserving an open unsaved editor.
          if (window.dispatchEvent(new Event('cheesit:before-update', { cancelable: true }))) setGeneration(v => v + 1);
          else initialRefresh.current = true;
        }
      }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo abrir tu cuenta.'); }
      if (!active) return;
      try {
        const savedIdentity = await fetchIdentity(owner);
        if (!active) return;
        if (savedIdentity?.completed_at) await metadata(`identity:${owner}`, savedIdentity);
        if (active) setIdentity(savedIdentity);
      } catch (reason) {
        const cached = await metadata<AccountIdentity>(`identity:${owner}`);
        if (active && cached?.owner_id === owner && cached.completed_at) setIdentity(cached);
        else if (active) setError(reason instanceof Error ? reason.message : 'No se pudo recuperar tu perfil.');
      }
      redraw(v => v + 1);
      const savedCopies = await recoveryCopies(owner); if (active) setCopies(savedCopies);
      const source = await legacySource();
      if (active && source && (!source.owner || source.owner === owner) && !current.getSnapshot().base.migrations.includes(source.id)) setLegacy(source);
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo abrir el almacenamiento.'); });
    return () => { active = false; if (current) void current.closePreservingPending().catch(() => undefined); if (storeRef.current === current) storeRef.current = null; };
  }, [session?.user.id, recovery]);

  async function synchronize() {
    if (!store || syncing.current || !session || store.owner !== session.user.id) return;
    syncing.current = true;
    try {
      await store.flushData();
      if (storeRef.current !== store) return;
      // Historical edits are held in memory until explicitly saved by their editor.
      if (!window.dispatchEvent(new Event('cheesit:before-update', { cancelable: true }))) return;
      const changed = await store.synchronize();
      if (storeRef.current !== store) return;
      await store.flushData();
      if (storeRef.current !== store) return;
      const refresh = store.consumeRefresh() || initialRefresh.current;
      initialRefresh.current = false;
      if (changed || refresh) setGeneration(v => v + 1);
      const savedIdentity = await fetchIdentity(store.owner);
      if (storeRef.current !== store) return;
      if (savedIdentity?.completed_at) await metadata(`identity:${store.owner}`, savedIdentity);
      if (storeRef.current !== store) return;
      setIdentity(savedIdentity);
      setError('');
      if (legacy && store.getSnapshot().base.migrations.includes(legacy.id)) { await claimLegacy(store.owner, legacy); setLegacy(undefined); setMigrationPreview(undefined); }
    } catch (reason) { if (storeRef.current === store) setError(reason instanceof Error ? reason.message : 'No se pudo sincronizar.'); }
    finally { syncing.current = false; redraw(v => v + 1); }
  }
  useEffect(() => {
    if (!store) return;
    let timer: ReturnType<typeof setTimeout>;
    const unsub = store.subscribe(() => { redraw(v => v + 1); if (!syncing.current && !store.hasPendingData() && store.consumeRefresh()) setGeneration(v => v + 1); clearTimeout(timer); if (store.status === 'pending' && navigator.onLine && !syncing.current) timer = setTimeout(() => void synchronize(), 800); });
    const trigger = () => { if (document.visibilityState === 'visible') void synchronize(); };
    const interval = setInterval(trigger, 15000);
    window.addEventListener('online', trigger); window.addEventListener('focus', trigger); document.addEventListener('visibilitychange', trigger);
    return () => { unsub(); clearTimeout(timer); clearInterval(interval); window.removeEventListener('online', trigger); window.removeEventListener('focus', trigger); document.removeEventListener('visibilitychange', trigger); };
  }, [store, session?.user.id, legacy]);

  function previewMigration(choices = migrationChoices) {
    if (!legacy || !store || storeRef.current !== store || (legacy.owner && legacy.owner !== store.owner)) return;
    const preview = previewLegacy(legacy.data, store.getSnapshot().draft, choices);
    setMigrationPreview(preview); return preview;
  }
  async function migrate() {
    if (!legacy || !store || migrationBusy) return;
    setMigrationBusy(true); setError('');
    try {
      await store.flushData();
      if (storeRef.current !== store) return;
      if (store.getSnapshot().draft.migrations.includes(legacy.id)) { await synchronize(); return; }
      const preview = previewMigration(); if (!preview || preview.conflicts.length) return;
      // Bind before enqueuing; another account must not claim an interrupted migration.
      const claimed = await claimLegacy(store.owner, legacy); if (storeRef.current !== store) return; setLegacy(claimed);
      await store.migrate(preview.merged, legacy.id); if (storeRef.current !== store) return; setMigrationPreview(undefined); setGeneration(v => v + 1); await synchronize();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo incorporar el historial. Se conserva el original.'); }
    finally { setMigrationBusy(false); }
  }
  async function leaveAccount() {
    if (signingOut.current) return false;
    signingOut.current = true;
    try {
      if (!window.dispatchEvent(new Event('cheesit:before-update', { cancelable: true }))) throw new Error('Guarda o descarta la edición abierta antes de cerrar sesión.');
      await store?.flushData();
      if (store?.hasUnsynced() && !window.confirm('Hay cambios pendientes de subir. Se conservarán vinculados a esta cuenta en este navegador y se enviarán al volver a iniciar sesión con ella. No aparecerán en otra cuenta. ¿Cerrar sesión y conservarlos aquí?')) return false;
      await signOut(); setSession(null); setStore(null);
      return true;
    } finally { signingOut.current = false; }
  }
  const panel = <AccountPanel ownerId={session?.user.id} email={session?.user.email} hasPending={store?.hasUnsynced() ?? false} recovery={recovery} onRecovered={() => { window.history.replaceState(null, '', window.location.pathname); setRecovery(false); }} onAuthenticated={() => setRecovery(false)} onSignOut={leaveAccount}/>;
  const accountSettings = <section className="settings-section account-settings" aria-label="Cuenta y sincronización"><span className="eyebrow">TU CUENTA</span><h2>Cuenta y sincronización</h2><div className="settings-card account-sync-card"><div className="account-sync-copy"><strong>Sincronización</strong><span role="status">{store ? syncStatusLabel[store.status] : 'Abriendo tu cuenta…'}</span></div><button className="secondary" disabled={syncing.current} onClick={() => void synchronize()}>Reintentar sincronización</button></div>{(error || store?.error) && <p className="account-settings-error" role="alert">{error || store?.error}</p>}<details className="account-settings-details"><summary>Mi cuenta</summary><div className="account-settings-content">{panel}<button onClick={()=>void recoveryCopies(store!.owner).then(value => { if (storeRef.current === store) setCopies(value); })}>Revisar copias de conflictos</button>{copies.map(copy=><details key={copy.key}><summary>Copia {new Date(Number(copy.key.split(':').at(-1))).toLocaleString('es-ES')}</summary><p>Rama conservada en este navegador. Puedes revisarla e incorporarla como una migración, con sus conflictos.</p><button onClick={()=>{setLegacy({id:copy.key,data:copy.local.data,owner:store!.owner});setMigrationPreview(undefined);setMigrationChoices({})}}>Revisar incorporación de esta copia</button></details>)}</div></details></section>;
  if (!ready) return <main className="account-page app-loading" aria-busy="true"><img src="/cheesit-logo.png" alt="Cheesit" width={72} height={48}/><p role="status">Comprobando tu sesión…</p><div className="loading-track" aria-hidden="true"/></main>;
  if (!session && guest && !recovery) return <EntrenosApp store={guestStorage} guest accountSettings={<section className="settings-section"><h2>Modo invitado</h2><p>Tu actividad se guarda solo en este navegador. Inicia sesión para usar una cuenta con sincronización.</p><button className="secondary" onClick={() => { if (window.dispatchEvent(new Event('cheesit:before-update', { cancelable: true }))) void guestStorage.flushData().then(() => { try { sessionStorage.removeItem('cheesit-access-mode'); } catch {} setGuest(false); }).catch(e => setError(e.message)); }}>Ir a iniciar sesión</button></section>}/>;
  if (!session || recovery) return <main className="account-page"><div className="account-card"><img src="/cheesit-logo.png" width="144" height="96" alt="Cheesit"/><span className="eyebrow">CADA REP CUENTA</span><h1>Tu entrenamiento.<br/>A tu ritmo.</h1><p>Registra tus sesiones y consulta tu progreso. Con una cuenta, tendrás tus datos en todos tus dispositivos.</p>{panel}{!recovery && <button type="button" className={`guest-access ${configured?'':'guest-primary'}`} onClick={() => { setError(''); try { sessionStorage.setItem('cheesit-access-mode', 'guest'); } catch {} setGuest(true); }}>Continuar como invitado</button>}{error && <p role="alert">{error}</p>}{!configured && <p className="account-local-note">Puedes probar la app como invitado. Tu actividad se guardará en este navegador.</p>}</div><OfflineShell/></main>;
  const usable = store?.owner === session.user.id && store.getSnapshot().verified;
  if (usable && store && identity !== undefined && !identity?.completed_at) return <ProfileOnboarding key={store.owner} owner={store.owner} identity={identity} data={store.getSnapshot().base.data} accountPanel={panel} onComplete={async saved => {
    await store.synchronize();
    if (storeRef.current !== store) return;
    await metadata(`identity:${store.owner}`, saved);
    if (storeRef.current !== store) return;
    setIdentity(saved); setGeneration(v => v + 1);
  }}/>;
  return <>

    {(!usable || !identity?.completed_at || !!store?.conflicts().length) && (error || store?.error) && <div className="account-notice" role="alert">{error || store?.error}</div>}
    {store && store.conflicts().length > 0 && <section className="account-notice account-conflicts" aria-label="Conflictos de sincronización"><h2>Revisa los cambios de tus dispositivos</h2><p>Ambas versiones están conservadas. Historial, perfil de entrenamiento y economía se resuelven juntos para evitar duplicar premios o gastar dos veces una carga. La foto, el nombre y la biografía se revisan por separado. La versión descartada quedará como copia de recuperación local. Las eliminaciones confirmadas se mantienen al elegir cualquiera de las versiones.</p>{store.conflicts().map(c => <fieldset key={c.key}><legend>{c.label}</legend><details><summary>Comparar versiones</summary><h3>Este dispositivo</h3><AccountVersion value={c.local}/><h3>Cuenta</h3><AccountVersion value={c.server}/></details><label><input type="radio" name={c.key} checked={conflictChoices[c.key] === 'server'} onChange={() => setConflictChoices(v => ({ ...v, [c.key]: 'server' }))}/> Usar versión de la cuenta</label><label><input type="radio" name={c.key} checked={conflictChoices[c.key] === 'local'} onChange={() => setConflictChoices(v => ({ ...v, [c.key]: 'local' }))}/> Usar versión de este dispositivo</label></fieldset>)}<button className="primary" onClick={() => void store.resolve(conflictChoices).then(() => { setConflictChoices({}); setGeneration(v => v + 1); return synchronize(); }).catch(e => setError(e.message))}>Confirmar resolución</button></section>}
    {legacy && (!legacy.owner || legacy.owner === store?.owner) && usable && <section className="account-notice" aria-label="Historial anterior"><h2>Tu historial anterior sigue aquí</h2><p>{legacy.data.workouts.length} entrenamientos y {legacy.data.routines.length} rutinas, junto con tus borradores y estado del juego. Puedes incorporarlos a esta cuenta sin archivos. Conservaremos el original incluso después del guardado.</p>{store?.getSnapshot().draft.migrations.includes(legacy.id) ? <p>Incorporación pendiente de confirmación en la nube. Reintenta la sincronización.</p> : <><button className="secondary" disabled={migrationBusy} onClick={() => { try { previewMigration(); } catch (e) { setError((e as Error).message); } }}>Revisar incorporación</button>{migrationPreview && <><p>Se añadirán {Object.values(migrationPreview.newCounts).reduce((a, b) => a + b, 0)} registros. Los identificadores coincidentes no se duplican.</p>{migrationPreview.conflictDetails.map(c => <fieldset key={c.key}><legend>{c.name}</legend><details><summary>Comparar versiones</summary><h3>Cuenta</h3><AccountVersion value={c.local}/><h3>Historial anterior</h3><AccountVersion value={c.incoming}/></details>{c.choices.filter(x => x !== 'duplicate').map(choice => <label key={choice}><input type="radio" name={`migration-${c.key}`} checked={migrationChoices[c.key] === choice} onChange={() => { const next = { ...migrationChoices, [c.key]: choice }; setMigrationChoices(next); try { previewMigration(next); } catch (e) { setError((e as Error).message); } }}/>{choice === 'local' ? 'Conservar cuenta' : 'Usar historial anterior'}</label>)}</fieldset>)}<button className="primary" disabled={migrationBusy || migrationPreview.conflicts.length > 0} onClick={() => void migrate()}>Incorporar a mi cuenta</button></>}</>}</section>}
    {usable && store && store.conflicts().length > 0 ? null : usable && store && identity?.completed_at ? <EntrenosApp key={`${store.owner}:${generation}`} store={store} username={identity.username} accountSettings={accountSettings} onSignOut={leaveAccount}/> : <main className="account-page"><div className="account-card"><h1>Preparando tu cuenta</h1><p>Necesitas conexión para descargarla por primera vez. Después podrás entrenar sin cobertura.</p><button className="primary" onClick={() => void synchronize()}>Reintentar</button>{panel}</div></main>}
  </>;
}
