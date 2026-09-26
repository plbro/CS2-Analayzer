/** Fast checks of every pure decision. Run: npm test */
import { describe, expect, it } from 'vitest';
import { findBlinds, findRounds, pairNades, roundAt, sampleTicks, winReason, type ParseCfg, type Row } from '../../src/parser/build';
import { sniffDemo } from '../../src/parser/read';
import { lerpAngle, nadeState, roundClock, fmtSeconds } from '../../src/model/query';
import { resolveSettings } from '../../src/config/settings-schema';
import { SETTINGS } from '../../src/config/settings';
import { actionFor, HOTKEYS } from '../../src/ui/hotkeys';
import { layerFor, mapInfo, siteWorldPositions, toRadar } from '../../src/model/maps';
import type { Nade, RoundInfo } from '../../src/model/types';

const cfg: ParseCfg = { tickrate: 64, sampleEveryTicks: 8, freezeWindowSeconds: 20, postRoundSeconds: 7, minBlindSeconds: 0.3, nadeMatchWindowSeconds: 20, smokeFallbackSeconds: 20, fireFallbackSeconds: 7 };
const ev = (event_name: string, tick: number, extra: Row = {}): Row => ({ event_name, tick, ...extra });

describe('findRounds', () => {
  it('skips warmup and unfinished rounds, pairs freeze end → round end → official end', () => {
    const rounds = findRounds([
      ev('round_end', 0, { round: 0 }), // demo-start junk: no winner
      ev('round_freeze_end', 100, { is_warmup_period: true }),
      ev('round_end', 500, { winner: 'T', round: 1, is_warmup_period: true }), // warmup
      ev('round_start', 1000), ev('round_freeze_end', 2000),
      ev('round_end', 5000, { winner: 'CT', reason: 't_killed', round: 1 }),
      ev('round_officially_ended', 5448), ev('round_start', 5448), ev('round_freeze_end', 6000),
      ev('round_end', 9000, { winner: 'T', reason: 'target_bombed', round: 2 }),
    ], cfg);
    expect(rounds.map((r) => [r.n, r.winnerSide, r.freezeEndTick, r.endTick])).toEqual([[1, 'ct', 2000, 5000], [2, 't', 6000, 9000]]);
    expect(rounds[0].startTick).toBe(1000); // round_start is inside the 20 s window
    expect(rounds[0].officialEndTick).toBe(5448);
    expect(rounds[1].startTick).toBe(5448);
    expect(rounds[1].officialEndTick).toBe(9000 + 7 * 64); // no official end → fallback
  });
  it('a restarted round replaces the earlier copy', () => {
    const rounds = findRounds([
      ev('round_freeze_end', 1000), ev('round_end', 3000, { winner: 'T', round: 5 }),
      ev('round_freeze_end', 4000), ev('round_end', 7000, { winner: 'CT', round: 5 }),
    ], cfg);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].winnerSide).toBe('ct');
  });
  it('clips a long freeze window to 20 s', () => {
    const r = findRounds([ev('round_start', 0), ev('round_freeze_end', 5000), ev('round_end', 9000, { winner: 'T', round: 1 })], cfg)[0];
    expect(r.startTick).toBe(5000 - 20 * 64);
  });
});

describe('sampling', () => {
  it('never samples the same tick twice across rounds', () => {
    const { ticks, offsets, counts } = sampleTicks([
      // like real demos: round 2 starts on the exact tick round 1 officially ends (a multiple of the step)
      { n: 1, startTick: 0, freezeEndTick: 10, endTick: 90, officialEndTick: 96, winnerSide: 't', reason: '' },
      { n: 2, startTick: 96, freezeEndTick: 110, endTick: 190, officialEndTick: 200, winnerSide: 't', reason: '' },
    ], 8);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(offsets).toEqual([0, 12]);
    expect(counts).toEqual([12, 13]);
  });
  it('roundAt finds the round of a tick', () => {
    const rs = [{ startTick: 0, officialEndTick: 100 }, { startTick: 100, officialEndTick: 200 }];
    expect([roundAt(rs, 0), roundAt(rs, 99), roundAt(rs, 100), roundAt(rs, 200), roundAt(rs, -5)]).toEqual([0, 0, 1, -1, -1]);
  });
});

describe('grenades', () => {
  it('links each landing to the oldest unused throw of the same type by the same player', () => {
    const throws = [
      { player: 1, type: 'smoke' as const, tick: 100, pos: [0, 0, 0] as [number, number, number] },
      { player: 1, type: 'smoke' as const, tick: 150, pos: [1, 1, 1] as [number, number, number] },
      { player: 2, type: 'flash' as const, tick: 120, pos: [2, 2, 2] as [number, number, number] },
    ];
    const dets = [
      { player: 1, type: 'smoke' as const, tick: 200, endTick: 0, pos: [9, 9, 9] as [number, number, number] },
      { player: 1, type: 'smoke' as const, tick: 260, endTick: 0, pos: [9, 9, 9] as [number, number, number] },
      { player: 2, type: 'smoke' as const, tick: 200, endTick: 0, pos: [9, 9, 9] as [number, number, number] }, // wrong type
      { player: 2, type: 'flash' as const, tick: 120 + 64 * 30, endTick: 0, pos: [9, 9, 9] as [number, number, number] }, // too late
    ];
    expect(pairNades(throws, dets, 20 * 64).map((p) => p.throwTick)).toEqual([100, 150, null, null]);
  });
  it('knows when a grenade is flying and when it is active', () => {
    const n: Nade = { type: 'smoke', round: 0, thrower: 0, throwTick: 100, from: [0, 0, 0], detTick: 200, endTick: 1200, pos: [0, 0, 0] };
    expect(nadeState(n, 150, 32)).toEqual({ flying: 0.5, active: -1 });
    expect(nadeState(n, 700, 32)).toEqual({ flying: -1, active: 0.5 });
    expect(nadeState(n, 1200, 32)).toEqual({ flying: -1, active: -1 });
    expect(nadeState({ ...n, type: 'flash' }, 216, 32).active).toBe(0.5); // bursts use the burst length, not endTick
  });
});

describe('blinds', () => {
  it('a new flash value starts a blind at the flashbang tick; repeats and short flashes are ignored', () => {
    const flash = Float32Array.from([0, 0, 2, 2, 2, 0.1, 0.1, 3]);
    const ticks = Int32Array.from([0, 8, 16, 24, 32, 40, 48, 56]);
    const out = findBlinds(flash, ticks, 0, 8, [14, 53], 8, 64, 0.3);
    expect(out).toEqual([{ startTick: 14, endTick: 14 + 128 }, { startTick: 53, endTick: 53 + 192 }]);
  });
});

describe('round clock', () => {
  const r = { freezeEndTick: 1000, endTick: 9000, plantTick: 5000 } as RoundInfo;
  it('counts freeze, round time, then the bomb timer', () => {
    expect(roundClock(r, 1000 - 64 * 10, 64, 115, 40)).toMatchObject({ phase: 'freeze', label: '0:10' });
    expect(roundClock(r, 1000 + 64 * 43, 64, 115, 40)).toMatchObject({ phase: 'live', label: '1:12' });
    expect(roundClock(r, 5000 + 64 * 5, 64, 115, 40)).toMatchObject({ phase: 'bomb', label: '0:35' });
    expect(roundClock(r, 9000, 64, 115, 40).phase).toBe('over');
    expect(fmtSeconds(-3)).toBe('0:00');
  });
  it('angles blend the short way round', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(360);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(-170, 170, 0.5)).toBeCloseTo(-180);
  });
});

describe('settings', () => {
  it('the shipped settings are all valid', () => {
    expect(resolveSettings(SETTINGS).warnings).toEqual([]);
  });
  it('bad values fall back to the default with one warning each', () => {
    const bad = structuredClone(SETTINGS);
    bad.parse.sampleEveryTicks = NaN;
    bad.map.playerRadius = 500;
    (bad.playback as { speeds: unknown }).speeds = 'fast';
    const { settings, warnings } = resolveSettings(bad);
    expect(settings.parse.sampleEveryTicks).toBe(8);
    expect(settings.map.playerRadius).toBe(9);
    expect(settings.playback.speeds).toEqual([0.25, 0.5, 1, 2, 4, 8]);
    expect(warnings).toHaveLength(3);
  });
});

describe('files', () => {
  const b = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  it('recognises CS2 demos, CS:GO demos and archives', () => {
    expect(sniffDemo(b('PBDEMS2\0....')).ok).toBe(true);
    expect(sniffDemo(b('HL2DEMO\0....'))).toMatchObject({ ok: false, message: expect.stringContaining('CS:GO') });
    expect(sniffDemo(b('Rar!\x1a\x07\0.'))).toMatchObject({ ok: false, message: expect.stringContaining('compressed') });
    expect(sniffDemo(Uint8Array.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0]))).toMatchObject({ ok: false, message: expect.stringContaining('compressed') });
    expect(sniffDemo(b('hello world!')).ok).toBe(false);
  });
  it('win reasons', () => {
    expect(['t_killed', 'target_bombed', 'bomb_defused', 'target_saved', 'x'].map(winReason)).toEqual(['elim', 'bomb', 'defuse', 'time', 'other']);
  });
});

describe('maps', () => {
  const anc = mapInfo('de_ancient')!;
  const nuke = mapInfo('de_nuke')!;
  it('world → radar pixel uses Valve overview numbers', () => {
    expect(toRadar(anc, anc.posX, anc.posY)).toEqual([0, 0]);
    expect(toRadar(anc, anc.posX + 5 * 1024, anc.posY - 5 * 1024)).toEqual([1024, 1024]);
  });
  it('two-level maps pick the level from height', () => {
    expect(nuke.layers).toHaveLength(2);
    expect(layerFor(nuke, 0)).toBe(0);
    expect(layerFor(nuke, -600)).toBe(1);
    expect(layerFor(anc, -600)).toBe(0);
  });
  it('bomb sites come from the overview file', () => {
    const s = siteWorldPositions('de_ancient')!;
    expect(s.A[0]).toBeCloseTo(anc.posX + anc.bombA[0]! * 1024 * anc.scale);
    expect(siteWorldPositions('de_nowhere')).toBeNull();
  });
});

describe('hotkeys', () => {
  const k = (key: string, extra: Partial<KeyboardEvent> = {}) => ({ key, code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  it('every listed hotkey has a key that triggers it', () => {
    const presses: Record<string, ReturnType<typeof k>> = {
      hotkeys: k('h'), playPause: k(' '), seekBack: k('ArrowLeft'), seekForward: k('ArrowRight'),
      speedUp: k('ArrowUp', { shiftKey: true }), speedDown: k('ArrowDown', { shiftKey: true }),
      prevRound: k('j'), nextRound: k('k'), draw: k('d'), penBack: k('D', { shiftKey: true }), move: k('m'),
      clear: k('c'), layer: k('l'), freeze: k('f'), escape: k('Escape'),
    };
    for (const h of HOTKEYS) expect(actionFor(presses[h.action]), h.action).toBe(h.action);
  });
  it('browser shortcuts are left alone', () => {
    expect(actionFor(k('c', { ctrlKey: true }))).toBeNull();
    expect(actionFor(k('r', { metaKey: true }))).toBeNull();
  });
});
