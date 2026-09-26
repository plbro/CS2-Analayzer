/**
 * Pure rules used by the real-demo batch test (tests/demo/real-demo.test.ts).
 * Unit-tested in tests/unit/demo-rules.test.ts, so a rule can't quietly stop working.
 * They describe normal 5v5 CS2 matches (Premier, Competitive, FACEIT): first to 13, overtime first to 4 of 6.
 */

export type Ending = 'regulation' | 'overtime' | 'unfinished';

/** How a match ended, from its final score. 'unfinished' = surrender, abandon, or a demo cut short. */
export function matchEnding(a: number, b: number): Ending {
  const w = Math.max(a, b), l = Math.min(a, b);
  if (w === 13 && l <= 11) return 'regulation';
  // overtime from 12–12: win 16–12/13/14; at 15–15 another overtime → 19–15/16/17, and so on
  if (w >= 16 && (w - 16) % 3 === 0 && l >= w - 4 && l <= w - 2) return 'overtime';
  return 'unfinished';
}

/**
 * Which "half" a round is in. Sides never change inside a half.
 * 1–12 = 0, 13–24 = 1, then overtime halves of 3 rounds: 25–27 = 2, 28–30 = 3, 31–33 = 4 ...
 */
export function halfOf(n: number): number {
  return n <= 24 ? Math.floor((n - 1) / 12) : 2 + Math.floor((n - 25) / 3);
}

/**
 * Do the teams have to swap sides between round n-1 and round n?
 * true = must swap, false = must stay, null = no fixed rule (start of each overtime, which differs between game modes).
 */
export function mustSwap(n: number): boolean | null {
  if (n <= 1) return false;
  const a = halfOf(n - 1), b = halfOf(n);
  if (a === b) return false;
  if (b === 1) return true; // halftime
  return b % 2 === 1 ? true : null; // second half of an overtime swaps; the start of an overtime has no fixed rule
}

/**
 * A final score written in the demo's file name, e.g. "faceit mirage [13-9].dem" or "[16_14].dem".
 * Only a score inside square brackets counts, so dates like 2026-09-24 are never mistaken for one.
 * Returned as [higher, lower] because the file name doesn't say which team is which.
 */
export function scoreFromName(file: string): [number, number] | null {
  const m = /\[(\d{1,2})\s*[-_:]\s*(\d{1,2})\]/.exec(file);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return [Math.max(a, b), Math.min(a, b)];
}
