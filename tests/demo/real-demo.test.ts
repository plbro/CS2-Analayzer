/**
 * Batch test: reads EVERY .dem file in test-demos/ with the same WebAssembly reader and code the website uses,
 * runs the same checks on each, and prints one summary table at the end.
 * About 10 s per demo. Run: npm run test:demo   (one demo: npm run test:demo -- -t "<part of the file name>")
 *
 * The final score must come from outside our own reader (trap T8): either an entry in expected.json, or the score in
 * square brackets in the file name, e.g. "faceit mirage [13-9].dem". A demo with neither still runs every other
 * check, but the table says "score NOT checked" — it never counts as a silent pass.
 * If test-demos/ is empty, the test prints a note and skips.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { initSync, parseEvents, parseHeader, parseTicks } from '../../vendor/demoparser2/demoparser2.js';
import { readDemo } from '../../src/parser/read';
import { siteWorldPositions } from '../../src/model/maps';
import { S } from '../../src/config/settings-schema';
import { matchEnding, mustSwap, scoreFromName } from './rules';

interface Expected { map?: string; rounds?: number; score?: Record<string, number> | string; kills?: number }

const dir = path.resolve(__dirname, '../../test-demos');
const { _source, ...expected } = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8')) as Record<string, Expected>;
void _source;
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.dem')).sort() : [];
for (const f of Object.keys(expected)) if (!files.includes(f)) console.warn(`NOTE: ${f} is listed in expected.json but is not in test-demos/, so it did not run.`);

initSync({ module: fs.readFileSync(path.resolve(__dirname, '../../vendor/demoparser2/demoparser2_bg.wasm')) });

interface Row { file: string; map: string; rounds: string; score: string; ending: string; scoreCheck: string; secs: string; result: string; notes: string }
const table: Row[] = [];

/** "13-9" / "13–9" / "13:9" → [13, 9] sorted high-low. */
const pair = (s: string): [number, number] | null => {
  const m = /^(\d+)\s*[-–:_]\s*(\d+)$/.exec(s.trim());
  return m ? [Math.max(+m[1], +m[2]), Math.min(+m[1], +m[2])] : null;
};

describe('real demos', () => {
  if (files.length === 0) {
    console.warn('NOTE: test-demos/ has no .dem files, so no real-demo checks ran.');
    it.skip('no demos in test-demos/', () => {});
  }
  for (const file of files) {
    it(file, () => {
      const row: Row = { file, map: '?', rounds: '?', score: '?', ending: '?', scoreCheck: '?', secs: '?', result: 'FAILED', notes: '' };
      table.push(row);
      const exp = expected[file] ?? {};
      const bytes = new Uint8Array(fs.readFileSync(path.join(dir, file)));
      const stages: string[] = [];
      const t0 = Date.now();
      let m;
      try {
        m = readDemo({ parseHeader, parseEvents, parseTicks }, bytes, S.parse, siteWorldPositions, (s) => stages.push(s));
      } catch (err) {
        row.notes = `could not be read: ${err instanceof Error ? err.message : String(err)}`;
        throw err;
      }
      row.secs = ((Date.now() - t0) / 1000).toFixed(1);
      const last = m.rounds[m.rounds.length - 1];
      const [a, b] = last.scoreAfter;
      row.map = m.mapName;
      row.rounds = String(m.rounds.length);
      row.score = `${m.teams[0].name} ${a}–${b} ${m.teams[1].name}`;
      row.ending = matchEnding(a, b);
      row.notes = m.notes.join(' | ');
      console.log(`${file}: ${m.mapName}, ${m.rounds.length} rounds, ${row.score}, ${m.kills.length} kills, ${m.nades.length} grenades, ${m.blinds.length} blinds, ${m.places.length} places, read in ${row.secs}s. Notes: ${row.notes || 'none'}`);

      // ---- the final score, checked against an outside source (T8)
      const fromName = scoreFromName(file);
      if (exp.score && typeof exp.score === 'object') {
        expect({ [m.teams[0].name]: a, [m.teams[1].name]: b }, 'final score vs expected.json').toEqual(exp.score);
        row.scoreCheck = 'matches expected.json';
      } else if (typeof exp.score === 'string' || fromName) {
        const want = typeof exp.score === 'string' ? pair(exp.score) : fromName;
        expect(want, `score "${String(exp.score)}" in expected.json is not like 13-9`).not.toBeNull();
        expect([Math.max(a, b), Math.min(a, b)], 'final score (either team order)').toEqual(want);
        row.scoreCheck = typeof exp.score === 'string' ? 'matches expected.json' : 'matches file name';
      } else {
        row.scoreCheck = 'score NOT checked';
      }
      if (exp.map) expect(m.mapName).toBe(exp.map);
      if (exp.rounds !== undefined) expect(m.rounds).toHaveLength(exp.rounds);
      if (exp.kills !== undefined) expect(m.kills, 'kill count (regression value from our own reader)').toHaveLength(exp.kills);

      // ---- checks that hold for every normal 5v5 match
      expect(stages).toEqual(['checking', 'rounds', 'positions', 'building']);
      expect(m.rounds.length, 'rounds = sum of the final score').toBe(a + b);
      expect(m.rounds.map((r) => r.n), 'rounds numbered 1, 2, 3 … with no gaps').toEqual(Array.from({ length: m.rounds.length }, (_, i) => i + 1));
      expect(m.players, 'players').toHaveLength(10);
      expect(m.players.filter((p) => p.team === 0), 'players on the first team').toHaveLength(5);
      expect(m.players.map((p) => p.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // sides: never change inside a half, always swap at halftime and between the two halves of an overtime
      for (let i = 1; i < m.rounds.length; i++) {
        const rule = mustSwap(m.rounds[i].n);
        if (rule === null) continue;
        const swapped = m.rounds[i].sides[0] !== m.rounds[i - 1].sides[0];
        expect(swapped, `sides between round ${m.rounds[i - 1].n} and ${m.rounds[i].n}`).toBe(rule);
      }
      // everyone has a position when each round goes live
      for (const r of m.rounds) {
        const k = Math.floor((r.freezeEndTick - r.startTick) / m.sampleStep) + 2;
        const alive = m.samples.filter((s) => Number.isFinite(s.x[r.sampleOffset + k])).length;
        expect(alive, `players with a position at the start of round ${r.n}`).toBe(10);
      }
      // nobody dies twice in one round
      for (let ri = 0; ri < m.rounds.length; ri++) {
        const victims = m.kills.filter((k) => k.round === ri).map((k) => k.victim);
        expect(new Set(victims).size, `someone died twice in round ${m.rounds[ri].n}`).toBe(victims.length);
      }
      // two independent sources agree: deaths on the game's own scoreboard = death events we read
      const scoreboardDeaths = m.samples.reduce((sum, s) => sum + s.deaths.reduce((mx, v) => Math.max(mx, v), 0), 0);
      expect(m.kills.length, 'death events vs the scoreboard\'s deaths').toBe(scoreboardDeaths);
      // grenades and flashes look sane
      expect(m.nades.filter((n) => n.throwTick !== null).length / m.nades.length, 'share of grenades linked to a throw').toBeGreaterThan(0.9);
      const smokes = m.nades.filter((n) => n.type === 'smoke').map((n) => (n.endTick - n.detTick) / m.tickrate);
      expect(smokes.filter((s) => s > 15 && s < 25).length / smokes.length, 'share of smokes lasting 15–25 s').toBeGreaterThan(0.8);
      expect(m.rounds.filter((r) => r.plantTick !== null).every((r) => r.plantSite === 'A' || r.plantSite === 'B'), 'every plant has a site').toBe(true);
      expect(m.blinds.length, 'flashes that blinded someone').toBeGreaterThan(m.rounds.length);
      row.result = 'ok';
    });
  }
  afterAll(() => {
    if (table.length === 0) return;
    const cols: (keyof Row)[] = ['file', 'map', 'rounds', 'score', 'ending', 'scoreCheck', 'secs', 'result', 'notes'];
    const width = cols.map((c) => Math.max(c.length, ...table.map((r) => r[c].length)));
    const line = (r: Record<keyof Row, string>) => cols.map((c, i) => r[c].padEnd(width[i])).join(' │ ');
    const out = ['', `REAL-DEMO SUMMARY (${table.length} demos)`, line(Object.fromEntries(cols.map((c) => [c, c])) as Record<keyof Row, string>), ...table.map(line)];
    const unchecked = table.filter((r) => r.scoreCheck === 'score NOT checked').length;
    if (unchecked) out.push(`NOTE: ${unchecked} demo(s) have no outside score yet. Add it to expected.json or the file name, e.g. "[13-9]".`);
    console.log(out.join('\n'));
  });
});
