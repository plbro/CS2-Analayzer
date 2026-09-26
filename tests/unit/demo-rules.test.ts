/** Checks the rules the real-demo batch test relies on (tests/demo/rules.ts). Run: npm test */
import { describe, expect, it } from 'vitest';
import { halfOf, matchEnding, mustSwap, scoreFromName } from '../demo/rules';

describe('real-demo rules', () => {
  it('how a match ended, from its final score', () => {
    expect(matchEnding(13, 8)).toBe('regulation');
    expect(matchEnding(11, 13)).toBe('regulation');
    expect(matchEnding(13, 12)).toBe('unfinished'); // 12–12 always goes to overtime
    expect(matchEnding(16, 12)).toBe('overtime');
    expect(matchEnding(14, 16)).toBe('overtime');
    expect(matchEnding(16, 15)).toBe('unfinished'); // 15–15 is another overtime
    expect(matchEnding(19, 17)).toBe('overtime');
    expect(matchEnding(19, 14)).toBe('unfinished'); // 19 needs 15–15 first
    expect(matchEnding(9, 4)).toBe('unfinished'); // surrender / abandoned
    expect(matchEnding(0, 0)).toBe('unfinished');
  });
  it('halves: 12 + 12, then overtime halves of 3', () => {
    expect([1, 12, 13, 24, 25, 27, 28, 30, 31].map(halfOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('when sides must swap', () => {
    expect(mustSwap(2)).toBe(false);
    expect(mustSwap(12)).toBe(false);
    expect(mustSwap(13)).toBe(true); // halftime
    expect(mustSwap(24)).toBe(false);
    expect(mustSwap(25)).toBeNull(); // start of overtime: no fixed rule
    expect(mustSwap(26)).toBe(false);
    expect(mustSwap(28)).toBe(true); // overtime halftime
    expect(mustSwap(31)).toBeNull();
    expect(mustSwap(34)).toBe(true);
  });
  it('a score in the file name only counts inside [ ]', () => {
    expect(scoreFromName('faceit mirage [13-9].dem')).toEqual([13, 9]);
    expect(scoreFromName('[9_13] inferno.dem')).toEqual([13, 9]);
    expect(scoreFromName('premier [16 - 14].dem')).toEqual([16, 14]);
    expect(scoreFromName('match-2026-09-24.dem')).toBeNull(); // a date is not a score
    expect(scoreFromName('spirit-vs-falcons-m1-nuke.dem')).toBeNull();
  });
});
