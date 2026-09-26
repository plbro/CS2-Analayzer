/**
 * Questions the screen asks about a Match at a moment in time. Pure functions.
 * fillFrame() is the per-frame hot path: it writes into a reused Frame and allocates nothing.
 */
import { FLAG_ALIVE, type Blind, type Kill, type Match, type Nade, type RoundInfo, type TeamKey } from './types';

export interface MatchIndex {
  killsByRound: Kill[][];
  nadesByRound: Nade[][];
  blindsByRound: Blind[][];
  /** deathTick[round][player] (Infinity = survived) */
  deathTick: number[][];
}

export function makeIndex(m: Match): MatchIndex {
  const killsByRound = m.rounds.map(() => [] as Kill[]);
  const nadesByRound = m.rounds.map(() => [] as Nade[]);
  const blindsByRound = m.rounds.map(() => [] as Blind[]);
  for (const k of m.kills) killsByRound[k.round].push(k);
  for (const n of m.nades) nadesByRound[n.round].push(n);
  for (const b of m.blinds) blindsByRound[b.round].push(b);
  const deathTick = m.rounds.map((_, ri) => {
    const d = m.players.map(() => Infinity);
    for (const k of killsByRound[ri]) if (d[k.victim] === Infinity) d[k.victim] = k.tick;
    return d;
  });
  return { killsByRound, nadesByRound, blindsByRound, deathTick };
}

export interface PlayerFrame {
  present: boolean;
  alive: boolean;
  x: number; y: number; z: number; yaw: number;
  hp: number; armor: number; flags: number; money: number; equip: number;
  weapon: number; inv: number;
  kills: number; deaths: number; assists: number; damage: number;
  blind: number; // 0 = not blinded, otherwise 0..1 remaining strength
}
export interface Frame { players: PlayerFrame[] }

export function newFrame(m: Match): Frame {
  return {
    players: m.players.map(() => ({
      present: false, alive: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, armor: 0, flags: 0, money: 0, equip: 0,
      weapon: 0, inv: 0, kills: 0, deaths: 0, assists: 0, damage: 0, blind: 0,
    })),
  };
}

/** Shortest-way angle blend (359° → 1° goes through 0°, not all the way round). */
export function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * f;
}

/** Fills `out` with every player's state at `tick` of round `ri`. No allocations. */
export function fillFrame(m: Match, idx: MatchIndex, ri: number, tick: number, out: Frame): void {
  const r = m.rounds[ri];
  const pos = (tick - r.startTick) / m.sampleStep;
  const k0 = Math.max(0, Math.min(r.sampleCount - 1, Math.floor(pos)));
  const k1 = Math.min(r.sampleCount - 1, k0 + 1);
  const f = Math.max(0, Math.min(1, pos - k0));
  const i0 = r.sampleOffset + k0, i1 = r.sampleOffset + k1;
  const blinds = idx.blindsByRound[ri];
  for (let p = 0; p < m.players.length; p++) {
    const s = m.samples[p];
    const o = out.players[p];
    const x0 = s.x[i0];
    o.present = Number.isFinite(x0);
    const dead = tick >= idx.deathTick[ri][p];
    o.alive = o.present && !dead && (s.flags[i0] & FLAG_ALIVE) !== 0;
    if (o.present) {
      const x1 = s.x[i1];
      const blend = Number.isFinite(x1) && (s.flags[i1] & FLAG_ALIVE) !== 0 ? f : 0;
      o.x = x0 + (x1 - x0) * blend;
      o.y = s.y[i0] + (s.y[i1] - s.y[i0]) * blend;
      o.z = s.z[i0] + (s.z[i1] - s.z[i0]) * blend;
      o.yaw = lerpAngle(s.yaw[i0], s.yaw[i1], blend);
    }
    o.hp = dead ? 0 : s.hp[i0];
    o.armor = s.armor[i0]; o.flags = s.flags[i0]; o.money = s.money[i0]; o.equip = s.equip[i0];
    o.weapon = s.weapon[i0]; o.inv = s.inv[i0];
    o.kills = s.kills[i0]; o.deaths = s.deaths[i0]; o.assists = s.assists[i0]; o.damage = s.damage[i0];
    o.blind = 0;
    for (let b = 0; b < blinds.length; b++) {
      const bl = blinds[b];
      if (bl.player === p && tick >= bl.startTick && tick < bl.endTick) {
        o.blind = Math.max(o.blind, (bl.endTick - tick) / Math.max(1, bl.endTick - bl.startTick));
      }
    }
  }
}

export type ClockPhase = 'freeze' | 'live' | 'bomb' | 'over';
export interface Clock { phase: ClockPhase; secondsLeft: number; label: string }

export function fmtSeconds(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** The round clock at `tick`: freeze countdown, round time, or bomb timer once planted. */
export function roundClock(r: RoundInfo, tick: number, rate: number, roundSeconds: number, bombSeconds: number): Clock {
  if (tick < r.freezeEndTick) {
    const s = (r.freezeEndTick - tick) / rate;
    return { phase: 'freeze', secondsLeft: s, label: fmtSeconds(s) };
  }
  if (tick >= r.endTick) return { phase: 'over', secondsLeft: 0, label: '0:00' };
  if (r.plantTick !== null && tick >= r.plantTick) {
    const s = bombSeconds - (tick - r.plantTick) / rate;
    return { phase: 'bomb', secondsLeft: s, label: fmtSeconds(s) };
  }
  const s = roundSeconds - (tick - r.freezeEndTick) / rate;
  return { phase: 'live', secondsLeft: s, label: fmtSeconds(s) };
}

/** Score going into round ri: [team0, team1]. */
export function scoreBefore(m: Match, ri: number): [number, number] {
  return ri === 0 ? [0, 0] : m.rounds[ri - 1].scoreAfter;
}

/** Score shown at `tick`: updates the moment the round is won. */
export function scoreAt(m: Match, ri: number, tick: number): [number, number] {
  return tick >= m.rounds[ri].endTick ? m.rounds[ri].scoreAfter : scoreBefore(m, ri);
}

/** Where the timeline of a round starts and ends. */
export function roundSpan(r: RoundInfo, includeFreeze: boolean): [number, number] {
  return [includeFreeze ? r.startTick : r.freezeEndTick, r.officialEndTick];
}

/** Grenade state at `tick`: in the air (0..1 progress), active (0..1 remaining), or neither. */
export function nadeState(n: Nade, tick: number, burstTicks: number): { flying: number; active: number } {
  let flying = -1, active = -1;
  if (n.throwTick !== null && tick >= n.throwTick && tick < n.detTick) flying = (tick - n.throwTick) / Math.max(1, n.detTick - n.throwTick);
  const end = n.type === 'flash' || n.type === 'he' ? n.detTick + burstTicks : n.endTick;
  if (tick >= n.detTick && tick < end) active = 1 - (tick - n.detTick) / Math.max(1, end - n.detTick);
  return { flying, active };
}

export function sideOf(r: RoundInfo, team: TeamKey) {
  return r.sides[team];
}

/** Sides swap here (halftime / overtime): the round before `ri` had the other sides. */
export function isSideSwap(m: Match, ri: number): boolean {
  return ri > 0 && m.rounds[ri].sides[0] !== m.rounds[ri - 1].sides[0];
}

/** Average damage per round for a player up to and including the frame's damage total. */
export function adr(damageTotal: number, roundsPlayed: number): number {
  return roundsPlayed > 0 ? Math.round(damageTotal / roundsPlayed) : 0;
}
