import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
export const DIST_DIR = join(ROOT, 'dist');

// 物件種別。APIの Type の値と、サイト上での呼び方の対応
export const TYPES = {
  mansion: { api: '中古マンション等', label: '中古マンション' },
  house: { api: '宅地(土地と建物)', label: '戸建て（土地と建物）' },
  land: { api: '宅地(土地)', label: '土地' },
};

export const TSUBO = 3.30578;

// .env を読み込んで process.env に入れる（外部ライブラリを使わない簡易版）
export function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// "2000m^2以上" のような値から先頭の数値だけ取り出す
export function num(v) {
  if (v == null || v === '') return null;
  const m = String(v).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// 直近 n 四半期を新しい順に返す
export function recentQuarters(n, now = new Date()) {
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ year, quarter: q });
    if (--q === 0) { q = 4; year--; }
  }
  return out;
}

export function median(arr) {
  return quantile(arr, 0.5);
}

export function quantile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
