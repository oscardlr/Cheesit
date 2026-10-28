import type { GearSlot } from './gear';

/** The base and every worn layer share the original character's pixel coordinates. */
export const AVATAR_VIEWBOX = '0 0 1145 1374';
export type SpriteRect = readonly [x: number, y: number, width: number, height: number];
export type AvatarFit = {
  source: SpriteRect;
  target: SpriteRect;
  silhouette?: 'torso' | 'shorts';
  fabric?: string;
  grip?: boolean;
  flipY?: boolean;
  sourceClip?: string;
};

// Atlas artwork has irregular padding and crosses the nominal grid in several cells.
// Crop each actual object, then anchor it to the neck, waist or right hand of the base.
export const AVATAR_FITS: Record<string, AvatarFit> = {
  'purple-tank': { source: [54, 66, 288, 317], target: [415, 267, 310, 389], silhouette: 'torso', fabric: '#6b12b8' },
  'training-tank': { source: [1144, 766, 284, 290], target: [415, 267, 310, 389], silhouette: 'torso', fabric: '#262333' },
  'golden-armor': { source: [802, 774, 291, 298], target: [414, 267, 314, 389], silhouette: 'torso', fabric: '#a77513' },
  'celestial-armor': { source: [480, 40, 377, 386], target: [414, 267, 314, 389], silhouette: 'torso', fabric: '#481477' },
  'storm-tank': { source: [938, 51, 341, 376], target: [415, 267, 310, 389], silhouette: 'torso', fabric: '#5a0fa5' },
  'lime-shorts': { source: [391, 120, 333, 230], target: [389, 642, 360, 176], silhouette: 'shorts', fabric: '#a1cc0b' },
  'crimson-shorts': { source: [748, 119, 313, 231], target: [389, 642, 360, 176], silhouette: 'shorts', fabric: '#282431' },
  'mecha-shorts': { source: [20, 479, 405, 330], target: [389, 642, 360, 176], silhouette: 'shorts', fabric: '#34303b' },
  'void-greaves': { source: [1352, 57, 387, 348], target: [389, 640, 360, 315], fabric: '#302039' },
  'dragon-head': { source: [1098, 19, 339, 368], target: [442, 20, 262, 282] },
  'champion-crown': { source: [45, 449, 311, 224], target: [473, 18, 203, 146] },
  'phoenix-crown': { source: [27, 48, 395, 341], target: [448, 0, 254, 219] },
  'headphones': { source: [411, 448, 305, 251], target: [464, 61, 219, 180] },
  'titan-sword': { source: [819, 350, 164, 418], target: [769, 421, 164, 418], grip: true },
  'plasma-blaster': { source: [1052, 484, 395, 197], target: [752, 652, 316, 158], grip: true },
  'thunder-hammer': { source: [490, 446, 353, 409], target: [705, 525, 283, 327], grip: true },
  'starlight-gauntlet': { source: [926, 444, 324, 410], target: [792, 684, 123, 156], flipY: true },
  'violet-cape': { source: [12, 746, 375, 312], target: [337, 274, 470, 642] },
  'neon-wings': { source: [367, 760, 411, 267], target: [141, 264, 861, 559], sourceClip: 'M367 760H780V1027H440L421 1004L397 979L380 953L367 928Z' },
  'solar-cape': { source: [1325, 454, 447, 403], target: [320, 269, 502, 698] },
};

// Trace the existing tank and boxer silhouette so replacements meet the skin and
// waistband instead of floating over the torso or leaving the old outfit visible.
export const TORSO_SILHOUETTE = 'M486 269L499 268C491 304 494 342 518 365C544 389 608 389 632 365C650 344 655 306 646 269L661 273L680 280L687 350L704 405L715 450L733 480L715 510L684 551L699 603L709 640L712 650L425 650L432 630L443 589L452 550L424 508L406 480L421 458L433 424L447 379L456 338L459 292L462 280Z';
export const SHORTS_SILHOUETTE = 'M431 644L705 644L714 665L728 713L739 757L749 791L741 811L584 817L570 777L555 817L397 802L389 791L398 749L410 700L425 661Z';
export const RIGHT_HAND_SILHOUETTE = 'M824 685L882 685L895 737L904 783L890 817L864 831L840 828L818 812L805 785L818 776L835 789L849 793L857 782L837 766L818 765L802 787L793 774L802 740Z';

export const AVATAR_SLOT_ORDER: Record<GearSlot, number> = { back: 0, bottom: 1, top: 2, head: 3, hand: 4 };
