/**
 * The replay's single source of truth + the ONE animation loop.
 * Map drawing listens every frame; the side panels listen at S.playback.panelRefreshPerSecond.
 */
import { S } from '../config/settings-schema';
import type { UtilityId } from '../config/weapons';
import { UTILITY_ORDER } from '../config/weapons';
import type { Match, TeamKey } from '../model/types';
import { makeIndex, roundSpan, type MatchIndex } from '../model/query';

export type Mode = 'single' | 'multi';
export type Tool = 'move' | 'draw';

export interface MultiState {
  rounds: Set<number>;
  team: TeamKey;
  players: Set<number>;
  util: Set<UtilityId>;
  showEnemies: boolean;
  enemyUtil: Set<UtilityId>;
  bomb: boolean;
}

export interface Stroke { color: string; pts: number[] }

export interface ViewState {
  ri: number;
  /** Single mode: the demo tick. */
  tick: number;
  /** Multi mode: seconds since the rounds went live (or since freeze started, with freeze time on). */
  mtime: number;
  playing: boolean;
  speed: number;
  includeFreeze: boolean;
  mode: Mode;
  tool: Tool;
  pen: number;
  levelSplit: boolean;
  layerFocus: number;
  callouts: boolean;
  hotkeysOpen: boolean;
  settingsOpen: boolean;
  multi: MultiState;
}

export function defaultMulti(m: Match, team: TeamKey = 0): MultiState {
  return {
    // start with the rounds this team played on T side: that's where their executes and utility are
    rounds: new Set(m.rounds.map((r, i) => (r.sides[team] === 't' ? i : -1)).filter((i) => i >= 0)),
    team,
    players: new Set(m.players.filter((p) => p.team === team).map((p) => p.idx)),
    util: new Set(UTILITY_ORDER),
    showEnemies: false,
    enemyUtil: new Set(),
    bomb: false,
  };
}

export class ReplayStore {
  readonly match: Match;
  readonly index: MatchIndex;
  state: ViewState;
  strokes: Stroke[] = [];
  private uiListeners = new Set<() => void>();
  private frameListeners = new Set<() => void>();
  private version = 0;
  private raf = 0;
  private lastNow = 0;
  private lastUi = 0;
  private dirty = true;

  constructor(match: Match) {
    this.match = match;
    this.index = makeIndex(match);
    this.state = {
      ri: 0, tick: 0, mtime: 0, playing: false, speed: S.playback.defaultSpeed,
      includeFreeze: S.playback.includeFreezeTime, mode: 'single', tool: 'move', pen: 0,
      levelSplit: S.features.levelSplit, layerFocus: 0, callouts: S.features.callouts,
      hotkeysOpen: false, settingsOpen: false, multi: defaultMulti(match),
    };
    this.state.tick = this.span()[0];
    this.loop = this.loop.bind(this);
  }

  // ---------- subscriptions
  subscribeUi = (fn: () => void) => { this.uiListeners.add(fn); return () => { this.uiListeners.delete(fn); }; };
  getVersion = () => this.version;
  onFrame(fn: () => void) { this.frameListeners.add(fn); return () => { this.frameListeners.delete(fn); }; }
  private notifyUi() { this.version++; for (const f of this.uiListeners) f(); }
  /** Something visible changed: redraw next frame and refresh panels now. */
  set(patch: Partial<ViewState>) {
    this.state = { ...this.state, ...patch };
    this.invalidate();
    this.notifyUi();
  }
  invalidate() { this.dirty = true; if (!this.raf) this.raf = requestAnimationFrame(this.loop); }

  // ---------- time
  /** Timeline start/end of the current round (ticks), single mode. */
  span(ri = this.state?.ri ?? 0): [number, number] {
    return roundSpan(this.match.rounds[ri], this.state?.includeFreeze ?? S.playback.includeFreezeTime);
  }
  /** Timeline length in seconds for multi mode (the longest selected round). */
  multiLength(): number {
    const rate = this.match.tickrate;
    let len = 0;
    for (const ri of this.state.multi.rounds) {
      const r = this.match.rounds[ri];
      const from = this.state.includeFreeze ? r.startTick : r.freezeEndTick;
      len = Math.max(len, (r.officialEndTick - from) / rate);
    }
    return len;
  }
  multiOffset(): number {
    // with freeze time on, t=0 is the start of the longest freeze window we keep
    return this.state.includeFreeze ? S.parse.freezeWindowSeconds : 0;
  }
  /** The tick of round ri at multi-mode time t. */
  multiTick(ri: number, t = this.state.mtime): number {
    const r = this.match.rounds[ri];
    return r.freezeEndTick + (t - this.multiOffset()) * this.match.tickrate;
  }

  seekSeconds(delta: number) {
    if (this.state.mode === 'multi') { this.setMultiTime(this.state.mtime + delta); return; }
    this.setTick(this.state.tick + delta * this.match.tickrate);
  }
  setTick(tick: number) {
    const [a, b] = this.span();
    this.state.tick = Math.max(a, Math.min(b - 1, tick));
    this.invalidate();
    this.notifyUi();
  }
  setMultiTime(t: number) {
    this.state.mtime = Math.max(0, Math.min(this.multiLength(), t));
    this.invalidate();
    this.notifyUi();
  }
  setRound(ri: number) {
    const clamped = Math.max(0, Math.min(this.match.rounds.length - 1, ri));
    this.state = { ...this.state, ri: clamped };
    this.state.tick = this.span(clamped)[0];
    this.invalidate();
    this.notifyUi();
  }
  togglePlay() {
    this.set({ playing: !this.state.playing });
    if (this.state.playing) { this.lastNow = 0; this.invalidate(); }
  }
  cycleSpeed(dir: 1 | -1) {
    const list = S.playback.speeds;
    const i = list.indexOf(this.state.speed);
    const next = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? list.indexOf(1) : i) + dir))];
    this.set({ speed: next });
  }
  setIncludeFreeze(on: boolean) {
    this.state = { ...this.state, includeFreeze: on };
    const [a, b] = this.span();
    this.state.tick = Math.max(a, Math.min(b - 1, this.state.tick));
    this.invalidate();
    this.notifyUi();
  }

  // ---------- the one loop
  private loop(now: number) {
    this.raf = 0;
    const st = this.state;
    if (st.playing) {
      const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
      this.lastNow = now;
      if (st.mode === 'single') {
        const [, end] = this.span();
        st.tick += dt * st.speed * this.match.tickrate;
        if (st.tick >= end - 1) {
          if (st.ri < this.match.rounds.length - 1) { this.setRound(st.ri + 1); this.state.playing = true; }
          else { st.tick = end - 1; st.playing = false; }
        }
      } else {
        st.mtime += dt * st.speed;
        if (st.mtime >= this.multiLength()) { st.mtime = this.multiLength(); st.playing = false; }
      }
      this.dirty = true;
      if (now - this.lastUi >= 1000 / S.playback.panelRefreshPerSecond || !st.playing) { this.lastUi = now; this.notifyUi(); }
    }
    if (this.dirty) {
      this.dirty = false;
      for (const f of this.frameListeners) f();
    }
    if (st.playing) this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.uiListeners.clear();
    this.frameListeners.clear();
  }
}
