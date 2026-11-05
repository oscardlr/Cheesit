import { isCivilDate, todayMadrid } from './dates';
import { normalizeProfile, type AthleteProfile } from './strength';

export type WeightEntry = { date: string; weightKg: number };
export type WeightTracking = {
  entries: WeightEntry[];
  goalKg?: number;
  baselineKg?: number;
  bestDistanceKg?: number;
  /** Decikilogram intervals already rewarded, shared across all personal goals. */
  rewardedRanges: [number, number][];
  rewards: { date: string; xp: number }[];
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const validBodyWeight = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 30 && v <= 300;
export function isWeightTracking(v: unknown): v is WeightTracking {
  if (!object(v) || !Array.isArray(v.entries) || !Array.isArray(v.rewards) || !Array.isArray(v.rewardedRanges)) return false;
  const dates = new Set<string>(), rewardDates = new Set<string>();
  return (v.goalKg === undefined || validBodyWeight(v.goalKg)) && (v.baselineKg === undefined || validBodyWeight(v.baselineKg)) &&
    (v.bestDistanceKg === undefined || typeof v.bestDistanceKg === 'number' && Number.isFinite(v.bestDistanceKg) && v.bestDistanceKg >= 0 && v.bestDistanceKg <= 270) &&
    v.entries.every(e => object(e) && typeof e.date === 'string' && isCivilDate(e.date) && !dates.has(e.date) && !!dates.add(e.date) && validBodyWeight(e.weightKg)) &&
    v.rewards.every(r => object(r) && typeof r.date === 'string' && isCivilDate(r.date) && !rewardDates.has(r.date) && !!rewardDates.add(r.date) && typeof r.xp === 'number' && Number.isInteger(r.xp) && r.xp > 0 && r.xp <= 27000) &&
    v.rewardedRanges.every(r => Array.isArray(r) && r.length === 2 && r.every(n => Number.isInteger(n) && n >= 300 && n <= 3000) && r[0] < r[1]);
}
export function weightEntries(profile?: AthleteProfile): WeightEntry[] {
  return [...(profile?.weightTracking?.entries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}
function editableProfile(profile?: AthleteProfile): AthleteProfile & { weightTracking: WeightTracking } {
  const current = normalizeProfile(profile);
  return { ...current, rewardWeightKg: current.rewardWeightKg ?? current.weightKg,
    weightTracking: structuredClone(current.weightTracking ?? { entries: [], rewardedRanges: [], rewards: [] }) };
}
export function setWeightGoal(profile: AthleteProfile | undefined, goalKg: number): AthleteProfile {
  if (!validBodyWeight(goalKg)) throw new Error('Introduce un objetivo entre 30 y 300 kg.');
  const next = editableProfile(profile);
  if (next.weightTracking.goalKg === goalKg) return next;
  next.weightTracking.goalKg = goalKg;
  next.weightTracking.baselineKg = profile ? next.weightKg : undefined;
  next.weightTracking.bestDistanceKg = profile ? Math.abs(next.weightKg - goalKg) : undefined;
  return next;
}
export function removeWeightGoal(profile: AthleteProfile | undefined): AthleteProfile {
  const next = editableProfile(profile);
  delete next.weightTracking.goalKg;
  delete next.weightTracking.baselineKg;
  delete next.weightTracking.bestDistanceKg;
  return next;
}
/** 100 XP/kg of new approach. Only a new latest day can earn: corrections,
 * backfills, oscillations and changing goals never replay a credited interval. */
export function recordBodyWeight(profile: AthleteProfile | undefined, entry: WeightEntry, today = todayMadrid()): AthleteProfile {
  if (!isCivilDate(entry.date) || entry.date > today || !validBodyWeight(entry.weightKg) || Math.abs(entry.weightKg * 10 - Math.round(entry.weightKg * 10)) > 1e-8) throw new Error('Revisa la fecha y el peso (30–300 kg, un decimal).');
  const next = editableProfile(profile), tracking = next.weightTracking;
  const previous = weightEntries(next).at(-1);
  const latest = !previous || entry.date > previous.date;
  const existing = tracking.entries.some(e => e.date === entry.date);
  const goal = tracking.goalKg;
  if (latest && !existing && !tracking.rewards.some(r => r.date === entry.date) && goal !== undefined && tracking.baselineKg !== undefined) {
    const from = Math.round((previous?.weightKg ?? next.weightKg) * 10), to = Math.round(entry.weightKg * 10), target = Math.round(goal * 10);
    const bestDistance = Math.round((tracking.bestDistanceKg ?? Math.abs(from - target) / 10) * 10);
    const improvement = Math.max(0, Math.min(Math.abs(from - target), bestDistance) - Math.abs(to - target));
    const end = from + Math.sign(target - from) * Math.min(Math.abs(to - from), Math.abs(target - from));
    const lo = Math.min(from, end), hi = Math.max(from, end);
    let fresh = 0;
    for (let step = lo; step < hi; step++) if (!tracking.rewardedRanges.some(([a, b]) => step >= a && step < b)) fresh++;
    if (fresh && improvement) {
      tracking.rewards.push({ date: entry.date, xp: Math.min(fresh, improvement) * 10 });
      const ranges = [...tracking.rewardedRanges, [lo, hi] as [number, number]].sort((a, b) => a[0] - b[0]);
      tracking.rewardedRanges = [];
      for (const range of ranges) {
        const last = tracking.rewardedRanges.at(-1);
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else tracking.rewardedRanges.push([...range]);
      }
    }
    tracking.bestDistanceKg = Math.min(bestDistance, Math.abs(to - target)) / 10;
  }
  tracking.entries = [...tracking.entries.filter(e => e.date !== entry.date), { ...entry }].sort((a, b) => a.date.localeCompare(b.date));
  next.weightKg = tracking.entries.at(-1)!.weightKg;
  if (tracking.goalKg !== undefined && tracking.baselineKg === undefined) {
    tracking.baselineKg = next.weightKg;
    tracking.bestDistanceKg = Math.abs(next.weightKg - tracking.goalKg);
  }
  return next;
}
export function bodyWeightXp(profile?: AthleteProfile, season?: string): number {
  return (profile?.weightTracking?.rewards ?? []).filter(r => !season || r.date.startsWith(season)).reduce((sum, r) => sum + r.xp, 0);
}
