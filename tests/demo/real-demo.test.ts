/**
 * Reads the real demos in test-demos/ with the same WebAssembly reader and code the website uses.
 * Slow (about 30 s per demo). Run: npm run test:demo
 * If test-demos/ is empty, each test prints a note and is skipped — it never silently passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initSync, parseEvents, parseHeader, parseTicks } from '../../vendor/demoparser2/demoparser2.js';
import { readDemo } from '../../src/parser/read';
import { siteWorldPositions } from '../../src/model/maps';
import { S } from '../../src/config/settings-schema';

const dir = path.resolve(__dirname, '../../test-demos');
const { _source, ...expected } = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8')) as Record<string, {
  map: string; rounds: number; score: Record<string, number>; kills: number;
}>;
void _source;

initSync({ module: fs.readFileSync(path.resolve(__dirname, '../../vendor/demoparser2/demoparser2_bg.wasm')) });

describe('real demos', () => {
  for (const [file, exp] of Object.entries(expected)) {
    const full = path.join(dir, file);
    const present = fs.existsSync(full);
    if (!present) console.warn(`NOTE: ${file} is not in test-demos/, so this check did not run.`);
    it.skipIf(!present)(file, () => {
      const bytes = new Uint8Array(fs.readFileSync(full));
      const stages: string[] = [];
      const t0 = Date.now();
      const m = readDemo({ parseHeader, parseEvents, parseTicks }, bytes, S.parse, siteWorldPositions, (s) => stages.push(s));
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const last = m.rounds[m.rounds.length - 1];
      console.log(`${file}: ${m.mapName}, ${m.rounds.length} rounds, ${m.teams[0].name} ${last.scoreAfter[0]}–${last.scoreAfter[1]} ${m.teams[1].name}, ${m.kills.length} kills, ${m.nades.length} grenades, ${m.blinds.length} blinds, ${m.places.length} places, read in ${secs}s. Notes: ${m.notes.join(' | ') || 'none'}`);
      expect(stages).toEqual(['checking', 'rounds', 'positions', 'building']);
      expect(m.mapName).toBe(exp.map);
      expect(m.players).toHaveLength(10);
      expect(m.rounds).toHaveLength(exp.rounds);
      expect(m.rounds.map((r) => r.n)).toEqual(Array.from({ length: exp.rounds }, (_, i) => i + 1));
      expect({ [m.teams[0].name]: last.scoreAfter[0], [m.teams[1].name]: last.scoreAfter[1] }).toEqual(exp.score);
      expect(m.kills).toHaveLength(exp.kills);
      // every team has five players, slots 1–10 in order
      expect(m.players.filter((p) => p.team === 0)).toHaveLength(5);
      expect(m.players.map((p) => p.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // sides swap at halftime: round 1 and round 13 have opposite sides
      expect(m.rounds[0].sides[0]).not.toBe(m.rounds[12].sides[0]);
      // positions exist for everyone alive at the moment each round goes live
      for (const r of m.rounds) {
        const k = Math.floor((r.freezeEndTick - r.startTick) / m.sampleStep) + 2;
        const alive = m.samples.filter((s) => Number.isFinite(s.x[r.sampleOffset + k])).length;
        expect(alive, `round ${r.n}`).toBe(10);
      }
      // most grenades are linked to a throw, and most smokes last ~18–22 s
      expect(m.nades.filter((n) => n.throwTick !== null).length / m.nades.length).toBeGreaterThan(0.9);
      const smokes = m.nades.filter((n) => n.type === 'smoke').map((n) => (n.endTick - n.detTick) / m.tickrate);
      expect(smokes.filter((s) => s > 15 && s < 25).length / smokes.length).toBeGreaterThan(0.8);
      // plants resolve to a site, and flashes blind someone
      expect(m.rounds.filter((r) => r.plantTick !== null).every((r) => r.plantSite === 'A' || r.plantSite === 'B')).toBe(true);
      expect(m.blinds.length).toBeGreaterThan(20);
    });
  }
});
