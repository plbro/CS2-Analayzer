/** Map data (radar image, where it sits in the world) and world → radar-pixel maths. Pure. */
import MAPS from '../config/maps.json';

export const RADAR_PX = 1024;

export interface MapLayer { id: string; image: string; altMin: number; altMax: number }
export interface MapInfo { posX: number; posY: number; scale: number; bombA: [number | null, number | null]; bombB: [number | null, number | null]; layers: MapLayer[] }

const maps = MAPS as unknown as Record<string, MapInfo>;

export function mapInfo(name: string): MapInfo | null {
  return maps[name] ?? null;
}
export function knownMaps(): string[] {
  return Object.keys(maps);
}
/** "de_ancient" → "Ancient" */
export function prettyMapName(name: string): string {
  const base = name.replace(/^(de|cs|ar)_/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** World position → radar pixel (0–1024). */
export function toRadar(m: MapInfo, x: number, y: number): [number, number] {
  return [(x - m.posX) / m.scale, (m.posY - y) / m.scale];
}

/** Which layer (0 = main, 1 = lower) a height belongs to. */
export function layerFor(m: MapInfo, z: number): number {
  if (m.layers.length < 2 || !Number.isFinite(z)) return 0;
  return z < m.layers[1].altMax ? 1 : 0;
}

/** Bomb site centres in world units, from the loading-screen markers in Valve's overview file. */
export function siteWorldPositions(name: string): { A: [number, number]; B: [number, number] } | null {
  const m = maps[name];
  if (!m || m.bombA[0] === null || m.bombB[0] === null) return null;
  const w = (n: [number | null, number | null]): [number, number] => [m.posX + (n[0] ?? 0) * RADAR_PX * m.scale, m.posY - (n[1] ?? 0) * RADAR_PX * m.scale];
  return { A: w(m.bombA), B: w(m.bombB) };
}
