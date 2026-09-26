import type { UtilityId } from '../config/weapons';

export type Side = 'ct' | 't';
export type TeamKey = 0 | 1;
export type Vec3 = [number, number, number];

export interface TeamInfo {
  key: TeamKey;
  name: string;
}

export interface PlayerInfo {
  /** Index into Match.players and Match.samples. */
  idx: number;
  steamid: string;
  name: string;
  team: TeamKey;
  /** 1–10. Shown as 1–9 and 0, like EDGE and the in-game scoreboard. */
  slot: number;
}

export interface RoundInfo {
  n: number;
  /** First tick we keep (inside freeze time). */
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  /** Last tick we keep (after the win panel). */
  officialEndTick: number;
  winnerSide: Side | null;
  winnerTeam: TeamKey | null;
  reason: string;
  /** Which side each team plays this round: sides[teamKey]. */
  sides: [Side, Side];
  /** Score AFTER this round: [team0, team1]. */
  scoreAfter: [number, number];
  plantTick: number | null;
  plantSite: 'A' | 'B' | null;
  plantPos: Vec3 | null;
  defuseTick: number | null;
  explodeTick: number | null;
  /** Position samples for this round live at [sampleOffset, sampleOffset + sampleCount) of every player's arrays. */
  sampleOffset: number;
  sampleCount: number;
}

/** One player's samples across all rounds (see RoundInfo.sampleOffset). NaN x = not in the demo at that moment. */
export interface PlayerSamples {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  hp: Uint8Array;
  armor: Uint8Array;
  /** bit 1 alive, bit 2 helmet, bit 4 defuse kit */
  flags: Uint8Array;
  money: Int32Array;
  equip: Int32Array;
  /** Index into Match.strings. */
  weapon: Uint16Array;
  /** Index into Match.inventories. */
  inv: Uint16Array;
  kills: Uint16Array;
  deaths: Uint16Array;
  assists: Uint16Array;
  damage: Int32Array;
}

export const FLAG_ALIVE = 1;
export const FLAG_HELMET = 2;
export const FLAG_KIT = 4;

export interface Kill {
  tick: number;
  round: number;
  attacker: number; // -1 = world / unknown
  victim: number;
  assister: number;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noscope: boolean;
  attackerBlind: boolean;
  victimPos: Vec3;
}

export interface Nade {
  type: UtilityId;
  round: number;
  thrower: number;
  /** null when the throw wasn't found (e.g. thrown before the demo started recording). */
  throwTick: number | null;
  from: Vec3 | null;
  detTick: number;
  endTick: number;
  pos: Vec3;
}

export interface Blind {
  player: number;
  round: number;
  startTick: number;
  endTick: number;
}

export interface Place {
  name: string;
  pos: Vec3;
}

export interface Match {
  format: number;
  mapName: string;
  serverName: string;
  tickrate: number;
  sampleStep: number;
  teams: [TeamInfo, TeamInfo];
  players: PlayerInfo[];
  rounds: RoundInfo[];
  samples: PlayerSamples[];
  strings: string[];
  /** Each entry is a list of indexes into strings. */
  inventories: number[][];
  kills: Kill[];
  nades: Nade[];
  blinds: Blind[];
  places: Place[];
  /** Things the reader noticed but could not handle, shown in the debug panel. */
  notes: string[];
}
