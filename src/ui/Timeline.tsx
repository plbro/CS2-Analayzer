import { useRef } from 'react';
import { S } from '../config/settings-schema';
import { fmtSeconds, roundClock } from '../model/query';
import type { ReplayStore } from '../playback/store';
import { useStore } from './Replay';

export function Timeline({ store }: { store: ReplayStore }) {
  const st = useStore(store);
  const ref = useRef<HTMLDivElement>(null);
  const m = store.match, rate = m.tickrate;
  const multi = st.mode === 'multi';

  // everything is placed as a fraction of the visible span
  let a: number, b: number, now: number;
  if (multi) { a = 0; b = Math.max(1, store.multiLength()); now = st.mtime; }
  else { [a, b] = store.span(); now = st.tick; }
  const pct = (v: number) => `${((v - a) / (b - a)) * 100}%`;

  const seekFrom = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (multi) store.setMultiTime(f * b); else store.setTick(a + f * (b - a));
  };

  const ticks: JSX.Element[] = [];
  if (multi) {
    const off = store.multiOffset();
    for (let s = 0; s <= b; s += 5) {
      ticks.push(<i key={`i${s}`} style={{ left: pct(s) }} />);
      if (s % 15 === 0) ticks.push(<span key={`s${s}`} className="num" style={{ left: pct(s) }}>{fmtSeconds(S.rules.roundSeconds - (s - off))}</span>);
    }
  } else {
    const r = m.rounds[st.ri];
    const step = 5 * rate;
    const first = Math.ceil((a - r.freezeEndTick) / step) * step + r.freezeEndTick;
    for (let t = first; t <= b; t += step) {
      const sec = Math.round((t - r.freezeEndTick) / rate);
      ticks.push(<i key={`i${t}`} style={{ left: pct(t) }} />);
      if (sec % 15 === 0) ticks.push(<span key={`s${t}`} className="num" style={{ left: pct(t) }}>{roundClock(r, t, rate, S.rules.roundSeconds, S.rules.bombSeconds).label}</span>);
    }
  }

  let lane: JSX.Element[] = [];
  if (!multi) {
    const r = m.rounds[st.ri];
    if (st.includeFreeze && r.freezeEndTick > a) lane.push(<div key="fz" className="freezespan" style={{ width: pct(r.freezeEndTick) }}><b>Freeze</b></div>);
    if (r.plantTick !== null) {
      const end = r.defuseTick ?? r.explodeTick ?? r.endTick;
      lane.push(<div key="bomb" className="bombspan" style={{ left: pct(r.plantTick), width: `${((end - r.plantTick) / (b - a)) * 100}%` }}><b>{r.defuseTick ? 'Bomb · defused' : 'Bomb'}</b></div>);
    }
    lane = lane.concat(store.index.killsByRound[st.ri].map((k) => {
      const who = k.attacker >= 0 && k.attacker !== k.victim ? r.sides[m.players[k.attacker].team] : 'death';
      const title = `${roundClock(r, k.tick, rate, S.rules.roundSeconds, S.rules.bombSeconds).label} · ${k.attacker >= 0 ? m.players[k.attacker].name : 'World'} → ${m.players[k.victim].name}`;
      return <div key={`${k.tick}-${k.victim}`} className={`ev ${who}`} style={{ left: pct(k.tick) }} title={title} />;
    }));
  }

  return (
    <div className="track" ref={ref}>
      <div className="ticks">{ticks}</div>
      <div className="lane">{lane}</div>
      <div className="head" style={{ left: pct(now) }} />
      <div
        className="scrub"
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(((now - a) / (b - a)) * 100)}
        tabIndex={-1}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekFrom(e.clientX); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFrom(e.clientX); }}
      />
    </div>
  );
}
