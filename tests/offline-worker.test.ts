import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function workerHarness(options: { manifestVersion?: string; missing?: string } = {}) {
  const origin = 'https://cheesit.test';
  const version = 'build-2026-test';
  const assets = ['/_next/static/app.js', '/_next/static/app.css', '/icon.svg'];
  const storage = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: unknown) => void>();
  let activations = 0;
  const pathOf = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).pathname;
  const fetch = async (request: string | Request) => {
    const path = pathOf(request);
    if (path === options.missing) return new Response('missing', { status: 404 });
    if (path === '/offline-manifest.json') return Response.json({ version: options.manifestVersion ?? version, assets });
    if (path === '/') return new Response('<html><script src="/_next/static/app.js"></script><link href="/_next/static/app.css"></html>');
    return new Response('asset');
  };
  const caches = {
    open: async (name: string) => {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name)!;
      return {
        put: async (key: string | Request, response: Response) => { entries.set(pathOf(key), response.clone()); },
        match: async (key: string | Request) => entries.get(pathOf(key))?.clone(),
        addAll: async (requests: Request[]) => {
          for (const request of requests) {
            const response = await fetch(request);
            if (!response.ok) throw new Error('Missing asset');
            entries.set(pathOf(request), response.clone());
          }
        },
      };
    },
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
  };
  class LocalRequest extends Request { constructor(path: string, init?: RequestInit) { super(new URL(path, origin), init); } }
  runInNewContext(source, {
    self: { location: { href: `${origin}/sw.js?v=${version}`, origin }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), skipWaiting: async () => { activations++; }, clients: { claim: async () => {} } },
    URL, Response, Request: LocalRequest, caches, fetch,
  });
  const dispatch = async (name: string, detail = {}) => {
    let operation: Promise<unknown> | undefined;
    handlers.get(name)!({ ...detail, waitUntil: (promise: Promise<unknown>) => { operation = promise; } });
    await operation;
  };
  const status = async () => {
    let result: { ready: boolean; version: string; resources: number } | undefined;
    await dispatch('message', { data: { type: 'CHEESIT_OFFLINE_STATUS' }, ports: [{ postMessage: (value: typeof result) => { result = value; } }] });
    return result!;
  };
  return { dispatch, status, storage, version, activations: () => activations };
}

test('offline preparation verifies every resource and waits for explicit activation', async () => {
  const worker = workerHarness();
  await worker.dispatch('install');
  const ready = await worker.status();
  assert.equal(ready.ready, true);
  assert.equal(ready.version, worker.version);
  assert.equal(ready.resources, 3);
  assert.equal(worker.activations(), 0);
  await worker.dispatch('message', { data: { type: 'CHEESIT_ACTIVATE_UPDATE' } });
  assert.equal(worker.activations(), 1);
  worker.storage.get(`cheesit-shell-${worker.version}`)!.delete('/_next/static/app.js');
  assert.equal((await worker.status()).ready, false);
  await worker.dispatch('message', { data: { type: 'CHEESIT_ACTIVATE_UPDATE' } });
  assert.equal(worker.activations(), 1);
  let recovered = false;
  await worker.dispatch('message', { data: { type: 'CHEESIT_PREPARE_OFFLINE' }, ports: [{ postMessage: (status: { ready: boolean }) => { recovered = status.ready; } }] });
  assert.equal(recovered, true);
  assert.equal((await worker.status()).ready, true);
});

test('a failed or mismatched build cannot announce an offline-ready shell', async () => {
  const missing = workerHarness({ missing: '/_next/static/app.css' });
  await assert.rejects(missing.dispatch('install'), /Missing asset/);
  assert.equal((await missing.status()).ready, false);
  const mismatch = workerHarness({ manifestVersion: 'another-deployment' });
  await assert.rejects(mismatch.dispatch('install'), /no coincide/);
  assert.equal((await mismatch.status()).ready, false);
});

test('activation retains previous immutable chunks while removing older shell caches', async () => {
  const worker = workerHarness();
  worker.storage.set('cheesit-shell-oldest', new Map());
  worker.storage.set('cheesit-shell-previous', new Map());
  worker.storage.set('entrenos-shell-v20', new Map());
  await worker.dispatch('install');
  await worker.dispatch('activate');
  assert.deepEqual([...worker.storage.keys()], ['cheesit-shell-previous', `cheesit-shell-${worker.version}`]);
});
