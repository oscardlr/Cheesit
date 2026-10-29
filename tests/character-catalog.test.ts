import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEAR } from '../src/lib/gear';
import { COMPANIONS } from '../src/lib/companions';
import { CHARACTER_EQUIPMENT_COMBINATIONS, CHARACTER_PARTY_COMBINATIONS, CHARACTER_SLOT_COUNTS, enumerateCharacterEquipment, type CharacterEquipment } from '../src/lib/character-catalog';

test('the catalog preserves 32,256 compatible outfits and adds eight independent cheesits plus the empty option', () => {
  assert.deepEqual(CHARACTER_SLOT_COUNTS, { head: 7, top: 8, bottom: 7, hand: 7, back: 6 });
  assert.equal(CHARACTER_EQUIPMENT_COMBINATIONS, 32_256);
  assert.equal(COMPANIONS.length, 8);
  assert.equal(CHARACTER_PARTY_COMBINATIONS, 290_304);
});

test('all full-catalog outfits are unique, use the correct slots and cover every item and empty slot', () => {
  const unique = new Set<string>();
  const covered = new Set<string>();
  const empty = new Set<string>();
  let count = 0;
  let previous: CharacterEquipment | undefined;
  for (const equipment of enumerateCharacterEquipment()) {
    assert.notEqual(equipment, previous, 'each yielded object can be safely retained');
    previous = equipment;
    for (const slot of Object.keys(CHARACTER_SLOT_COUNTS)) {
      const id = equipment[slot as keyof typeof equipment];
      if (!id) { empty.add(slot); continue; }
      const gear = GEAR.find(item => item.id === id);
      assert.equal(gear?.slot, slot, `${id} belongs to its own slot`);
      covered.add(id);
    }
    const signature = JSON.stringify(equipment);
    assert.ok(!unique.has(signature), 'no duplicate combination');
    unique.add(signature);
    count++;
  }
  assert.equal(count, CHARACTER_EQUIPMENT_COMBINATIONS);
  assert.equal(unique.size, count);
  assert.deepEqual(covered, new Set(GEAR.map(item => item.id)));
  assert.deepEqual(empty, new Set(['head', 'top', 'bottom', 'hand', 'back']));
  assert.ok(unique.has('{}'), 'completely unequipped is a valid outfit');
});
