/**
 * OPEN SKYBOX SETTINGS — the one file to edit to tune the app.
 *
 * Every value here is read once when the page starts. If a value is missing or out of range,
 * the app uses the default from settings-schema.ts and prints ONE warning in the browser console
 * (F12 → Console) that names the setting. Nothing is silently switched off.
 */
export const SETTINGS = {
  /** Feature switches. false = the feature is completely gone from the screen. */
  features: {
    /** Multi-round mode (overlay many rounds at once). You'll notice: the "Multi-round" button disappears. */
    multiRound: true,
    /** Drawing on the map with D / C. You'll notice: the pen button and D/C keys stop working. */
    drawing: true,
    /** Place names on the map (e.g. "Mid", "Donut"), taken from the demo itself. */
    callouts: true,
    /** Kill feed in the top-right corner of the map. */
    killFeed: true,
    /** Two-level maps (Nuke, Vertigo, Train) show both levels side by side. Off = one level at a time, L switches. */
    levelSplit: true,
  },

  /** How the demo is read. Changes take effect on the next demo you load. */
  parse: {
    /** CS2 server tick rate. CS2 demos are 64. Range 32–128. */
    tickrate: 64,
    /**
     * Store player positions every N ticks. 8 = 8 times per second at 64 tick.
     * Lower = smoother and more exact, but slower loading and more memory. Range 2–32.
     */
    sampleEveryTicks: 8,
    /** How much freeze time (seconds) to keep before each round starts. Range 0–30. */
    freezeWindowSeconds: 20,
    /** If the demo has no "round officially ended" event, keep this many seconds after the round ends. Range 0–15. */
    postRoundSeconds: 7,
    /** A flash shorter than this (seconds) doesn't count as blinded. Range 0–3. */
    minBlindSeconds: 0.3,
    /** A grenade must land within this many seconds of being thrown to be linked to its throw. Range 2–40. */
    nadeMatchWindowSeconds: 20,
    /** If the demo doesn't say when a smoke ended, assume it lasted this many seconds. Range 5–30. */
    smokeFallbackSeconds: 20,
    /** If the demo doesn't say when a molotov went out, assume it burned this many seconds. Range 2–15. */
    fireFallbackSeconds: 7,
  },

  /** Round rules used for the clock. Only change for custom game modes. */
  rules: {
    /** Round length in seconds (CS2 competitive = 115, i.e. 1:55). Range 30–600. */
    roundSeconds: 115,
    /** Bomb timer in seconds (CS2 = 40). Range 10–90. */
    bombSeconds: 40,
  },

  /** Playback controls. */
  playback: {
    /** Speeds the speed button cycles through (Shift+↑ / Shift+↓). Each 0.1–16. */
    speeds: [0.25, 0.5, 1, 2, 4, 8],
    /** Speed when a demo opens. Must be one of the speeds above. */
    defaultSpeed: 1,
    /** ← / → jump in seconds. Range 0.5–30. */
    stepSeconds: 5,
    /** Shift + ← / → jump in seconds. Range 0.1–10. */
    fineStepSeconds: 1,
    /** Ctrl + ← / → jump in seconds. Range 0.01–2. */
    preciseStepSeconds: 0.125,
    /** Start with freeze time included in each round (F toggles). */
    includeFreezeTime: false,
    /** How often the side panels (HP, money…) refresh per second while playing. The map always runs smooth. Range 2–30. */
    panelRefreshPerSecond: 10,
  },

  /** How the map looks. Sizes are in radar pixels (the radar image is 1024 wide). */
  map: {
    /** Radar image styling (a CSS filter). "none" shows Valve's original colours. */
    radarFilter: 'grayscale(1) brightness(0.85) contrast(1.1)',
    /** Player dot radius. Range 4–20. */
    playerRadius: 9,
    /** Player name size. Range 8–24. */
    nameSize: 13,
    /** Place name size. Range 6–20. */
    calloutSize: 10,
    /** Smoke radius in game units (a CS2 smoke is roughly 144 wide). Range 60–250. */
    smokeRadiusUnits: 144,
    /** Molotov fire radius in game units. Range 40–250. */
    fireRadiusUnits: 110,
    /** How long the flash burst shows, seconds. Range 0.1–2. */
    flashBurstSeconds: 0.5,
    /** How long the HE burst shows, seconds. Range 0.1–2. */
    heBurstSeconds: 0.4,
    /** Kills stay in the kill feed for this many seconds. Range 2–60. */
    killFeedSeconds: 10,
    /** Kill feed shows at most this many lines. Range 1–10. */
    killFeedMax: 5,
    /** Mouse-wheel zoom limits. */
    minZoom: 0.5,
    maxZoom: 6,
  },

  /** Colours. Any CSS colour works. */
  colors: {
    ct: '#62ade8',
    t: '#eba33c',
    kill: '#e5625a',
    smoke: '#bfc0c4',
    smokeRing: '#efc21a',
    fire: '#ec7613',
    /** Colours for players' paths in multi-round mode, in slot order. */
    multiPalette: ['#eba33c', '#e5625a', '#d7d08a', '#c58ad8', '#7fd1ae', '#62ade8', '#9ec1ff', '#f28bb3', '#b9e36a', '#ffffff'],
    /** Drawing pen colours; D cycles forward, Shift+D backward. */
    pens: ['#ffffff', '#e5625a', '#efc21a', '#62ade8', '#7fd1ae'],
  },

  /** Multi-round mode. */
  multi: {
    /** Path line opacity, 0.05–1. Lower = less clutter with many rounds. */
    pathOpacity: 0.5,
    /** Most rounds drawn at once. Keeps the map fast on slow PCs. Range 1–60. */
    maxRounds: 40,
  },
};

export type Settings = typeof SETTINGS;
