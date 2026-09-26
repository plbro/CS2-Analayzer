import { useCallback, useEffect, useRef, useState } from 'react';
import type { Match } from '../model/types';
import type { Stage } from '../parser/read';
import { ReplayStore } from '../playback/store';
import { MATCH_FORMAT, VERSION } from '../version';
import { Icon } from './Icon';
import { Replay } from './Replay';
import { Brand } from './Brand';

type Status =
  | { kind: 'idle'; error?: string }
  | { kind: 'loading'; name: string; size: number; stage: Stage | 'starting'; started: number }
  | { kind: 'ready'; store: ReplayStore; name: string; size: number };

const STAGES: { id: Stage; label: string }[] = [
  { id: 'checking', label: 'Checking the file' },
  { id: 'rounds', label: 'Finding rounds, kills and grenades' },
  { id: 'positions', label: 'Reading player positions (the slow part)' },
  { id: 'building', label: 'Building the replay' },
];

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const workerRef = useRef<Worker | null>(null);

  const load = useCallback((file: File) => {
    workerRef.current?.terminate();
    if (status.kind === 'ready') status.store.destroy();
    const worker = new Worker(new URL('../parser/worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const started = performance.now();
    setStatus({ kind: 'loading', name: file.name, size: file.size, stage: 'starting', started });
    worker.onmessage = (ev: MessageEvent<{ type: 'stage'; stage: Stage } | { type: 'done'; match: Match } | { type: 'error'; message: string }>) => {
      const msg = ev.data;
      if (msg.type === 'stage') setStatus((s) => (s.kind === 'loading' ? { ...s, stage: msg.stage } : s));
      else if (msg.type === 'error') { setStatus({ kind: 'idle', error: msg.message }); worker.terminate(); }
      else {
        worker.terminate();
        workerRef.current = null;
        if (msg.match.format !== MATCH_FORMAT) {
          setStatus({ kind: 'idle', error: `Internal mismatch (reader format ${msg.match.format}, screen expects ${MATCH_FORMAT}). Reload the page.` });
          return;
        }
        console.info(`[Open Skybox ${VERSION}] ${file.name}: read in ${((performance.now() - started) / 1000).toFixed(1)} s`, msg.match.notes);
        setStatus({ kind: 'ready', store: new ReplayStore(msg.match), name: file.name, size: file.size });
      }
    };
    worker.onerror = (e) => { setStatus({ kind: 'idle', error: `The demo reader stopped: ${e.message || 'unknown error'}.` }); worker.terminate(); };
    worker.postMessage({ file });
  }, [status]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  if (status.kind === 'ready') return <Replay store={status.store} fileName={status.name} fileSize={status.size} onLoad={load} />;
  return <DropScreen status={status} onFile={load} />;
}

function DropScreen({ status, onFile }: { status: Exclude<Status, { kind: 'ready' }>; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (status.kind !== 'loading') return;
    const id = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(id);
  }, [status.kind]);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  const stageIdx = status.kind === 'loading' ? STAGES.findIndex((s) => s.id === status.stage) : -1;
  return (
    <div className="drop" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <header><Brand /></header>
      <main>
        <div className={`dropzone${over ? ' over' : ''}`}>
          {status.kind === 'loading' ? (
            <>
              <h1>Reading {status.name}</h1>
              <p>{(status.size / 1e6).toFixed(0)} MB · {((now - status.started) / 1000).toFixed(0)} s so far. Big demos take 15–40 seconds. Everything happens on your computer; nothing is uploaded.</p>
              <ol className="stages">
                {STAGES.map((s, i) => <li key={s.id} className={i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''}><i />{s.label}</li>)}
              </ol>
            </>
          ) : (
            <>
              <h1>Drop a CS2 demo here</h1>
              <p>Get a 2D replay of every round: positions, utility, kills, economy and multi-round overlays. Free, and your demo never leaves your browser.</p>
              <button className="pick" onClick={() => input.current?.click()}><Icon name="upload" />Choose a .dem file</button>
              <input ref={input} type="file" accept=".dem" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              {status.error ? <p className="err" role="alert">{status.error}</p> : null}
              <p className="fine">Your own matches: CS2 → Watch → Your Matches → download, then find the .dem in your CS2 "replays" folder. Pro matches: download from HLTV and unzip first.</p>
            </>
          )}
        </div>
      </main>
      <footer>
        <span>Open Skybox {VERSION} · free and open source (MIT)</span>
        <span>Map images © Valve. Not affiliated with Valve, HLTV or any team.</span>
      </footer>
    </div>
  );
}
