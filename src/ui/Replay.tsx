import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { S } from '../config/settings-schema';
import { mapInfo, prettyMapName } from '../model/maps';
import { newFrame, fillFrame, roundClock, scoreAt } from '../model/query';
import type { ReplayStore } from '../playback/store';
import { VERSION } from '../version';
import { Brand } from './Brand';
import { HOTKEYS, actionFor, type ActionId } from './hotkeys';
import { Icon } from './Icon';
import { MapView } from './MapView';
import { MultiFilters } from './MultiFilters';
import { KillLedger, RoundColumn, TeamSheet } from './Panels';
import { Timeline } from './Timeline';

export function useStore(store: ReplayStore) {
  useSyncExternalStore(store.subscribeUi, store.getVersion);
  return store.state;
}

export function Replay({ store, fileName, fileSize, onLoad }: { store: ReplayStore; fileName: string; fileSize: number; onLoad: (f: File) => void }) {
  const st = useStore(store);
  const m = store.match;
  const r = m.rounds[st.ri];
  const map = mapInfo(m.mapName);
  const frame = useMemo(() => newFrame(m), [m]);
  fillFrame(m, store.index, st.ri, st.tick, frame);
  const score = scoreAt(m, st.ri, st.tick);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const handlers: Record<ActionId, (shift: boolean, ctrl: boolean) => void> = {
      hotkeys: () => store.set({ hotkeysOpen: !store.state.hotkeysOpen }),
      playPause: () => store.togglePlay(),
      seekBack: (sh, c) => store.seekSeconds(-(c ? S.playback.preciseStepSeconds : sh ? S.playback.fineStepSeconds : S.playback.stepSeconds)),
      seekForward: (sh, c) => store.seekSeconds(c ? S.playback.preciseStepSeconds : sh ? S.playback.fineStepSeconds : S.playback.stepSeconds),
      speedUp: () => store.cycleSpeed(1),
      speedDown: () => store.cycleSpeed(-1),
      prevRound: () => store.setRound(store.state.ri - 1),
      nextRound: () => store.setRound(store.state.ri + 1),
      draw: () => {
        if (!S.features.drawing) return;
        if (store.state.tool === 'draw') store.set({ pen: (store.state.pen + 1) % S.colors.pens.length });
        else store.set({ tool: 'draw' });
      },
      penBack: () => {
        if (!S.features.drawing) return;
        store.set({ tool: 'draw', pen: (store.state.pen - 1 + S.colors.pens.length) % S.colors.pens.length });
      },
      move: () => store.set({ tool: 'move' }),
      clear: () => { if (S.features.drawing) { store.strokes = []; store.invalidate(); } },
      layer: () => { if (map && map.layers.length > 1 && !store.state.levelSplit) store.set({ layerFocus: store.state.layerFocus ? 0 : 1 }); },
      freeze: () => store.setIncludeFreeze(!store.state.includeFreeze),
      escape: () => store.set({ hotkeysOpen: false, settingsOpen: false, tool: 'move' }),
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const a = actionFor(e);
      if (!a) return;
      e.preventDefault();
      handlers[a](e.shiftKey, e.ctrlKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, map]);

  const clock = st.mode === 'single' ? roundClock(r, st.tick, m.tickrate, S.rules.roundSeconds, S.rules.bombSeconds) : null;
  const sideCls = (team: 0 | 1) => (r.sides[team] === 'ct' ? 'ct' : 't');
  const multi = st.mode === 'multi';

  return (
    <div
      className={`app${multi ? ' multi' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onLoad(f); }}
      style={dragOver ? { outline: '2px dashed var(--t)', outlineOffset: -4 } : undefined}
    >
      <header>
        <Brand />
        <div className="matchline">
          <span className={sideCls(0)}>{m.teams[0].name.toUpperCase()}</span>
          <span className="score num"><span className={sideCls(0)}>{score[0]}</span> – <span className={sideCls(1)}>{score[1]}</span></span>
          <span className={sideCls(1)}>{m.teams[1].name.toUpperCase()}</span>
        </div>
        <div className="meta">
          <span><b>{prettyMapName(m.mapName)}</b></span>
          <span>Round <b className="num">{r.n}</b> of {m.rounds.length}</span>
          <span title={fileName}>{(fileSize / 1e6).toFixed(0)} MB{m.serverName ? ` · ${m.serverName}` : ''}</span>
        </div>
        <div className="spacer" />
        {S.features.multiRound ? (
          <div className="seg" role="group" aria-label="Replay mode">
            <button aria-pressed={!multi} onClick={() => store.set({ mode: 'single', playing: false })}>Single round</button>
            <button aria-pressed={multi} onClick={() => { store.set({ mode: 'multi', playing: false }); store.setMultiTime(0); }}>Multi-round</button>
          </div>
        ) : null}
        {S.features.drawing ? (
          <button className="tool" aria-pressed={st.tool === 'draw'} title="Draw (D) — D again changes colour, C clears" onClick={() => store.set({ tool: st.tool === 'draw' ? 'move' : 'draw' })}><Icon name="pen" /></button>
        ) : null}
        <button className="tool" title="Hotkeys (H)" onClick={() => store.set({ hotkeysOpen: true })}><Icon name="keys" /></button>
        <button className="tool" aria-pressed={st.settingsOpen} title="Settings" onClick={() => store.set({ settingsOpen: !st.settingsOpen })}><Icon name="gear" /></button>
        {st.settingsOpen ? <SettingsPop store={store} onLoad={onLoad} twoLevel={!!map && map.layers.length > 1} /> : null}
      </header>

      <RoundColumn store={store} />
      <MapView store={store} map={map} />
      <aside className="sheet">
        {multi ? <MultiFilters store={store} /> : (
          <>
            <TeamSheet store={store} team={0} frame={frame} />
            <TeamSheet store={store} team={1} frame={frame} />
            <KillLedger store={store} />
            {m.notes.length ? <div className="notes" style={{ padding: '0 18px 12px' }}>{m.notes.join(' ')}</div> : null}
          </>
        )}
      </aside>

      <footer>
        <div className="transport">
          <button className="tool" title="Previous round (J)" onClick={() => store.setRound(st.ri - 1)} disabled={st.ri === 0 || multi}><Icon name="prev" /></button>
          <button className="playbtn" title="Play / pause (Space)" onClick={() => store.togglePlay()}><Icon name={st.playing ? 'pause' : 'play'} /></button>
          <button className="tool" title="Next round (K)" onClick={() => store.setRound(st.ri + 1)} disabled={st.ri === m.rounds.length - 1 || multi}><Icon name="next" /></button>
        </div>
        <Timeline store={store} />
        <div className="speed">
          <span>
            <span className={`clock num ${clock?.phase ?? ''}`}>{clock ? clock.label : `+${Math.floor(st.mtime)}s`}</span>
            <span className="clockcap">{clock ? (clock.phase === 'freeze' ? 'FREEZE TIME' : clock.phase === 'bomb' ? 'BOMB TIMER' : clock.phase === 'over' ? 'ROUND OVER' : 'ROUND TIME') : 'SINCE ROUNDS WENT LIVE'}</span>
          </span>
          <button className="num" title="Speed (Shift + ↑ / ↓)" onClick={() => store.cycleSpeed(1)} onContextMenu={(e) => { e.preventDefault(); store.cycleSpeed(-1); }}>{st.speed}×</button>
        </div>
      </footer>

      {st.hotkeysOpen ? <HotkeysDialog onClose={() => store.set({ hotkeysOpen: false })} /> : null}
    </div>
  );
}

function SettingsPop({ store, onLoad, twoLevel }: { store: ReplayStore; onLoad: (f: File) => void; twoLevel: boolean }) {
  const st = store.state;
  return (
    <div className="pop" role="dialog" aria-label="Settings">
      <h3>Replay</h3>
      <button className="chk-row" aria-pressed={st.includeFreeze} onClick={() => store.setIncludeFreeze(!st.includeFreeze)}><i />Include freeze time <small>F</small></button>
      {S.features.callouts ? <button className="chk-row" aria-pressed={st.callouts} onClick={() => store.set({ callouts: !st.callouts })}><i />Place names on the map</button> : null}
      {twoLevel ? <button className="chk-row" aria-pressed={st.levelSplit} onClick={() => store.set({ levelSplit: !st.levelSplit })}><i />Show both levels side by side</button> : null}
      <h3 style={{ marginTop: 10 }}>Demo</h3>
      <label className="quick"><button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>Load another demo…</button>
        <input type="file" accept=".dem" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoad(f); }} /></label>
      <div className="ver">Open Skybox {VERSION} · Tune more in src/config/settings.ts</div>
    </div>
  );
}

function HotkeysDialog({ onClose }: { onClose: () => void }) {
  const shown = HOTKEYS.filter((h) => h.title && (!h.feature || S.features[h.feature]));
  const keysFor = (i: number) => {
    const h = HOTKEYS[HOTKEYS.indexOf(shown[i])];
    const next = HOTKEYS[HOTKEYS.indexOf(h) + 1];
    const extra = next && !next.title && next.action !== 'escape' ? [next.keys] : [];
    return [h.keys, ...extra];
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Hotkeys" onClick={(e) => e.stopPropagation()}>
        <h2>Hotkeys</h2>
        <div className="hk">
          {shown.map((h, i) => (
            <div key={h.action}>
              <h3>{h.title} {keysFor(i).map((ks, j) => <span key={j}>{ks.map((k) => <kbd key={k}>{k}</kbd>)}</span>)}</h3>
              <p>{h.help}</p>
            </div>
          ))}
        </div>
        <button className="close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
