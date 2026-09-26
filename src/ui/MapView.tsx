import { useEffect, useRef } from 'react';
import { S } from '../config/settings-schema';
import { killWeaponName } from '../config/weapons';
import type { MapInfo } from '../model/maps';
import type { ReplayStore } from '../playback/store';
import { MapRenderer } from '../render/renderer';
import { Icon } from './Icon';
import { useStore } from './Replay';

export function MapView({ store, map }: { store: ReplayStore; map: MapInfo | null }) {
  const st = useStore(store);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new MapRenderer(canvas, store, map, import.meta.env.BASE_URL);
    rendererRef.current = renderer;
    const off = store.onFrame(() => renderer.draw());
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    document.fonts?.ready.then(() => store.invalidate());

    let drag: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (store.state.tool === 'draw' && S.features.drawing) {
        const [x, y] = renderer.screenToRadar(sx, sy);
        store.strokes.push({ color: S.colors.pens[store.state.pen], pts: [x, y] });
      } else drag = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!canvas.hasPointerCapture(e.pointerId)) return;
      if (store.state.tool === 'draw' && S.features.drawing) {
        const rect = canvas.getBoundingClientRect();
        const [x, y] = renderer.screenToRadar(e.clientX - rect.left, e.clientY - rect.top);
        store.strokes[store.strokes.length - 1]?.pts.push(x, y);
        store.invalidate();
      } else if (drag) {
        renderer.view.panX += e.clientX - drag.x;
        renderer.view.panY += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        store.invalidate();
      }
    };
    const onUp = () => { drag = null; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const old = renderer.view.zoom;
      const next = Math.max(S.map.minZoom, Math.min(S.map.maxZoom, old * Math.exp(-e.deltaY * 0.0015)));
      // keep the point under the cursor still
      renderer.view.panX += (sx - renderer.ox) * (1 - next / old);
      renderer.view.panY += (sy - renderer.oy) * (1 - next / old);
      renderer.view.zoom = next;
      store.invalidate();
    };
    const onDbl = () => { renderer.view = { zoom: 1, panX: 0, panY: 0 }; store.invalidate(); };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      off(); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, [store, map]);

  // cached multi-round paths depend on these
  useEffect(() => { rendererRef.current?.resetCache(); store.invalidate(); }, [st.levelSplit, st.layerFocus, store]);

  const m = store.match, r = m.rounds[st.ri];
  const feed = st.mode === 'single' && S.features.killFeed
    ? store.index.killsByRound[st.ri].filter((k) => k.tick <= st.tick && st.tick - k.tick <= S.map.killFeedSeconds * m.tickrate).slice(-S.map.killFeedMax)
    : [];
  const side = (p: number) => (p >= 0 ? r.sides[m.players[p].team] : '');
  const twoLevel = !!map && map.layers.length > 1;

  return (
    <main className={`stage tool-${st.tool}`}>
      <canvas ref={canvasRef} aria-label="2D replay map" />
      {twoLevel && !st.levelSplit ? <div className="layer-tag">{st.layerFocus ? 'Lower level' : 'Upper level'} · L to switch</div> : null}
      <div className="killfeed" aria-live="polite">
        {feed.map((k) => (
          <div className="kf" key={`${k.tick}-${k.victim}`}>
            <span className={side(k.attacker)}>{k.attacker >= 0 ? m.players[k.attacker].name : 'World'}</span>
            <span className="w">{killWeaponName(k.weapon)}</span>
            {k.headshot ? <Icon name="hs" className="ic hs" title="Headshot" /> : null}
            <span className={side(k.victim)}>{m.players[k.victim].name}</span>
          </div>
        ))}
      </div>
      <div className="corner">
        {st.tool === 'draw'
          ? <><span className="pen-dot" style={{ background: S.colors.pens[st.pen] }} />Drawing · D changes colour · C clears · M to stop</>
          : map ? 'Scroll to zoom · drag to move · double-click to reset' : `No radar image for ${m.mapName} yet`}
      </div>
    </main>
  );
}
