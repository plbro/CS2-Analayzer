import { Fragment } from 'react';
import { INVENTORY_UTILITY, killWeaponName, PISTOLS, PRIMARIES, BOMB_ITEM, UTILITY_ORDER, type UtilityId } from '../config/weapons';
import { S } from '../config/settings-schema';
import { winReason } from '../parser/build';
import { adr, isSideSwap, roundClock, type Frame } from '../model/query';
import { FLAG_HELMET, FLAG_KIT, type Match, type TeamKey } from '../model/types';
import type { ReplayStore } from '../playback/store';
import { Icon } from './Icon';
import { useStore } from './Replay';

const REASON_ICON = { elim: 'skull', bomb: 'bomb', defuse: 'kit', time: 'clock', other: 'clock' } as const;

export function RoundColumn({ store }: { store: ReplayStore }) {
  const st = useStore(store);
  const m = store.match;
  const multi = st.mode === 'multi';
  const toggle = (ri: number) => {
    const rounds = new Set(st.multi.rounds);
    if (rounds.has(ri)) rounds.delete(ri); else rounds.add(ri);
    store.set({ multi: { ...st.multi, rounds } });
    store.setMultiTime(st.mtime);
  };
  const firstSwap = m.rounds.findIndex((_, i) => isSideSwap(m, i));
  return (
    <nav className="rounds" aria-label="Rounds">
      {m.rounds.map((r, ri) => {
        const why = winReason(r.reason);
        const winner = r.winnerTeam !== null ? m.teams[r.winnerTeam].name : 'nobody';
        return (
          <Fragment key={r.n}>
            {isSideSwap(m, ri) ? <div className="half"><span>{ri === firstSwap ? 'HALF' : 'OT'}</span></div> : null}
            <button
              className={`rd ${r.winnerSide ?? ''}${multi && st.multi.rounds.has(ri) ? ' sel' : ''}`}
              aria-current={!multi && ri === st.ri ? 'true' : undefined}
              aria-pressed={multi ? st.multi.rounds.has(ri) : undefined}
              title={`Round ${r.n}: ${winner} (${why === 'elim' ? 'elimination' : why === 'bomb' ? 'bomb exploded' : why === 'defuse' ? 'bomb defused' : why === 'time' ? 'time ran out' : r.reason})`}
              onClick={() => (multi ? toggle(ri) : store.setRound(ri))}
            >
              <span className="n num">{r.n}</span><span className="box" /><Icon name={REASON_ICON[why]} />
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Names of the player's guns and utility, from their inventory. */
export function loadout(m: Match, invId: number) {
  const items = m.inventories[invId].map((i) => m.strings[i]);
  const primary = items.find((n) => PRIMARIES.has(n)) ?? '';
  const secondary = items.find((n) => PISTOLS.has(n)) ?? '';
  const util: UtilityId[] = [];
  for (const n of items) { const u = INVENTORY_UTILITY[n]; if (u) util.push(u); }
  util.sort((a, b) => UTILITY_ORDER.indexOf(a) - UTILITY_ORDER.indexOf(b));
  return { primary, secondary, util, bomb: items.includes(BOMB_ITEM) };
}

export function TeamSheet({ store, team, frame }: { store: ReplayStore; team: TeamKey; frame: Frame }) {
  const st = useStore(store);
  const m = store.match, r = m.rounds[st.ri];
  const side = r.sides[team];
  const ps = m.players.filter((p) => p.team === team);
  const bank = ps.reduce((s, p) => s + frame.players[p.idx].money, 0);
  const played = st.ri + (st.tick >= r.endTick ? 1 : 0);
  return (
    <section className={`team ${side}`}>
      <h2><span>{m.teams[team].name}</span><span className="side">{side === 'ct' ? 'CT' : 'T'} side</span><span className="band" /><span className="eq num">${bank.toLocaleString()} bank</span></h2>
      <table>
        <thead><tr><th>Player</th><th>HP</th><th>Armor</th><th>$</th><th>Utility</th><th>K–D–A</th><th>ADR</th></tr></thead>
        <tbody>
          {ps.map((p) => {
            const f = frame.players[p.idx];
            const lo = loadout(m, f.inv);
            const dead = !f.alive;
            const guns = [lo.primary, lo.secondary].filter(Boolean).join(' · ') || (dead ? '' : 'Knife');
            return (
              <tr key={p.idx} className={`${side}${dead ? ' dead' : ''}${f.blind > 0 ? ' blind' : ''}`}>
                <td className="name"><span className="num" style={{ color: 'var(--ink-3)', marginRight: 6 }}>{p.slot % 10}</span>{p.name}<span className="sec">{f.present ? guns || '—' : 'not in demo'}</span></td>
                <td className="hp"><span className="hpv num">{f.present ? f.hp : '—'}</span><div className="hpbar"><i style={{ width: `${f.hp}%` }} /></div></td>
                <td className="arm">{f.armor > 0 ? <Icon name={f.flags & FLAG_HELMET ? 'helmet' : 'armor'} title={f.flags & FLAG_HELMET ? 'Kevlar + helmet' : 'Kevlar'} /> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                <td className="num">{f.money.toLocaleString()}</td>
                <td className="util">{lo.util.map((u, i) => <Icon key={i} name={u} title={u} />)}{lo.bomb ? <Icon name="bomb" title="Bomb" /> : null}{f.flags & FLAG_KIT ? <Icon name="kit" title="Defuse kit" /> : null}</td>
                <td className="kda num">{f.kills}–{f.deaths}–{f.assists}</td>
                <td className="num">{adr(f.damage, Math.max(1, played))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function KillLedger({ store }: { store: ReplayStore }) {
  const st = useStore(store);
  const m = store.match, r = m.rounds[st.ri];
  const rate = m.tickrate;
  const at = (tick: number) => roundClock(r, tick, rate, S.rules.roundSeconds, S.rules.bombSeconds).label;
  const side = (p: number) => (p >= 0 ? r.sides[m.players[p].team] : '');
  type Row = { tick: number; el: JSX.Element };
  const rows: Row[] = store.index.killsByRound[st.ri].map((k) => ({
    tick: k.tick,
    el: <><span className={side(k.attacker)}>{k.attacker >= 0 ? m.players[k.attacker].name : 'World'}</span> <span className="x">{killWeaponName(k.weapon)}{k.headshot ? ' · HS' : ''}{k.wallbang ? ' · wall' : ''}{k.throughSmoke ? ' · smoke' : ''} →</span> <span className={side(k.victim)}>{m.players[k.victim].name}</span></>,
  }));
  if (r.plantTick !== null) rows.push({ tick: r.plantTick, el: <span className="bomb">Bomb planted{r.plantSite ? ` · ${r.plantSite}` : ''}</span> });
  if (r.defuseTick !== null) rows.push({ tick: r.defuseTick, el: <span className="defuse">Bomb defused</span> });
  if (r.explodeTick !== null) rows.push({ tick: r.explodeTick, el: <span className="bomb">Bomb exploded</span> });
  rows.sort((a, b) => a.tick - b.tick);
  return (
    <section className="ledger">
      <h3>Round {r.n} · events</h3>
      <div className="lg num">
        {rows.length === 0 ? <span style={{ gridColumn: '1 / -1', color: 'var(--ink-3)' }}>No kills this round.</span> : null}
        {rows.map((row, i) => (
          <Fragment key={i}>
            <span className={`tm${row.tick > st.tick ? ' future' : ''}`}>{at(row.tick)}</span>
            <button className={row.tick > st.tick ? 'future' : ''} onClick={() => store.setTick(row.tick - 2 * rate)} title="Jump to 2 s before">{row.el}</button>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
