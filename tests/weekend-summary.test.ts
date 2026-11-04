import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWeekendMadrid, todayMadrid } from '../src/lib/dates';
import { emptyData } from '../src/lib/model';
import { weeklySummary } from '../src/lib/training-features';

for (const [date, expected] of [
  ['2026-11-02', false], ['2026-11-03', false], ['2026-11-04', false],
  ['2026-11-05', false], ['2026-11-06', false], ['2026-11-07', true], ['2026-11-08', true],
] as const) test(`weekly summary visibility on Madrid civil date ${date}`, () => {
  assert.equal(isWeekendMadrid(date), expected);
});

test('weekend uses Madrid midnight rather than the instant UTC weekday, with winter and summer offsets', () => {
  for (const [instant, date, expected] of [
    ['2026-11-06T22:59:59Z', '2026-11-06', false],
    ['2026-11-06T23:00:00Z', '2026-11-07', true],
    ['2026-11-08T22:59:59Z', '2026-11-08', true],
    ['2026-11-08T23:00:00Z', '2026-11-09', false],
    ['2026-07-03T22:00:00Z', '2026-07-04', true],
    ['2026-07-05T22:00:00Z', '2026-07-06', false],
  ] as const) {
    const now = new Date(instant);
    assert.equal(todayMadrid(now), date);
    assert.equal(isWeekendMadrid(now), expected);
  }
  assert.equal(isWeekendMadrid('2026-02-30'), false);
});

test('Saturday and Sunday show the same Monday–Sunday week ending on Sunday', () => {
  for (const date of ['2026-11-07', '2026-11-08']) {
    const summary = weeklySummary(emptyData(), date, date);
    assert.equal(summary.start, '2026-11-02');
    assert.equal(summary.end, '2026-11-08');
  }
});
