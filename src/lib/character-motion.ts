export type CharacterMotion = 'idle' | 'walk' | 'train' | 'victory' | 'power';

export const CHARACTER_MOTIONS: ReadonlyArray<{
  id: CharacterMotion;
  label: string;
  description: string;
}> = [
  { id: 'idle', label: 'Reposo', description: 'Respira, parpadea y relaja los brazos.' },
  { id: 'walk', label: 'Caminar', description: 'Alterna pasos y acompaña el ritmo con los brazos.' },
  { id: 'train', label: 'Entrenar', description: 'Flexiona los codos y completa sus repeticiones.' },
  { id: 'victory', label: 'Victoria', description: 'Levanta los brazos para celebrar tu progreso.' },
  { id: 'power', label: 'Poder', description: 'Adopta una postura firme y concentra su energía.' },
];
