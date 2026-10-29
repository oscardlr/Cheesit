import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOG, exerciseImage } from '../src/lib/catalog';

test('every catalog exercise has a distinct, self-contained local illustration', () => {
  const illustrations = new Set<string>();
  for (const exercise of CATALOG) {
    assert.equal(exercise.image, `/assets/exercises/${exercise.id}.svg`, exercise.id);
    const source = readFileSync(new URL(`../public${exercise.image}`, import.meta.url), 'utf8');
    assert.match(source, /viewBox="0 0 160 128"/);
    assert.match(source, /<title>[^<]+<\/title>/);
    assert.match(source, /<desc>[^<]+<\/desc>/);
    assert.doesNotMatch(source, /<(?:image|script|foreignObject)\b|(?:href|src)=/i);
    // Compare artwork alone: different titles must not conceal a repeated placeholder.
    const artwork = source.replace(/<(title|desc)>.*?<\/\1>/g, '');
    illustrations.add(createHash('sha256').update(artwork).digest('hex'));
    assert.equal(exerciseImage(exercise.id), exercise.image);
  }
  assert.equal(illustrations.size, CATALOG.length);
});

test('historical exercise IDs resolve art without rewriting their snapshots', () => {
  const historical = { exerciseId: 'press-banca-barra', name: 'Mi nombre antiguo' };
  const original = structuredClone(historical);
  assert.equal(exerciseImage(historical.exerciseId), '/assets/exercises/press-banca-barra.svg');
  assert.deepEqual(historical, original);
  assert.equal(exerciseImage('custom-exercise'), null);
  assert.equal(exerciseImage('missing-catalog-item'), null);
});

test('custom images accept only local exercise assets and otherwise use the visual fallback', () => {
  assert.equal(exerciseImage('custom-exercise', '/assets/exercises/flexiones.svg'), '/assets/exercises/flexiones.svg');
  for (const source of ['https://example.com/image.svg', '//example.com/image.svg', 'data:image/svg+xml,bad', '/assets/exercises/../../other.svg', '/assets/exercises/Flexiones.svg', '']) {
    assert.equal(exerciseImage('custom-exercise', source), null);
  }
});
