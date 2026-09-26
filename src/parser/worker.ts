/// <reference lib="webworker" />
/**
 * Background worker: reads the dropped demo with the WebAssembly demo reader so the page stays responsive.
 * Messages in:  { file: File }
 * Messages out: { type: 'stage', stage } | { type: 'done', match } | { type: 'error', message }
 */
import init, { parseEvents, parseHeader, parseTicks } from '../../vendor/demoparser2/demoparser2.js';
import wasmUrl from '../../vendor/demoparser2/demoparser2_bg.wasm?url';
import { readDemo } from './read';
import { transferables } from './build';
import { S } from '../config/settings-schema';
import { siteWorldPositions } from '../model/maps';

let ready: Promise<unknown> | null = null;

self.onmessage = async (ev: MessageEvent<{ file: File }>) => {
  try {
    ready ??= init({ module_or_path: wasmUrl });
    await ready;
    const bytes = new Uint8Array(await ev.data.file.arrayBuffer());
    const match = readDemo(
      { parseHeader, parseEvents, parseTicks },
      bytes,
      S.parse,
      siteWorldPositions,
      (stage) => self.postMessage({ type: 'stage', stage }),
      S.features,
    );
    self.postMessage({ type: 'done', match }, transferables(match));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly = /memory|allocation|out of bounds/i.test(message)
      ? 'Your browser ran out of memory reading this demo. Close other tabs and try again, or use a desktop browser.'
      : /unreachable|panic/i.test(message)
        ? "The demo reader couldn't read this file. It may be damaged, cut short, or from a CS2 update newer than this site. Please report it with the demo's source."
        : message;
    self.postMessage({ type: 'error', message: friendly });
  }
};
