/**
 * Runs the demo reader in the right order and hands its output to buildMatch.
 * The reader functions are passed in, so the browser worker and the Node test use the same code.
 */
import { buildMatch, EVENT_NAMES, EVENT_OTHER_PROPS, EVENT_PLAYER_PROPS, findRounds, sampleTicks, TICK_PROPS, type Cols, type ParseCfg, type Row } from './build';
import type { Match } from '../model/types';

export interface ReaderFns {
  parseHeader(bytes: Uint8Array): unknown;
  parseEvents(bytes: Uint8Array, names: string[], playerProps: string[], otherProps: string[]): unknown;
  parseTicks(bytes: Uint8Array, props: string[], ticks: Int32Array, players: null, structOfArrays: boolean): unknown;
}

export type Stage = 'checking' | 'rounds' | 'positions' | 'building';

/** What kind of file this is, from its first bytes. */
export function sniffDemo(bytes: Uint8Array): { ok: true } | { ok: false; message: string } {
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (head.startsWith('PBDEMS2')) return { ok: true };
  if (head.startsWith('HL2DEMO')) return { ok: false, message: 'This is a CS:GO demo. Open Skybox reads CS2 demos only.' };
  if (head.startsWith('Rar!') || head.startsWith('PK') || (bytes[0] === 0x1f && bytes[1] === 0x8b) || head.startsWith('BZh') || (bytes[0] === 0x28 && bytes[1] === 0xb5)) {
    return { ok: false, message: 'This file is compressed (.rar / .zip / .gz / .bz2 / .zst). Unpack it first, then drop the .dem file inside.' };
  }
  return { ok: false, message: "This doesn't look like a CS2 demo (.dem) file." };
}

function toObj(v: unknown): Row {
  return v instanceof Map ? Object.fromEntries(v) : (v as Row);
}
function toCols(v: unknown): Cols {
  if (v instanceof Map) return Object.fromEntries(v) as Cols;
  return v as Cols;
}

export function readDemo(
  fns: ReaderFns, bytes: Uint8Array, cfg: ParseCfg,
  sitesFor: (mapName: string) => { A: [number, number]; B: [number, number] } | null,
  onStage: (s: Stage) => void,
): Match {
  onStage('checking');
  const sniff = sniffDemo(bytes);
  if (!sniff.ok) throw new Error(sniff.message);
  const header = toObj(fns.parseHeader(bytes));
  onStage('rounds');
  const events = (fns.parseEvents(bytes, EVENT_NAMES, EVENT_PLAYER_PROPS, EVENT_OTHER_PROPS) as unknown[]).map(toObj);
  const rounds = findRounds(events, cfg);
  if (rounds.length === 0) throw new Error('No finished rounds found in this demo. It may be only warmup, or a Deathmatch / Arms Race game, which Open Skybox does not read.');
  onStage('positions');
  const { ticks } = sampleTicks(rounds, cfg.sampleEveryTicks);
  const cols = toCols(fns.parseTicks(bytes, TICK_PROPS, ticks, null, true));
  onStage('building');
  return buildMatch({ header, events, ticks: cols, cfg, sites: sitesFor(String(header.map_name ?? '')) });
}
