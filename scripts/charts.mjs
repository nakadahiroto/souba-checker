// ビルド時にインラインSVGのグラフを作る（JSライブラリ不要・色は CSS 変数で両テーマに対応）
const W = 640;
const H = 300;
const PAD = { top: 24, right: 64, bottom: 52, left: 52 };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// x軸ラベル。「2026(1〜3月)」のような補足付きは2行に分けて重なりを防ぐ
function xLabel(l, x, y) {
  const m = String(l).match(/^(.+?)\((.+)\)$/);
  if (!m) return `<text x="${x}" y="${y}" text-anchor="middle" class="tick">${esc(l)}</text>`;
  return `<text x="${x}" y="${y}" text-anchor="middle" class="tick">${esc(m[1])}<tspan x="${x}" dy="13">${esc(m[2])}</tspan></text>`;
}

function niceMax(v) {
  if (!v) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = n <= 2 ? 0.5 : n <= 5 ? 1 : 2;
  return Math.ceil(n / step) * step * p;
}

function yAxis(max, fmt) {
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  return [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const y = PAD.top + ih * (1 - f);
      return `<line x1="${PAD.left}" x2="${PAD.left + iw}" y1="${y}" y2="${y}" class="grid"/><text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" class="tick">${esc(fmt(f * max))}</text>`;
    })
    .join('');
}

// 折れ線グラフ（面の塗り＋最後の値のラベル付き）。series = [{ label, cls, values: [number|null, ...] }]
export function lineChart({ title, labels, series, fmt = (v) => v, note }) {
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!all.length) return '';
  const max = niceMax(Math.max(...all) * 1.15);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const y = (v) => PAD.top + ih * (1 - v / max);
  const base = PAD.top + ih;

  const paths = series
    .map((s) => {
      const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
      let d = '';
      let pen = false;
      const segs = [];
      let cur = [];
      pts.forEach((p) => {
        if (!p) { pen = false; if (cur.length) segs.push(cur); cur = []; return; }
        d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
        pen = true;
        cur.push(p);
      });
      if (cur.length) segs.push(cur);
      const area = segs
        .filter((seg) => seg.length > 1)
        .map((seg) => `M${seg[0][0].toFixed(1)},${base} ` + seg.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${seg.at(-1)[0].toFixed(1)},${base} Z`)
        .join(' ');
      const dots = pts
        .map((p, i) => (p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" class="dot ${s.cls}"><title>${esc(labels[i])} ${esc(s.label)}: ${esc(fmt(s.values[i]))}</title></circle>` : ''))
        .join('');
      const last = [...pts].reverse().find(Boolean);
      const lastV = [...s.values].reverse().find((v) => v != null);
      const endLabel = last ? `<text x="${(last[0] + 8).toFixed(1)}" y="${(last[1] + 4).toFixed(1)}" class="end-label ${s.cls}" stroke="none">${esc(fmt(lastV))}</text>` : '';
      return `${area ? `<path d="${area}" class="area ${s.cls}"/>` : ''}<path d="${d.trim()}" class="line ${s.cls}"/>${dots}${endLabel}`;
    })
    .join('');
  const every = labels.length > 8 ? 2 : 1;
  const xLabels = labels
    .map((l, i) => (i % every && i !== labels.length - 1 ? '' : xLabel(l, x(i).toFixed(1), H - PAD.bottom + 20)))
    .join('');
  const legend = series.map((s) => `<span><i class="sw ${s.cls}"></i>${esc(s.label)}</span>`).join('');
  return wrap(title, `${yAxis(max, fmt)}${paths}${xLabels}`, legend, note);
}

// 棒グラフ。bars = [{ label, value, sub }]
export function barChart({ title, bars, fmt = (v) => v, cls = 's1', note }) {
  const vals = bars.map((b) => b.value).filter((v) => v != null);
  if (!vals.length) return '';
  const max = niceMax(Math.max(...vals) * 1.15);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const bw = iw / bars.length;
  const rects = bars
    .map((b, i) => {
      const cx = PAD.left + bw * (i + 0.5);
      const label = xLabel(b.label, cx.toFixed(1), H - PAD.bottom + 20);
      if (b.value == null) return label;
      const h = ih * (b.value / max);
      const top = PAD.top + ih - h;
      return `<rect x="${(PAD.left + bw * i + bw * 0.18).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="bar ${cls}"><title>${esc(b.label)}: ${esc(fmt(b.value))}${b.sub ? `（${esc(b.sub)}）` : ''}</title></rect>
<text x="${cx.toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle" class="tick">${esc(fmt(b.value))}</text>${label}`;
    })
    .join('');
  return wrap(title, `${yAxis(max, fmt)}${rects}`, '', note);
}

// カードに入れる小さな推移グラフ（値の配列、null は欠損）
export function sparkline(values, cls = 's1') {
  const pts = values.map((v, i) => (v == null ? null : [i, v]));
  const vals = pts.filter(Boolean).map((p) => p[1]);
  if (vals.length < 2) return '';
  const w = 120;
  const h = 36;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const x = (i) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 6) + 3);
  const y = (v) => (max === min ? h / 2 : 4 + (h - 8) * (1 - (v - min) / (max - min)));
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)} `;
    pen = true;
  }
  const last = [...pts].reverse().find(Boolean);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d.trim()}" class="line ${cls}"/><circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="3" class="${cls}"/></svg>`;
}

function wrap(title, inner, legend, note) {
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${inner}</svg>
${legend ? `<div class="legend">${legend}</div>` : ''}${note ? `<p class="note">${esc(note)}</p>` : ''}</figure>`;
}
