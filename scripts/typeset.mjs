// 本文中の「数字＋単位」に目印を付ける。見た目は style.css 側で場所ごとに決める。
//   1,136万円 → <span class="nu"><span class="d">1,136</span><span class="u">万円</span></span>
// 参考にした不動産・金融サイトに共通する「数字は大きく太く、単位は小さく、数字と単位は改行させない」を
// 全ページで漏れなく実現するため、手書きではなくページ書き出し時に一括で処理する。
// ※ src/app.js にも同じ処理（計算結果用）がある。直すときは両方そろえる。

// 見出しで数字を強調してよい単位（「3つ」「6社」「60秒」など。日付や金額は強調しない）
const KEY_UNITS = new Set(['つ', '社', '秒', 'ステップ']);
const TOKEN = /(&#?\w+;)|(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(万円\/坪|万円|万件|億|万|円|件|㎡|%|％|社|秒|つ|ステップ|店舗|倍)?/g;
// 中身を書き換えてはいけない要素
const SKIP = new Set(['head', 'script', 'style', 'svg', 'textarea', 'option', 'select', 'title', 'noscript']);

export function typesetText(text) {
  let changed = false;
  const out = text.replace(TOKEN, (all, entity, int, dec = '', unit) => {
    if (entity) return entity;
    changed = true;
    const d = `<span class="d${unit && KEY_UNITS.has(unit) ? ' k' : ''}">${int}${dec}</span>`;
    return unit ? `<span class="nu">${d}<span class="u">${unit}</span></span>` : d;
  });
  // ボタンやチップのような横並び（flex）の部品では、目印ごとに間隔が空いてしまう。
  // 文のかたまりを1つの span で包んで、1つの部品として並ぶようにする
  return changed ? `<span class="tx">${out}</span>` : out;
}

export function typeset(html) {
  let skip = 0;
  return html.split(/(<[^>]*>)/).map((part, i) => {
    if (i % 2 === 1) {
      const m = part.match(/^<(\/?)([a-zA-Z][\w-]*)/);
      if (m && SKIP.has(m[2].toLowerCase()) && !part.endsWith('/>')) skip += m[1] ? -1 : 1;
      return part;
    }
    return skip > 0 || !/\d/.test(part) ? part : typesetText(part);
  }).join('');
}
