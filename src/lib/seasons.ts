import { isCivilDate, todayMadrid } from './dates';

export const MAX_CHARACTER_LEVEL = 99;
export const isYearSeason = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{3}$/.test(value);
export const isMonthSeason = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);

/** One clock for all season consumers; callers/tests can supply an instant. */
export function currentSeasons(now = new Date(Date.now())) {
  const day = todayMadrid(now);
  return { day, month: day.slice(0, 7), year: day.slice(0, 4) };
}
export function seasonBounds(season: string) {
  if (!isYearSeason(season) && !isMonthSeason(season)) throw new Error('Temporada no válida');
  const year = Number(season.slice(0, 4)), month = season.length === 7 ? Number(season.slice(5)) : 0;
  const next = month ? (month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`) : `${year + 1}-01-01`;
  return { start: `${season}${month ? '-01' : '-01-01'}`, next };
}
export const inSeason = (day: string, season: string) => isCivilDate(day) && day.startsWith(season);
export function seasonLabel(season: string) {
  if (isYearSeason(season)) return season;
  if (!isMonthSeason(season)) return season;
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${season}-01T12:00:00Z`));
}
/** The character curve caps at level 99; XP can continue to accumulate. */
export function characterLevelThreshold(level: number): number {
  const steps = Math.max(0, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)) - 1);
  return 800 * steps + 30 * steps * (steps - 1);
}
export function annualLevelProgress(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  while (level < MAX_CHARACTER_LEVEL && characterLevelThreshold(level + 1) <= safeXp) level++;
  const maxLevel = level === MAX_CHARACTER_LEVEL;
  const levelXp = safeXp - characterLevelThreshold(level);
  const nextLevelXp = maxLevel ? 0 : characterLevelThreshold(level + 1) - characterLevelThreshold(level);
  return { xp: safeXp, level, levelXp, nextLevelXp, percent: maxLevel ? 100 : levelXp / nextLevelXp * 100 };
}

/** Timer handles an open app; focus/pageshow/visibility handle sleeping tabs and late reopening. */
export function watchSeasonClock(onDay: (day: string) => void, surface: Pick<Window, 'setInterval' | 'clearInterval' | 'addEventListener' | 'removeEventListener'> = window, page: Pick<Document, 'addEventListener' | 'removeEventListener'> = document, now: () => Date = () => new Date(Date.now())) {
  const refresh = () => onDay(currentSeasons(now()).day);
  refresh();
  const timer = surface.setInterval(refresh, 1000);
  surface.addEventListener('focus', refresh);
  surface.addEventListener('pageshow', refresh);
  page.addEventListener('visibilitychange', refresh);
  return () => { surface.clearInterval(timer); surface.removeEventListener('focus', refresh); surface.removeEventListener('pageshow', refresh); page.removeEventListener('visibilitychange', refresh); };
}
