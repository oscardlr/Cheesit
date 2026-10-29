import type { Rarity } from './game';

export type Companion = { id: string; name: string; rarity: Rarity; sprite: number; description: string; adult: true };
/** Original adult arcade characters. Their rarity describes effects and costume, never age. */
export const COMPANIONS: Companion[] = [
  { id: 'athlete', name: 'Vega, atleta del neón', rarity: 'common', sprite: 0, adult: true, description: 'Una cheesit adulta de entrenamiento con energía y estilo deportivo.' },
  { id: 'warrior', name: 'Kira, guerrera del hierro', rarity: 'rare', sprite: 1, adult: true, description: 'Una guerrera adulta con armadura violeta y una presencia imposible de ignorar.' },
  { id: 'sorceress', name: 'Nyx, hechicera estelar', rarity: 'epic', sprite: 2, adult: true, description: 'Una hechicera adulta rodeada de magia lima y partículas de estrellas.' },
  { id: 'dragon-queen', name: 'Astra, reina dragón', rarity: 'legendary', sprite: 3, adult: true, description: 'Una reina dragón adulta con corona, alas y una aura legendaria.' },
  { id: 'iris', name: 'Iris, mecánica del pulso', rarity: 'common', sprite: 4, adult: true, description: 'Una inventora adulta de rizos oscuros, gafas de cobre, chaqueta violeta y herramientas para cada reto.' },
  { id: 'lua', name: 'Lúa, guardiana de la marea', rarity: 'rare', sprite: 5, adult: true, description: 'Una guardiana adulta del océano con trenza plateada, abrigo turquesa y un bastón de cristal marino.' },
  { id: 'sol', name: 'Sol, bailarina solar', rarity: 'epic', sprite: 6, adult: true, description: 'Una bailarina adulta de moño oscuro, túnica violeta y un abanico dorado que marca su ritmo.' },
  { id: 'mara', name: 'Mara, navegante astral', rarity: 'legendary', sprite: 7, adult: true, description: 'Una exploradora adulta de las estrellas con cabello azul y plata, abrigo de capitana y astrolabio dorado.' },
];
