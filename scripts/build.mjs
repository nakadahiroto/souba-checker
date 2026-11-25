// data/raw/ と data/munis.json から、全国の相場ページを dist/ に生成する。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import config from '../config.mjs';
import { DATA_DIR, DIST_DIR, ROOT, TYPES } from './lib.mjs';
import { PREFS, REGIONS } from './prefs.mjs';
import { lineChart, barChart, sparkline } from './charts.mjs';
import { ICONS, LOGO, icon } from './icons.mjs';
import { prose } from './prose.mjs';
import { japanMap } from './japanmap.mjs';
import { typeset } from './typeset.mjs';
import { summarize, yearly, trend, ageCurve, spread, oldCount, byDistrict, qLabel, recentFrom, quarters } from './stats.mjs';

const RAW_DIR = join(DATA_DIR, 'raw');
const munis = JSON.parse(readFileSync(join(DATA_DIR, 'munis.json'), 'utf8'));
// node scripts/build.mjs 23 21 のように県コードを渡すと、その県だけビルドする（確認用）
const only = process.argv.slice(2);
const prefs = only.length ? PREFS.filter((p) => only.includes(p.code)) : config.prefectures === 'all' ? PREFS : PREFS.filter((p) => config.prefectures.includes(p.code));
const TYPE_ICON = { mansion: 'mansion', house: 'house', land: 'land' };
const TYPE_CLS = { mansion: 's1', house: 's2', land: 's3' };
const TYPE_SHORT = { mansion: 'マンション', house: '戸建て', land: '土地' };
const TODAY = new Date();
const YEAR = TODAY.getFullYear();
const ISO_DATE = TODAY.toISOString().slice(0, 10);
const JP_DATE = `${YEAR}年${TODAY.getMonth() + 1}月${TODAY.getDate()}日`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const href = (path) => `/${encodeURI(path)}/`;
const pct = (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`);
const deltaCls = (v) => (v == null ? 'flat' : v >= 5 ? 'up' : v <= -5 ? 'down' : 'flat');
const arrow = (v) => (v == null ? '' : v >= 5 ? '▲' : v <= -5 ? '▼' : '→');

function man(yen) {
  if (yen == null) return '—';
  const m = Math.round(yen / 10_000);
  if (m >= 10_000) return `${Math.floor(m / 10_000)}億${m % 10_000 ? (m % 10_000).toLocaleString() + '万' : ''}円`;
  return `${m.toLocaleString()}万円`;
}
const manTsubo = (yen) => (yen == null ? '—' : `${(Math.round(yen / 1000) / 10).toLocaleString()}万円/坪`);

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(join(DIST_DIR, 'd'), { recursive: true });
for (const f of ['style.css', 'app.js', 'favicon.svg']) copyFileSync(join(ROOT, 'src', f), join(DIST_DIR, f));
// イラスト: *.webp は Nano Banana 2.1 で生成した自作（scripts/gen-images.mjs、元画像は art/ai/）。
// *.svg はソコスト（商用利用可・クレジット不要。直リンク禁止のため自前で配信する）
mkdirSync(join(DIST_DIR, 'img'), { recursive: true });
for (const f of readdirSync(join(ROOT, 'src', 'img'))) copyFileSync(join(ROOT, 'src', 'img', f), join(DIST_DIR, 'img', f));
const img = (name, alt, w, h, cls = '', eager = false) => `<img class="ill ${cls}" src="/img/${name}${name.includes('.') ? '' : '.svg'}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;

const places = {};
const urls = ['/'];
const prefSummaries = [];
let pages = 0;
let totalRecords = 0;

for (const pref of prefs) {
  const records = loadPref(pref.code);
  if (!records.length) { console.warn(`${pref.name}: データなし（npm run fetch を先に実行）`); continue; }
  totalRecords += records.length;
  const byMuni = new Map();
  for (const r of records) byMuni.set(r.m, [...(byMuni.get(r.m) ?? []), r]);

  const list = Object.values(munis).filter((m) => m.pref === pref.code).sort((a, b) => a.code.localeCompare(b.code));
  const rows = [];
  for (const m of list.filter((x) => !x.parent)) {
    const wards = list.filter((x) => x.parent === m.code);
    const recs = wards.length ? wards.flatMap((w) => byMuni.get(w.code) ?? []) : byMuni.get(m.code) ?? [];
    if (!recs.length) continue;
    const area = makeArea(m, pref);
    const siblings = () => rows.filter((r) => r.area.code !== m.code).slice(-12).map((r) => r.area);
    if (wards.length) {
      const wardAreas = [];
      for (const w of wards) {
        const wr = byMuni.get(w.code) ?? [];
        if (!wr.length) continue;
        wardAreas.push({ area: makeArea(w, pref, area), records: wr, summary: summarize(wr) });
      }
      for (const { area: wa, records: wr } of wardAreas) buildArea(wa, wr, { siblings: wardAreas.filter((x) => x.area.code !== wa.code).map((x) => x.area) });
      buildArea(area, recs, { children: wardAreas, siblings: siblings() });
    } else {
      buildArea(area, recs, { siblings: siblings() });
    }
    rows.push({ area, count: recs.length, summary: summarize(recs), wards: wards.map((w) => makeArea(w, pref, area)).filter((w) => byMuni.has(w.code)) });
  }
  prefSummaries.push({ pref, count: records.length, summary: summarize(records), munis: rows.length, records, rows });
  console.log(`${pref.name}: ${records.length}件 / ${rows.length}市区町村`);
}

for (const p of prefSummaries) {
  writePage(p.pref.slug, prefPage(p.pref, p.records, p.rows));
  urls.push(href(p.pref.slug));
  delete p.records;
  delete p.rows;
}
writePage('', indexPage());
for (const [slug, html] of Object.entries(staticPages())) { writePage(slug, html); urls.push(href(slug)); }
writeFileSync(join(DIST_DIR, 'places.json'), JSON.stringify(places));
writeFileSync(join(DIST_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /go/\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
writeFileSync(join(DIST_DIR, 'llms.txt'), llmsTxt());
writeSitemaps();
console.log(`完了: ${pages}ページ、取引 ${totalRecords.toLocaleString()}件 → dist/`);

// ---------- データ読み込み ----------
function loadPref(code) {
  if (!existsSync(RAW_DIR)) return [];
  return readdirSync(RAW_DIR)
    .filter((f) => f.startsWith(`${code}-`))
    .flatMap((f) => JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8')))
    .filter((r) => r.t && r.p > 0)
    .map((r) => ({ ...r, m: String(r.m).padStart(5, '0') }));
}

function makeArea(m, pref, parent) {
  return { code: m.code, name: m.name, short: m.short, full: pref.name + m.name, path: m.path, pref, parent };
}

// ---------- ページ生成 ----------
function writePage(path, html) {
  const dir = join(DIST_DIR, ...path.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), typeset(html));
  pages++;
}

function buildArea(area, records, { children, siblings = [] }) {
  const districts = children ? [] : byDistrict(records, config.minDistrict);
  const districtPaths = new Map(districts.map((d) => [d.name, `${area.path}/${d.name}`]));
  places[area.code] = [area.full, href(area.path)];
  writePage(area.path, areaPage({ area, records, all: records, children, siblings, districtPaths }));
  urls.push(href(area.path));
  for (const d of districts) {
    const path = districtPaths.get(d.name);
    writePage(path, areaPage({ area, records: records.filter((r) => r.d === d.name), all: records, district: d.name, siblings, districtPaths }));
    urls.push(href(path));
  }
  if (!children) writeFileSync(join(DIST_DIR, 'd', `${area.code}.json`), calcData(records));
}

function calcData(records) {
  const districts = [...new Set(records.map((r) => r.d))];
  const qs = [...new Set(records.map((r) => r.q))].sort();
  const types = Object.keys(TYPES);
  const di = new Map(districts.map((d, i) => [d, i]));
  const qi = new Map(qs.map((q, i) => [q, i]));
  const rows = records.filter((r) => r.u).map((r) => [types.indexOf(r.t), di.get(r.d), r.u, r.y ?? 0, qi.get(r.q)]);
  return JSON.stringify({ types, districts, quarters: qs, rows });
}

// ---------- 共通部品 ----------
function layout({ title, description, path, hero, body, rail, crumbs = [], jsonld = [], og = '/og/default.png' }) {
  const crumbLd = { '@type': 'BreadcrumbList', itemListElement: [{ name: 'トップ', url: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: config.siteUrl + c.url })) };
  const siteLd = [
    { '@type': 'WebSite', '@id': `${config.siteUrl}/#website`, name: config.siteName, url: config.siteUrl, inLanguage: 'ja', publisher: { '@id': `${config.siteUrl}/#org` } },
    { '@type': 'Organization', '@id': `${config.siteUrl}/#org`, name: config.owner.name || config.siteName, url: config.siteUrl, logo: `${config.siteUrl}/og/default.png` },
    { '@type': 'WebPage', '@id': `${config.siteUrl}${path}`, url: `${config.siteUrl}${path}`, name: title, description, dateModified: ISO_DATE, isPartOf: { '@id': `${config.siteUrl}/#website` }, inLanguage: 'ja' },
  ];
  const ld = { '@context': 'https://schema.org', '@graph': [...siteLd, crumbLd, ...jsonld] };
  const ownerName = config.owner.name || '運営者情報（準備中）';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(config.siteUrl + path)}">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(config.siteUrl + path)}">
<meta property="og:image" content="${esc(config.siteUrl + og)}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:ital,wght@0,700;0,800;1,800&display=swap">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
${ICONS}
<header class="site-header"><div class="wrap">
<a class="brand" href="/">${LOGO}<span>${esc(config.siteName)}</span><span class="tag">実取引データで見る売却相場</span></a>
<nav class="nav" aria-label="サイト内">
<a href="/#prefs">${icon('map')}<span class="label">都道府県から</span></a>
<button type="button" id="finder-toggle" class="primary">${icon('search')}<span class="label">場所を探す</span></button>
</nav>
</div></header>
<p class="pr">当サイトはアフィリエイト広告（PR）を利用しています。掲載する相場データは国土交通省の公開情報をもとに独自に集計しています。</p>
${finderPanel()}
${hero}
<main><div class="wrap ${rail ? 'page' : 'page single'}">
<div class="content">
${body}
</div>
${rail ? `<aside class="rail">${rail}</aside>` : ''}
</div></main>
<footer><div class="wrap">
<div class="foot-grid">
<div><a class="brand light" href="/">${LOGO}<span>${esc(config.siteName)}</span></a><p class="small">${esc(config.tagline)}</p><p class="small">運営：${esc(ownerName)}</p></div>
<div><h3>サイトについて</h3><ul><li><a href="/about/">運営者情報・このサイトの方針</a></li><li><a href="/privacy/">プライバシーポリシー・免責事項</a></li><li><a href="/about/#contact">お問い合わせ</a></li><li><a href="/#prefs">都道府県一覧</a></li></ul></div>
<div><h3>データについて</h3><p class="small">出典：国土交通省「不動産情報ライブラリ」の不動産取引価格情報・成約価格情報を加工して作成（関係者間取引・競売等の特殊な取引は除外）。地図：国土地理院。イラストは当サイトのオリジナル（AI生成）。</p><p class="small">このサービスは国土交通省の不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。</p></div>
</div>
<p class="small foot-note">本サイトの数値は過去の取引事例から算出した参考値であり、不動産の鑑定評価や査定ではありません。実際の売却価格は物件の状態や市況により異なります。データ更新：${JP_DATE}</p>
<p class="small">© ${YEAR} ${esc(config.siteName)}</p>
</div></footer>
<div class="sticky-cta"><a class="btn ghost" href="#calc-section">${icon('calc')}10秒で目安</a>${ctaButton('small', 'sticky')}</div>
<script src="/app.js" defer></script>
</body>
</html>
`;
}

function finderPanel() {
  return `<div id="finder" class="finder" hidden><div class="wrap">${finderInner()}</div></div>`;
}

function finderInner(prefix = '') {
  const id = (s) => `${prefix}${s}`;
  return `<div class="finder-tabs" role="tablist">
<button type="button" class="active" data-pane="${id('text')}">${icon('search')}市区町村・住所</button>
<button type="button" data-pane="${id('zip')}">${icon('mail')}郵便番号</button>
<button type="button" data-pane="${id('map')}">${icon('map')}地図でピン</button>
<button type="button" data-locate>${icon('pin')}現在地</button>
</div>
<div class="finder-pane" id="${id('text')}"><div class="finder-row"><input id="${id('q-text')}" type="search" data-role="q-text" placeholder="例: 名古屋市中川区、瑞浪市、栄駅" autocomplete="off" aria-label="市区町村名・住所・駅名"><button type="button" class="btn" data-role="q-go">検索</button></div></div>
<div class="finder-pane" id="${id('zip')}" hidden><div class="finder-row"><input id="${id('q-zip')}" type="text" data-role="q-zip" inputmode="numeric" placeholder="例: 4540011" maxlength="8" aria-label="郵便番号"><button type="button" class="btn" data-role="q-zip-go">この住所の相場</button></div></div>
<div class="finder-pane" id="${id('map')}" hidden><div class="map" data-role="map"></div><div class="map-hit" data-role="map-hit" hidden></div><p class="small muted" style="margin-top:6px">地図をタップするとピンが立ちます。ピンはドラッグで動かせます。</p></div>
<ul class="q-results" data-role="q-results"></ul>
<p class="locate-msg" data-role="locate-msg" hidden></p>`;
}

// 査定ボタン。/go/<id>?src=<置き場所> を経由してアフィリエイト先へ（どのボタンが押されたかログに残る）
function goUrl(id, src) {
  return `/go/${id}?src=${encodeURIComponent(src)}`;
}
function ctaButton(size, src = 'cta', { id = 'main', label = config.affiliate.label, ribbon = 'かんたん60秒入力' } = {}) {
  const cls = `cta-btn${size === 'small' ? ' small' : ''}`;
  const inner = `${size === 'small' ? '' : '<span class="free">無料</span>'}${esc(label)}${icon('trend')}`;
  const btn = `<a class="${cls}" href="${goUrl(id, src)}" target="_blank" rel="sponsored noopener" data-go>${inner}</a>`;
  return size === 'small' ? btn : `<span class="cta-wrap"><span class="ribbon orange">${esc(ribbon)}</span>${btn}</span>`;
}
function assure() {
  return `<div class="assure"><span>${icon('yen')}完全無料</span><span>${icon('clock')}入力は約60秒</span><span>${icon('compare')}複数社をまとめて比較</span><span>${icon('shield')}合わない会社は断ってOK</span></div>`;
}

// 物件の種類と地域に合わせて、向いている査定サービスを順に並べる
function rankServices(mainType, isUrban) {
  const tags = [mainType, isUrban ? 'urban' : 'rural'];
  return [...config.services].sort((a, b) => tags.filter((t) => b.fit.includes(t)).length - tags.filter((t) => a.fit.includes(t)).length);
}

// ヒーロー右の「今すぐ」カード（マンションマーケット型）。種別を選んでそのまま査定へ、または先に目安
function heroCtaCard(place, types) {
  return `<div class="hero-cta-card">
<p class="eyebrow">${esc(place)}の物件をお持ちの方へ</p>
<h3>いくらで売れるか、今すぐ確かめる</h3>
<div class="hero-types">${types.map((s, i) => `<button type="button" class="hero-type${i === 0 ? ' active' : ''}" data-hero-type="${s.key}">${icon(TYPE_ICON[s.key])}${TYPE_SHORT[s.key]}</button>`).join('')}</div>
${ctaButton('', 'hero')}
<button type="button" class="btn ghost block" data-quick>${icon('calc')}先に目安だけ見る（10秒・登録不要）</button>
<p class="small muted">査定は無料。売るかどうかは、金額を見てから決められます。</p>
</div>`;
}

// 「結論」カード（mybest型）。この地域・種別に一番合うサービスを冒頭に
function conclusionCard(place, mainType, isUrban) {
  const s = rankServices(mainType, isUrban)[0];
  return `<section class="conclusion">
<div class="conclusion-head"><span class="ribbon">結論</span><h2>${esc(place)}の${esc(TYPES[mainType].label)}を売るなら、まず <b>${esc(s.name)}</b></h2></div>
<div class="conclusion-body">
<div class="conclusion-ill">${img('agent.webp', '', 220, 242)}</div>
<div class="conclusion-main">
<p class="conclusion-tag">${esc(s.tagline)}｜提携 ${esc(s.partners)}｜${esc(s.max)}に同時依頼</p>
<ul class="svc-points">${s.points.map((p) => `<li>${icon('check')}${esc(p)}</li>`).join('')}</ul>
<div class="conclusion-actions">${ctaButton('', 'conclusion', { id: s.id, label: `${s.name}で無料査定` })}<a class="rail-link" href="#services">他のサービスと比べる ↓</a></div>
</div>
</div>
</section>`;
}

// 「あなたに合うのはどれ？」の分岐（マネカイのフローチャート型）
function chooserSection() {
  const by = (id) => config.services.find((s) => s.id === id);
  const items = [
    ['都市部のマンション・戸建てを、できるだけ高く', '大手6社の販売力で買い手を探す', by('sumai-value')],
    ['地方の土地・実家・築年数の古い家', '地元の業者まで含めて幅広く声をかける', by('ieul')],
    ['営業電話が不安。まず金額だけ知りたい', 'メールだけで依頼できる匿名査定', by('homes')],
    ['初めての売却で、運営元で選びたい', 'NTTデータグループ運営、2001年開始', by('home4u')],
  ];
  return `<section class="chooser"><div class="section-head"><h2>あなたに合う査定サービスは？</h2><p>当てはまるものを選ぶだけ</p></div>
<div class="chooser-grid">${items.map(([q, why, s]) => `<a class="choice" href="${goUrl(s.id, 'chooser')}" target="_blank" rel="sponsored noopener" data-go><span class="choice-q">${esc(q)}</span><span class="choice-a">→ ${esc(s.name)}</span><span class="small muted">${esc(why)}</span><span class="choice-btn">無料で査定 ${icon('trend')}</span></a>`).join('')}</div></section>`;
}

// 比較表（各行に公式ボタン）＋カード
function servicesSection(place, mainType, isUrban) {
  const ranked = rankServices(mainType, isUrban);
  const rows = ranked
    .map((s, i) => `<tr${i === 0 ? ' class="top"' : ''}><td><b>${esc(s.name)}</b>${i === 0 ? `<span class="svc-rank">${esc(place)}向き</span>` : ''}<br><span class="small muted">${esc(s.tagline)}</span></td><td class="n">${esc(s.partners)}</td><td class="n">${esc(s.max)}</td><td>${esc(s.good)}</td><td><a class="cta-btn small" href="${goUrl(s.id, 'table')}" target="_blank" rel="sponsored noopener" data-go>無料査定</a></td></tr>`)
    .join('\n');
  return `<section id="services"><div class="section-head"><h2>査定サービスを比べる</h2><p>${esc(place)}の${esc(TYPES[mainType].label)}に合う順</p></div>
<div class="scroll"><table class="svc-table"><thead><tr><th>サービス</th><th class="n">提携社数</th><th class="n">同時依頼</th><th>向いている人</th><th></th></tr></thead><tbody>
${rows}
</tbody></table></div>
<p class="small muted" style="margin-top:10px">各社の特徴は公式サイトの公開情報（${YEAR}年10月時点）です。2〜3社に同時に依頼して金額を並べるのが、損をしない使い方です。当サイトが代理で申し込むことはありません。</p>
<script id="services-data" type="application/json">${JSON.stringify({ urban: isUrban, list: config.services.map((s) => ({ id: s.id, name: s.name, tagline: s.tagline, fit: s.fit })) }).replace(/</g, '\\u003c')}</script>
</section>`;
}

function diffSection(place, records) {
  const sp = spread(records, 'mansion') ?? spread(records, 'house');
  if (!sp) return '';
  const max = sp.high * 1.05;
  const row = (lbl, v, cls) => `<div class="diff-row"><span class="lbl">${lbl}</span><div class="diff-bar ${cls}"><i style="--w:${Math.round((v / max) * 100)}%"></i><b>${man(v)}</b></div></div>`;
  return `<section class="diff" id="diff">
<div class="diff-main">
<div class="section-head"><h2>同じ${esc(place)}でも、<br class="sp">売れた値段はここまで違う</h2></div>
<p class="small muted">直近3年の${sp.count}件を単価で並べ、${Math.round(sp.area)}㎡の物件に換算しました。</p>
<div class="diff-rows">
${row('安く売れた例<br><span class="small">（下位25%）</span>', sp.low, '')}
${row('真ん中', sp.mid, 'mid')}
${row('高く売れた例<br><span class="small">（上位25%）</span>', sp.high, 'hi')}
</div>
<div class="diff-foot"><p>立地や築年数の違いはあります。それでも、似たような家が<mark>誰に任せるかで数百万円変わる</mark>のが不動産です。1社の査定で決めず、並べて比べる。それだけで下の側に入る確率は減らせます。</p><div class="diff-badge">差額<b>${man(sp.high - sp.low)}</b></div></div>
<div class="diff-cta">${ctaButton('', 'diff')}</div>
</div>
<div class="diff-ill">${img('consult.webp', '不動産会社に相談する夫婦', 460, 295)}</div>
</section>`;
}

function ctaBlock(place) {
  return `<aside class="cta" id="cta">
<div class="cta-ill">${img('agent.webp', '案内する担当者', 300, 330)}</div>
<div class="cta-main">
<p class="eyebrow">ここまで読んだあなたへ</p>
<h2>相場が分かったら、次は「自分の家の値段」を知る番です</h2>
<p>${esc(place)}の相場は、あくまで地域の平均的な姿です。あなたの家がその上に来るか下に来るかは、査定を取ってみないと分かりません。複数社の金額を並べると、どの会社が本気で売ろうとしているかまで見えてきます。</p>
<div class="cta-actions">${ctaButton('', 'block')}${assure()}</div>
</div>
</aside>`;
}

function worriesSection(place, oldN) {
  return `<section class="worries"><div class="section-head"><h2>こんな不安はありませんか</h2></div>
<div class="worries-grid">
<div class="worry">${img('worried.webp', '売却に悩む夫婦', 300, 356)}<ul><li>いくらで売れるのか、見当がつかない</li><li>1社に頼んで、安く買い叩かれないか</li><li>営業電話がしつこそうで怖い</li><li>古い家でも買い手がつくのか</li></ul></div>
<div class="worries-arrow" aria-hidden="true">▶</div>
<div class="worry ok">${img('relieved.webp', '安心した夫婦', 300, 377)}<ul><li>${esc(place)}で<mark>実際に売れた価格</mark>と目安が、このページで分かる</li><li>複数社の査定を並べれば、安すぎる提示はすぐに見抜ける</li><li>合わない会社は断ってよい。匿名で依頼できるサービスもある</li><li>${oldN >= 5 ? `${esc(place)}では直近3年に、築30年以上の家が<b>${oldN}件</b>売れている` : '建物が古くても、土地の価値で売れる例が多い'}</li></ul></div>
</div></section>`;
}

function trendBadge(records) {
  for (const type of ['mansion', 'house', 'land']) {
    const t = trend(records, type);
    if (t == null) continue;
    const cls = deltaCls(t);
    const label = { up: '上昇傾向', down: '下落傾向', flat: '横ばい' }[cls];
    return { cls, text: `${TYPES[type].label}の坪単価 3年前比 ${pct(t)}（${label}）` };
  }
  return null;
}

function heroBlock({ crumbs, h1, lead, chips = [], stats = [], side = '' }) {
  return `<section class="hero"><div class="wrap">
<div>
<nav class="crumbs" aria-label="現在地"><a href="/">トップ</a>${crumbs.map((c, i) => (i === crumbs.length - 1 ? `<span>›</span><span>${esc(c.name)}</span>` : `<span>›</span><a href="${esc(c.url)}">${esc(c.name)}</a>`)).join('')}</nav>
<h1>${h1}</h1>
<p class="lead">${lead}</p>
${chips.length ? `<div class="hero-chips">${chips.join('')}</div>` : ''}
${stats.length ? `<div class="hero-stats">${stats.map((s) => `<div><span class="k">${esc(s.k)}</span><span class="v num" data-count>${s.v}</span>${s.sub ? `<span class="s">${s.sub}</span>` : ''}</div>`).join('')}</div>` : ''}
</div>
${side}
</div></section>`;
}

function stepsSection(done) {
  const step = (no, title, body, pic, alt, isDone) => `<div class="step${isDone ? ' done' : ''}"><div class="step-top"><span class="no"><small>STEP</small>${no}</span>${title}</div><div class="step-body">${img(pic, alt, 240, 180, 'step-ill')}<p class="small">${body}</p></div></div>`;
  return `<section><div class="section-head"><h2>高く売る人がやっている3つのこと</h2></div><div class="steps">
${step('01', '相場を知る', done ? 'このページで、地域の実際の取引価格と動きをつかみました。' : 'まず地域の実際の取引価格と動きをつかむ。', 'smartphone.webp', 'スマホで相場を調べる', done)}
${step('02', '査定は2〜3社に同時に頼む', '1社の金額だけでは高いか安いか判断できません。並べて初めて、相場のどこにいるかが分かります。', 'consult.webp', '複数の不動産会社に相談する', false)}
${step('03', '金額の根拠で会社を選ぶ', '高い金額を出す会社が良い会社とは限りません。根拠を具体的に説明できる会社を選ぶと、売り出し後の値下げを避けられます。', 'handshake.webp', '納得して契約する', false)}
</div><div class="steps-cta">${ctaButton('', 'steps')}${assure()}</div></section>`;
}

function railCard(place, records, siblings, area, mainType, isUrban) {
  const recentN = records.filter((r) => r.q >= recentFrom(records, 4)).length;
  const best = rankServices(mainType, isUrban)[0];
  const links = [area.parent ? { name: area.parent.name, url: href(area.parent.path) } : null, { name: area.pref.name + 'の市区町村一覧', url: href(area.pref.slug) }, ...siblings.slice(0, 6).map((s) => ({ name: s.name, url: href(s.path) }))].filter(Boolean);
  return `<div class="rail-card accent">
<p class="eyebrow">${esc(place)}</p>
<h3>査定額を並べて、相場より高く売る</h3>
<p class="small">直近1年で<b class="num">${recentN}</b>件の取引がある地域です。複数社の金額を比べると、自分の家の立ち位置が分かります。</p>
<ul class="rail-points"><li>${icon('yen')}完全無料・約60秒</li><li>${icon('compare')}複数社にまとめて依頼</li><li>${icon('shield')}合わない会社は断ってOK</li></ul>
${ctaButton('small', 'rail')}
</div>
<div class="rail-card svc-mini">
<span class="svc-rank">${esc(TYPES[mainType].label)}向き</span>
<h3>${esc(best.name)}</h3>
<p class="small">${esc(best.tagline)}。提携${esc(best.partners)}、${esc(best.max)}に同時依頼。</p>
<a class="btn block" href="${goUrl(best.id, 'rail-fit')}" target="_blank" rel="sponsored noopener" data-go>公式サイトで無料査定</a>
<a class="rail-link" href="#services">他のサービスと比べる →</a>
</div>
<div class="rail-card">
<h3>${icon('calc')} 先に目安を知りたい</h3>
<p class="small">面積と築年数から、似た取引で価格帯を出します。</p>
<a class="btn ghost block" href="#calc-section">10秒で目安を見る</a>
</div>
<div class="rail-card">
<h3>近くの地域</h3>
<ul class="rail-list">${links.map((l) => `<li><a href="${esc(l.url)}">${esc(l.name)}</a></li>`).join('')}</ul>
</div>`;
}

function areaPage({ area, records, all, children, district, siblings, districtPaths }) {
  const place = district ? `${area.full}${district}` : area.full;
  const path = district ? districtPaths.get(district) : area.path;
  const summaries = summarize(records);
  const qs = quarters(records);
  const range = qs.length ? `${qLabel(qs[0])}〜${qLabel(qs.at(-1))}` : '';
  const main = summaries.find((s) => s.price) ?? summaries[0];
  const mainType = main.key;
  const badge = trendBadge(records);
  const recentN = records.filter((r) => r.q >= recentFrom(records, 4)).length;
  const yr = yearly(records);
  // 都市部の判定：政令市の区、またはマンション取引が十分にある（200件以上かつ全体の2割以上）
  const mansionN = summaries.find((s) => s.key === 'mansion')?.count ?? 0;
  const isUrban = !!area.parent || (mansionN >= 200 && mansionN / records.length >= 0.2);
  const types = summaries.filter((s) => s.count >= 3);

  const thin = summaries.filter((s) => s.count && s.count < 5);
  const cards = summaries
    .filter((s) => s.count >= 5)
    .map((s) => {
      const t = trend(records, s.key);
      const series = yr.series.find((x) => x.key === s.key);
      return `<div class="card">
<div class="head">${icon(TYPE_ICON[s.key], 'lg')}${esc(s.label)}</div>
<div class="card-main"><div><p class="big" data-count>${man(s.price)}</p><p class="delta ${deltaCls(t)}">${t == null ? '<span class="muted">3年前比 —</span>' : `${arrow(t)} ${pct(t)} <span class="muted">3年前比</span>`}</p></div>${sparkline(series?.values ?? [], TYPE_CLS[s.key])}</div>
<dl><dt>坪単価</dt><dd>${manTsubo(s.tsubo)}</dd><dt>面積の中央値</dt><dd>${s.area ? Math.round(s.area) + '㎡' : '—'}</dd><dt>取引件数（10年）</dt><dd>${s.count.toLocaleString()}件</dd><dt>直近1年</dt><dd>${s.recent}件</dd></dl></div>`;
    })
    .join('');
  const thinNote = thin.length ? `<p class="small muted" style="margin-top:10px">${thin.map((s) => `${esc(s.label)}は取引が${s.count}件のみのため、統計を出していません。`).join('')}</p>` : '';

  const trendChart = lineChart({ title: `坪単価の推移（年ごとの中央値）`, labels: yr.labels, series: yr.series.filter((s) => s.values.some((v) => v != null)).map((s) => ({ label: s.label, cls: TYPE_CLS[s.key], values: s.values })), fmt: (v) => `${v}万`, note: '単位：万円/坪。取引が5件未満の年は表示していません。' });
  const countChart = district ? '' : barChart({ title: `取引件数の推移`, bars: yr.years.map((y, i) => ({ label: yr.labels[i], value: yr.series.reduce((a, s) => a + s.counts[i], 0) })), fmt: (v) => `${v}件`, cls: 's4' });
  const ageType = summaries.find((s) => s.key === 'mansion')?.count >= 20 ? 'mansion' : 'house';
  const ageChart = district ? '' : barChart({ title: `築年数別の坪単価（${TYPES[ageType].label}・直近5年）`, bars: ageCurve(records, ageType), fmt: (v) => `${v}万`, cls: 's2', note: '築年数が進むほど単価がどう下がるかの目安です。' });

  const districtLink = (name) => (districtPaths.has(name) ? `<a href="${href(districtPaths.get(name))}">${esc(name)}</a>` : esc(name));
  const barCell = (v, max) => (v == null ? '<td class="n">—</td>' : `<td class="n bar-cell"><span class="bar" style="--w:${Math.round((v / max) * 100)}%"></span>${manTsubo(v)}</td>`);
  let listSection = '';
  if (children) {
    const max = Math.max(...children.map((c) => c.summary[0].tsubo ?? 0), 1);
    listSection = `<section><div class="section-head"><h2>区ごとの相場</h2><p>区名を選ぶと、地区別の相場と計算機が使えます</p></div><div class="scroll"><table><thead><tr><th>区</th><th class="n">中古マンション</th><th class="n">マンション坪単価</th><th class="n">戸建て</th><th class="n">件数</th></tr></thead><tbody>
${children.map((c) => `<tr><td><a href="${href(c.area.path)}">${esc(c.area.short)}</a></td><td class="n">${man(c.summary[0].price)}</td>${barCell(c.summary[0].tsubo, max)}<td class="n">${man(c.summary[1].price)}</td><td class="n">${c.records.length.toLocaleString()}</td></tr>`).join('\n')}
</tbody></table></div></section>`;
  } else if (!district) {
    const tabs = summaries.map((s, i) => `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-tab="${s.key}">${esc(s.label)}</button>`).join('');
    const tables = summaries
      .map((s, i) => {
        const rows = byDistrict(records.filter((r) => r.t === s.key));
        const max = Math.max(...rows.map((d) => d.tsubo ?? 0), 1);
        return `<div class="tab-panel" data-panel="${s.key}"${i === 0 ? '' : ' hidden'}>${
          rows.length
            ? `<div class="scroll"><table><thead><tr><th>地区</th><th class="n">中央値</th><th class="n">坪単価</th><th class="n">件数</th></tr></thead><tbody>
${rows.map((d) => `<tr><td>${districtLink(d.name)}</td><td class="n">${man(d.price)}</td>${barCell(d.tsubo, max)}<td class="n">${d.count}</td></tr>`).join('\n')}
</tbody></table></div>`
            : '<p class="notice">取引件数が少ないため表示できません。</p>'
        }</div>`;
      })
      .join('');
    listSection = `<section><div class="section-head"><h2>地区別の相場</h2><p>取引が${config.minDistrict}件以上の地区はリンクになっています</p></div><div class="tabs">${tabs}</div>${tables}</section>`;
  } else {
    const others = [...districtPaths.keys()].filter((d) => d !== district);
    listSection = others.length ? `<section><div class="section-head"><h2>${esc(area.name)}のほかの地区</h2></div><ul class="link-list">${others.map((d) => `<li>${districtLink(d)}</li>`).join('')}</ul></section>` : '';
  }

  const recent = [...records].sort((a, b) => b.q.localeCompare(a.q)).slice(0, district ? 20 : 30);
  const recentRows = recent.map((r) => `<tr><td>${esc(qLabel(r.q))}</td><td>${esc(TYPES[r.t].label)}</td><td>${esc(r.d || '—')}</td><td class="n">${man(r.p)}</td><td class="n">${r.a ?? '—'}㎡</td><td class="n">${r.y ?? '—'}</td></tr>`).join('\n');

  const calcSection = children
    ? `<section class="calc" id="calc-section"><div class="calc-head"><span class="ribbon">無料・10秒・登録不要</span><h2>あなたの物件の目安を出す</h2></div><p class="small muted" style="padding:16px 20px 0">区を選ぶと、その区の取引事例から目安を計算できます。</p><div class="ward-pick">${children.map((c) => `<a href="${href(c.area.path)}#calc-section">${esc(c.area.short)}</a>`).join('')}</div></section>`
    : `<section class="calc" id="calc-section">
<div class="calc-head"><span class="ribbon">無料・10秒・登録不要</span><h2>あなたの物件の目安を出す</h2></div>
<div class="calc-body">
<p class="small muted">${esc(place)}で実際に売れた事例のうち、条件の近いものから計算します。入力した内容はどこにも送られません。</p>
<div class="calc-grid">
<form id="calc" data-code="${area.code}" data-cta-label="${esc(config.affiliate.label)}" data-place="${esc(place)}">
<div class="step-label"><span class="no">1</span>物件の種別</div>
<div class="type-pick">${types.map((s, i) => `<label><input type="radio" name="type" value="${s.key}"${i === 0 ? ' checked' : ''}>${icon(TYPE_ICON[s.key], 'lg')}${TYPE_SHORT[s.key]}</label>`).join('')}</div>
<div class="step-label"><span class="no">2</span>物件の条件</div>
<label class="field">地区<select name="district" id="calc-district"><option value="">指定しない</option>${[...new Set(all.map((r) => r.d).filter(Boolean))].sort().map((d) => `<option${d === district ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
<div class="two">
<label class="field"><span><span id="area-label">専有面積</span>（㎡）</span><input name="area" id="calc-area" type="number" min="1" step="0.1" required placeholder="例: 65"></label>
<label class="field" id="built-wrap">建築年（西暦）<input name="built" id="calc-built" type="number" min="1900" max="2100" placeholder="例: 2005"></label>
</div>
<button type="submit" class="calc-submit">目安を出す ▶</button>
</form>
<div id="calc-result" class="result empty"><p>${icon('calc', 'lg')}</p><p>種別・面積・建築年を入れると、<br>似た条件の取引から価格帯が出ます。</p></div>
</div>
</div>
</section>`;

  const oldN = oldCount(records);
  const faq = [
    ['このページの相場と、不動産会社の査定額は何が違いますか？', `相場は過去の取引の真ん中の値で、「この地域ならだいたいこのくらい」という目安です。査定額は、あなたの物件の状態・階数・向き・日当たり・管理状況を見て、不動産会社が「この金額なら売れる」と見積もる金額です。${esc(place)}の相場から数百万円ずれることは珍しくありません。`],
    ['一括査定は本当に無料ですか？', '無料です。不動産会社は売却を任された場合に仲介手数料を得る仕組みなので、査定の段階で費用はかかりません。'],
    ['申し込むと営業の連絡は来ますか？', '来ます。依頼した複数の会社から電話やメールが届きます。合わない会社には「他社に決めました」と伝えて断って問題ありません。連絡方法を選べるサービスや、匿名で依頼できるサービスもあります。'],
    ['築年数が古くても売れますか？', oldN >= 5 ? `${esc(place)}では直近3年に、築30年以上の建物付き物件が${oldN}件取引されています。建物の価値が低くても、土地の価値で売れるケースが多くあります。` : '建物の価値が低くても、土地の価値で売れるケースが多くあります。解体の要否も含めて、不動産会社に相談するのが近道です。'],
    ['データの出典は？', '国土交通省「不動産情報ライブラリ」が公開している実際の取引価格です。関係者間の取引や競売など、相場からかけ離れやすい取引は除いて集計しています。'],
  ];
  const faqLd = { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) };
  const datasetLd = { '@type': 'Dataset', name: `${place}の不動産取引価格データ（${range}）`, description: `${place}で実際に取引された${records.length}件の価格・面積・建築年。国土交通省 不動産情報ライブラリの取引価格情報を加工。`, creator: { '@type': 'Organization', name: '国土交通省' }, temporalCoverage: qs.length ? `${qs[0].slice(0, 4)}/${qs.at(-1).slice(0, 4)}` : undefined, spatialCoverage: place, license: 'https://www.reinfolib.mlit.go.jp/help/apiManual/' };

  const crumbs = [{ name: area.pref.name, url: href(area.pref.slug) }];
  if (area.parent) crumbs.push({ name: area.parent.name, url: href(area.parent.path) });
  crumbs.push({ name: area.parent ? area.short : area.name, url: href(area.path) });
  if (district) crumbs.push({ name: district, url: href(path) });

  const hero = heroBlock({
    crumbs,
    h1: `${esc(place)}の<br class="sp">不動産売却相場`,
    lead: `${esc(range)}に実際に売れた<strong>${records.length.toLocaleString()}件</strong>から集計。${main.price ? `${esc(main.label)}の真ん中の値は<strong>${man(main.price)}</strong>。` : ''}${recentN ? `直近1年は<strong>${recentN}</strong>件が取引されています。` : ''}`,
    chips: [badge ? `<span class="chip ${badge.cls}">${icon('trend')}${esc(badge.text)}</span>` : '', `<span class="chip">${icon('data')}出典：国土交通省</span>`, `<span class="chip">${icon('clock')}更新 ${JP_DATE}</span>`].filter(Boolean),
    stats: summaries.filter((s) => s.price).map((s) => ({ k: s.label, v: man(s.price), sub: manTsubo(s.tsubo) })),
    side: heroCtaCard(area.parent ? area.short : area.name, types),
  });

  const paragraphs = prose(place, records, summaries);
  const body = `
<section><div class="section-head"><h2>種別ごとの相場</h2><p>真ん中の値（中央値）なので、極端な取引に引っ張られません</p></div>
<div class="cards">${cards || '<p class="notice">取引データが少ないため、相場の統計を出せません。</p>'}</div>${thinNote}</section>
${conclusionCard(place, mainType, isUrban)}
${calcSection}
${diffSection(place, records)}
${chooserSection()}
${worriesSection(place, oldN)}
${trendChart || countChart || ageChart ? `<section><div class="section-head"><h2>相場の動き</h2><p>10年の推移と、築年数による差</p></div><div class="charts">${trendChart}${countChart}${ageChart}</div></section>` : ''}
${ctaBlock(place)}
${paragraphs.length ? `<section class="prose"><div class="section-head"><h2>${esc(place)}の相場を読む</h2></div><p>${paragraphs[0]}</p>${paragraphs.length > 1 ? `<details class="more"><summary>データの解説をもっと読む</summary>${paragraphs.slice(1).map((p) => `<p>${p}</p>`).join('')}</details>` : ''}</section>` : ''}
${listSection}
${servicesSection(place, mainType, isUrban)}
${recent.length ? `<section><details class="more"><summary><h2>最近の取引事例（${recent.length}件）</h2></summary><div class="scroll"><table><thead><tr><th>時期</th><th>種別</th><th>地区</th><th class="n">価格</th><th class="n">面積</th><th class="n">建築年</th></tr></thead><tbody>
${recentRows}
</tbody></table></div></details></section>` : ''}
${stepsSection(true)}
<section><div class="section-head"><h2>よくある質問</h2></div><div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</div></section>
${siblings.length ? `<section><div class="section-head"><h2>近くの地域の相場</h2></div><ul class="link-list">${siblings.map((s) => `<li><a href="${href(s.path)}">${esc(s.name)}</a></li>`).join('')}</ul></section>` : ''}
<script id="district-map" type="application/json">${JSON.stringify(Object.fromEntries([...districtPaths].map(([nm, p]) => [nm, href(p)]))).replace(/</g, '\\u003c')}</script>
`;
  return layout({
    title: `${place}の不動産売却相場【${YEAR}年最新】実際の取引${records.length}件から集計`,
    description: `${place}で実際に売れた${records.length}件のデータから、中古マンション・戸建て・土地の売却相場、坪単価、10年の推移、地区別の価格をまとめました。${main.price ? `${main.label}の中央値は${man(main.price)}。` : ''}面積と築年数からあなたの物件の目安も10秒で分かります。`,
    path: href(path),
    hero,
    body,
    rail: railCard(place, records, siblings, area, mainType, isUrban),
    crumbs,
    jsonld: [faqLd, datasetLd],
    og: `/og/${area.pref.slug}.png`,
  });
}

function prefMapValues() {
  const out = {};
  for (const p of prefSummaries) {
    const s = p.summary[0].tsubo ?? p.summary[1].tsubo;
    out[p.pref.code] = { v: s, label: s ? `${Math.round(s / 10000)}万` : '', href: href(p.pref.slug), title: s ? `${p.summary[0].tsubo ? '中古マンション' : '戸建て'} ${manTsubo(s)}` : '' };
  }
  return out;
}

function prefPage(pref, records, rows) {
  const summaries = summarize(records);
  const mainType = (summaries.find((s) => s.price) ?? summaries[0]).key;
  const isUrban = (summaries[0].count ?? 0) > (summaries[2].count ?? 0);
  const yr = yearly(records);
  const chart = lineChart({ title: `${pref.name}の坪単価の推移（年ごとの中央値）`, labels: yr.labels, series: yr.series.filter((s) => s.values.some((v) => v != null)).map((s) => ({ label: s.label, cls: TYPE_CLS[s.key], values: s.values })), fmt: (v) => `${v}万` });
  const max = Math.max(...rows.map((r) => r.summary[0].tsubo ?? 0), 1);
  const barCell = (v) => (v == null ? '<td class="n">—</td>' : `<td class="n bar-cell"><span class="bar" style="--w:${Math.round((v / max) * 100)}%"></span>${manTsubo(v)}</td>`);
  const table = rows
    .map((r) => `<tr><td><a href="${href(r.area.path)}">${esc(r.area.name)}</a></td><td class="n">${man(r.summary[0].price)}</td>${barCell(r.summary[0].tsubo)}<td class="n">${man(r.summary[1].price)}</td><td class="n">${manTsubo(r.summary[2].tsubo)}</td><td class="n">${r.count.toLocaleString()}</td></tr>` + r.wards.map((w) => `<tr><td class="indent"><a href="${href(w.path)}">${esc(w.short)}</a></td><td colspan="5"></td></tr>`).join(''))
    .join('\n');
  const hero = heroBlock({
    crumbs: [{ name: pref.name, url: href(pref.slug) }],
    h1: `${esc(pref.name)}の不動産売却相場`,
    lead: `${esc(pref.name)}で実際に売れた<strong>${records.length.toLocaleString()}件</strong>から、${rows.length}市区町村の相場をまとめました。市区町村を選ぶと、地区別の相場と<mark>あなたの物件の目安</mark>が分かります。`,
    chips: [`<span class="chip">${icon('data')}出典：国土交通省</span>`, `<span class="chip">${icon('clock')}更新 ${JP_DATE}</span>`],
    stats: summaries.filter((s) => s.price).map((s) => ({ k: s.label, v: man(s.price), sub: manTsubo(s.tsubo) })),
    side: heroCtaCard(pref.name, summaries.filter((s) => s.count >= 3)),
  });
  const paragraphs = prose(pref.name, records, summaries);
  const body = `
<section><div class="section-head"><h2>市区町村を選ぶ</h2><p>名前を選ぶと、地区別の相場と計算機が使えます</p></div><div class="scroll"><table><thead><tr><th>市区町村</th><th class="n">中古マンション</th><th class="n">マンション坪単価</th><th class="n">戸建て</th><th class="n">土地（坪単価）</th><th class="n">件数</th></tr></thead><tbody>
${table}
</tbody></table></div></section>
${conclusionCard(pref.name, mainType, isUrban)}
${diffSection(pref.name, records)}
${chooserSection()}
${chart ? `<section><div class="section-head"><h2>${esc(pref.name)}の相場の動き</h2></div><div class="charts">${chart}</div></section>` : ''}
${ctaBlock(pref.name)}
${paragraphs.length ? `<section class="prose"><div class="section-head"><h2>${esc(pref.name)}の相場を読む</h2></div><p>${paragraphs[0]}</p>${paragraphs.length > 1 ? `<details class="more"><summary>データの解説をもっと読む</summary>${paragraphs.slice(1).map((p) => `<p>${p}</p>`).join('')}</details>` : ''}</section>` : ''}
${servicesSection(pref.name, mainType, isUrban)}
<section><div class="section-head"><h2>ほかの都道府県</h2><p>中古マンションの坪単価で色分け</p></div>${japanMap(prefMapValues(), { current: pref.code, caption: '坪単価' })}</section>
`;
  return layout({
    title: `${pref.name}の不動産売却相場【${YEAR}年最新】市区町村別の価格と10年の推移`,
    description: `${pref.name}の市区町村ごとの不動産売却相場。実際に売れた${records.length}件から、中古マンション・戸建て・土地の中央値と坪単価、10年の推移をまとめました。`,
    path: href(pref.slug),
    hero,
    body,
    crumbs: [{ name: pref.name, url: href(pref.slug) }],
    og: `/og/${pref.slug}.png`,
  });
}

function indexPage() {
  const byCode = new Map(prefSummaries.map((p) => [p.pref.code, p]));
  const regions = REGIONS.map((r) => {
    const items = r.prefs.filter((p) => byCode.has(p.code)).map((p) => `<li><a href="${href(p.slug)}">${esc(p.name)}</a></li>`).join('');
    return items ? `<div class="region"><h3>${esc(r.name)}</h3><ul>${items}</ul></div>` : '';
  }).join('');
  const sorted = [...prefSummaries].filter((p) => p.summary[0].price).sort((a, b) => b.summary[0].tsubo - a.summary[0].tsubo);
  const max = sorted[0]?.summary[0].tsubo ?? 1;
  const ranking = sorted.map((p, i) => `<tr><td class="n">${i + 1}</td><td><a href="${href(p.pref.slug)}">${esc(p.pref.name)}</a></td><td class="n">${man(p.summary[0].price)}</td><td class="n bar-cell"><span class="bar" style="--w:${Math.round((p.summary[0].tsubo / max) * 100)}%"></span>${manTsubo(p.summary[0].tsubo)}</td><td class="n">${man(p.summary[1].price)}</td><td class="n">${p.count.toLocaleString()}</td></tr>`).join('\n');
  const muniCount = prefSummaries.reduce((a, p) => a + p.munis, 0);
  const hero = `<section class="hero hero-top"><div class="wrap">
<div>
<div class="hero-badges">
<div class="medal"><span class="m-top">国交省の</span><span class="m-num"><b data-count>${Math.floor(totalRecords / 10000).toLocaleString()}</b><small>万件</small></span><span class="m-bot">実取引データ</span></div>
<div class="medal"><span class="m-top">全国</span><span class="m-num"><b data-count>${muniCount.toLocaleString()}</b></span><span class="m-bot">市区町村</span></div>
<div class="medal"><span class="m-top">最長</span><span class="m-num"><b data-count>10</b><small>年分</small></span><span class="m-bot">の価格推移</span></div>
</div>
<h1>あなたの家、<br class="sp">いま<em class="hl">いくら</em>で売れる？</h1>
<p class="lead">広告でも推計でもない、<mark>実際に売れた価格だけ</mark>で作った相場です。市区町村と面積・築年数を入れれば、10秒であなたの物件の価格帯が分かります。登録は不要、すべて無料です。</p>
</div>
<div class="hero-ill">${img('hero.webp', '家の売却を考える家族', 520, 399, '', true)}</div>
</div>
<div class="wrap">
<div class="search-card"><div class="seal" aria-hidden="true"><span>かんたん</span><b>10</b><span>秒</span></div>
<p class="search-card-head"><span>実際に売れた価格で、</span><span><em>相場</em>がわかる！</span><span><em>査定額</em>と比べられる！</span></p>
${finderInner('top-')}
<p class="hint">市区町村名・住所・駅名・郵便番号のどれでも。現在地からなら1タップです。</p>
</div>
</div>
<div class="city-band">${img('city.webp', '', 1000, 229, 'city-ill')}</div>
</section>`;
  const body = `
<section id="prefs"><div class="section-head"><h2>地図から選ぶ</h2><p>中古マンションの坪単価で色分け。タップで都道府県ページへ</p></div>${japanMap(prefMapValues(), { caption: '坪単価' })}</section>
<section><div class="section-head"><h2>都道府県から選ぶ</h2></div><div class="regions">${regions}</div></section>
${chooserSection()}
<section><div class="section-head center"><h2>このサイトが違う3つの点</h2></div><div class="reasons">
<div class="reason"><span class="no">01</span><h3>推計ではなく、実際に売れた価格</h3><p class="reason-lead">集計した実際の取引</p><b class="num" data-count>${totalRecords.toLocaleString()}<small>件</small></b>${img('icon-data.webp', '', 110, 109, 'reason-icon')}<p class="small">国土交通省が公開する取引記録だけを集計。広告主の数字は使いません。</p></div>
<div class="reason"><span class="no">02</span><h3>10秒で、あなたの物件の価格帯</h3><p class="reason-lead">面積と築年数を入れるだけ</p><b class="num">0<small>円・登録不要</small></b>${img('icon-time.webp', '', 110, 81, 'reason-icon')}<p class="small">入力内容はブラウザの外に送りません。営業電話がかかってくることもありません。</p></div>
<div class="reason"><span class="no">03</span><h3>町名の単位まで分かる</h3><p class="reason-lead">相場を調べられる地域</p><b class="num" data-count>${muniCount.toLocaleString()}<small>市区町村</small></b>${img('icon-map.webp', '', 110, 110, 'reason-icon')}<p class="small">市区町村・区・町名ごとに、中央値・坪単価・10年の推移を確認できます。</p></div>
</div></section>
<section><div class="section-head"><h2>都道府県別の相場</h2><p>中古マンションの坪単価が高い順</p></div><div class="scroll"><table><thead><tr><th class="n">#</th><th>都道府県</th><th class="n">中古マンション</th><th class="n">坪単価</th><th class="n">戸建て</th><th class="n">件数</th></tr></thead><tbody>
${ranking}
</tbody></table></div></section>
${stepsSection(false)}
`;
  return layout({
    title: `${config.siteName}｜${config.tagline}`,
    description: `国土交通省の約10年分・${totalRecords.toLocaleString()}件の不動産取引データから、全国の市区町村・地区ごとの売却相場と、あなたの物件の目安を無料で確認できます。`,
    path: '/',
    hero,
    body,
  });
}

function staticPages() {
  const owner = config.owner.name || '（運営者名は準備中です）';
  const email = config.owner.email;
  const about = `
<section class="prose"><div class="section-head"><h2>このサイトの方針</h2></div>
<p>${esc(config.siteName)}は、国土交通省が公開する実際の不動産取引価格をもとに、全国の市区町村・地区ごとの売却相場を誰でも無料で確認できるようにしたサイトです。</p>
<p>相場を知らないまま1社の査定額だけで売却を決めると、数百万円単位で損をすることがあります。このサイトは「まず自分の地域の本当の取引価格を知り、そのうえで複数社の査定を比べる」という順番を勧めています。</p>
<ul><li>掲載する数値はすべて実際の取引記録から算出し、推計や広告主の提供値は使いません。</li><li>件数が少ない地域・種別は統計を出さず、誤解を招く表示を避けます。</li><li>査定サービスの紹介はアフィリエイト広告ですが、物件の種類と地域に合うものを優先して並べます。</li></ul></section>
<section class="prose"><div class="section-head"><h2>運営者</h2></div><p>運営者：${esc(owner)}</p>${config.owner.about ? `<p>${esc(config.owner.about)}</p>` : ''}</section>
<section class="prose" id="contact"><div class="section-head"><h2>お問い合わせ</h2></div><p>データの誤り、掲載内容、提携のご相談は${email ? `メール（<span class="num">${esc(email)}</span>）` : 'メール（準備中）'}でお願いします。相場の数値は自動集計のため、個別の物件の査定にはお答えできません。</p></section>
<section class="prose"><div class="section-head"><h2>データの出典と加工方法</h2></div>
<p>国土交通省「不動産情報ライブラリ」の不動産取引価格情報・成約価格情報をAPIで取得し、直近約10年分を四半期ごとに集計しています。中古マンション・戸建て（土地と建物）・土地の3種別を対象とし、関係者間取引・調停や競売・隣地の購入など、相場からかけ離れやすい取引は除外しています。中央値・坪単価・築年数別の集計はすべて当サイト独自の計算です。地図は国土地理院のタイルを使用しています。イラストは当サイトのオリジナルで、画像生成AI（Google Nano Banana）で作成しています。</p></section>`;
  const privacy = `
<section class="prose"><div class="section-head"><h2>プライバシーポリシー</h2></div>
<p><b>個人情報の収集について</b><br>当サイトは会員登録や入力フォームによる個人情報の収集を行いません。「目安を出す」で入力した面積や建築年は、お使いのブラウザの中だけで計算され、当サイトのサーバーには送信されません。</p>
<p><b>位置情報について</b><br>「現在地」ボタンを押した場合に限り、ブラウザの位置情報を使って住所（町名）を判定します。緯度・経度は国土地理院の住所検索サービスに送られますが、当サイトで保存することはありません。</p>
<p><b>外部サービス</b><br>地図の表示に国土地理院のタイル、住所・郵便番号の検索に国土地理院および zipcloud のサービス、フォントの表示に Google Fonts を利用しています。これらのサービスへの接続時に、お使いの端末のIPアドレス等がそれぞれの事業者に送信されます。</p>
<p><b>広告とリンクの記録について</b><br>当サイトはアフィリエイトプログラムに参加しており、査定サービスへのリンクを経由して申し込みがあった場合に報酬を受け取ることがあります。査定サービスへのリンクは当サイトの転送ページ（/go/）を経由し、どのボタンが押されたか（サービス名・ページ内の位置・参照元・ブラウザの種類・国）を統計目的で記録します。氏名や連絡先は含みません。リンク先での入力情報は、各サービスのプライバシーポリシーに従って扱われます。当サイトが代理で申し込みを行うことはありません。</p>
<p><b>アクセス解析</b><br>現在、Cookie を用いたアクセス解析ツールは使用していません。導入する場合はこのページで告知します。</p></section>
<section class="prose"><div class="section-head"><h2>免責事項</h2></div>
<p>当サイトの相場は過去の取引事例から機械的に算出した参考値であり、不動産の鑑定評価や査定ではありません。実際の売却価格は、物件の状態・権利関係・市況などにより異なります。当サイトの情報を利用して生じた損害について、運営者は責任を負いません。</p>
<p>国土交通省の不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。</p>
<p>制定日：${JP_DATE}</p></section>`;
  const wrapStatic = (slug, title, h1, description, body) =>
    layout({ title: `${title}｜${config.siteName}`, description, path: href(slug), hero: heroBlock({ crumbs: [{ name: title, url: href(slug) }], h1, lead: description }), body, crumbs: [{ name: title, url: href(slug) }] });
  return {
    about: wrapStatic('about', '運営者情報', '運営者情報・このサイトの方針', `${config.siteName}の運営者、サイトの方針、データの出典と加工方法、お問い合わせ先。`, about),
    privacy: wrapStatic('privacy', 'プライバシーポリシー', 'プライバシーポリシー・免責事項', '当サイトでの個人情報・位置情報の扱い、外部サービス、広告、免責事項について。', privacy),
  };
}

function llmsTxt() {
  return `# ${config.siteName}

> ${config.tagline}。国土交通省「不動産情報ライブラリ」の実際の取引価格 ${totalRecords.toLocaleString()}件（約10年分）から、全国の市区町村・区・地区ごとの中古マンション・戸建て・土地の売却相場（中央値・坪単価・10年推移・築年数別）を集計し、面積と築年数から物件の価格帯を計算できる無料サイト。

## 使い方
- 都道府県ページ: ${config.siteUrl}/{都道府県のローマ字}/ （例: ${config.siteUrl}/aichi/）
- 市区町村ページ: ${config.siteUrl}/{都道府県}/{市区町村}/ （例: ${config.siteUrl}/gifu/mizunami/）
- 政令指定都市の区: ${config.siteUrl}/{都道府県}/{市}/{区}/ （例: ${config.siteUrl}/aichi/nagoya/nakagawa/）
- 地区ページ: 市区町村ページの下に地区名（漢字）

## データの扱い
- 中央値は取引価格を並べた真ん中の値。5件未満の集計は表示しない。
- 関係者間取引・競売・隣地購入などの特殊な取引は除外。
- 数値は参考値であり、鑑定評価や査定ではない。

## ページ
- ${config.siteUrl}/about/ : 運営者情報・方針・データの加工方法
- ${config.siteUrl}/privacy/ : プライバシーポリシー・免責事項
- ${config.siteUrl}/sitemap.xml : 全ページ一覧
`;
}

function writeSitemaps() {
  const CHUNK = 40_000;
  const files = [];
  for (let i = 0; i < urls.length; i += CHUNK) {
    const name = urls.length > CHUNK ? `sitemap-${files.length + 1}.xml` : 'sitemap.xml';
    files.push(name);
    writeFileSync(join(DIST_DIR, name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.slice(i, i + CHUNK).map((u) => `<url><loc>${esc(config.siteUrl + u)}</loc><lastmod>${ISO_DATE}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  }
  if (urls.length > CHUNK) {
    writeFileSync(join(DIST_DIR, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((f) => `<sitemap><loc>${config.siteUrl}/${f}</loc><lastmod>${ISO_DATE}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);
  }
}
