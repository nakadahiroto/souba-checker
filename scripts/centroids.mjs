// 市区町村ごとの代表点（緯度経度）を国土地理院の住所検索で集めて data/centroids.json に保存する。
// 航空写真タイルの表示位置に使う。取得済みは飛ばすので再実行で続きから。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './lib.mjs';
import { PREF_BY_CODE } from './prefs.mjs';

const munis = JSON.parse(readFileSync(join(DATA_DIR, 'munis.json'), 'utf8'));
const file = join(DATA_DIR, 'centroids.json');
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
let n = 0;
for (const m of Object.values(munis)) {
  if (out[m.code]) continue;
  const q = PREF_BY_CODE[m.pref].name + m.name;
  try {
    const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
    const hits = await res.json();
    // 役所（addressCode が市区町村コード）があればそれを優先、なければ先頭の結果
    const hit = hits.find((h) => h.properties.addressCode === m.code) ?? hits.find((h) => h.properties.title.includes(m.name)) ?? hits[0];
    if (hit) out[m.code] = [Math.round(hit.geometry.coordinates[1] * 1e5) / 1e5, Math.round(hit.geometry.coordinates[0] * 1e5) / 1e5];
  } catch (e) {
    console.warn(`${q}: ${e.message}`);
  }
  if (++n % 50 === 0) { writeFileSync(file, JSON.stringify(out)); process.stdout.write(`${n} `); }
  await new Promise((r) => setTimeout(r, 120));
}
writeFileSync(file, JSON.stringify(out));
console.log(`\n${Object.keys(out).length}件の座標を保存しました`);
