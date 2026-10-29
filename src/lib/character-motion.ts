export type CharacterMotion = 'idle' | 'walk' | 'train' | 'victory' | 'power';

export const CHARACTER_MOTIONS: ReadonlyArray<{
  id: CharacterMotion;
  label: string;
  description: string;
}> = [
  { id: 'idle', label: 'Reposo', description: 'Balanceo suave de la pose completa.' },
  { id: 'walk', label: 'Caminar', description: 'Balanceo lateral suave, con todo el equipo unido.' },
  { id: 'train', label: 'Entrenar', description: 'Se prepara con un pequeño movimiento de la pose completa.' },
  { id: 'victory', label: 'Victoria', description: 'Un pequeño impulso para celebrar tu progreso.' },
  { id: 'power', label: 'Poder', description: 'Mantiene su postura mientras concentra un aura de energía.' },
];
