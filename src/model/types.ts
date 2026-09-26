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

/** F-010: a grenade lying on the ground during a live round. */
export interface Drop {
  type: UtilityId;
  round: number;
  /** Who dropped it (index into Match.players). */
  player: number;
  /** 'hand' = dropped on purpose; 'death' = fell when he died. */
  cause: 'hand' | 'death';
  /** When it hit the ground (within one position sample, 1/8 s at the default setting). */
  tick: number;
  /** When it was picked up, or the round's last tick if nobody did. */
  endTick: number;
  /** Who picked it up, -1 = nobody. */
  pickedBy: number;
  /** Where: the player's feet when he dropped it, or where he died. */
  pos: Vec3;
}

/** F-010: counts used by the real-demo test to check the drop finder against the game's own pickup events. */
export interface DropStats {
  hand: number;
  /** Grenades that vanished without a throw while NOT in hand (so not a drop; counted to catch a wrong rule). */
  handRejected: number;
  /** Grenades that left the inventory while the player's money went up: sold back, not dropped. */
  sold: number;
  death: number;
  /** Grenade pickups from the ground (before the round was decided). */
  pickups: number;
  /** item_pickup events that were purchases (money went down), not counted in pickups. */
  bought: number;
  /** Of those, how many picked up a drop we found. */
  explained: number;
  /** Death drops confirmed by a pickup, and how many of those our "which grenade fell" rule got right. */
  deathChecked: number;
  deathAgreed: number;
  /** Drops left out because they were picked up again before buy time ended (handed over in spawn). */
  handovers: number;
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
  /** F-010: dropped grenades. Empty when the feature is off. */
  drops: Drop[];
  /** F-010: null when the feature is off. */
  dropStats: DropStats | null;
  /** Things the reader noticed but could not handle, shown in the debug panel. */
  notes: string[];
}
