// トップページ用の街並みイラスト（SVG）。写真の代わりに、サイトの色で描いた平面的な街。
const rect = (x, y, w, h, fill, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const windows = (x, y, w, h, cols, rows, fill) => {
  let s = '';
  const cw = (w - 8) / cols;
  const rh = (h - 8) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) s += `<rect x="${(x + 6 + i * cw).toFixed(1)}" y="${(y + 6 + j * rh).toFixed(1)}" width="${(cw - 6).toFixed(1)}" height="${(rh - 6).toFixed(1)}" rx="1" fill="${fill}"/>`;
  return s;
};
const house = (x, y, w, h, wall, roof) => `${rect(x, y, w, h, wall)}<path d="M${x - 6} ${y} L${x + w / 2} ${y - h * 0.55} L${x + w + 6} ${y} Z" fill="${roof}"/>${rect(x + w * 0.4, y + h * 0.45, w * 0.2, h * 0.55, '#c9d6ea', 1)}${rect(x + w * 0.1, y + h * 0.2, w * 0.2, h * 0.22, '#eaf3fc', 1)}${rect(x + w * 0.7, y + h * 0.2, w * 0.2, h * 0.22, '#eaf3fc', 1)}`;
const tree = (x, y, s, fill) => `<circle cx="${x}" cy="${y - s}" r="${s}" fill="${fill}"/><rect x="${x - s * 0.15}" y="${y - s * 0.4}" width="${s * 0.3}" height="${s * 0.9}" fill="#9aa9c3"/>`;

export function skyline() {
  const B = '#c7d6ee';
  const B2 = '#a9bddf';
  const B3 = '#8fa8d4';
  const W = '#eef4fc';
  return `<svg class="skyline" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#dfeaf8"/></linearGradient></defs>
<rect width="1200" height="260" fill="url(#sky)"/>
<path d="M0 200 Q150 150 300 190 T600 180 T900 195 T1200 175 V260 H0 Z" fill="#e3ecf8"/>
${rect(60, 120, 70, 110, B2)}${windows(60, 120, 70, 110, 3, 5, W)}
${rect(150, 90, 50, 140, B3)}${windows(150, 90, 50, 140, 2, 7, W)}
${rect(210, 140, 90, 90, B)}${windows(210, 140, 90, 90, 4, 4, W)}
${house(330, 180, 60, 50, '#ffffff', '#f26b1d')}
${tree(410, 232, 14, '#8fcdb4')}
${rect(440, 70, 60, 160, B3)}${windows(440, 70, 60, 160, 2, 8, W)}
${rect(505, 110, 80, 120, B2)}${windows(505, 110, 80, 120, 3, 5, W)}
${rect(595, 150, 45, 80, B)}${windows(595, 150, 45, 80, 2, 3, W)}
${house(660, 185, 54, 45, '#ffffff', '#1c4f9c')}
${tree(735, 232, 12, '#8fcdb4')}
${tree(760, 232, 16, '#6fbf9d')}
${rect(790, 100, 70, 130, B2)}${windows(790, 100, 70, 130, 3, 6, W)}
${rect(870, 60, 55, 170, B3)}${windows(870, 60, 55, 170, 2, 8, W)}
${rect(935, 130, 85, 100, B)}${windows(935, 130, 85, 100, 4, 4, W)}
${house(1040, 182, 58, 48, '#ffffff', '#19a974')}
${tree(1120, 232, 15, '#8fcdb4')}
${rect(1140, 150, 50, 80, B2)}${windows(1140, 150, 50, 80, 2, 3, W)}
<rect x="0" y="230" width="1200" height="30" fill="#d7e4f5"/>
</svg>`;
}
