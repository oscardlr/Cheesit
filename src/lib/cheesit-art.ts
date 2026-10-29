/** One transparent, uniformly fitted portrait per cheesit. Summary requests only
 * the equipped portrait; the catalog is not a combined raster download. */
export const CHEESIT_ART: Readonly<Record<string, { src: string; width: number; height: number }>> = Object.fromEntries(
  ['athlete', 'warrior', 'sorceress', 'dragon-queen', 'iris', 'lua', 'sol', 'mara'].map(id => [id, { src: `/assets/cheesits/${id}.png`, width: 384, height: 640 }]),
);

export type CheesitMotion = 'idle' | 'celebrate';
/** Rigid, foot-anchored portraits and separate light layers never stretch bodies.
 * Personality controls timing, posture and the path of the celebration sparks. */
export const CHEESIT_MOTION: Readonly<Record<string, { rhythm: string; idle: number; celebration: number; turn: number; spark: string }>> = {
  athlete: { rhythm: 'pulse', idle: 3.4, celebration: 1.8, turn: .32, spark: 'cheesit-rise' },
  warrior: { rhythm: 'guard', idle: 4.8, celebration: 2.4, turn: -.16, spark: 'cheesit-shield' },
  sorceress: { rhythm: 'spell', idle: 5.2, celebration: 2.8, turn: .22, spark: 'cheesit-orbit' },
  'dragon-queen': { rhythm: 'regal', idle: 5.8, celebration: 3.2, turn: -.12, spark: 'cheesit-crown' },
  iris: { rhythm: 'clock', idle: 3.8, celebration: 2.1, turn: -.28, spark: 'cheesit-shield' },
  lua: { rhythm: 'tide', idle: 6.2, celebration: 3.6, turn: .38, spark: 'cheesit-wave' },
  sol: { rhythm: 'dance', idle: 4.2, celebration: 2.5, turn: -.46, spark: 'cheesit-orbit' },
  mara: { rhythm: 'astral', idle: 7, celebration: 4, turn: .14, spark: 'cheesit-crown' },
};
