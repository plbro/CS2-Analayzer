// Downloads radar images + overview numbers for every map in tools/maps-source.json
// and writes src/config/maps.json. Run: npm run fetch-maps
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = JSON.parse(fs.readFileSync(path.join(root, 'tools/maps-source.json'), 'utf8'));
const out = {};

function num(txt, key) {
  const m = txt.match(new RegExp(`"${key}"\\s+"(-?[\\d.]+)"`, 'i'));
  return m ? Number(m[1]) : null;
}

for (const map of src.maps) {
  const info = await (await fetch(`${src.base}/data/radar_info/${map}.txt`)).text();
  const entry = {
    posX: num(info, 'pos_x'), posY: num(info, 'pos_y'), scale: num(info, 'scale'),
    bombA: [num(info, 'bombA_x'), num(info, 'bombA_y')], bombB: [num(info, 'bombB_x'), num(info, 'bombB_y')],
    layers: [{ id: 'default', image: `maps/${map}/radar.png`, altMin: -1e9, altMax: 1e9 }],
  };
  const lower = info.match(/"lower"[^{]*\{[^}]*"AltitudeMax"\s+"(-?[\d.]+)"[^}]*"AltitudeMin"\s+"(-?[\d.]+)"/i);
  const def = info.match(/"default"[^{]*\{[^}]*"AltitudeMax"\s+"(-?[\d.]+)"[^}]*"AltitudeMin"\s+"(-?[\d.]+)"/i);
  if (lower) {
    entry.layers[0].altMin = def ? Number(def[2]) : Number(lower[1]);
    entry.layers.push({ id: 'lower', image: `maps/${map}/radar_lower.png`, altMin: Number(lower[2]), altMax: Number(lower[1]) });
  }
  fs.mkdirSync(path.join(root, 'public/maps', map), { recursive: true });
  for (const layer of entry.layers) {
    const file = layer.id === 'lower' ? `${map}_lower_radar_psd.png` : `${map}_radar_psd.png`;
    const res = await fetch(`${src.base}/images/radars/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    fs.writeFileSync(path.join(root, 'public', layer.image), Buffer.from(await res.arrayBuffer()));
  }
  out[map] = entry;
  console.log(map, entry.layers.length === 2 ? '(2 layers)' : '', entry.posX, entry.posY, entry.scale);
}
fs.writeFileSync(path.join(root, 'src/config/maps.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote src/config/maps.json');
