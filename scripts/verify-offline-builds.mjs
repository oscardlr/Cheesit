// Local verification only: build two real releases and test update/offline recovery at one origin.
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const repo = process.cwd();
const next = join(repo, 'node_modules/next/dist/bin/next');
const fixture = await mkdtemp(join(tmpdir(), 'cheesit-offline-'));
const servers = [];
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
delete environment.NEXT_PUBLIC_OFFLINE_CHECKPOINT;
const previousPort = process.env.CHEESIT_OFFLINE_PREVIOUS_PORT ?? '3211';
const currentPort = process.env.CHEESIT_OFFLINE_CURRENT_PORT ?? '3212';

function run(command, args, env = environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: repo, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${command} terminó con ${signal ?? code}`)));
  });
}
async function build(env) {
  await run(process.execPath, [next, 'build'], env);
  await run(process.execPath, ['scripts/generate-offline-manifest.mjs'], env);
}
async function start(directory, port) {
  const child = spawn(process.execPath, [next, 'start', directory, '--hostname', '127.0.0.1', '--port', port], { cwd: repo, env: environment, stdio: 'inherit' });
  servers.push(child);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`El servidor local ${port} no pudo arrancar.`);
    try { if ((await fetch(`http://127.0.0.1:${port}/offline-manifest.json`)).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error(`El servidor local ${port} no respondió.`);
}
try {
  console.log('Preparando compilación anterior para verificar la actualización…');
  await build({ ...environment, NEXT_PUBLIC_OFFLINE_CHECKPOINT: 'previous-release-verification' });
  await cp(join(repo, '.next'), join(fixture, '.next'), { recursive: true, filter: path => ![join(repo, '.next/cache'), join(repo, '.next/dev')].some(excluded => path === excluded || path.startsWith(excluded + sep)) });
  await cp(join(repo, 'public'), join(fixture, 'public'), { recursive: true });
  await symlink(join(repo, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  await symlink(join(repo, 'src'), join(fixture, 'src'), 'dir');
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'cheesit-offline-verification', private: true, type: 'module' }));
  await writeFile(join(fixture, 'next.config.mjs'), 'export default { devIndicators: false };\n');
  await mkdir(join(fixture, 'scripts'), { recursive: true });
  await start(fixture, previousPort);
  console.log('Preparando compilación final y comprobando ambos despliegues en Chromium…');
  await build(environment);
  await start(repo, currentPort);
  await run(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', 'tests/offline.spec.ts', '--workers=1'], {
    ...environment,
    PLAYWRIGHT_PRODUCTION: '1',
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${currentPort}`,
    PLAYWRIGHT_UPDATE_BASE_URL: `http://127.0.0.1:${previousPort}`,
  });
} finally {
  await Promise.all(servers.map(child => new Promise(resolveStop => {
    if (child.exitCode !== null) return resolveStop();
    child.once('exit', resolveStop); child.kill('SIGTERM');
  })));
  await rm(fixture, { recursive: true, force: true });
}
