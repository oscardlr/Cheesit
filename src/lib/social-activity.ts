import { gameProgress, normalizeGame } from './game';
import { totals } from './metrics';
import type { AppData } from './model';
import { todayMadrid } from './dates';

export type ActivitySummary = ReturnType<typeof totals> & { seasons: Record<string, number> };

/** Publish only derived numbers, never the athlete's physical data or game ledger.
 * Runs against the exact document committed by the existing CAS sync protocol. */
export function socialActivitySummary(data: AppData): ActivitySummary {
  const game = normalizeGame(data.game);
  const years = new Set([
    ...data.workouts.map(workout => workout.date.slice(0, 4)),
    ...(game.missionRewards ?? []).map(reward => todayMadrid(new Date(reward.awardedAt)).slice(0, 4)),
    ...(data.profile?.weightTracking?.rewards ?? []).map(reward => reward.date.slice(0, 4)),
    ...(game.arcadeGrant ? [game.arcadeGrant.season] : []),
  ]);
  return { ...totals(data.workouts, data.profile), seasons: Object.fromEntries([...years].filter(y => /^[1-9]\d{3}$/.test(y)).map(year => [year, gameProgress(game, data.workouts, data.profile, year).xp])) };
}
