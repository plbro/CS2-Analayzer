import { SETTINGS, type Settings } from './settings';

/**
 * Allowed range and fallback for every number in settings.ts.
 * [min, max, fallback]. The fallback MUST equal the value shipped in settings.ts —
 * tools/check.mjs fails the build if they ever disagree.
 */
export const NUMBER_RULES: Record<string, [number, number, number]> = {
  'parse.tickrate': [32, 128, 64],
  'parse.sampleEveryTicks': [2, 32, 8],
  'parse.freezeWindowSeconds': [0, 30, 20],
  'parse.postRoundSeconds': [0, 15, 7],
  'parse.minBlindSeconds': [0, 3, 0.3],
  'parse.nadeMatchWindowSeconds': [2, 40, 20],
  'parse.smokeFallbackSeconds': [5, 30, 20],
  'parse.fireFallbackSeconds': [2, 15, 7],
  'parse.minPlayers': [2, 10, 8],
  'parse.maxPlayers': [10, 24, 12],
  'rules.roundSeconds': [30, 600, 115],
  'rules.bombSeconds': [10, 90, 40],
  'playback.defaultSpeed': [0.1, 16, 1],
  'playback.stepSeconds': [0.5, 30, 5],
  'playback.fineStepSeconds': [0.1, 10, 1],
  'playback.preciseStepSeconds': [0.01, 2, 0.125],
  'playback.panelRefreshPerSecond': [2, 30, 10],
  'map.playerRadius': [4, 20, 9],
  'map.nameSize': [8, 24, 13],
  'map.calloutSize': [6, 20, 10],
  'map.smokeRadiusUnits': [60, 250, 144],
  'map.fireRadiusUnits': [40, 250, 110],
  'map.flashBurstSeconds': [0.1, 2, 0.5],
  'map.heBurstSeconds': [0.1, 2, 0.4],
  'map.killFeedSeconds': [2, 60, 10],
  'map.killFeedMax': [1, 10, 5],
  'map.minZoom': [0.1, 1, 0.5],
  'map.maxZoom': [1, 20, 6],
  'multi.pathOpacity': [0.05, 1, 0.5],
  'multi.maxRounds': [1, 60, 40],
};

/** Fallbacks for non-number settings (same rule: must equal settings.ts). */
export const OTHER_FALLBACKS: Record<string, unknown> = {
  'playback.speeds': [0.25, 0.5, 1, 2, 4, 8],
  'map.radarFilter': 'grayscale(1) brightness(0.85) contrast(1.1)',
};

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

/** Validates a settings object. Returns a safe copy plus one warning per bad value. Pure. */
export function resolveSettings(raw: Settings): { settings: Settings; warnings: string[] } {
  const out = structuredClone(raw) as unknown as Record<string, unknown>;
  const warnings: string[] = [];
  for (const [path, [lo, hi, fallback]] of Object.entries(NUMBER_RULES)) {
    const v = getPath(raw, path);
    // written as !(v >= lo) so NaN, undefined and strings are caught too
    if (typeof v !== 'number' || !(v >= lo) || !(v <= hi)) {
      warnings.push(`Setting ${path} = ${String(v)} is not between ${lo} and ${hi}; using ${fallback}.`);
      setPath(out, path, fallback);
    }
  }
  const speeds = getPath(raw, 'playback.speeds');
  if (!Array.isArray(speeds) || speeds.length === 0 || speeds.some((s) => typeof s !== 'number' || !(s >= 0.1) || !(s <= 16))) {
    warnings.push('Setting playback.speeds must be a list of numbers between 0.1 and 16; using the default list.');
    setPath(out, 'playback.speeds', OTHER_FALLBACKS['playback.speeds']);
  }
  const resolvedSpeeds = getPath(out, 'playback.speeds') as number[];
  if (!resolvedSpeeds.includes(getPath(out, 'playback.defaultSpeed') as number)) {
    warnings.push('Setting playback.defaultSpeed is not one of playback.speeds; using 1.');
    setPath(out, 'playback.defaultSpeed', resolvedSpeeds.includes(1) ? 1 : resolvedSpeeds[0]);
  }
  if (typeof getPath(raw, 'map.radarFilter') !== 'string') {
    warnings.push('Setting map.radarFilter must be text; using the default.');
    setPath(out, 'map.radarFilter', OTHER_FALLBACKS['map.radarFilter']);
  }
  return { settings: out as unknown as Settings, warnings };
}

const resolved = resolveSettings(SETTINGS);
for (const w of resolved.warnings) console.warn(`[Open Skybox] ${w}`);

/** The validated settings. Everything in the app reads from S, never from SETTINGS directly. */
export const S: Settings = resolved.settings;
