// 都道府県を四角いタイルで並べた日本地図（HOME'S などの「地図から選ぶ」の簡易版）。値で色分けする。
import { PREFS } from './prefs.mjs';

// 都道府県コード → [列, 行]
const POS = {
  '01': [14, 0], '02': [14, 1], '05': [13, 2], '03': [14, 2], '06': [13, 3], '04': [14, 3], '15': [12, 4], '07': [13, 4],
  '17': [10, 5], '16': [11, 5], '20': [12, 5], '10': [13, 5], '09': [14, 5], '08': [15, 5],
  '18': [10, 6], '21': [11, 6], '19': [12, 6], '11': [13, 6],
  '32': [6, 7], '31': [7, 7], '28': [8, 7], '26': [9, 7], '25': [10, 7], '23': [11, 7], '22': [12, 7], '13': [13, 7], '12': [14, 7],
  '35': [5, 8], '34': [6, 8], '33': [7, 8], '27': [8, 8], '29': [9, 8], '24': [10, 8], '14': [13, 8],
  '42': [1, 9], '41': [2, 9], '40': [3, 9], '44': [4, 9], '38': [6, 9], '37': [7, 9], '36': [8, 9], '30': [9, 9],
  '43': [2, 10], '45': [3, 10], '39': [7, 10], '46': [2, 11], '47': [0, 13],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// values: { [code]: { v: 数値, label: 表示文字, href } }。current は強調する県コード
export function japanMap(values, { current, caption } = {}) {
  const nums = Object.values(values).map((x) => x.v).filter((v) => v != null).sort((a, b) => a - b);
  const q = (p) => nums[Math.min(nums.length - 1, Math.floor(nums.length * p))];
  const bins = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const level = (v) => (v == null ? 0 : 1 + bins.filter((b) => v > b).length);
  const tiles = PREFS.map((p) => {
    const [x, y] = POS[p.code];
    const d = values[p.code];
    const short = p.name.replace(/[都府県]$/, '');
    const inner = `<span class="jp-name">${esc(short)}</span>${d?.label ? `<span class="jp-val">${esc(d.label)}</span>` : ''}`;
    const cls = `jp-tile l${level(d?.v)}${current === p.code ? ' current' : ''}`;
    const style = `grid-column:${x + 1};grid-row:${y + 1}`;
    return d?.href ? `<a class="${cls}" style="${style}" href="${esc(d.href)}" title="${esc(p.name)}${d.title ? '：' + esc(d.title) : ''}">${inner}</a>` : `<span class="${cls}" style="${style}">${inner}</span>`;
  }).join('');
  return `<div class="jp-map-wrap"><div class="jp-map">${tiles}</div>${caption ? `<p class="jp-legend">${esc(caption)}<span class="jp-scale"><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><i class="l5"></i></span>安い ← → 高い</p>` : ''}</div>`;
}
