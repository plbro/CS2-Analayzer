/**
 * Turns the demo reader's raw output into a compact Match. Pure functions only:
 * no browser, no worker, no parser calls — so tests can run every decision here.
 */
import { MATCH_FORMAT } from '../version';
import { THROW_WEAPONS, type UtilityId } from '../config/weapons';
import {
  FLAG_ALIVE, FLAG_HELMET, FLAG_KIT,
  type Blind, type Kill, type Match, type Nade, type Place, type PlayerInfo, type PlayerSamples,
  type RoundInfo, type Side, type TeamInfo, type TeamKey, type Vec3,
} from '../model/types';

export type Row = Record<string, unknown>;
export type Cols = Record<string, unknown[]>;

export interface ParseCfg {
  tickrate: number;
  sampleEveryTicks: number;
  freezeWindowSeconds: number;
  postRoundSeconds: number;
  minBlindSeconds: number;
  nadeMatchWindowSeconds: number;
  smokeFallbackSeconds: number;
  fireFallbackSeconds: number;
}

/** Events we ask the reader for (one pass). */
export const EVENT_NAMES = [
  'round_start', 'round_freeze_end', 'round_end', 'round_officially_ended',
  'player_death', 'weapon_fire', 'bomb_planted', 'bomb_defused', 'bomb_exploded',
  'smokegrenade_detonate', 'smokegrenade_expired', 'inferno_startburn', 'inferno_expire',
  'flashbang_detonate', 'hegrenade_detonate', 'decoy_started', 'decoy_detonate',
];
/** Extra fields added to every event about the player involved (gives user_X, attacker_X, ...). */
export const EVENT_PLAYER_PROPS = ['X', 'Y', 'Z'];
export const EVENT_OTHER_PROPS = ['is_warmup_period'];
/** Per-player values read at every sample tick. */
export const TICK_PROPS = [
  'X', 'Y', 'Z', 'yaw', 'health', 'armor_value', 'has_helmet', 'has_defuser', 'is_alive',
  'balance', 'current_equip_value', 'team_num', 'team_clan_name', 'active_weapon_name', 'inventory',
  'flash_duration', 'kills_total', 'deaths_total', 'assists_total', 'damage_total', 'last_place_name',
];

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface RawRound {
  n: number;
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  officialEndTick: number;
  winnerSide: Side | null;
  reason: string;
}

/** Finds the real rounds: skips warmup, keeps the last copy of a round that was restarted. */
export function findRounds(events: Row[], cfg: ParseCfg): RawRound[] {
  const sorted = [...events].sort((a, b) => num(a.tick) - num(b.tick));
  const byN = new Map<number, RawRound>();
  let lastStart: number | null = null;
  let lastFreezeEnd: number | null = null;
  let pending: RawRound | null = null;
  let count = 0;
  for (const e of sorted) {
    const tick = num(e.tick);
    switch (e.event_name) {
      case 'round_start': lastStart = tick; break;
      case 'round_freeze_end': lastFreezeEnd = tick; break;
      case 'round_end': {
        const w = str(e.winner).toUpperCase();
        if ((w !== 'CT' && w !== 'T') || e.is_warmup_period === true || lastFreezeEnd === null || lastFreezeEnd >= tick) break;
        const n = num(e.round, 0) >= 1 ? num(e.round) : count + 1;
        const windowStart = lastFreezeEnd - Math.round(cfg.freezeWindowSeconds * cfg.tickrate);
        const startTick = lastStart !== null && lastStart <= lastFreezeEnd ? Math.max(lastStart, windowStart) : windowStart;
        pending = { n, startTick: Math.max(0, startTick), freezeEndTick: lastFreezeEnd, endTick: tick, officialEndTick: -1, winnerSide: w === 'CT' ? 'ct' : 't', reason: str(e.reason) };
        byN.set(n, pending); // a later copy of the same round number (restart / backup) replaces the earlier one
        count = Math.max(count, n);
        lastFreezeEnd = null;
        break;
      }
      case 'round_officially_ended':
        if (pending) { pending.officialEndTick = tick; pending = null; }
        break;
    }
  }
  const rounds = [...byN.values()].sort((a, b) => a.n - b.n);
  const post = Math.round(cfg.postRoundSeconds * cfg.tickrate);
  rounds.forEach((r, i) => {
    if (r.officialEndTick <= r.endTick) r.officialEndTick = r.endTick + post;
    const next = rounds[i + 1];
    if (next && r.officialEndTick > next.startTick) r.officialEndTick = next.startTick;
  });
  return rounds;
}

/** The ticks to sample: every Nth tick of every round (end exclusive, so rounds never share a tick). */
export function sampleTicks(rounds: RawRound[], step: number): { ticks: Int32Array; offsets: number[]; counts: number[] } {
  const offsets: number[] = [];
  const counts: number[] = [];
  const list: number[] = [];
  for (const r of rounds) {
    offsets.push(list.length);
    for (let t = r.startTick; t < r.officialEndTick; t += step) list.push(t);
    counts.push(list.length - offsets[offsets.length - 1]);
  }
  return { ticks: Int32Array.from(list), offsets, counts };
}

/** Which round a tick belongs to, or -1. Rounds are sorted and don't overlap. */
export function roundAt(rounds: { startTick: number; officialEndTick: number }[], tick: number): number {
  let lo = 0, hi = rounds.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rounds[mid];
    if (tick < r.startTick) hi = mid - 1;
    else if (tick >= r.officialEndTick) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function winReason(reason: string): 'elim' | 'bomb' | 'defuse' | 'time' | 'other' {
  const r = reason.toLowerCase();
  if (r.includes('defus')) return 'defuse';
  if (r.includes('bomb')) return 'bomb';
  if (r.includes('killed') || r.includes('elim')) return 'elim';
  if (r.includes('saved') || r.includes('time')) return 'time';
  return 'other';
}

/** Links each grenade landing to the throw that caused it (same player, same type, oldest unused throw inside the window). */
export function pairNades(
  throws: { player: number; type: UtilityId; tick: number; pos: Vec3 }[],
  dets: { player: number; type: UtilityId; tick: number; endTick: number; pos: Vec3 }[],
  windowTicks: number,
): { throwTick: number | null; from: Vec3 | null }[] {
  const used = new Uint8Array(throws.length);
  const sortedThrows = throws.map((t, i) => ({ ...t, i })).sort((a, b) => a.tick - b.tick);
  return dets.map((d) => {
    for (const t of sortedThrows) {
      if (used[t.i] || t.player !== d.player || t.type !== d.type) continue;
      if (t.tick > d.tick) break;
      if (d.tick - t.tick > windowTicks) continue;
      used[t.i] = 1;
      return { throwTick: t.tick, from: t.pos };
    }
    return { throwTick: null, from: null };
  });
}

/**
 * Blinds from the per-sample flash_duration value: a new non-zero value means a new flash.
 * Start = the flashbang that went off just before (if found), end = start + duration.
 */
export function findBlinds(
  flash: Float32Array, sampleTicksArr: Int32Array, sampleStart: number, count: number,
  flashDets: number[], step: number, rate: number, minSeconds: number,
): { startTick: number; endTick: number }[] {
  const out: { startTick: number; endTick: number }[] = [];
  let prev = 0;
  for (let k = 0; k < count; k++) {
    const v = flash[sampleStart + k];
    if (Number.isNaN(v)) continue;
    if (v > 0 && v !== prev && v >= minSeconds) {
      const tick = sampleTicksArr[sampleStart + k];
      let start = tick - (step >> 1);
      for (let i = flashDets.length - 1; i >= 0; i--) {
        const d = flashDets[i];
        if (d <= tick && tick - d <= step + 4) { start = d; break; }
        if (d < tick - step - 4) break;
      }
      out.push({ startTick: start, endTick: start + Math.round(v * rate) });
    }
    prev = v;
  }
  return out;
}

export interface BuildInput {
  header: Row;
  events: Row[];
  ticks: Cols;
  cfg: ParseCfg;
  /** Bomb site centres in world units, from the map file (optional). */
  sites?: { A: [number, number]; B: [number, number] } | null;
}

/** Builds the full Match. */
export function buildMatch({ header, events, ticks, cfg, sites }: BuildInput): Match {
  const notes: string[] = [];
  const rate = cfg.tickrate;
  const step = cfg.sampleEveryTicks;
  const raw = findRounds(events, cfg);
  if (raw.length === 0) throw new Error('No finished rounds found in this demo.');
  const { ticks: sTicks, offsets, counts } = sampleTicks(raw, step);
  const total = sTicks.length;
  const tickIndex = new Map<number, number>();
  for (let i = 0; i < total; i++) tickIndex.set(sTicks[i], i);

  const col = (name: string): unknown[] => ticks[name] ?? [];
  const cTick = col('tick'), cSteam = col('steamid'), cName = col('name'), cTeam = col('team_num'), cClan = col('team_clan_name');
  const rows = cTick.length;

  // ---- players: anyone on T/CT for a meaningful share of samples
  const seen = new Map<string, { name: string; count: number; clan: string }>();
  for (let i = 0; i < rows; i++) {
    const tn = num(cTeam[i]);
    if (tn !== 2 && tn !== 3) continue;
    const id = str(cSteam[i]);
    if (!id || id === '0') continue;
    const s = seen.get(id);
    if (s) { s.count++; if (!s.clan && cClan[i]) s.clan = str(cClan[i]); }
    else seen.set(id, { name: str(cName[i]) || id, count: 1, clan: str(cClan[i]) });
  }
  const maxCount = Math.max(1, ...[...seen.values()].map((s) => s.count));
  const ids = [...seen.entries()].filter(([, s]) => s.count >= maxCount * 0.05).map(([id]) => id);
  if (ids.length !== 10) notes.push(`Found ${ids.length} players instead of 10.`);

  // side each player is on at a given sample
  const pIndexTmp = new Map(ids.map((id, i) => [id, i]));
  const teamNumAt: number[][] = raw.map(() => ids.map(() => 0));
  for (let i = 0; i < rows; i++) {
    const p = pIndexTmp.get(str(cSteam[i]));
    const si = tickIndex.get(num(cTick[i]));
    if (p === undefined || si === undefined) continue;
    const r = roundOfSample(offsets, counts, si);
    if (r >= 0 && teamNumAt[r][p] === 0) { const tn = num(cTeam[i]); if (tn === 2 || tn === 3) teamNumAt[r][p] = tn; }
  }

  // ---- teams: by clan name when the demo has two, otherwise by starting side
  const clans = [...new Set(ids.map((id) => seen.get(id)!.clan).filter(Boolean))];
  const startCt = (p: number) => teamNumAt.find((row) => row[p] !== 0)?.[p] === 3;
  let groupOf: (p: number) => 0 | 1;
  let names: [string, string];
  if (clans.length === 2 && ids.every((id) => seen.get(id)!.clan)) {
    const ctClan = seen.get(ids.find((_, p) => startCt(p)) ?? ids[0])!.clan;
    const other = clans.find((c) => c !== ctClan)!;
    groupOf = (p) => (seen.get(ids[p])!.clan === ctClan ? 0 : 1);
    names = [ctClan, other];
  } else {
    groupOf = (p) => (startCt(p) ? 0 : 1);
    names = ['Team A', 'Team B'];
    notes.push('The demo has no team names; teams are named by starting side (Team A started CT).');
  }
  const teams: [TeamInfo, TeamInfo] = [{ key: 0, name: names[0] }, { key: 1, name: names[1] }];

  // ---- player order: team 0 → slots 1–5, team 1 → 6–10, alphabetical inside a team
  const order = ids.map((id, p) => ({ id, p, team: groupOf(p), name: seen.get(id)!.name }))
    .sort((a, b) => a.team - b.team || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const players: PlayerInfo[] = order.map((o, idx) => ({ idx, steamid: o.id, name: o.name, team: o.team, slot: idx + 1 }));
  const pIndex = new Map(players.map((p) => [p.steamid, p.idx]));

  // ---- samples
  const strings: string[] = [''];
  const stringId = new Map<string, number>([['', 0]]);
  const sid = (s: string) => { let i = stringId.get(s); if (i === undefined) { i = strings.length; strings.push(s); stringId.set(s, i); } return i; };
  const inventories: number[][] = [[]];
  const invId = new Map<string, number>([['', 0]]);
  const samples: PlayerSamples[] = players.map(() => ({
    x: new Float32Array(total).fill(NaN), y: new Float32Array(total).fill(NaN), z: new Float32Array(total).fill(NaN),
    yaw: new Float32Array(total), hp: new Uint8Array(total), armor: new Uint8Array(total), flags: new Uint8Array(total),
    money: new Int32Array(total), equip: new Int32Array(total), weapon: new Uint16Array(total), inv: new Uint16Array(total),
    kills: new Uint16Array(total), deaths: new Uint16Array(total), assists: new Uint16Array(total), damage: new Int32Array(total),
  }));
  const flash = players.map(() => new Float32Array(total).fill(NaN));
  const cX = col('X'), cY = col('Y'), cZ = col('Z'), cYaw = col('yaw'), cHp = col('health'), cArm = col('armor_value');
  const cHelm = col('has_helmet'), cKit = col('has_defuser'), cAlive = col('is_alive'), cBal = col('balance'), cEq = col('current_equip_value');
  const cWep = col('active_weapon_name'), cInv = col('inventory'), cFlash = col('flash_duration');
  const cK = col('kills_total'), cD = col('deaths_total'), cA = col('assists_total'), cDmg = col('damage_total'), cPlace = col('last_place_name');
  const placeAcc = new Map<string, [number, number, number, number]>();
  for (let i = 0; i < rows; i++) {
    const p = pIndex.get(str(cSteam[i]));
    const si = tickIndex.get(num(cTick[i]));
    if (p === undefined || si === undefined) continue;
    const s = samples[p];
    const x = num(cX[i], NaN), y = num(cY[i], NaN), z = num(cZ[i], NaN);
    s.x[si] = x; s.y[si] = y; s.z[si] = z; s.yaw[si] = num(cYaw[i]);
    const alive = cAlive[i] === true || (cAlive[i] === undefined && num(cHp[i]) > 0);
    s.hp[si] = alive ? Math.max(0, Math.min(255, num(cHp[i]))) : 0;
    s.armor[si] = Math.max(0, Math.min(255, num(cArm[i])));
    s.flags[si] = (alive ? FLAG_ALIVE : 0) | (cHelm[i] === true ? FLAG_HELMET : 0) | (cKit[i] === true ? FLAG_KIT : 0);
    s.money[si] = num(cBal[i]); s.equip[si] = num(cEq[i]);
    s.weapon[si] = sid(str(cWep[i]));
    const inv = Array.isArray(cInv[i]) ? (cInv[i] as unknown[]).map(str) : [];
    const key = inv.join('|');
    let ii = invId.get(key);
    if (ii === undefined) { ii = inventories.length; inventories.push(inv.map(sid)); invId.set(key, ii); }
    s.inv[si] = ii;
    s.kills[si] = num(cK[i]); s.deaths[si] = num(cD[i]); s.assists[si] = num(cA[i]); s.damage[si] = num(cDmg[i]);
    flash[p][si] = num(cFlash[i]);
    const place = str(cPlace[i]);
    if (alive && place && Number.isFinite(x)) {
      const acc = placeAcc.get(place) ?? [0, 0, 0, 0];
      acc[0] += x; acc[1] += y; acc[2] += z; acc[3]++; placeAcc.set(place, acc);
    }
  }

  // ---- rounds with sides and score
  const score: [number, number] = [0, 0];
  const rounds: RoundInfo[] = raw.map((r, ri) => {
    let ctVotes = 0, tVotes = 0;
    for (const pl of players) {
      const tn = teamNumAt[ri][order[pl.idx].p];
      if (pl.team === 0) { if (tn === 3) ctVotes++; else if (tn === 2) tVotes++; }
      else { if (tn === 2) ctVotes++; else if (tn === 3) tVotes++; }
    }
    const team0Side: Side = ctVotes >= tVotes ? 'ct' : 't';
    const sides: [Side, Side] = [team0Side, team0Side === 'ct' ? 't' : 'ct'];
    const winnerTeam: TeamKey | null = r.winnerSide ? (sides[0] === r.winnerSide ? 0 : 1) : null;
    if (winnerTeam !== null) score[winnerTeam]++;
    return {
      n: r.n, startTick: r.startTick, freezeEndTick: r.freezeEndTick, endTick: r.endTick, officialEndTick: r.officialEndTick,
      winnerSide: r.winnerSide, winnerTeam, reason: r.reason, sides, scoreAfter: [score[0], score[1]],
      plantTick: null, plantSite: null, plantPos: null, defuseTick: null, explodeTick: null,
      sampleOffset: offsets[ri], sampleCount: counts[ri],
    };
  });

  // ---- events
  const sorted = [...events].sort((a, b) => num(a.tick) - num(b.tick));
  const kills: Kill[] = [];
  const throws: { player: number; type: UtilityId; tick: number; pos: Vec3 }[] = [];
  const dets: { player: number; type: UtilityId; tick: number; endTick: number; pos: Vec3; entity: number }[] = [];
  const flashDets: number[] = [];
  const pos = (e: Row, pre: string): Vec3 => [num(e[`${pre}X`], NaN), num(e[`${pre}Y`], NaN), num(e[`${pre}Z`], NaN)];
  const who = (v: unknown) => pIndex.get(str(v)) ?? -1;
  for (const e of sorted) {
    const tick = num(e.tick);
    const ri = roundAt(rounds, tick);
    const name = e.event_name;
    if (name === 'weapon_fire') {
      const type = THROW_WEAPONS[str(e.weapon)];
      const p = who(e.user_steamid);
      if (type && p >= 0) throws.push({ player: p, type, tick, pos: pos(e, 'user_') });
      continue;
    }
    if (ri < 0) continue;
    const round = rounds[ri];
    switch (name) {
      case 'player_death': {
        const victim = who(e.user_steamid);
        if (victim < 0) break;
        kills.push({
          tick, round: ri, victim, attacker: who(e.attacker_steamid), assister: who(e.assister_steamid),
          weapon: str(e.weapon), headshot: e.headshot === true, wallbang: num(e.penetrated) > 0, throughSmoke: e.thrusmoke === true,
          noscope: e.noscope === true, attackerBlind: e.attackerblind === true, victimPos: pos(e, 'user_'),
        });
        break;
      }
      case 'bomb_planted': {
        round.plantTick = tick;
        round.plantPos = pos(e, 'user_');
        if (sites && Number.isFinite(round.plantPos[0])) {
          const [x, y] = round.plantPos;
          const dA = (x - sites.A[0]) ** 2 + (y - sites.A[1]) ** 2, dB = (x - sites.B[0]) ** 2 + (y - sites.B[1]) ** 2;
          round.plantSite = dA <= dB ? 'A' : 'B';
        }
        break;
      }
      case 'bomb_defused': round.defuseTick = tick; break;
      case 'bomb_exploded': round.explodeTick = tick; break;
      case 'smokegrenade_detonate': case 'inferno_startburn': case 'flashbang_detonate': case 'hegrenade_detonate': case 'decoy_started': {
        const type: UtilityId = name.startsWith('smoke') ? 'smoke' : name.startsWith('inferno') ? 'molotov' : name.startsWith('flash') ? 'flash' : name.startsWith('he') ? 'he' : 'decoy';
        const fallback = type === 'smoke' ? cfg.smokeFallbackSeconds : type === 'molotov' ? cfg.fireFallbackSeconds : type === 'decoy' ? 15 : 0;
        dets.push({ player: who(e.user_steamid), type, tick, endTick: tick + Math.round(fallback * rate), pos: [num(e.x, NaN), num(e.y, NaN), num(e.z, NaN)], entity: num(e.entityid, -1) });
        if (type === 'flash') flashDets.push(tick);
        break;
      }
      case 'smokegrenade_expired': case 'inferno_expire': case 'decoy_detonate': {
        const type: UtilityId = name.startsWith('smoke') ? 'smoke' : name.startsWith('inferno') ? 'molotov' : 'decoy';
        const ent = num(e.entityid, -2);
        for (let i = dets.length - 1; i >= 0; i--) if (dets[i].entity === ent && dets[i].type === type) { dets[i].endTick = tick; break; }
        break;
      }
    }
  }
  const pairs = pairNades(throws, dets, Math.round(cfg.nadeMatchWindowSeconds * rate));
  const nades: Nade[] = [];
  dets.forEach((d, i) => {
    const ri = roundAt(rounds, d.tick);
    if (ri < 0 || !Number.isFinite(d.pos[0])) return;
    nades.push({ type: d.type, round: ri, thrower: d.player, throwTick: pairs[i].throwTick, from: pairs[i].from, detTick: d.tick, endTick: Math.max(d.tick, d.endTick), pos: d.pos });
  });
  const unpaired = nades.filter((n) => n.throwTick === null).length;
  if (unpaired > nades.length * 0.1) notes.push(`${unpaired} of ${nades.length} grenades have no matching throw (drawn without a flight path).`);

  // ---- blinds
  const blinds: Blind[] = [];
  rounds.forEach((r, ri) => {
    const fd = flashDets.filter((t) => t >= r.startTick && t < r.officialEndTick);
    for (let p = 0; p < players.length; p++) {
      for (const b of findBlinds(flash[p], sTicks, r.sampleOffset, r.sampleCount, fd, step, rate, cfg.minBlindSeconds)) {
        blinds.push({ player: p, round: ri, ...b });
      }
    }
  });

  const places: Place[] = [...placeAcc.entries()].filter(([, a]) => a[3] >= 20)
    .map(([name, a]) => ({ name, pos: [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as Vec3 }));

  return {
    format: MATCH_FORMAT,
    mapName: str(header.map_name) || 'unknown',
    serverName: str(header.server_name),
    tickrate: rate,
    sampleStep: step,
    teams, players, rounds, samples, strings, inventories, kills, nades, blinds, places, notes,
  };
}

function roundOfSample(offsets: number[], counts: number[], si: number): number {
  let lo = 0, hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (si < offsets[mid]) hi = mid - 1;
    else if (si >= offsets[mid] + counts[mid]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Every typed array inside a Match, so the worker can hand them over without copying. */
export function transferables(m: Match): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const s of m.samples) for (const a of Object.values(s)) out.push((a as { buffer: ArrayBuffer }).buffer);
  return out;
}
