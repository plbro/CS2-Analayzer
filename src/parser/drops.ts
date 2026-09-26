/**
 * "Dropped utility" (F-010): grenades lying on the ground during a live round. Pure functions only.
 *
 * CS2 demos have no "dropped" event, so drops are worked out from data we already read:
 * - by hand: a grenade leaves a living player's inventory without a throw, while he had that grenade in his hand
 *   (the game only lets you drop the item you are holding);
 * - on death: the game drops ONE grenade (server rule mp_death_drop_grenade): the one in his hand; otherwise, as measured
 *   on the test demos, the grenade he last had in his hand this round (27 of 30 right), and only then the most valuable
 *   one (DEATH_DROP_ORDER; price alone was right 18 of 33).
 * A grenade "item_pickup" near an open drop of the same type ends it (and, for a death drop, confirms which grenade fell).
 * Buying also fires "item_pickup", and selling back also empties the slot: both are told apart by the player's money.
 * Grenades dropped AND picked up before buy time ends (handed over in spawn) are left out, so spawn doesn't fill with icons.
 *
 * Removing this feature: delete this file and the lines marked "F-010" in build.ts, read.ts, query.ts, renderer.ts,
 * MultiFilters.tsx, store.ts, types.ts and settings.
 */
import { DEATH_DROP_ORDER, INVENTORY_UTILITY, UTILITY_ORDER, type UtilityId } from '../config/weapons';
import { FLAG_ALIVE, type Drop, type DropStats, type Kill, type PlayerSamples, type RoundInfo, type Vec3 } from '../model/types';

export interface DropCfg {
  tickrate: number;
  sampleEveryTicks: number;
  /** Grenades dropped and picked up again before this many seconds after freeze time are not shown (handovers). */
  dropBuyTimeSeconds: number;
  /** The grenade leaves the inventory up to this many seconds after its throw event (end of the throw animation). */
  dropThrowLagSeconds: number;
  /** A pickup ends a drop only if the player is within this many game units of it. */
  dropPickupRadiusUnits: number;
}

export interface DropInput {
  rounds: RoundInfo[];
  samples: PlayerSamples[];
  inventories: number[][];
  strings: string[];
  throws: { player: number; type: UtilityId; tick: number }[];
  kills: Kill[];
  pickups: { player: number; type: UtilityId; tick: number; pos: Vec3 }[];
  cfg: DropCfg;
}

const TYPES = UTILITY_ORDER.length;
const typeIdx = (t: UtilityId) => UTILITY_ORDER.indexOf(t);

/** Grenade counts per inventory entry: counts[inv * TYPES + typeIdx]. Worked out once. */
function inventoryCounts(inventories: number[][], strings: string[]): Uint8Array {
  const out = new Uint8Array(inventories.length * TYPES);
  inventories.forEach((inv, i) => {
    for (const s of inv) {
      const t = INVENTORY_UTILITY[strings[s]];
      if (t) out[i * TYPES + typeIdx(t)]++;
    }
  });
  return out;
}

/**
 * Which grenade the game drops when a player dies: the one in his hand, else the one he last had in his hand,
 * else the most valuable he carries.
 */
export function deathDropType(held: UtilityId | undefined, lastHeld: UtilityId | undefined, carried: UtilityId[]): UtilityId | null {
  if (held && carried.includes(held)) return held;
  if (lastHeld && carried.includes(lastHeld)) return lastHeld;
  for (const t of DEATH_DROP_ORDER) if (carried.includes(t)) return t;
  return null;
}

export function findDrops(inp: DropInput): { drops: Drop[]; stats: DropStats } {
  const { rounds, samples, inventories, strings, cfg } = inp;
  const step = cfg.sampleEveryTicks, rate = cfg.tickrate;
  const buyTime = Math.round(cfg.dropBuyTimeSeconds * rate);
  const lag = Math.round(cfg.dropThrowLagSeconds * rate);
  const counts = inventoryCounts(inventories, strings);
  const heldType = strings.map((s) => INVENTORY_UTILITY[s]);
  const stats: DropStats = { hand: 0, handRejected: 0, sold: 0, death: 0, pickups: 0, bought: 0, explained: 0, deathChecked: 0, deathAgreed: 0, handovers: 0 };
  const drops: (Drop & { alt: UtilityId[] })[] = [];

  // throws per player, sorted, with a used flag so one throw explains one missing grenade only
  const throwsBy = samples.map(() => [] as { type: UtilityId; tick: number; used: boolean }[]);
  for (const t of inp.throws) if (t.player >= 0 && t.player < samples.length) throwsBy[t.player].push({ type: t.type, tick: t.tick, used: false });
  for (const list of throwsBy) list.sort((a, b) => a.tick - b.tick);
  const takeThrow = (p: number, type: UtilityId, from: number, to: number): boolean => {
    for (const t of throwsBy[p]) {
      if (t.tick > to) break;
      if (!t.used && t.type === type && t.tick > from) { t.used = true; return true; }
    }
    return false;
  };

  // ---- by hand
  rounds.forEach((r, ri) => {
    for (let p = 0; p < samples.length; p++) {
      const s = samples[p];
      for (let k = 1; k < r.sampleCount; k++) {
        const i = r.sampleOffset + k;
        if (s.inv[i] === s.inv[i - 1]) continue; // nothing changed: the common case, no work
        if (!(s.flags[i] & FLAG_ALIVE) || !(s.flags[i - 1] & FLAG_ALIVE)) continue;
        const tick = r.startTick + k * step, prevTick = tick - step;
        for (let t = 0; t < TYPES; t++) {
          let lost = counts[s.inv[i - 1] * TYPES + t] - counts[s.inv[i] * TYPES + t];
          const type = UTILITY_ORDER[t];
          // the throw event comes first; the grenade leaves the inventory when the throw animation ends
          while (lost > 0 && takeThrow(p, type, prevTick - lag, tick + step)) lost--;
          if (lost <= 0 || tick > r.endTick) continue;
          if (s.money[i] > s.money[i - 1]) { stats.sold += lost; continue; } // sold back in the buy menu
          // the game only drops what is in your hand: it must have been held just before
          const held = heldType[s.weapon[i - 1]] === type || (k >= 2 && heldType[s.weapon[i - 2]] === type);
          if (!held || !Number.isFinite(s.x[i])) { stats.handRejected += lost; continue; }
          for (; lost > 0; lost--) {
            drops.push({ type, round: ri, player: p, cause: 'hand', tick, endTick: r.officialEndTick, pickedBy: -1, pos: [s.x[i], s.y[i], s.z[i]], alt: [type] });
            stats.hand++;
          }
        }
      }
    }
  });

  // ---- on death
  for (const kill of inp.kills) {
    const r = rounds[kill.round];
    if (!r || kill.tick > r.endTick) continue;
    const s = samples[kill.victim];
    if (!s) continue;
    let k = Math.min(r.sampleCount - 1, Math.floor((kill.tick - r.startTick) / step));
    while (k >= 0 && !(s.flags[r.sampleOffset + k] & FLAG_ALIVE)) k--;
    if (k < 0) continue;
    const i = r.sampleOffset + k;
    const sampleTick = r.startTick + k * step;
    const carried: UtilityId[] = [];
    for (let t = 0; t < TYPES; t++) {
      let n = counts[s.inv[i] * TYPES + t];
      const type = UTILITY_ORDER[t];
      // a grenade thrown between the last sample and the death is not on him any more
      while (n > 0 && takeThrow(kill.victim, type, sampleTick, kill.tick)) n--;
      if (n > 0) carried.push(type);
    }
    const held = heldType[s.weapon[i]];
    let lastHeld: UtilityId | undefined;
    for (let q = i - 1; q >= r.sampleOffset && !lastHeld; q--) { const h = heldType[s.weapon[q]]; if (h && carried.includes(h)) lastHeld = h; }
    const type = deathDropType(held, lastHeld, carried);
    if (!type) continue;
    const pos: Vec3 = Number.isFinite(kill.victimPos[0]) ? kill.victimPos : [s.x[i], s.y[i], s.z[i]];
    if (!Number.isFinite(pos[0])) continue;
    drops.push({ type, round: kill.round, player: kill.victim, cause: 'death', tick: kill.tick, endTick: r.officialEndTick, pickedBy: -1, pos, alt: carried });
    stats.death++;
  }

  // ---- pickups end drops (nearest open drop of a matching type in the same round)
  drops.sort((a, b) => a.tick - b.tick);
  const r2 = cfg.dropPickupRadiusUnits ** 2;
  const pickups = [...inp.pickups].sort((a, b) => a.tick - b.tick);
  for (const pk of pickups) {
    const ri = roundOf(rounds, pk.tick);
    if (ri < 0) continue;
    const r = rounds[ri];
    if (pk.tick > r.endTick) continue; // after the round is decided: not shown, not judged
    const s = samples[pk.player];
    if (s) {
      // buying also fires item_pickup: the buyer's money goes down at that moment
      const k0 = Math.max(0, Math.min(r.sampleCount - 1, Math.floor((pk.tick - 1 - r.startTick) / step)));
      const k1 = Math.min(r.sampleCount - 1, k0 + 2);
      if (s.money[r.sampleOffset + k1] < s.money[r.sampleOffset + k0]) { stats.bought++; continue; }
    }
    stats.pickups++;
    let best = -1, bestD = Infinity;
    for (let d = 0; d < drops.length; d++) {
      const dr = drops[d];
      if (dr.tick > pk.tick) break;
      if (dr.round !== ri || dr.pickedBy >= 0 || dr.endTick < pk.tick) continue;
      if (dr.type !== pk.type && !(dr.cause === 'death' && dr.alt.includes(pk.type))) continue;
      const dist = (dr.pos[0] - pk.pos[0]) ** 2 + (dr.pos[1] - pk.pos[1]) ** 2;
      if (dist <= r2 && dist < bestD) { best = d; bestD = dist; }
    }
    if (best < 0) continue;
    const dr = drops[best];
    stats.explained++;
    if (dr.cause === 'death') { stats.deathChecked++; if (dr.type === pk.type) stats.deathAgreed++; }
    dr.type = pk.type;
    dr.endTick = pk.tick;
    dr.pickedBy = pk.player;
  }
  // handovers in spawn: dropped and picked up again before buy time ended
  const shown = drops.filter((d) => {
    const handover = d.pickedBy >= 0 && d.endTick <= rounds[d.round].freezeEndTick + buyTime;
    if (handover) stats.handovers++;
    return !handover;
  });
  return { drops: shown.map(({ alt: _alt, ...d }) => d), stats };
}

function roundOf(rounds: RoundInfo[], tick: number): number {
  let lo = 0, hi = rounds.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tick < rounds[mid].startTick) hi = mid - 1;
    else if (tick >= rounds[mid].officialEndTick) lo = mid + 1;
    else return mid;
  }
  return -1;
}
