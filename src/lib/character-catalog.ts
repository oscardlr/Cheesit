import { GEAR, type GearSlot } from './gear';
import { COMPANIONS } from './companions';

/** Visual combinations are independent of rarity, collection and ability choice. */
export const CHARACTER_GEAR_SLOTS = ['head', 'top', 'bottom', 'hand', 'back'] as const satisfies readonly GearSlot[];
export type CharacterEquipment = Partial<Record<GearSlot, string>>;
export const CHARACTER_SLOT_COUNTS = Object.fromEntries(
  CHARACTER_GEAR_SLOTS.map(slot => [slot, GEAR.filter(gear => gear.slot === slot).length]),
) as Record<GearSlot, number>;

/** The empty option in each slot is the existing basic outfit, not another illustration. */
export const CHARACTER_EQUIPMENT_COMBINATIONS = CHARACTER_GEAR_SLOTS.reduce(
  (combinations, slot) => combinations * (CHARACTER_SLOT_COUNTS[slot] + 1), 1,
);
export const CHARACTER_PARTY_COMBINATIONS = CHARACTER_EQUIPMENT_COMBINATIONS * (COMPANIONS.length + 1);

/**
 * Full catalog only. equipCosmetic additionally requires a permanently unlocked,
 * revealed appearance, so an individual save may have fewer available combinations.
 * There are no cross-slot exclusions in the existing game rules.
 */
export function* enumerateCharacterEquipment(): Generator<CharacterEquipment> {
  const options = CHARACTER_GEAR_SLOTS.map(slot => [undefined, ...GEAR.filter(gear => gear.slot === slot).map(gear => gear.id)]);
  function* visit(index: number, equipment: CharacterEquipment): Generator<CharacterEquipment> {
    if (index === CHARACTER_GEAR_SLOTS.length) {
      yield { ...equipment };
      return;
    }
    const slot = CHARACTER_GEAR_SLOTS[index];
    for (const id of options[index]) {
      if (id) equipment[slot] = id;
      else delete equipment[slot];
      yield* visit(index + 1, equipment);
    }
    delete equipment[slot];
  }
  yield* visit(0, {});
}
