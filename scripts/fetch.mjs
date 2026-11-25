// 国土交通省「不動産情報ライブラリ」APIから、都道府県ごと・四半期ごとに取引データを取得して data/raw/ に保存する。
// 取得済みの四半期はスキップするので、途中で止めても再実行すれば続きから取れる。
//   node scripts/fetch.mjs          … config.prefectures の全県
//   node scripts/fetch.mjs 23 21    … 指定した県だけ
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../config.mjs';
import { DATA_DIR, TYPES, loadEnv, num, recentQuarters } from './lib.mjs';
import { PREFS } from './prefs.mjs';

const API = 'https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001';
const RAW_DIR = join(DATA_DIR, 'raw');
const WANTED = new Map(Object.entries(TYPES).map(([k, t]) => [t.api, k]));
// 相場からかけ離れやすい特殊な取引は集計に入れない
const SPECIAL = /関係者間|親族間|調停|競売|隣地/;

loadEnv();
const key = process.env.REINFOLIB_API_KEY;
if (!key) {
  console.error('REINFOLIB_API_KEY が設定されていません。.env に APIキーを書いてください。');
  process.exit(1);
}
mkdirSync(RAW_DIR, { recursive: true });

const targets = process.argv.slice(2).length ? process.argv.slice(2) : config.prefectures === 'all' ? PREFS.map((p) => p.code) : config.prefectures;

for (const pref of targets) {
  const name = PREFS.find((p) => p.code === pref)?.name ?? pref;
  let found = 0;
  let fetched = 0;
  // 直近は未公開の四半期があるので、データのある四半期が quarters 個そろうまでさかのぼる
  for (const { year, quarter } of recentQuarters(config.quarters + 4)) {
    if (found >= config.quarters) break;
    const file = join(RAW_DIR, `${pref}-${year}Q${quarter}.json`);
    if (existsSync(file)) { found++; continue; }

    const t0 = Date.now();
    const res = await fetch(`${API}?year=${year}&quarter=${quarter}&area=${pref}`, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    if (res.status === 404) continue; // まだ公開されていない四半期
    if (!res.ok) {
      console.warn(`  ${name} ${year}Q${quarter}: HTTP ${res.status}。10秒待って次へ`);
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }
    const body = await res.json();
    const rows = (body.data ?? []).filter((r) => WANTED.has(r.Type) && !SPECIAL.test(r.Remarks ?? '')).map((r) => normalize(r, year, quarter));
    writeFileSync(file, JSON.stringify(rows));
    found++;
    fetched++;
    console.log(`  ${name} ${year}Q${quarter}: ${rows.length}件 (${Date.now() - t0}ms)`);
    await new Promise((r) => setTimeout(r, 250)); // APIに負荷をかけないよう間隔を空ける
  }
  console.log(`${name}: ${found}四半期分あり（今回取得 ${fetched}）`);
}

// 保存容量を抑えるため、項目名は短くする
//   t=種別 m=市区町村コード d=地区名 p=価格 a=面積 u=㎡単価 y=建築年 q=四半期
function normalize(r, year, quarter) {
  const price = num(r.TradePrice);
  const area = num(r.Area);
  return {
    t: WANTED.get(r.Type),
    m: r.MunicipalityCode,
    d: r.DistrictName || '',
    p: price,
    a: area,
    u: num(r.UnitPrice) ?? (price && area ? Math.round(price / area) : null),
    y: num(r.BuildingYear),
    q: `${year}Q${quarter}`,
  };
}
