// 取引データから相場の統計を出す関数群
import { TSUBO, TYPES, median, quantile } from './lib.mjs';

// 四半期の文字列 "2025Q1" → 表示用
export const qLabel = (q) => {
  const [y, n] = q.split('Q');
  return `${y}年${['1〜3', '4〜6', '7〜9', '10〜12'][n - 1]}月`;
};

export const MIN_N = 5; // これより少ない件数で統計を出すと誤解を招くので出さない

// 種別ごとの基本統計
export function summarize(records) {
  const from = recentFrom(records, 4);
  return Object.entries(TYPES).map(([key, t]) => {
    const rs = records.filter((r) => r.t === key);
    const units = rs.filter((r) => r.u).map((r) => r.u);
    return {
      key,
      label: t.label,
      count: rs.length,
      price: rs.length >= MIN_N ? median(rs.map((r) => r.p)) : null,
      tsubo: units.length >= MIN_N ? median(units) * TSUBO : null,
      area: rs.length >= MIN_N ? median(rs.filter((r) => r.a).map((r) => r.a)) : null,
      recent: rs.filter((r) => r.q >= from).length,
    };
  });
}

// 四半期の一覧（古い順）。同じ配列に対しては結果を使い回す
const quartersCache = new WeakMap();
export function quarters(records) {
  let qs = quartersCache.get(records);
  if (!qs) {
    qs = [...new Set(records.map((r) => r.q))].sort();
    quartersCache.set(records, qs);
  }
  return qs;
}

// 直近 n 四半期の始まりの四半期を返す
export function recentFrom(records, n) {
  const qs = quarters(records);
  return qs[Math.max(0, qs.length - n)] ?? '';
}

// 年ごとの坪単価の中央値と件数（種別ごと）
export function yearly(records) {
  const qs = quarters(records);
  const years = [...new Set(qs.map((q) => q.slice(0, 4)))];
  const lastQ = qs.at(-1) ?? '';
  const series = Object.entries(TYPES).map(([key, t]) => ({
    key,
    label: t.label,
    values: years.map((y) => {
      const us = records.filter((r) => r.t === key && r.q.startsWith(y) && r.u).map((r) => r.u);
      return us.length >= MIN_N ? Math.round((median(us) * TSUBO) / 1000) / 10 : null; // 万円/坪（小数1桁）
    }),
    counts: years.map((y) => records.filter((r) => r.t === key && r.q.startsWith(y)).length),
  }));
  // 途中までしかない年は「2026(1〜3月)」のように範囲を付ける
  const labels = years.map((y) => (lastQ.startsWith(y) && !lastQ.endsWith('Q4') ? `${y}(1〜${qLabel(lastQ).split('〜')[1]})` : y));
  return { years, labels, series };
}

// 直近1年と3年前の1年で坪単価を比べた変化率（%）。データが足りなければ null
export function trend(records, type) {
  const qs = quarters(records);
  if (qs.length < 16) return null;
  const now = new Set(qs.slice(-4));
  const before = new Set(qs.slice(-16, -12));
  const pick = (set) => records.filter((r) => r.t === type && r.u && set.has(r.q)).map((r) => r.u);
  const a = pick(now);
  const b = pick(before);
  // 件数が少ない地域は年ごとのぶれが大きく「下落傾向」などと断定できないので出さない
  if (a.length < 30 || b.length < 30) return null;
  return Math.round(((median(a) - median(b)) / median(b)) * 100);
}

// 築年数ごとの坪単価（直近5年の取引から）
const AGE_BUCKETS = [
  ['〜5年', 0, 5], ['6〜10年', 6, 10], ['11〜15年', 11, 15], ['16〜20年', 16, 20],
  ['21〜25年', 21, 25], ['26〜30年', 26, 30], ['31〜40年', 31, 40], ['41年〜', 41, 999],
];
export function ageCurve(records, type) {
  const from = recentFrom(records, 20);
  const rs = records.filter((r) => r.t === type && r.u && r.y && r.q >= from);
  return AGE_BUCKETS.map(([label, lo, hi]) => {
    const us = rs.filter((r) => { const age = Number(r.q.slice(0, 4)) - r.y; return age >= lo && age <= hi; }).map((r) => r.u);
    return { label, value: us.length >= MIN_N ? Math.round((median(us) * TSUBO) / 1000) / 10 : null, sub: `${us.length}件` };
  });
}

// 同じ種別の直近3年の取引で、単価の25%点と75%点の開き（中央的な広さの物件での金額差、円）
export function spread(records, type) {
  const from = recentFrom(records, 12);
  const rs = records.filter((r) => r.t === type && r.u && r.q >= from);
  if (rs.length < MIN_N * 2) return null;
  const units = rs.map((r) => r.u);
  const area = median(rs.filter((r) => r.a).map((r) => r.a));
  return { low: quantile(units, 0.25) * area, mid: quantile(units, 0.5) * area, high: quantile(units, 0.75) * area, area, count: rs.length };
}

// 築30年以上の物件の直近3年の取引件数（「古くても売れる」の根拠に使う）
export function oldCount(records) {
  const from = recentFrom(records, 12);
  return records.filter((r) => r.q >= from && r.y && Number(r.q.slice(0, 4)) - r.y >= 30 && r.t !== 'land').length;
}

// 年ごとの件数と価格の中央値（直近1年と前年の比較に使う）
export function lastYears(records, type) {
  const qs = quarters(records);
  const now = new Set(qs.slice(-4));
  const prev = new Set(qs.slice(-8, -4));
  const pick = (set) => records.filter((r) => (!type || r.t === type) && set.has(r.q));
  const a = pick(now);
  const b = pick(prev);
  return {
    now: { count: a.length, price: a.length >= MIN_N ? median(a.map((r) => r.p)) : null },
    prev: { count: b.length, price: b.length >= MIN_N ? median(b.map((r) => r.p)) : null },
  };
}

// 地区ごとの集計（件数の多い順）
export function byDistrict(records, minN = 3) {
  const by = new Map();
  for (const r of records) if (r.d) by.set(r.d, [...(by.get(r.d) ?? []), r]);
  return [...by.entries()]
    .filter(([, list]) => list.length >= minN)
    .map(([name, list]) => ({
      name,
      count: list.length,
      price: median(list.map((r) => r.p)),
      tsubo: list.some((r) => r.u) ? median(list.filter((r) => r.u).map((r) => r.u)) * TSUBO : null,
    }))
    .sort((a, b) => b.count - a.count);
}
