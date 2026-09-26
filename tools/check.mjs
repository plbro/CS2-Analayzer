// Cross-checks that no compiler catches. Run: npm run check  (also part of npm run verify and GitHub Actions)
// Every bug that escapes to a user should become a new check here.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const fails = [];
const notes = [];
let passed = 0;
const check = (ok, msg) => { if (ok) passed++; else fails.push(msg); };

/** Remove // and /* *\/ comments (string-aware enough for our code: skips "…", '…', `…`). */
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const srcFiles = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));

// 1. one version everywhere
const version = JSON.parse(read('package.json')).version;
check(read('src/version.ts').includes(`VERSION = '${version}'`), `src/version.ts VERSION does not match package.json (${version})`);
// Private notes (kept on disk, not in git) carry a <!-- version-tracked --> marker; on GitHub there are none, which is fine.
const tracked = fs.readdirSync(root).filter((f) => f.endsWith('.md') && f !== 'README.md' && read(f).includes('<!-- version-tracked -->'));
if (tracked.length === 0) notes.push('No version-tracked notes found (normal on GitHub, where they are not published).');
for (const doc of tracked) {
  const text = read(doc);
  const newest = /^##\s+v([\d.]+)/m.exec(text)?.[1];
  check(newest ? newest === version : text.includes(`v${version}`), `${doc} is not up to date with v${version}`);
}

// 2. every code fallback equals the shipped setting (the #1 bug class)
const settingsSrc = stripComments(read('src/config/settings.ts'));
const schemaSrc = stripComments(read('src/config/settings-schema.ts'));
const shipped = Function(`${settingsSrc.replace(/export const SETTINGS =/, 'return').replace(/export type[\s\S]*$/, '')}`)();
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const rules = [...schemaSrc.matchAll(/'([\w.]+)':\s*\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]/g)];
check(rules.length > 10, 'could not read NUMBER_RULES from settings-schema.ts');
for (const [, p, lo, hi, fb] of rules) {
  const v = get(shipped, p);
  check(v === Number(fb), `fallback for ${p} is ${fb} but settings.ts ships ${v}`);
  check(v >= Number(lo) && v <= Number(hi), `settings.ts ${p} = ${v} is outside its own range ${lo}–${hi}`);
}
const otherFallbacks = Function(`return ${/OTHER_FALLBACKS[^=]*=\s*(\{[\s\S]*?\});/.exec(schemaSrc)[1]}`)();
for (const [p, fb] of Object.entries(otherFallbacks)) check(JSON.stringify(get(shipped, p)) === JSON.stringify(fb), `fallback for ${p} differs from settings.ts`);
// every numeric setting has a rule (so it gets validated)
const leaves = [];
(function walkObj(o, pre) { for (const [k, v] of Object.entries(o)) { const p = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) walkObj(v, p); else leaves.push([p, v]); } })(shipped, '');
const ruled = new Set(rules.map((r) => r[1]));
for (const [p, v] of leaves) if (typeof v === 'number') check(ruled.has(p), `number setting ${p} has no range in settings-schema.ts`);

// 3. every shipped setting is read somewhere (no dead settings)
const code = srcFiles.filter((f) => !f.includes('config/settings')).map((f) => stripComments(read(f))).join('\n');
for (const [p] of leaves) {
  const [group, key] = p.split('.');
  const direct = new RegExp(`S\\.${group}\\.${key}\\b`).test(code);
  const viaGroup = new RegExp(`S\\.${group}\\b(?!\\.)`).test(code) && new RegExp(`\\b${key}\\b`).test(code);
  check(direct || viaGroup, `setting ${p} is never read`);
}
check(!/\bSETTINGS\b/.test(code), 'code reads SETTINGS directly; read the validated S instead');

// 4. no addresses in code (they belong in settings or tools/)
for (const f of srcFiles) {
  const s = stripComments(read(f));
  check(!/https?:\/\//.test(s), `${f} contains a web address`);
}

// 5. maps: every map's images exist
const maps = JSON.parse(read('src/config/maps.json'));
for (const [name, m] of Object.entries(maps)) for (const l of m.layers) check(exists(path.join('public', l.image)), `${name}: missing ${l.image}`);

// 6. the demo reader is vendored with its build notes
for (const f of ['demoparser2.js', 'demoparser2_bg.wasm', 'wasm-build.patch', 'BUILD.md', 'LICENSE']) check(exists(`vendor/demoparser2/${f}`), `vendor/demoparser2/${f} is missing`);

// 7. the one animation loop: only the store may call requestAnimationFrame
for (const f of srcFiles) if (!f.endsWith('playback/store.ts')) check(!/requestAnimationFrame/.test(stripComments(read(f))), `${f} starts its own animation loop`);

// 8. real-demo test data present (dormant = a note, never a silent pass)
const demos = exists('test-demos') ? fs.readdirSync(path.join(root, 'test-demos')).filter((f) => f.endsWith('.dem')) : [];
if (demos.length === 0) notes.push('test-demos/ is empty: "npm run test:demo" will skip the real-demo checks.');

// 9. docs that must exist
for (const f of ['README.md', 'LICENSE', '.gitignore', '.github/workflows/deploy.yml']) check(exists(f), `${f} is missing`);
check(read('.gitignore').includes('test-demos/') && read('.gitignore').includes('*.dem'), '.gitignore must keep demos out of git');

for (const n of notes) console.log(`NOTE  ${n}`);
if (fails.length) {
  for (const f of fails) console.log(`FAIL  ${f}`);
  console.log(`\n${fails.length} check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`All ${passed} checks passed.`);
