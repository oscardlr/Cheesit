'use client';

import { useEffect, useRef, useState } from 'react';

import './offline-shell.css';

type OfflineState = 'preparing' | 'ready' | 'error' | 'update' | 'applying' | 'unsupported';

function inspect(worker: ServiceWorker, prepare = false): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => { channel.port1.close(); reject(new Error('No se pudo verificar la preparación offline.')); }, prepare ? 60000 : 10000);
    channel.port1.onmessage = event => {
      window.clearTimeout(timeout); channel.port1.close();
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data?.ready === true);
    };
    worker.postMessage({ type: prepare ? 'CHEESIT_PREPARE_OFFLINE' : 'CHEESIT_OFFLINE_STATUS' }, [channel.port2]);
  });
}

export default function OfflineShell({ flush = async () => undefined }: { flush?: () => Promise<void> }) {
  const [state, setState] = useState<OfflineState>('preparing');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) { setState('unsupported'); return; }
    let active = true;
    const cleanup: (() => void)[] = [];
    const fail = (reason: unknown) => { if (active) { setState('error'); setError(reason instanceof Error ? reason.message : 'No se pudo preparar el arranque sin conexión.'); } };
    const check = async (worker: ServiceWorker, waiting = false, prepare = false) => {
      const verified = await inspect(worker);
      const ready = !verified && prepare ? await inspect(worker, true) : verified;
      if (!active) return;
      if (!ready) throw new Error('La copia offline está incompleta. Vuelve a prepararla con conexión.');
      setState(waiting ? 'update' : 'ready');
      setError('');
    };
    const reload = () => { if (applying.current) window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    cleanup.push(() => navigator.serviceWorker.removeEventListener('controllerchange', reload));
    const register = async () => {
      let version = process.env.NEXT_PUBLIC_SHELL_VERSION;
      if (navigator.onLine) {
        // A cached HTML/client can be older than the deployed manifest.
        try {
          const response = await fetch('/offline-manifest.json', { cache: 'no-store' });
          const manifest = response.ok ? await response.json() as { version?: unknown } : null;
          if (typeof manifest?.version === 'string' && /^[a-f0-9]{24}$/.test(manifest.version)) version = manifest.version;
        } catch { /* An already verified shell can still be used offline. */ }
      }
      const result = await navigator.serviceWorker.register(`/sw.js?v=${version}`, { scope: '/', updateViaCache: 'none' });
      if (!active) return;
      registration.current = result;
      const watch = (worker: ServiceWorker) => {
        const changed = () => {
          if (worker.state === 'installed') void check(worker, Boolean(result.active)).catch(fail);
          if (worker.state === 'redundant') fail(new Error('No se pudo completar la preparación offline. Reintenta con conexión.'));
        };
        worker.addEventListener('statechange', changed);
        cleanup.push(() => worker.removeEventListener('statechange', changed));
        changed();
      };
      if (result.waiting) await check(result.waiting, true);
      else if (result.installing) watch(result.installing);
      else if (result.active) await check(result.active, false, attempt > 0);
      const found = () => { if (result.installing) watch(result.installing); };
      result.addEventListener('updatefound', found);
      cleanup.push(() => result.removeEventListener('updatefound', found));
      // The currently open client still contains its old build ID. Discover the new ID
      // from the generated manifest before registering; update() alone retains an old URL.
      let checking = false;
      const update = () => {
        if (checking || document.visibilityState !== 'visible' || !navigator.onLine) return;
        checking = true;
        void (async () => {
          const response = await fetch('/offline-manifest.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('No se pudo comprobar si hay una actualización.');
          const manifest = await response.json() as { version?: unknown };
          if (typeof manifest.version !== 'string' || !/^[a-f0-9]{24}$/.test(manifest.version)) throw new Error('La versión de la actualización no es válida.');
          const newest = result.waiting ?? result.installing ?? result.active;
          if (newest && new URL(newest.scriptURL).searchParams.get('v') === manifest.version) return;
          const updated = await navigator.serviceWorker.register(`/sw.js?v=${manifest.version}`, { scope: '/', updateViaCache: 'none' });
          registration.current = updated;
        })().catch(fail).finally(() => { checking = false; });
      };
      document.addEventListener('visibilitychange', update);
      window.addEventListener('focus', update);
      cleanup.push(() => document.removeEventListener('visibilitychange', update));
      cleanup.push(() => window.removeEventListener('focus', update));
    };
    void register().catch(fail);
    return () => { active = false; cleanup.forEach(dispose => dispose()); };
  }, [attempt]);

  async function applyUpdate() {
    if (!registration.current?.waiting || applying.current) return;
    // Editors can veto a reload while unsaved routine/history changes are in memory.
    if (!window.dispatchEvent(new Event('cheesit:before-update', { cancelable: true }))) return;
    setState('applying');
    try {
      await flush();
      applying.current = true;
      registration.current.waiting.postMessage({ type: 'CHEESIT_ACTIVATE_UPDATE' });
    } catch (reason) {
      applying.current = false;
      setState('error');
      setError(`No se actualizará hasta guardar tus cambios. ${reason instanceof Error ? reason.message : 'Reintenta el guardado o exporta una copia.'}`);
    }
  }

  if (process.env.NODE_ENV !== 'production') return null;
  return <aside className={`offline-shell offline-shell-${state}`} aria-label="Disponibilidad sin conexión" aria-live="polite">
    <p>{({ preparing: 'Preparando uso sin conexión…', ready: 'Disponible sin conexión', error: 'Preparación offline pendiente', update: 'Hay una actualización preparada', applying: 'Guardando y actualizando…', unsupported: 'Este navegador no permite preparar el arranque offline' })[state]}</p>
    {error && <p className="offline-shell-detail">{error}</p>}
    {state === 'error' && <button type="button" onClick={() => { setState('preparing'); setError(''); setAttempt(value => value + 1); }}>Reintentar preparación</button>}
    {state === 'update' && <button type="button" onClick={() => void applyUpdate()}>Guardar y actualizar</button>}
  </aside>;
}
