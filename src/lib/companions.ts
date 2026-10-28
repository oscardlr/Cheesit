import type { Rarity } from './game';

export type Companion = { id: string; name: string; rarity: Rarity; sprite: number; description: string; adult: true };
/** Original adult arcade characters. Their rarity describes effects and costume, never age. */
export const COMPANIONS: Companion[] = [
  { id: 'athlete', name: 'Vega, atleta del neón', rarity: 'common', sprite: 0, adult: true, description: 'Una compañera adulta de entrenamiento con energía y estilo deportivo.' },
  { id: 'warrior', name: 'Kira, guerrera del hierro', rarity: 'rare', sprite: 1, adult: true, description: 'Una guerrera adulta con armadura violeta y una presencia imposible de ignorar.' },
  { id: 'sorceress', name: 'Nyx, hechicera estelar', rarity: 'epic', sprite: 2, adult: true, description: 'Una hechicera adulta rodeada de magia lima y partículas de estrellas.' },
  { id: 'dragon-queen', name: 'Astra, reina dragón', rarity: 'legendary', sprite: 3, adult: true, description: 'Una reina dragón adulta con corona, alas y una aura legendaria.' },
];
