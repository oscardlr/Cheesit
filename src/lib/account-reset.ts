import { normalizeGame } from './game';
import { emptyData, type AppData } from './model';

/** Start training and the entire game economy over, keeping account identity. */
export function resetAccountData(previous: AppData): AppData {
  const profile = previous.profile ? structuredClone(previous.profile) : undefined;
  // Keep the measurements and replay protection, while resetting earned game XP.
  if (profile?.weightTracking) profile.weightTracking.rewards = [];
  return {
    ...emptyData(),
    game: normalizeGame(),
    ...(profile ? { profile } : {}),
    ...(previous.personalProfile ? { personalProfile: structuredClone(previous.personalProfile) } : {}),
    ...(previous.preferences ? { preferences: structuredClone(previous.preferences) } : {}),
  };
}
