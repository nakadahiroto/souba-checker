// サイト用イラストを Google Nano Banana 2.1 で生成し、白背景を透明にして src/img/*.webp に書き出す。
// 使い方: node scripts/gen-images.mjs            … 未生成のものだけ作る
//         node scripts/gen-images.mjs hero agent … 指定したものを作り直す
//         node scripts/gen-images.mjs --process  … 生成済みの元画像から加工だけやり直す
// API キーは ~/.config/gemini/api_key.txt（または環境変数 GEMINI_API_KEY）。元画像は art/ai/ に残す。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const RAW = path.join(ROOT, 'art', 'ai');
const OUT = path.join(ROOT, 'src', 'img');
const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const STYLE = `Style: polished flat vector illustration for a trustworthy Japanese real-estate website (like the illustrations on major Japanese real-estate portals).
Clean geometric shapes, gentle soft shading, thin dark-navy outlines, rounded friendly proportions, Japanese people with natural skin tones and dark hair.
Strict color palette: dark navy #16294e, blue #1c4f9c, pale sky blue #cfe0f5, warm orange accent #f26b1d, fresh green #19a974, warm beige, white.
Composition: the subject is isolated and centered on a PURE WHITE #FFFFFF background with generous white margin on every side. No background scenery, no frame, no border, no vignette, no drop shadow except a very faint pale-blue ellipse under feet or objects.
Absolutely no text, letters, numbers, logos or watermarks anywhere.`;

// name: 出力名 / ratio: 縦横比 / width: 書き出す幅(px, 表示幅の約2倍)
const ITEMS = [
  { name: 'hero', ratio: '4:3', width: 960, anchor: true,
    prompt: 'A happy Japanese family of four (father, mother, elementary-school son and daughter) standing in front of their two-story Japanese detached house with a small garden tree. The mother holds a smartphone and points at it while the father looks at it with interest, the children smile. Warm, hopeful mood about selling their home at a good price.' },
  { name: 'city', ratio: '21:9', width: 1400,
    prompt: 'A wide panoramic row of Japanese residential buildings: detached houses with gable roofs, a low-rise condominium, a mid-rise apartment, trees and a small park, a few tiny people walking. Calm suburban Japanese townscape seen from the front, buildings sitting on one flat baseline. No sky color, just white behind.' },
  { name: 'agent', ratio: '1:1', width: 600, bust: 1.1, // 上半身だけ使う（高さ＝幅×1.1）
    prompt: 'A friendly Japanese female real-estate advisor in her 30s wearing a dark navy suit with an orange accent scarf, smiling warmly, holding a tablet in one hand and gesturing to the side with an open palm as if guiding the viewer. Upper body to knees.' },
  { name: 'consult', ratio: '3:2', width: 920,
    prompt: 'A Japanese couple in their 50s sitting at a table consulting with a real-estate agent in a navy suit who explains a document with a simple bar chart and a small house model on the table. Everyone looks engaged and comfortable. Side view, full table visible.' },
  { name: 'worried', ratio: '4:3', width: 600,
    prompt: 'A Japanese couple in their 50s looking worried and confused, the husband scratching his head and the wife holding a sheet of paper with a puzzled frown. A small question-mark-shaped cloud above them drawn as a simple shape (not a letter). Muted colors.' },
  { name: 'relieved', ratio: '4:3', width: 600,
    prompt: 'The same Japanese couple in their 50s now relieved and smiling, the wife holding a smartphone showing a simple chart, the husband giving a thumbs up. Small sparkle shapes around them. Bright, positive colors.' },
  { name: 'smartphone', ratio: '3:2', width: 480,
    prompt: 'A Japanese woman in her 40s sitting on a sofa at home, checking local housing prices on her smartphone; a simple floating card with a line chart and a small house icon appears next to the phone (no text).' },
  { name: 'handshake', ratio: '3:2', width: 480,
    prompt: 'A Japanese man in his 50s shaking hands with a smiling real-estate agent in a navy suit; next to them a small detached house with a green check-mark badge. Satisfied, trustworthy mood.' },

  // ---- 飾りの部品（文字は入れず、数字や文言は HTML で重ねる。データ更新で数字が変わっても正しく出るように） ----
  { name: 'medal', ratio: '1:1', width: 360, part: true,
    prompt: `A premium gold award medal frame for a Japanese website, like the achievement badges on top Japanese real-estate comparison sites.
A symmetrical golden laurel wreath of two branches curving up around a circle, the branches meeting at the bottom with a small ribbon knot; a small golden crown floating above the top gap, with three tiny gold stars arranged in a gentle arc between the crown and the wreath.
Inside the wreath: a large plain solid WHITE circular disc (empty, about 72% of the wreath diameter) with a very thin pale-gold rim, completely empty in the middle for text to be placed later.
Rich gold gradient (#f7d774 highlights to #d9a520 shadows), crisp flat-vector style with subtle shine, clean edges.` },
  { name: 'seal', ratio: '1:1', width: 260, part: true,
    prompt: `A scalloped rosette seal badge (like a "best price" sticker) for a Japanese website: a circle with 16 rounded scallops around its edge, a thick fresh green #19a974 scalloped outline and a thin inner green ring, the inside filled with solid plain WHITE and completely empty for text to be placed later. Flat vector, crisp edges.` },
  { name: 'icon-data', ratio: '1:1', width: 220, part: true,
    prompt: `A single flat icon: an official document sheet with a small bar chart and a tiny house symbol on it, with a magnifying glass resting at the lower right. Two-color flat design in fresh green #19a974 and dark navy #16294e on white, chunky friendly shapes, no outlines, like the feature icons on major Japanese service websites.` },
  { name: 'icon-time', ratio: '1:1', width: 220, part: true,
    prompt: `A single flat icon: a stopwatch next to a smartphone showing a simple price range bar, with three small speed lines. Two-color flat design in fresh green #19a974 and dark navy #16294e on white, chunky friendly shapes, no outlines, like the feature icons on major Japanese service websites.` },
  { name: 'icon-map', ratio: '1:1', width: 220, part: true,
    prompt: `A single flat icon: a folded paper town map with a few small houses on it and a large location pin above, a small check mark on the pin. Two-color flat design in fresh green #19a974 and dark navy #16294e on white, chunky friendly shapes, no outlines, like the feature icons on major Japanese service websites.` },
];

const PART_STYLE = `Isolated and centered on a PURE WHITE #FFFFFF background with generous white margin on every side. No background scenery, no frame, no drop shadow.
Absolutely no text, letters, numbers, logos or watermarks anywhere.`;

function getKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  return fs.readFileSync(path.join(os.homedir(), '.config', 'gemini', 'api_key.txt'), 'utf8').trim();
}

function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findImage(n); if (r) return r; } return null; }
  if (typeof node.data === 'string' && node.data.length > 100 && (!node.mime_type || node.mime_type.startsWith('image/'))) return node.data;
  for (const v of Object.values(node)) { const r = findImage(v); if (r) return r; }
  return null;
}

async function generate(item, anchorPath) {
  const input = [{ type: 'text', text: `${item.prompt}\n\n${item.part ? PART_STYLE : STYLE}` }];
  if (anchorPath && !item.part) {
    input[0].text += '\n\nMatch the exact illustration style, line weight, shading and color palette of the attached reference image (same artist, same series). Do not copy its subject.';
    input.push({ type: 'image', mime_type: 'image/jpeg', data: fs.readFileSync(anchorPath).toString('base64') });
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': getKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input, response_format: { type: 'image', aspect_ratio: item.ratio, image_size: '2K' } }),
    });
    const text = await res.text();
    if (res.ok) {
      const data = findImage(JSON.parse(text));
      if (data) { fs.writeFileSync(path.join(RAW, `${item.name}.jpg`), Buffer.from(data, 'base64')); return; }
    }
    console.warn(`${item.name}: 失敗 ${attempt}回目 (${res.status}) ${text.slice(0, 300)}`);
    if ([400, 401, 402, 403].includes(res.status)) throw new Error('API の残高・権限エラーのため中止');
    await new Promise(r => setTimeout(r, 4000 * attempt));
  }
  throw new Error(`${item.name}: 生成できませんでした`);
}

// 外周から続く白い部分を透明にし、境目は白とのにじみを取り除いて自然にする
async function cutout(item) {
  const { data, info } = await sharp(path.join(RAW, `${item.name}.jpg`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = i => Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = i => { if (!bg[i] && px(i) >= 236) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  // 背景に接する2px以内の縁は、白との混ざり具合から透明度を計算
  const edge = new Uint8Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? bg : edge.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (bg[i] || edge[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < W - 1 && src[i + 1]) || (y > 0 && src[i - W]) || (y < H - 1 && src[i + W])) edge[i] = 1;
    }
  }
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    let r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2], a = 255;
    if (bg[i]) a = 0;
    else if (edge[i]) {
      const m = Math.min(r, g, b);
      const al = Math.min(1, Math.max(0, (255 - m) / (255 - 170)));
      a = Math.round(al * 255);
      if (al > 0) { r = Math.round((r - 255 * (1 - al)) / al); g = Math.round((g - 255 * (1 - al)) / al); b = Math.round((b - 255 * (1 - al)) / al); }
    }
    out[i * 4] = Math.max(0, Math.min(255, r)); out[i * 4 + 1] = Math.max(0, Math.min(255, g)); out[i * 4 + 2] = Math.max(0, Math.min(255, b)); out[i * 4 + 3] = a;
  }
  const file = path.join(OUT, `${item.name}.webp`);
  let trimmed = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
  if (item.bust) {
    const m = await sharp(trimmed).metadata();
    const h = Math.min(m.height, Math.round(m.width * item.bust));
    trimmed = await sharp(trimmed).extract({ left: 0, top: 0, width: m.width, height: h }).png().toBuffer();
  }
  await sharp(trimmed)
    .resize({ width: item.width, withoutEnlargement: true })
    .webp({ quality: 86, alphaQuality: 90, effort: 6 })
    .toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`${item.name}.webp  ${meta.width}x${meta.height}  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

fs.mkdirSync(RAW, { recursive: true });
const args = process.argv.slice(2);
const processOnly = args.includes('--process');
const only = args.filter(a => !a.startsWith('--'));
const targets = ITEMS.filter(it => only.length ? only.includes(it.name) : !fs.existsSync(path.join(RAW, `${it.name}.jpg`)));

if (!processOnly) {
  const anchor = ITEMS.find(it => it.anchor);
  const anchorPath = path.join(RAW, `${anchor.name}.jpg`);
  if (targets.includes(anchor)) { console.log('見本の画像を生成中…'); await generate(anchor); }
  const rest = targets.filter(it => it !== anchor);
  if (rest.length) console.log(`残り ${rest.length} 枚を生成中…`);
  await Promise.all(rest.map(it => generate(it, fs.existsSync(anchorPath) ? anchorPath : null)));
}
for (const it of processOnly ? (only.length ? ITEMS.filter(i => only.includes(i.name)) : ITEMS) : (only.length ? targets : ITEMS)) {
  if (fs.existsSync(path.join(RAW, `${it.name}.jpg`))) await cutout(it);
}
