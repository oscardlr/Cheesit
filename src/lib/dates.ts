const madridDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Civil dates are strings, never instants in the browser's time zone. */
export function todayMadrid(now = new Date()): string {
  const parts = madridDateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1000 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function addDays(value: string, days: number): string {
  if (!isCivilDate(value)) throw new Error('Fecha no válida');
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(value, -((day + 6) % 7));
}

/** Next Monday at 00:00 in Madrid, using the offset on that Monday (including DST). */
export function nextWeeklyResetMadrid(now = new Date()): Date {
  const monday = addDays(weekStart(todayMadrid(now)), 7);
  const midnightUtc = new Date(`${monday}T00:00:00Z`);
  const madridHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23',
  }).format(midnightUtc));
  return new Date(midnightUtc.getTime() - madridHour * 60 * 60 * 1000);
}

/** Monday–Sunday rows containing only this month's dates and inert alignment gaps. */
export function calendarMonth(value: string): (string | null)[] {
  if (!isCivilDate(value)) throw new Error('Fecha no válida');
  const first = `${value.slice(0, 7)}-01`;
  const [year, month] = first.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) =>
    index < offset || index >= offset + days ? null : `${first.slice(0, 8)}${String(index - offset + 1).padStart(2, '0')}`);
}
