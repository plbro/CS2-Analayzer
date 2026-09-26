# Open Skybox

A free, open-source CS2 demo analyzer. Drop a `.dem` file in your browser and get a 2D replay of every round:
positions, aim direction, HP, armor, money, weapons, utility, kills, bomb, and multi-round overlays.

**Your demo never leaves your computer.** It's read inside your browser by a WebAssembly demo reader, so there's no upload and no server.

> Status: early (v0.2.0). The replay works; ratings, smoke library, player tendencies and pro-match library are planned.

## Use it

1. Open the site (GitHub Pages link on the repo's front page).
2. Drop a CS2 `.dem` file on the page, or click **Choose a .dem file**.
   - Your own matches: CS2 → **Watch → Your Matches** → download, then find the `.dem` in
     `Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\replays`.
   - Pro matches: download from HLTV and **unzip** first.
3. A 300–400 MB demo takes about 15–40 seconds to read.

Reads normal 5v5 matches (Premier, Competitive, FACEIT, pro matches). Wingman, Casual and Deathmatch demos are refused with a message.

Works best in a desktop Chrome, Edge or Firefox. Phones may run out of memory on big demos.

## What you get

- **Round list** (left): every round with who won it and how (elimination, bomb, defuse, time). Halftime and overtime are marked.
- **Map** (middle): players with their number, name and aim direction; smokes with a countdown ring; molotov fire; flash bursts
  and a white ring around blinded players; HE bursts; grenade flight arcs; the bomb; kill markers. Place names come from the demo.
  Two-level maps (Nuke, Vertigo, Train) show both levels side by side.
- **Team sheet** (right): HP, armor, money, guns, grenades, bomb and kit, K–D–A and ADR, live at the current moment.
- **Round events**: every kill and bomb event with its time; click one to jump there.
- **Timeline** (bottom): kills, bomb timer, playhead. Drag to scrub.
- **Multi-round mode**: overlay many rounds of one team at once, synced from the moment each round went live. Pick players,
  their utility types, enemy players and enemy utility, and the bomb.
- **Drawing** on the map, zoom and pan.

## Hotkeys

| Key | Does |
|---|---|
| Space | Play / pause |
| ← / → | Move 5 s (Shift = 1 s, Ctrl = 0.125 s) |
| Shift + ↑ / ↓ | Playback speed |
| J / K | Previous / next round |
| D | Draw; D again = next colour, Shift+D = previous colour |
| C | Clear drawings |
| M | Back to moving the map |
| L | Switch level on two-level maps (when levels aren't side by side) |
| F | Include / hide freeze time |
| H | Hotkeys window |

## Settings

Everything you might tune lives in [`src/config/settings.ts`](src/config/settings.ts), with a comment on each value saying what it does
and its safe range. Each feature has an on/off switch under `features`. Bad values fall back to the default with one console warning.

## Performance

Measured on a cloud test machine (headless Chrome, 8 GB RAM) with a 399 MB BLAST pro demo (24 rounds): read in about 20 s.
Positions are kept 8 times per second (`parse.sampleEveryTicks`) and smoothed in between.

## For developers

```
npm install
npm run dev         # local site at http://localhost:5173
npm run verify      # type-check + cross-checks + unit tests
npm run test:demo   # slow: reads every demo in test-demos/ (not in git) and prints a summary table
npm run build       # production build in dist/
```

`npm run test:demo` checks each demo's final score against an outside source: an entry in `tests/demo/expected.json`, or the
score in square brackets in the file name, e.g. `faceit mirage [13-9].dem`. Demos without one are marked "score NOT checked".

- `src/parser/` reads the demo (worker + pure builder), `src/model/` answers "what's happening at tick X",
  `src/playback/store.ts` owns state and the single animation loop, `src/render/` draws the map, `src/ui/` is the React screen.
- Map radar images and positions: `npm run fetch-maps` (list in `tools/maps-source.json`).
- The demo reader is a patched WebAssembly build of [demoparser2](https://github.com/LaihoE/demoparser); see `vendor/demoparser2/BUILD.md`.

## Licence

MIT (see `LICENSE`). Radar images are Valve's. Not affiliated with Valve, HLTV, Leetify or any team.
