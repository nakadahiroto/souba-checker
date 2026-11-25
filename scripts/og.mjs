// SNS・検索結果用の画像（OGP）を作る。HTMLをヘッドレスの Edge で撮影して dist/og/ に保存する。
//   node scripts/og.mjs        … default + 都道府県47枚
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../config.mjs';
import { DIST_DIR, ROOT } from './lib.mjs';
import { PREFS } from './prefs.mjs';

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
if (!EDGE) { console.error('Edge が見つかりません'); process.exit(1); }
const OUT = join(DIST_DIR, 'og');
const TMP = join(ROOT, 'data', 'og-tmp');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const page = (title, sub) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@900&family=Noto+Sans+JP:wght@500&display=swap">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#142646 radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:22px 22px;color:#fff;font-family:"Noto Sans JP",sans-serif;position:relative}
.glow{position:absolute;right:-120px;bottom:-200px;width:620px;height:620px;border-radius:50%;background:radial-gradient(closest-side,rgba(21,143,120,.5),transparent)}
.box{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:500}
.brand svg{width:56px;height:56px}
h1{font-family:"Zen Kaku Gothic New",sans-serif;font-weight:900;font-size:68px;line-height:1.2;margin:0;letter-spacing:.01em}
.sub{font-size:30px;opacity:.9;margin-top:18px}
.foot{display:flex;gap:28px;font-size:24px;opacity:.85}
.foot span{display:flex;align-items:center;gap:10px}
.dot{width:12px;height:12px;border-radius:50%;background:#e65f22}
</style></head><body><div class="glow"></div><div class="box">
<div class="brand"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#20365e"/><path d="M7 16.5 16 9l9 7.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 24v-7M22 24v-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="m11 21 3-3 2.5 2.5L21 16" fill="none" stroke="#e8672c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>${config.siteName}</div>
<div><h1>${title}</h1><div class="sub">${sub}</div></div>
<div class="foot"><span><i class="dot"></i>国土交通省の実取引データ</span><span><i class="dot"></i>10年分の推移</span><span><i class="dot"></i>あなたの物件の目安を計算</span></div>
</div></body></html>`;

const jobs = [['default', page('あなたの家、<br>いまいくらで売れる？', '実際に売れた価格だけで集計した、全国の不動産売却相場')], ...PREFS.map((p) => [p.slug, page(`${p.name}の<br>不動産売却相場`, '市区町村・地区ごとの中央値・坪単価・10年の推移')])];
for (const [name, html] of jobs) {
  const src = join(TMP, `${name}.html`);
  writeFileSync(src, html);
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(TMP, 'profile')}`, '--virtual-time-budget=5000', '--window-size=1200,630', `--screenshot=${join(OUT, `${name}.png`)}`, `file:///${src.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  process.stdout.write('.');
}
console.log(`\nOG画像 ${jobs.length}枚 → dist/og/`);
