import { S } from '../config/settings-schema';
import { UTILITY_LABEL, UTILITY_ORDER, type UtilityId } from '../config/weapons';
import type { TeamKey } from '../model/types';
import { defaultMulti, type MultiState, type ReplayStore } from '../playback/store';
import { Icon } from './Icon';
import { useStore } from './Replay';

export function MultiFilters({ store }: { store: ReplayStore }) {
  const st = useStore(store);
  const m = store.match, ms = st.multi;
  const team = ms.team, enemy: TeamKey = team === 0 ? 1 : 0;
  const update = (patch: Partial<MultiState>) => { store.set({ multi: { ...ms, ...patch } }); store.setMultiTime(st.mtime); };
  const toggleIn = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const pickRounds = (side: 'ct' | 't' | 'all' | 'none') => update({
    rounds: new Set(m.rounds.map((r, i) => ({ r, i })).filter(({ r }) => side === 'all' || (side !== 'none' && r.sides[team] === side)).map(({ i }) => i)),
  });
  const players = m.players.filter((p) => p.team === team);
  const capped = ms.rounds.size > S.multi.maxRounds;
  const utilCells = (set: Set<UtilityId>, onToggle: (u: UtilityId) => void) => (
    <div className="cells">
      {UTILITY_ORDER.map((u) => (
        <button key={u} className="cell" aria-pressed={set.has(u)} title={UTILITY_LABEL[u]} onClick={() => onToggle(u)}><Icon name={u} /></button>
      ))}
    </div>
  );
  return (
    <section className="filters">
      <div className="teamtabs" role="group" aria-label="Team to study">
        {m.teams.map((t) => (
          <button key={t.key} aria-pressed={team === t.key} onClick={() => store.set({ multi: { ...defaultMulti(m, t.key), rounds: ms.rounds } })}>{t.name}</button>
        ))}
      </div>
      <div className="fcount num">{ms.rounds.size}<span>rounds selected{capped ? ` · first ${S.multi.maxRounds} drawn` : ''}</span></div>
      <div className="quick">
        <button onClick={() => pickRounds('t')}>Their T rounds</button>
        <button onClick={() => pickRounds('ct')}>Their CT rounds</button>
        <button onClick={() => pickRounds('all')}>All</button>
        <button onClick={() => pickRounds('none')}>None</button>
      </div>
      <div>
        <h3>{m.teams[team].name}</h3>
        {players.map((p) => (
          <button key={p.idx} className="prow" aria-pressed={ms.players.has(p.idx)} onClick={() => update({ players: toggleIn(ms.players, p.idx) })}>
            <span className="n num">{p.slot % 10}</span>
            <span className="sw" style={{ background: S.colors.multiPalette[(p.slot - 1) % S.colors.multiPalette.length] }} />
            {p.name}<span className="chk">{ms.players.has(p.idx) ? 'shown' : 'hidden'}</span>
          </button>
        ))}
        <button className="link" onClick={() => update({ players: new Set(players.map((p) => p.idx)) })}>Select all players</button>
      </div>
      <div><h3>Their utility</h3>{utilCells(ms.util, (u) => update({ util: toggleIn(ms.util, u) }))}</div>
      <div>
        <h3>Opponents · {m.teams[enemy].name}</h3>
        <button className="chk-row" aria-pressed={ms.showEnemies} onClick={() => update({ showEnemies: !ms.showEnemies })}><i />Show enemy players</button>
        <div style={{ marginTop: 6 }}>{utilCells(ms.enemyUtil, (u) => update({ enemyUtil: toggleIn(ms.enemyUtil, u) }))}</div>
      </div>
      <div>
        <h3>On map</h3>
        <button className="chk-row" aria-pressed={ms.bomb} onClick={() => update({ bomb: !ms.bomb })}><i />Bomb</button>
        {S.features.droppedUtility ? (
          <button className="chk-row" aria-pressed={ms.dropped} title="Grenades lying on the ground until someone picks them up" onClick={() => update({ dropped: !ms.dropped })}><i />Dropped utility</button>
        ) : null}
      </div>
      <button className="reset" onClick={() => { store.set({ multi: defaultMulti(m, team) }); store.setMultiTime(0); }}><Icon name="reset" />Reset filters</button>
    </section>
  );
}
