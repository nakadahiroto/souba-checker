// 総務省「全国地方公共団体コード」の Excel から市区町村の一覧（読み仮名・URL用スラッグ付き）を作り、data/munis.json に保存する。
// 事前に data/soumu/x/ に Excel を展開しておく（Expand-Archive）。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './lib.mjs';
import { PREF_BY_CODE } from './prefs.mjs';
import { kanaToRomaji } from './romaji.mjs';

const X = join(DATA_DIR, 'soumu', 'x', 'xl');
const shared = [...readFileSync(join(X, 'sharedStrings.xml'), 'utf8').matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''),
);
// sheet1 = 市区町村の一覧、sheet2 = 政令指定都市とその区の一覧
const sheet = ['sheet1', 'sheet2'].map((s) => readFileSync(join(X, 'worksheets', `${s}.xml`), 'utf8')).join('');

const rows = [];
for (const row of sheet.matchAll(/<row [^>]*>(.*?)<\/row>/gs)) {
  const cells = {};
  for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>)?/g)) {
    const raw = c[3] ?? '';
    cells[c[1]] = /t="s"/.test(c[2]) ? shared[Number(raw)] : raw;
  }
  rows.push(cells);
}

// 列: A=団体コード(6桁) B=都道府県 C=市区町村 D=都道府県カナ E=市区町村カナ
const munis = {};
for (const r of rows) {
  const code6 = String(r.A ?? '').padStart(6, '0');
  const code = code6.slice(0, 5);
  if (!/^\d{6}$/.test(code6) || code.endsWith('000') || !r.C) continue; // 見出し行と都道府県の行（28000 など）は飛ばす
  // NFKC で異体字（「神戸」の「神」など）も通常の漢字にそろえる
  munis[code] = { code, pref: code.slice(0, 2), name: r.C.normalize('NFKC'), kana: (r.E ?? '').normalize('NFKC') };
}

// 政令指定都市の区は「名古屋市中川区」の形で入っているので、親の市を見つけて区の部分だけ取り出す
const byName = new Map(Object.values(munis).map((m) => [m.pref + m.name, m]));
for (const m of Object.values(munis)) {
  const w = m.name.match(/^(.+?市)(.+区)$/);
  const parent = w && byName.get(m.pref + w[1]);
  if (parent) {
    m.parent = parent.code;
    m.short = w[2];
    m.kana = m.kana.startsWith(parent.kana) ? m.kana.slice(parent.kana.length) : m.kana;
  } else {
    m.short = m.name;
  }
}

// スラッグ：読み仮名から「シ/ク/チョウ/マチ/ムラ/ソン」の語尾を落としてローマ字に
for (const m of Object.values(munis)) {
  const suffix = m.short.slice(-1);
  const kana = m.kana.replace({ 市: /シ$/, 区: /ク$/, 町: /(チョウ|マチ)$/, 村: /(ムラ|ソン)$/ }[suffix] ?? /$^/, '');
  m.slug = kanaToRomaji(kana) || m.code;
}
// 同じ親の中でスラッグがかぶったらコードを付けて区別する
const seen = new Map();
for (const m of Object.values(munis)) {
  const key = `${m.parent ?? m.pref}/${m.slug}`;
  if (seen.has(key)) m.slug += `-${m.code}`;
  seen.set(key, true);
}
// URLのパス（都道府県/市/区）
for (const m of Object.values(munis)) {
  const pref = PREF_BY_CODE[m.pref].slug;
  m.path = m.parent ? `${pref}/${munis[m.parent].slug}/${m.slug}` : `${pref}/${m.slug}`;
}

writeFileSync(join(DATA_DIR, 'munis.json'), JSON.stringify(munis));
const n = Object.keys(munis).length;
console.log(`${n}件の市区町村を保存しました（区 ${Object.values(munis).filter((m) => m.parent).length}件）`);
for (const code of ['23110', '23100', '21208', '13112', '27100', '27141', '01101']) console.log(code, munis[code]?.name, '→', munis[code]?.path);
