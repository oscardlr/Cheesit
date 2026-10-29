import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { CHARACTER_ART, CHARACTER_ATLAS, CHARACTER_MASTER, CHARACTER_MASKS, CHARACTER_VIEWBOX, COMPANION_ART } from '../src/lib/character-art';
import { CHARACTER_EQUIPMENT_COMBINATIONS, enumerateCharacterEquipment } from '../src/lib/character-catalog';

const frame = CHARACTER_VIEWBOX.split(/\s+/).map(Number);
const atlas = readFileSync(new URL(`../public${CHARACTER_ATLAS.src}`, import.meta.url));
const fitsFrame = ([x, y, width, height]: readonly number[]) => x >= frame[0] && y >= frame[1] && x + width <= frame[0] + frame[2] && y + height <= frame[1] + frame[3];

test('one final transparent atlas contains the 35 stable gear IDs and four existing companions', () => {
  assert.deepEqual([...atlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(atlas.toString('ascii', 12, 16), 'IHDR');
  assert.equal(atlas.readUInt32BE(16), CHARACTER_ATLAS.width);
  assert.equal(atlas.readUInt32BE(20), CHARACTER_ATLAS.height);
  assert.ok([4, 6].includes(atlas[25]), 'atlas has an alpha channel');
  assert.deepEqual(new Set(Object.keys(CHARACTER_ART)), new Set(GEAR.map(item => item.id)));
  assert.deepEqual(new Set(Object.keys(COMPANION_ART)), new Set(COMPANIONS.map(item => item.id)));
  assert.equal(CHARACTER_MASTER.stage, 'base-v1');
  assert.equal(CHARACTER_MASTER.src, '/assets/grind-avatar-base.png');
  assert.ok(CHARACTER_MASKS.rightHand);
  assert.ok(CHARACTER_MASKS.backClasp);
});

test('all tailored clothes retain their authored scale and reused accessories use uniform scaling', () => {
  const tailored: string[] = [], reused: string[] = [];
  for (const gear of GEAR) {
    const art = CHARACTER_ART[gear.id];
    assert.equal(art.slot, gear.slot, gear.id);
    assert.ok(art.source.every(Number.isSafeInteger), `${gear.id}: pixel-aligned crop`);
    const [sx, sy, sw, sh] = art.source;
    assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && sx + sw <= CHARACTER_ATLAS.width && sy + sh <= CHARACTER_ATLAS.height, `${gear.id}: existing atlas source`);
    const [x, y, width, height] = art.target;
    assert.ok([x, y, width, height].every(Number.isFinite));
    assert.ok(width > 0 && height > 0);
    assert.ok(fitsFrame(art.target), `${gear.id}: complete target fits the stable frame`);
    assert.ok(Math.abs(width / sw - height / sh) < .001, `${gear.id}: no nonuniform scaling`);
    if (art.origin === 'tailored') {
      tailored.push(gear.id);
      assert.equal(sw, width, `${gear.id}: authored width is preserved`);
      assert.equal(sh, height, `${gear.id}: authored height is preserved`);
    } else {
      reused.push(gear.id);
      assert.equal(art.origin, 'reused');
    }
  }
  assert.equal(tailored.length, 16);
  assert.equal(reused.length, 19);
  assert.equal(tailored.filter(id => GEAR.find(item => item.id === id)?.slot === 'top').length, 8);
  assert.equal(tailored.filter(id => GEAR.find(item => item.id === id)?.slot === 'bottom').length, 7);
  assert.ok(tailored.includes('starlight-gauntlet'));
});

test('every valid combination resolves only complete, correctly slotted art in the same body frame', () => {
  let count = 0;
  const covered = new Set<string>();
  for (const equipment of enumerateCharacterEquipment()) {
    for (const [slot, id] of Object.entries(equipment)) {
      const art = CHARACTER_ART[id];
      assert.ok(art, `outfit ${count}: missing ${id}`);
      assert.equal(art.slot, slot);
      assert.ok(fitsFrame(art.target), `outfit ${count}: clipped ${id}`);
      covered.add(id);
    }
    count++;
  }
  assert.equal(count, CHARACTER_EQUIPMENT_COMBINATIONS);
  assert.equal(covered.size, 35);
});

test('companion crops include complete independent original characters without foreign fragments', async () => {
  for (const companion of COMPANIONS) {
    const art = COMPANION_ART[companion.id];
    const source = Array.isArray(art) ? art : art.source;
    const [x, y, width, height] = source;
    assert.ok(source.every(Number.isSafeInteger), companion.id);
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= CHARACTER_ATLAS.width && y + height <= CHARACTER_ATLAS.height, companion.id);
    const { data } = await sharp(atlas).extract({ left: x, top: y, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const visited = new Uint8Array(width * height), queue = new Int32Array(visited.length);
    let visible = 0, largest = 0;
    for (let pixel = 0; pixel < visited.length; pixel++) {
      if (visited[pixel] || data[pixel * 4 + 3] < 24) continue;
      let start = 0, length = 1;
      queue[0] = pixel; visited[pixel] = 1;
      while (start < length) {
        const current = queue[start++], px = current % width, py = Math.floor(current / width);
        for (const next of [px > 0 ? current - 1 : -1, px < width - 1 ? current + 1 : -1, py > 0 ? current - width : -1, py < height - 1 ? current + width : -1]) {
          if (next >= 0 && !visited[next] && data[next * 4 + 3] >= 24) { visited[next] = 1; queue[length++] = next; }
        }
      }
      visible += length; largest = Math.max(largest, length);
    }
    assert.ok(largest > 50_000, `${companion.id}: full original body remains`);
    // Small disconnected orb wisps belong to Nyx. Large disconnected pieces were
    // foreign hair, cloth and orb fragments from the neighbouring atlas columns.
    assert.ok(largest / visible > .995, `${companion.id}: foreign disconnected fragments remain`);
  }
});
