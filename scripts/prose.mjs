// データから、その地域にしか当てはまらない解説文を組み立てる（検索エンジン・AI回答向けの一次情報）
import { TSUBO, TYPES, median } from './lib.mjs';
import { ageCurve, byDistrict, lastYears, quarters, trend } from './stats.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const man = (yen) => {
  const m = Math.round(yen / 10_000);
  return m >= 10_000 ? `${Math.floor(m / 10_000)}億${m % 10_000 ? (m % 10_000).toLocaleString() + '万' : ''}円` : `${m.toLocaleString()}万円`;
};
const tsubo = (yenPerM2) => `${(Math.round((yenPerM2 * TSUBO) / 1000) / 10).toLocaleString()}万円/坪`;
const pct = (a, b) => Math.round(((a - b) / b) * 100);
const sign = (v) => `${v > 0 ? '+' : ''}${v}%`;

// 戻り値は段落の配列（HTML）。データが足りない項目は書かない
export function prose(place, records, summaries) {
  const out = [];
  const main = summaries.find((s) => s.price) ?? null;
  if (!main) return out;

  // 1. 総括
  const parts = summaries.filter((s) => s.price).map((s) => `${s.label}が<b>${man(s.price)}</b>（${tsubo(s.tsubo / TSUBO)}、${s.count.toLocaleString()}件）`);
  out.push(`${esc(place)}で過去10年に取引された物件の価格の中央値は、${parts.join('、')}です。中央値は取引を安い順に並べたときの真ん中の値で、極端に高い・安い取引の影響を受けにくい指標です。`);

  // 2. 10年の推移（1年ごとの値は数件の取引でぶれるので、最初の3年と直近の3年をまとめて比べる）
  const qs = quarters(records);
  if (qs.length >= 24) {
    const first = new Set(qs.slice(0, 12));
    const last = new Set(qs.slice(-12));
    const pick = (set) => records.filter((r) => r.t === main.key && r.u && set.has(r.q)).map((r) => r.u);
    const a = pick(first);
    const b = pick(last);
    if (a.length >= 30 && b.length >= 30) {
      const ua = median(a);
      const ub = median(b);
      const chg = pct(ub, ua);
      const t = trend(records, main.key);
      out.push(
        `${main.label}の坪単価は、${qs[0].slice(0, 4)}〜${qs[11].slice(0, 4)}年の${tsubo(ua)}から、${qs.at(-12).slice(0, 4)}〜${qs.at(-1).slice(0, 4)}年は${tsubo(ub)}へと${chg >= 0 ? '上がり' : '下がり'}、<b>約${sign(chg)}</b>の変化です（各期間${a.length}件・${b.length}件の中央値）。` +
          (t != null ? `直近1年と3年前を比べると${sign(t)}で、${t >= 5 ? '上昇が続いています' : t <= -5 ? '下落局面にあります' : 'おおむね横ばいです'}。` : ''),
      );
    }
  }

  // 3. 直近1年
  const ly = lastYears(records, main.key);
  if (ly.now.count && ly.prev.count) {
    const both = ly.now.count >= 10 && ly.prev.count >= 10 && ly.now.price && ly.prev.price;
    out.push(
      `直近1年の${main.label}の取引は${ly.now.count}件で、前の1年（${ly.prev.count}件）と比べて${ly.now.count > ly.prev.count ? '増えて' : ly.now.count < ly.prev.count ? '減って' : '同じで'}います。` +
        (both ? `価格の中央値は${man(ly.prev.price)}から${man(ly.now.price)}へ${sign(pct(ly.now.price, ly.prev.price))}です。` : ''),
    );
  }

  // 4. 地区の差
  const dist = byDistrict(records.filter((r) => r.t === main.key), 15).filter((d) => d.tsubo);
  if (dist.length >= 4) {
    const sorted = [...dist].sort((a, b) => b.tsubo - a.tsubo);
    const top = sorted.slice(0, 3);
    const low = sorted.slice(-2).reverse();
    out.push(
      `地区別に${main.label}の坪単価を見ると、${top.map((d) => `${esc(d.name)}（${tsubo(d.tsubo / TSUBO)}）`).join('、')}が高く、${low.map((d) => `${esc(d.name)}（${tsubo(d.tsubo / TSUBO)}）`).join('、')}は比較的手頃です。最も高い地区と低い地区の差は約${Math.round(sorted[0].tsubo / sorted.at(-1).tsubo * 10) / 10}倍あり、同じ${esc(place)}内でも立地で価格は大きく変わります。`,
    );
  }

  // 5. 築年数
  const ageType = summaries.find((x) => x.key === 'mansion')?.count >= 20 ? 'mansion' : 'house';
  const curve = ageCurve(records, ageType);
  const young = curve.find((c) => c.value != null);
  const old = [...curve].reverse().find((c) => c.value != null);
  if (young && old && young !== old && young.value > old.value) {
    out.push(
      `築年数の影響も大きく、${TYPES[ageType].label}では築${young.label}が${young.value}万円/坪なのに対し、築${old.label}は${old.value}万円/坪と<b>約${Math.round((1 - old.value / young.value) * 100)}%低い</b>水準です（直近5年の取引）。築年数が古い物件ほど、建物より土地の価値が価格を決めます。`,
    );
  }

  // 6. 面積
  const areas = records.filter((r) => r.t === main.key && r.a).map((r) => r.a);
  if (areas.length >= 20) {
    out.push(`取引された${main.label}の広さは中央値で${Math.round(median(areas))}㎡です。同じ地域でも広さと築年数で価格は数百万円単位で変わるため、具体的な金額は上の計算機で条件を入れて確かめるのが確実です。`);
  }
  return out;
}
