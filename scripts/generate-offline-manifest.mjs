import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory, prefix) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const url = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path, url));
    else if (!entry.name.endsWith('.map')) result.push(url);
  }
  return result;
}
const version = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const assets = [
  ...await files('.next/static', '/_next/static'),
  ...(await files('public', '')).filter(path => !['/sw.js', '/offline-manifest.json'].includes(path)),
].sort();
if (!version || !assets.some(path => path.endsWith('.js')) || !assets.some(path => path.endsWith('.css'))) throw new Error('La compilación no contiene una aplicación offline completa.');
await writeFile('public/offline-manifest.json', `${JSON.stringify({ version, assets }, null, 2)}\n`);
console.log(`Offline: ${assets.length} recursos preparados para ${version}.`);
