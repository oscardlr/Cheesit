import type { SpriteRect } from './avatar-fit';

/** Generated from the original atlases, preserving their violet, lime and gold palette. */
export const GEAR_ART_ATLAS = { src: '/assets/grind-gear-pixel-expansion.png', width: 1619, height: 971 } as const;

type GearArt = {
  source: SpriteRect;
  bounds: SpriteRect;
  silhouette?: 'torso' | 'shorts';
  fabric?: string;
  sourceClip?: string;
  grip?: boolean;
};

/** Crop the actual object before fitting it to the shared character skeleton.
 * The sword and axe tips cross a row boundary, so their source masks separate them. */
export const GEAR_ART: Record<string, GearArt> = {
  'ronin-head': { source: [18, 17, 326, 312], bounds: [434, -15, 282, 270] },
  'ronin-top': { source: [379, 21, 287, 304], bounds: [415, 267, 310, 389], silhouette: 'torso', fabric: '#42106f' },
  'ronin-bottom': { source: [689, 51, 323, 261], bounds: [389, 642, 360, 176], silhouette: 'shorts', fabric: '#282431' },
  'ronin-hand': { source: [1098, 8, 127, 352], bounds: [769, 421, 164, 418], sourceClip: 'M1096 7H1227V333H1185V362H1135V333H1096Z', grip: true },
  'ronin-back': { source: [1324, 7, 280, 334], bounds: [337, 260, 470, 600] },
  'glacier-head': { source: [23, 365, 321, 244], bounds: [456, -10, 230, 175] },
  'glacier-top': { source: [380, 352, 288, 285], bounds: [415, 267, 310, 389], silhouette: 'torso', fabric: '#4c0d83' },
  'glacier-bottom': { source: [695, 352, 311, 276], bounds: [389, 640, 360, 315], fabric: '#272235' },
  'glacier-hand': { source: [1033, 335, 251, 335], bounds: [730, 450, 250, 405], sourceClip: 'M1032 334H1135V360H1185V334H1286V672H1032Z', grip: true },
  'glacier-back': { source: [1288, 349, 329, 308], bounds: [337, 274, 470, 642] },
  'cosmic-head': { source: [17, 696, 328, 207], bounds: [448, 65, 250, 158] },
  'cosmic-top': { source: [364, 649, 317, 307], bounds: [415, 267, 310, 389], silhouette: 'torso', fabric: '#272235' },
  'cosmic-bottom': { source: [689, 680, 323, 263], bounds: [389, 642, 360, 176], silhouette: 'shorts', fabric: '#282431' },
  'cosmic-hand': { source: [1048, 679, 212, 263], bounds: [792, 684, 123, 156] },
  'cosmic-back': { source: [1291, 667, 325, 289], bounds: [285, 285, 575, 510] },
};
