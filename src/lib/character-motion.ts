export type CharacterMotion = 'idle' | 'walk' | 'train' | 'victory' | 'power';

export const CHARACTER_MOTIONS: ReadonlyArray<{
  id: CharacterMotion;
  label: string;
  description: string;
}> = [
  { id: 'idle', label: 'Reposo', description: 'Un movimiento suave para mantener viva su pose.' },
  // Preserve the public motion IDs while naming only actions this registered pose can show.
  { id: 'walk', label: 'Balanceo', description: 'Se inclina de lado a lado, con todo su equipo unido.' },
  { id: 'train', label: 'Prepararse', description: 'Toma impulso e inclina su pose antes del esfuerzo.' },
  { id: 'victory', label: 'Victoria', description: 'Dos saltos para celebrar tu progreso.' },
  { id: 'power', label: 'Poder', description: 'Se eleva mientras concentra energía a su alrededor.' },
];
