import { normalizeGame } from './game';
import { emptyData, type AppData } from './model';

/** Start training and the entire game economy over, keeping account identity. */
export function resetAccountData(previous: AppData): AppData {
  return {
    ...emptyData(),
    game: normalizeGame(),
    ...(previous.profile ? { profile: structuredClone(previous.profile) } : {}),
    ...(previous.personalProfile ? { personalProfile: structuredClone(previous.personalProfile) } : {}),
    ...(previous.preferences ? { preferences: structuredClone(previous.preferences) } : {}),
  };
}
