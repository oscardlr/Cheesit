import type { NextConfig } from 'next';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A source/asset change automatically creates a new worker URL and isolated cache.
// Generated manifest output is excluded so rebuilding unchanged sources stays reproducible.
const hash = createHash('sha256');
function hashFiles(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) hashFiles(path);
    else if (path !== join('public', 'offline-manifest.json')) hash.update(path).update(readFileSync(path));
  }
}
for (const directory of ['src', 'public', 'scripts']) hashFiles(directory);
for (const path of ['next.config.ts', 'package.json', 'package-lock.json']) hash.update(readFileSync(path));
for (const name of Object.keys(process.env).filter(name => name.startsWith('NEXT_PUBLIC_')).sort()) hash.update(name).update(process.env[name] ?? '');
const shellVersion = hash.digest('hex').slice(0, 24);

const nextConfig: NextConfig = {
  // The development badge otherwise covers the mobile Resumen button.
  devIndicators: false,
  generateBuildId: async () => shellVersion,
  env: { NEXT_PUBLIC_SHELL_VERSION: shellVersion },
  async headers() {
    return ['/sw.js', '/offline-manifest.json'].map(source => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    }));
  },
};

export default nextConfig;
