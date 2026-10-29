import assets from './character-assets.json' with { type: 'json' };
import type { GearSlot } from './gear';

export type CharacterRect = readonly [x: number, y: number, width: number, height: number];
export type CharacterArt = {
  slot: GearSlot;
  source: CharacterRect;
  target: CharacterRect;
  origin: 'tailored' | 'reused';
  grip?: boolean;
  foregroundMask?: string;
};

/** All geometry is in the unchanged base-v1 master's coordinates. No body scaling by level. */
export const CHARACTER_MASTER = { src: '/assets/grind-avatar-base.png', width: 1145, height: 1374, stage: 'base-v1' } as const;
export const CHARACTER_VIEWBOX = '-60 -60 1265 1494';
export const CHARACTER_ATLAS = assets.atlas;
export const CHARACTER_ART = assets.gear as unknown as Record<string, CharacterArt>;
export const COMPANION_ART = assets.companions as unknown as Record<string, { source: CharacterRect }>;
export const CHARACTER_ANCHORS = { crown: [572, 100], neck: [572, 275], waist: [572, 650], grip: [845, 766], feet: [572, 1320] } as const;
export const CHARACTER_SLOT_ORDER: Record<GearSlot, number> = { back: 0, bottom: 2, top: 3, head: 5, hand: 6 };
export const CHARACTER_MASKS = {
  rightHand: 'M825 688L879 688L890 726L901 774L893 805L876 823L855 831L833 825L814 809L801 786L813 777L832 791L848 798L857 785L839 771L818 769L802 787L793 774L802 740Z',
  backClasp: 'M420 270H725V348H420Z',
} as const;

/** Body-dependent clothing and gloves need redrawing for a future physical stage.
 * Rigid head/back/held objects can be reused with stage-specific anchors and occlusion masks.
 * Stage selection belongs here; saves continue to store the existing gear IDs. */
export const CHARACTER_STAGE_VARIANTS = { 'base-v1': CHARACTER_ART } as const;
