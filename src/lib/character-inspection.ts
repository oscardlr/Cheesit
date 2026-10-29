import { COMPANIONS } from './companions';
import { GEAR, type GearSlot } from './gear';
import { normalizeGame, type GameState, type InventoryItem } from './game';
import { CHARACTER_GEAR_SLOTS, CHARACTER_EQUIPMENT_COMBINATIONS, CHARACTER_PARTY_COMBINATIONS } from './character-catalog';

export const INSPECTION_SLOTS: readonly GearSlot[] = CHARACTER_GEAR_SLOTS;
export const INSPECTION_SLOT_ITEMS = Object.fromEntries(INSPECTION_SLOTS.map(slot => [slot, GEAR.filter(item => item.slot === slot)])) as Record<GearSlot, typeof GEAR>;
export const CHARACTER_COMBINATION_COUNT = CHARACTER_EQUIPMENT_COMBINATIONS;
export const PARTY_COMBINATION_COUNT = CHARACTER_PARTY_COMBINATIONS;

// This fixture belongs only to the inspection route. It never reads or writes
// storage and cannot grant items to a saved player inventory.
const inspectionInventory: InventoryItem[] = [
  ...GEAR.map(item => ({ id: `inspection-${item.id}`, kind: 'gear' as const, gearId: item.id, rarity: item.rarity, acquiredAt: '2026-01-01T00:00:00.000Z', crateId: 'starter', sold: false })),
  ...COMPANIONS.map(item => ({ id: `inspection-${item.id}`, kind: 'companion' as const, companionId: item.id, rarity: item.rarity, acquiredAt: '2026-01-01T00:00:00.000Z', crateId: 'starter', sold: false })),
];

export function inspectionGame(gearIds: readonly string[], companionId: string | null = null): GameState {
  return { ...normalizeGame(), inventory: inspectionInventory, cosmeticGear: Object.fromEntries(GEAR.filter(item => gearIds.includes(item.id)).map(item => [item.slot, item.id])), equippedCompanionId: companionId };
}

/** Mixed-radix enumeration includes the empty choice in every slot exactly once. */
export function inspectionCombination(index: number): string[] {
  let remaining = Math.max(0, Math.min(CHARACTER_COMBINATION_COUNT - 1, Math.trunc(index)));
  return INSPECTION_SLOTS.flatMap(slot => {
    const options = INSPECTION_SLOT_ITEMS[slot];
    const selected = remaining % (options.length + 1);
    remaining = Math.floor(remaining / (options.length + 1));
    return selected ? [options[selected - 1].id] : [];
  });
}

export type InspectionPreset = { id: string; label: string; gearIds: string[] };
export const COLLECTION_INSPECTION_PRESETS: InspectionPreset[] = ['ronin', 'glacier', 'cosmic'].map(collection => ({ id: collection, label: GEAR.find(item => item.id === `${collection}-top`)!.collection!, gearIds: INSPECTION_SLOTS.map(slot => `${collection}-${slot}`) }));
const armorIds = ['golden-armor', 'celestial-armor', 'ronin-top', 'glacier-top', 'cosmic-top'];
const backIds = ['violet-cape', 'neon-wings', 'solar-cape'];
export const OVERLAP_INSPECTION_PRESETS: InspectionPreset[] = armorIds.flatMap(top => backIds.flatMap(back => INSPECTION_SLOT_ITEMS.hand.map(hand => ({ id: `${top}-${back}-${hand.id}`, label: [top, back, hand.id].map(id => GEAR.find(item => item.id === id)!.name).join(' · '), gearIds: [top, back, hand.id] }))));
