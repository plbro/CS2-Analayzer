/**
 * Draws the map on a <canvas>. Called by the store's single loop only when something changed.
 * Budget per frame (single round): 10 players, ≤ ~40 grenades, ≤ 10 death marks, drawings.
 */
import { S } from '../config/settings-schema';
import { BOMB_ITEM, UTILITY_ORDER, type UtilityId } from '../config/weapons';
import { ICONS } from '../ui/Icon';
import { iconPathData } from './icon-path';
import { layerFor, RADAR_PX, toRadar, type MapInfo } from '../model/maps';
import { fillFrame, nadeState, newFrame, type Frame } from '../model/query';
import { FLAG_ALIVE, type Drop, type Nade, type Side } from '../model/types';
import type { ReplayStore } from '../playback/store';

const GAP = 48; // radar px between the two levels of a two-level map
const FONT_NAME = '700 13px "Barlow Semi Condensed", "Archivo", sans-serif';
const INK = '#e2e4df';
const GROUND = '#141619';

/** "BombsiteA" → "BOMBSITE A", "CTSpawn" → "CT SPAWN", "TopofMid" → "TOP OF MID". */
export function placeLabel(name: string): string {
  return name
    .replace(/(Top|Back|Front|Side|End|Bottom|Outside)of(?=[A-Z])/g, '$1 of ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface ViewXform { zoom: number; panX: number; panY: number }

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private radars: (HTMLCanvasElement | null)[] = [];
  private frame: Frame;
  private frames: Frame[] = [];
  private pathCache = new Map<string, Path2D>();
  private fireDots: number[] = [];
  /** Inventory ids that contain the bomb, worked out once. */
  private bombInv: Uint8Array;
  /** F-010: grenade icons as canvas paths, built once. */
  private iconPaths = new Map<UtilityId, Path2D>();
  view: ViewXform = { zoom: 1, panX: 0, panY: 0 };
  /** Last computed transform: screen = radar * scale + (ox, oy) */
  scale = 1; ox = 0; oy = 0;

  constructor(private canvas: HTMLCanvasElement, private store: ReplayStore, private map: MapInfo | null, base: string) {
    this.ctx = canvas.getContext('2d')!;
    this.frame = newFrame(store.match);
    const m = store.match;
    this.bombInv = Uint8Array.from(m.inventories, (inv) => (inv.some((i) => m.strings[i] === BOMB_ITEM) ? 1 : 0));
    // fixed pseudo-random flame layout, reused for every molotov
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()); this.fireDots.push(Math.cos(a) * d, Math.sin(a) * d); }
    if (S.features.droppedUtility) for (const u of UTILITY_ORDER) this.iconPaths.set(u, new Path2D(iconPathData(ICONS[u]).d));
    if (map) {
      map.layers.forEach((layer, i) => {
        const img = new Image();
        img.onload = () => { this.radars[i] = this.bake(img); store.invalidate(); };
        img.src = base + layer.image;
      });
    }
  }

  /** Pre-applies the radar colour filter once, so frames don't pay for it. */
  private bake(img: HTMLImageElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    if (S.map.radarFilter !== 'none') g.filter = S.map.radarFilter;
    g.drawImage(img, 0, 0);
    return c;
  }

  private split(): boolean {
    return !!this.map && this.map.layers.length > 1 && this.store.state.levelSplit;
  }
  /** Content size in radar px. */
  contentSize(): [number, number] {
    return [this.split() ? RADAR_PX * 2 + GAP : RADAR_PX, RADAR_PX];
  }
  /** World → radar px on the canvas layout (handles the side-by-side lower level). Returns null if hidden. */
  project(x: number, y: number, z: number): [number, number] | null {
    if (!this.map) return null;
    const [px, py] = toRadar(this.map, x, y);
    const layer = layerFor(this.map, z);
    if (this.split()) return layer === 1 ? [px + RADAR_PX + GAP, py] : [px, py];
    if (this.map.layers.length > 1 && layer !== this.store.state.layerFocus) return null;
    return [px, py];
  }
  screenToRadar(sx: number, sy: number): [number, number] {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.store.invalidate();
  }

  draw() {
    const { ctx, canvas, store } = this;
    const st = store.state;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, cw, ch);
    const [W, H] = this.contentSize();
    const fit = Math.min(cw / W, ch / H) * 0.98;
    this.scale = fit * this.view.zoom;
    this.ox = (cw - W * this.scale) / 2 + this.view.panX;
    this.oy = (ch - H * this.scale) / 2 + this.view.panY;
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy);

    // radar(s)
    if (this.map) {
      const show = this.split() ? [0, 1] : [this.map.layers.length > 1 ? st.layerFocus : 0];
      for (const li of show) {
        const img = this.radars[li];
        const dx = this.split() && li === 1 ? RADAR_PX + GAP : 0;
        if (img) ctx.drawImage(img, dx, 0, RADAR_PX, RADAR_PX);
      }
    } else {
      ctx.fillStyle = '#8a9097';
      ctx.font = '600 24px Archivo, sans-serif';
      ctx.fillText(`No radar image for ${store.match.mapName} yet — positions still shown.`, 40, 60);
    }
    // radar-px sizes stay the same on screen while zooming
    const k = 1 / Math.max(0.35, this.view.zoom * fit);
    if (st.callouts && S.features.callouts) this.drawCallouts(k);
    if (st.mode === 'single') this.drawSingle(k);
    else this.drawMulti(k);
    this.drawStrokes(k);
  }

  private drawCallouts(k: number) {
    const { ctx } = this;
    ctx.font = `600 ${S.map.calloutSize * k}px Archivo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(160,166,172,0.55)';
    for (const p of this.store.match.places) {
      const pt = this.project(p.pos[0], p.pos[1], p.pos[2]);
      if (pt) ctx.fillText(placeLabel(p.name), pt[0], pt[1]);
    }
  }

  private sideColor(side: Side) { return side === 'ct' ? S.colors.ct : S.colors.t; }

  private drawSingle(k: number) {
    const { store } = this;
    const m = store.match, st = store.state, ri = st.ri, r = m.rounds[ri];
    const tick = st.tick;
    fillFrame(m, store.index, ri, tick, this.frame);
    const burst = (n: Nade) => Math.round((n.type === 'flash' ? S.map.flashBurstSeconds : S.map.heBurstSeconds) * m.tickrate);
    for (const n of store.index.nadesByRound[ri]) this.drawNade(n, tick, burst(n), k, r.sides[m.players[n.thrower]?.team ?? 0]);
    this.drawBomb(ri, tick, k);
    for (const kill of store.index.killsByRound[ri]) {
      if (kill.tick > tick) break;
      const p = m.players[kill.victim];
      this.drawX(kill.victimPos, this.sideColor(r.sides[p.team]), k);
    }
    for (const p of m.players) {
      const f = this.frame.players[p.idx];
      if (!f.present || !f.alive) continue;
      this.drawPlayer(f.x, f.y, f.z, f.yaw, this.sideColor(r.sides[p.team]), p.slot, p.name, f.blind, this.bombInv[f.inv] === 1, k, 1);
    }
  }

  private drawMulti(k: number) {
    const { ctx, store } = this;
    const m = store.match, st = store.state, ms = st.multi;
    const rounds = [...ms.rounds].sort((a, b) => a - b).slice(0, S.multi.maxRounds);
    const enemyTeam = ms.team === 0 ? 1 : 0;
    const shownPlayers = m.players.filter((p) => (p.team === ms.team && ms.players.has(p.idx)) || (p.team === enemyTeam && ms.showEnemies));
    while (this.frames.length < rounds.length) this.frames.push(newFrame(m));
    // paths first (under everything)
    ctx.globalAlpha = S.multi.pathOpacity;
    ctx.lineWidth = 1.6 * k;
    ctx.lineJoin = 'round';
    for (const ri of rounds) {
      for (const p of shownPlayers) {
        const path = this.pathFor(ri, p.idx);
        if (!path) continue;
        ctx.strokeStyle = S.colors.multiPalette[(p.slot - 1) % S.colors.multiPalette.length];
        ctx.stroke(path);
      }
    }
    ctx.globalAlpha = 1;
    rounds.forEach((ri, i) => {
      const r = m.rounds[ri];
      const tick = store.multiTick(ri);
      if (tick > r.officialEndTick) return;
      const frame = this.frames[i];
      fillFrame(m, store.index, ri, Math.max(r.startTick, tick), frame);
      for (const n of store.index.nadesByRound[ri]) {
        const thrower = m.players[n.thrower];
        if (!thrower) continue;
        const own = thrower.team === ms.team;
        if (own ? !(ms.players.has(thrower.idx) && ms.util.has(n.type)) : !ms.enemyUtil.has(n.type)) continue;
        const burst = Math.round((n.type === 'flash' ? S.map.flashBurstSeconds : S.map.heBurstSeconds) * m.tickrate);
        this.drawNade(n, tick, burst, k, r.sides[thrower.team]);
      }
      if (ms.bomb) this.drawBomb(ri, tick, k);
      if (ms.dropped && S.features.droppedUtility) { // F-010
        for (const d of store.index.dropsByRound[ri]) {
          if (tick < d.tick || tick >= d.endTick) continue;
          const owner = m.players[d.player];
          if (!owner) continue;
          if (owner.team === ms.team ? !(ms.players.has(d.player) && ms.util.has(d.type)) : !ms.showEnemies) continue;
          this.drawDrop(d, k, this.sideColor(r.sides[owner.team]));
        }
      }
      for (const p of shownPlayers) {
        const f = frame.players[p.idx];
        const col = S.colors.multiPalette[(p.slot - 1) % S.colors.multiPalette.length];
        const death = store.index.deathTick[ri][p.idx];
        if (tick >= death) {
          const kill = store.index.killsByRound[ri].find((kk) => kk.victim === p.idx);
          if (kill) this.drawX(kill.victimPos, col, k * 0.8);
          continue;
        }
        if (!f.present || !f.alive) continue;
        this.drawPlayer(f.x, f.y, f.z, f.yaw, col, p.slot, '', f.blind, false, k, 0.75);
      }
    });
  }

  /** Whole-round path of one player, cached. */
  private pathFor(ri: number, p: number): Path2D | null {
    const key = `${ri}:${p}:${this.split() ? 1 : 0}:${this.store.state.layerFocus}`;
    let path = this.pathCache.get(key);
    if (path) return path;
    const m = this.store.match, r = m.rounds[ri], s = m.samples[p];
    const death = this.store.index.deathTick[ri][p];
    path = new Path2D();
    let pen = false;
    let lastLayer = -1;
    const from = Math.max(0, Math.floor((r.freezeEndTick - r.startTick) / m.sampleStep));
    for (let kk = from; kk < r.sampleCount; kk++) {
      const i = r.sampleOffset + kk;
      const tick = r.startTick + kk * m.sampleStep;
      if (tick > death || tick > r.endTick) break;
      if (!Number.isFinite(s.x[i]) || !(s.flags[i] & FLAG_ALIVE)) { pen = false; continue; }
      const pt = this.project(s.x[i], s.y[i], s.z[i]);
      if (!pt) { pen = false; continue; }
      // going up/down a level jumps across the screen: start a new line instead of drawing that jump
      const layer = this.map ? layerFor(this.map, s.z[i]) : 0;
      if (layer !== lastLayer) { pen = false; lastLayer = layer; }
      if (pen) path.lineTo(pt[0], pt[1]); else path.moveTo(pt[0], pt[1]);
      pen = true;
    }
    this.pathCache.set(key, path);
    return path;
  }

  private drawNade(n: Nade, tick: number, burstTicks: number, k: number, side: Side) {
    const { ctx } = this;
    const { flying, active } = nadeState(n, tick, burstTicks);
    if (flying >= 0 && n.from) {
      const a = this.project(n.from[0], n.from[1], n.from[2]);
      const b = this.project(n.pos[0], n.pos[1], n.pos[2]);
      if (a && b) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.18;
        ctx.save();
        ctx.setLineDash([4 * k, 4 * k]);
        ctx.strokeStyle = this.sideColor(side);
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.4 * k;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
        ctx.restore();
        const f = flying, q = 1 - f;
        const x = q * q * a[0] + 2 * q * f * mx + f * f * b[0], y = q * q * a[1] + 2 * q * f * my + f * f * b[1];
        ctx.fillStyle = INK; ctx.strokeStyle = GROUND; ctx.lineWidth = 2 * k;
        ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    if (active < 0) return;
    const c = this.project(n.pos[0], n.pos[1], n.pos[2]);
    if (!c) return;
    const scale = this.map?.scale ?? 5;
    switch (n.type) {
      case 'smoke': {
        const rad = S.map.smokeRadiusUnits / scale;
        ctx.globalAlpha = 0.55; ctx.fillStyle = S.colors.smoke;
        ctx.beginPath(); ctx.arc(c[0], c[1], rad, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        const rr = rad * 0.44;
        ctx.lineWidth = 3.5 * k * 0.8;
        ctx.strokeStyle = '#3b3b40';
        ctx.beginPath(); ctx.arc(c[0], c[1], rr, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.shadowColor = S.colors.smokeRing; ctx.shadowBlur = 6;
        ctx.strokeStyle = S.colors.smokeRing;
        ctx.beginPath(); ctx.arc(c[0], c[1], rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * active); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'molotov': {
        const rad = S.map.fireRadiusUnits / scale;
        ctx.save();
        ctx.fillStyle = S.colors.fire; ctx.shadowColor = S.colors.fire; ctx.shadowBlur = 5;
        for (let i = 0; i < this.fireDots.length; i += 2) {
          ctx.beginPath(); ctx.arc(c[0] + this.fireDots[i] * rad, c[1] + this.fireDots[i + 1] * rad, Math.max(3, rad * 0.2), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'flash': {
        const rad = 70 * k * 1.2;
        const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], rad);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * active})`);
        g.addColorStop(0.45, `rgba(255,255,255,${0.45 * active})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c[0], c[1], rad, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'he': {
        ctx.strokeStyle = S.colors.kill; ctx.lineWidth = 2.5 * k; ctx.globalAlpha = active;
        ctx.beginPath(); ctx.arc(c[0], c[1], (1 - active) * 40 * k + 8 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'decoy': {
        ctx.strokeStyle = 'rgba(226,228,223,0.6)'; ctx.lineWidth = 1.5 * k;
        ctx.beginPath(); ctx.arc(c[0], c[1], 7 * k, 0, Math.PI * 2); ctx.stroke();
        break;
      }
    }
  }

  /** F-010: a grenade on the ground: dark disc, team-coloured ring and the grenade's icon. */
  private drawDrop(d: Drop, k: number, color: string) {
    const c = this.project(d.pos[0], d.pos[1], d.pos[2]);
    const icon = this.iconPaths.get(d.type);
    if (!c || !icon) return;
    const { ctx } = this;
    const R = S.map.dropIconRadius * k;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = GROUND; ctx.strokeStyle = color; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const s = (R * 1.5) / 24; // the icon fills ~75% of the disc
    ctx.translate(c[0] - 12 * s, c[1] - 12 * s);
    ctx.scale(s, s);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(icon);
    ctx.restore();
  }

  private drawBomb(ri: number, tick: number, k: number) {
    const r = this.store.match.rounds[ri];
    if (r.plantTick === null || tick < r.plantTick || !r.plantPos) return;
    const c = this.project(r.plantPos[0], r.plantPos[1], r.plantPos[2]);
    if (!c) return;
    const { ctx } = this;
    const defused = r.defuseTick !== null && tick >= r.defuseTick;
    ctx.fillStyle = defused ? S.colors.ct : S.colors.kill;
    ctx.strokeStyle = GROUND; ctx.lineWidth = 2 * k;
    const w = 14 * k, h = 9 * k;
    ctx.beginPath(); ctx.roundRect(c[0] - w / 2, c[1] - h / 2, w, h, 2 * k); ctx.fill(); ctx.stroke();
  }

  private drawX(pos: [number, number, number], color: string, k: number) {
    const c = this.project(pos[0], pos[1], pos[2]);
    if (!c) return;
    const { ctx } = this;
    const s = 6 * k;
    ctx.strokeStyle = color; ctx.lineWidth = 2.6 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c[0] - s, c[1] - s); ctx.lineTo(c[0] + s, c[1] + s); ctx.moveTo(c[0] + s, c[1] - s); ctx.lineTo(c[0] - s, c[1] + s); ctx.stroke();
  }

  private drawPlayer(x: number, y: number, z: number, yaw: number, color: string, slot: number, name: string, blind: number, bomb: boolean, k: number, size: number) {
    const c = this.project(x, y, z);
    if (!c) return;
    const { ctx } = this;
    const R = S.map.playerRadius * k * size;
    // aim cone (CS yaw: 0 = +x, counter-clockwise; radar y points down)
    const a = (-yaw * Math.PI) / 180;
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.globalAlpha = 0.3; ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 3, a - 0.28, a + 0.28); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    if (blind > 0) {
      ctx.save();
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * blind})`; ctx.lineWidth = 2.5 * k;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.75, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = blind > 0.3 ? '#ffffff' : color;
    ctx.strokeStyle = GROUND; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GROUND;
    ctx.font = `800 ${R * 1.15}px Archivo, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(slot % 10), 0, R * 0.06);
    if (bomb) { ctx.fillStyle = S.colors.kill; ctx.fillRect(R * 0.55, -R * 1.35, R * 0.8, R * 0.55); }
    ctx.font = FONT_NAME.replace('13px', `${S.map.nameSize * k}px`);
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4 * k; ctx.lineJoin = 'round'; ctx.strokeStyle = GROUND;
    if (!name) { ctx.restore(); return; }
    const label = name.toUpperCase();
    ctx.strokeText(label, 0, R + S.map.nameSize * k);
    ctx.fillStyle = INK;
    ctx.fillText(label, 0, R + S.map.nameSize * k);
    ctx.restore();
  }

  private drawStrokes(k: number) {
    const { ctx } = this;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * k;
    for (const s of this.store.strokes) {
      if (s.pts.length < 4) continue;
      ctx.strokeStyle = s.color;
      ctx.beginPath(); ctx.moveTo(s.pts[0], s.pts[1]);
      for (let i = 2; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
      ctx.stroke();
    }
  }

  /** Forget cached paths (after a layer switch or split toggle). */
  resetCache() { this.pathCache.clear(); }
}

