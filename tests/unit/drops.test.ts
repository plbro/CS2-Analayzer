/** F-010 dropped utility: every decision of the drop finder, on made-up rounds. Run: npm test */
import { describe, expect, it } from 'vitest';
import { deathDropType, findDrops, type DropInput } from '../../src/parser/drops';
import { iconPathData } from '../../src/render/icon-path';
import { eventNames } from '../../src/parser/build';
import { ICONS } from '../../src/ui/Icon';
import { UTILITY_ORDER } from '../../src/config/weapons';
import { FLAG_ALIVE, type Kill, type PlayerSamples, type RoundInfo } from '../../src/model/types';

const STEP = 8, RATE = 64;
// strings and inventories: index 0 = empty
const strings = ['', 'Flashbang', 'Smoke Grenade', 'Molotov', 'AK-47', 'High Explosive Grenade'];
const INV = { none: 0, flashSmoke: 1, smoke: 2, flashSmokeMolly: 3, smokeMolly: 4, smokeHe: 5, flash: 6 };
const inventories = [[], [1, 2], [2], [1, 2, 3], [2, 3], [2, 5], [1]];
const W = { none: 0, flash: 1, smoke: 2, molly: 3, ak: 4 };

const round: RoundInfo = {
  n: 1, startTick: 0, freezeEndTick: 1280, endTick: 1280 + 100 * RATE, officialEndTick: 1280 + 107 * RATE,
  winnerSide: 'ct', winnerTeam: 0, reason: '', sides: ['ct', 't'], scoreAfter: [1, 0],
  plantTick: null, plantSite: null, plantPos: null, defuseTick: null, explodeTick: null,
  sampleOffset: 0, sampleCount: (1280 + 107 * RATE) / STEP,
};
const N = round.sampleCount;
/** One player: alive the whole round at (100, 200, 0), holding `weapon`, carrying `inv`. */
function player(inv: number, weapon: number): PlayerSamples {
  return {
    x: new Float32Array(N).fill(100), y: new Float32Array(N).fill(200), z: new Float32Array(N),
    yaw: new Float32Array(N), hp: new Uint8Array(N).fill(100), armor: new Uint8Array(N), flags: new Uint8Array(N).fill(FLAG_ALIVE),
    money: new Int32Array(N), equip: new Int32Array(N), weapon: new Uint16Array(N).fill(weapon), inv: new Uint16Array(N).fill(inv),
    kills: new Uint16Array(N), deaths: new Uint16Array(N), assists: new Uint16Array(N), damage: new Int32Array(N),
  };
}
/** From tick on: set a field for every later sample. */
const from = (arr: { fill(v: number, a: number): unknown }, tick: number, v: number) => arr.fill(v, tick / STEP);
const cfg = { tickrate: RATE, sampleEveryTicks: STEP, dropBuyTimeSeconds: 20, dropThrowLagSeconds: 1, dropPickupRadiusUnits: 400 };
const input = (samples: PlayerSamples[], extra: Partial<DropInput> = {}): DropInput =>
  ({ rounds: [round], samples, inventories, strings, throws: [], kills: [], pickups: [], cfg, ...extra });
const kill = (victim: number, tick: number): Kill => ({
  tick, round: 0, attacker: 1, victim, assister: -1, weapon: 'ak47', headshot: false, wallbang: false, throughSmoke: false,
  noscope: false, attackerBlind: false, victimPos: [300, 400, 0],
});
const LIVE = 1280 + 30 * RATE; // 30 s into the round: after buy time

describe('dropped utility: by hand', () => {
  it('a grenade that leaves the inventory while held, without a throw, is a drop at the player\'s feet', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, LIVE, INV.smoke);
    const { drops, stats } = findDrops(input([p]));
    expect(drops).toEqual([{ type: 'flash', round: 0, player: 0, cause: 'hand', tick: LIVE, endTick: round.officialEndTick, pickedBy: -1, pos: [100, 200, 0] }]);
    expect(stats.hand).toBe(1);
  });
  it('a thrown grenade is not a drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, LIVE, INV.smoke);
    expect(findDrops(input([p], { throws: [{ player: 0, type: 'flash', tick: LIVE - 4 }] })).drops).toEqual([]);
  });
  it('the grenade leaves the inventory up to ~0.5 s after the throw event: still a throw, not a drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, LIVE, INV.smoke);
    expect(findDrops(input([p], { throws: [{ player: 0, type: 'flash', tick: LIVE - 37 }] })).drops).toEqual([]);
  });
  it('a throw long before (more than the lag setting) does not hide a later drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, LIVE, INV.smoke);
    expect(findDrops(input([p], { throws: [{ player: 0, type: 'flash', tick: LIVE - 2 * RATE }] })).drops).toHaveLength(1);
  });
  it('a throw by another player, or of another grenade, does not hide a drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, LIVE, INV.smoke);
    const throws = [{ player: 1, type: 'flash' as const, tick: LIVE - 4 }, { player: 0, type: 'smoke' as const, tick: LIVE - 4 }];
    expect(findDrops(input([p, player(INV.none, W.ak)], { throws })).drops).toHaveLength(1);
  });
  it('a grenade handed over in spawn (dropped and picked up before buy time ends) is not shown', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, 1280 + 5 * RATE, INV.smoke);
    const pickups = [{ player: 1, type: 'flash' as const, tick: 1280 + 8 * RATE, pos: [110, 200, 0] as [number, number, number] }];
    const { drops, stats } = findDrops(input([p, player(INV.none, W.ak)], { pickups }));
    expect(drops).toEqual([]);
    expect([stats.hand, stats.handovers, stats.explained]).toEqual([1, 1, 1]);
  });
  it('a grenade dropped in buy time that stays on the ground is shown', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, 1280 + 5 * RATE, INV.smoke);
    const pickups = [{ player: 1, type: 'flash' as const, tick: LIVE, pos: [110, 200, 0] as [number, number, number] }];
    expect(findDrops(input([p, player(INV.none, W.ak)], { pickups })).drops.map((d) => [d.tick, d.endTick])).toEqual([[1280 + 5 * RATE, LIVE]]);
  });
  it('a grenade sold back (money goes up) is not a drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.inv, 1280 + 5 * RATE, INV.smoke);
    from(p.money, 1280 + 5 * RATE, 200);
    const { drops, stats } = findDrops(input([p]));
    expect(drops).toEqual([]);
    expect(stats.sold).toBe(1);
  });
  it('a grenade that vanishes while NOT in hand is not a drop, and is counted so the rule can be checked', () => {
    const p = player(INV.flashSmoke, W.ak);
    from(p.inv, LIVE, INV.smoke);
    const { drops, stats } = findDrops(input([p]));
    expect(drops).toEqual([]);
    expect(stats.handRejected).toBe(1);
  });
  it('a dead player\'s inventory emptying is not a hand drop', () => {
    const p = player(INV.flashSmoke, W.flash);
    from(p.flags, LIVE, 0);
    from(p.inv, LIVE, INV.none);
    expect(findDrops(input([p])).stats.hand).toBe(0);
  });
});

describe('dropped utility: on death', () => {
  it('the game drops the grenade in his hand', () => {
    const p = player(INV.flashSmokeMolly, W.smoke);
    from(p.flags, LIVE + 2, 0);
    const { drops } = findDrops(input([p, player(INV.none, W.ak)], { kills: [kill(0, LIVE + 2)] }));
    expect(drops.map((d) => [d.type, d.cause, d.pos])).toEqual([['smoke', 'death', [300, 400, 0]]]);
  });
  it('otherwise his most valuable grenade (molotov before smoke before flash)', () => {
    const p = player(INV.flashSmokeMolly, W.ak);
    from(p.flags, LIVE + 2, 0);
    expect(findDrops(input([p], { kills: [kill(0, LIVE + 2)] })).drops[0].type).toBe('molotov');
    expect(deathDropType(undefined, undefined, ['flash', 'smoke'])).toBe('smoke');
    expect(deathDropType('he', 'flash', ['flash', 'he', 'molotov'])).toBe('he');
    expect(deathDropType(undefined, undefined, [])).toBeNull();
  });
  it('before that, the grenade he last had in his hand this round', () => {
    const p = player(INV.flashSmokeMolly, W.ak);
    p.weapon.fill(W.flash, LIVE / STEP - 40, LIVE / STEP - 20); // held a flash 5 s before, then back to the rifle
    from(p.flags, LIVE + 2, 0);
    expect(findDrops(input([p], { kills: [kill(0, LIVE + 2)] })).drops[0].type).toBe('flash');
    expect(deathDropType(undefined, 'decoy', ['flash', 'smoke'])).toBe('smoke'); // no longer carried: ignored
  });
  it('a grenade thrown just before dying is no longer on him', () => {
    const p = player(INV.flash, W.flash);
    from(p.flags, LIVE + 6, 0);
    expect(findDrops(input([p], { kills: [kill(0, LIVE + 6)], throws: [{ player: 0, type: 'flash', tick: LIVE + 3 }] })).drops).toEqual([]);
  });
  it('a death after the round is decided drops nothing we show', () => {
    const p = player(INV.flashSmoke, W.flash);
    expect(findDrops(input([p], { kills: [kill(0, round.endTick + 64)] })).drops).toEqual([]);
  });
});

describe('dropped utility: pickups', () => {
  const dropped = () => { const p = player(INV.flashSmoke, W.flash); from(p.inv, LIVE, INV.smoke); return p; };
  it('a pickup of the same grenade nearby ends the drop and records who took it', () => {
    const { drops, stats } = findDrops(input([dropped(), player(INV.none, W.ak)], { pickups: [{ player: 1, type: 'flash', tick: LIVE + 100, pos: [150, 250, 0] }] }));
    expect([drops[0].endTick, drops[0].pickedBy]).toEqual([LIVE + 100, 1]);
    expect([stats.pickups, stats.explained]).toEqual([1, 1]);
  });
  it('too far away, the wrong grenade, before the drop, or after the round is decided: the drop stays on the ground', () => {
    const pickups = [
      { player: 1, type: 'flash' as const, tick: LIVE + 100, pos: [900, 900, 0] as [number, number, number] },
      { player: 1, type: 'smoke' as const, tick: LIVE + 100, pos: [100, 200, 0] as [number, number, number] },
      { player: 1, type: 'flash' as const, tick: LIVE - 100, pos: [100, 200, 0] as [number, number, number] },
      { player: 1, type: 'flash' as const, tick: round.endTick + 64, pos: [100, 200, 0] as [number, number, number] },
    ];
    const { drops, stats } = findDrops(input([dropped(), player(INV.none, W.ak)], { pickups }));
    expect([drops[0].endTick, drops[0].pickedBy]).toEqual([round.officialEndTick, -1]);
    expect([stats.pickups, stats.explained]).toEqual([3, 0]); // the one after the round is decided is not judged
  });
  it('a purchase (the buyer\'s money goes down) is not a pickup', () => {
    const buyer = player(INV.none, W.ak);
    buyer.money.fill(4000);
    from(buyer.money, LIVE + 96, 3800);
    const { drops, stats } = findDrops(input([dropped(), buyer], { pickups: [{ player: 1, type: 'flash', tick: LIVE + 96, pos: [100, 200, 0] }] }));
    expect(drops[0].pickedBy).toBe(-1);
    expect([stats.bought, stats.pickups]).toEqual([1, 0]);
  });
  it('a pickup corrects the guess of which grenade a dead player dropped, and the rule is scored', () => {
    const p = player(INV.smokeHe, W.ak); // smoke and HE cost the same: the rule guesses smoke
    from(p.flags, LIVE + 2, 0);
    const { drops, stats } = findDrops(input([p, player(INV.none, W.ak)], { kills: [kill(0, LIVE + 2)], pickups: [{ player: 1, type: 'he', tick: LIVE + 64, pos: [310, 410, 0] }] }));
    expect(drops[0].type).toBe('he');
    expect([stats.deathChecked, stats.deathAgreed]).toEqual([1, 0]);
  });
  it('one pickup ends one drop only', () => {
    const a = dropped(), b = dropped();
    const { drops } = findDrops(input([a, b], { pickups: [{ player: 1, type: 'flash', tick: LIVE + 100, pos: [100, 200, 0] }] }));
    expect(drops.filter((d) => d.pickedBy >= 0)).toHaveLength(1);
  });
});

describe('dropped utility: switch', () => {
  it('off = the demo reader is not even asked for pickup events', () => {
    expect(eventNames(true)).toContain('item_pickup');
    expect(eventNames(false)).not.toContain('item_pickup');
  });
});

describe('map icons', () => {
  it('every grenade icon converts to a canvas path with nothing left out', () => {
    for (const u of UTILITY_ORDER) {
      const { d, unsupported } = iconPathData(ICONS[u]);
      expect(unsupported, u).toEqual([]);
      expect(d.length, u).toBeGreaterThan(10);
    }
    expect(iconPathData('<rect x="1" y="2" width="3" height="4"/>').d).toBe('M1 2H4V6H1Z');
    expect(iconPathData('<ellipse cx="1"/>').unsupported).toEqual(['ellipse']);
  });
});
