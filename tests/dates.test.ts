import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonth, nextWeeklyResetMadrid } from '../src/lib/dates';

for (const [month, days, offset, rows] of [
  ['2021-02-01', 28, 0, 4],
  ['2024-02-01', 29, 3, 5],
  ['2026-02-01', 28, 6, 5],
  ['2026-03-01', 31, 6, 6],
  ['2026-06-01', 30, 0, 5],
  ['1900-02-01', 28, 3, 5],
  ['2000-02-01', 29, 1, 5],
  ['2026-12-01', 31, 1, 5],
] as const) test(`calendar ${month} has only its dates, aligned Monday–Sunday`, () => {
  const cells = calendarMonth(month);
  assert.equal(cells.length, rows * 7);
  assert.deepEqual(cells.slice(0, offset), Array(offset).fill(null));
  assert.deepEqual(cells.slice(offset, offset + days), Array.from({ length: days }, (_, index) => `${month.slice(0, 8)}${String(index + 1).padStart(2, '0')}`));
  assert.ok(cells.slice(offset + days).every(cell => cell === null));
  assert.deepEqual(calendarMonth(`${month.slice(0, 8)}15`), cells);
});

test('calendar rejects invalid civil dates', () => {
  for (const date of ['2025-02-29', '2026-13-01', '2026-02', 'invalid']) assert.throws(() => calendarMonth(date), /Fecha no válida/);
});

for (const [now, reset] of [
  ['2026-11-03T12:34:56Z', '2026-11-08T23:00:00.000Z'],
  ['2026-11-08T22:59:59Z', '2026-11-08T23:00:00.000Z'],
  ['2026-11-08T23:00:00Z', '2026-11-15T23:00:00.000Z'],
  ['2026-03-28T12:00:00Z', '2026-03-29T22:00:00.000Z'],
  ['2026-10-24T12:00:00Z', '2026-10-25T23:00:00.000Z'],
  ['2026-12-31T12:00:00Z', '2027-01-03T23:00:00.000Z'],
] as const) test(`weekly reset from ${now} follows Monday midnight in Madrid`, () => {
  assert.equal(nextWeeklyResetMadrid(new Date(now)).toISOString(), reset);
});
