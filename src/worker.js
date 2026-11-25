// Cloudflare Workers の入口。
//  - /go/<id>?src=<場所> … アフィリエイトリンクへ転送し、クリックをログに残す（LINKS に URL が無ければ準備中ページ）
//  - それ以外 … SITE_PASSWORD が設定されている間は Basic 認証をかけて dist/ を配信
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/go/')) return go(url, request, env);

    if (env.SITE_PASSWORD === undefined) {
      return new Response('準備中です', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
    }
    const password = env.SITE_PASSWORD.replace(/^﻿/, '').trim();
    if (password !== '') {
      const expected = `${env.SITE_USER ?? 'guest'}:${password}`;
      const auth = request.headers.get('Authorization') ?? '';
      let given = '';
      if (auth.startsWith('Basic ')) {
        try {
          given = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0)));
        } catch {}
      }
      if (given !== expected) {
        return new Response('関係者向けの確認用サイトです。ユーザー名とパスワードを入力してください。', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="souba-checker", charset="UTF-8"', 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
        });
      }
    }
    const res = await env.ASSETS.fetch(request);
    if (password !== '') {
      const h = new Headers(res.headers);
      h.set('x-robots-tag', 'noindex');
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};

// アフィリエイトリンクへの転送。LINKS は {"main":"https://...","ieul":"https://..."} の JSON（wrangler.jsonc の vars）
function go(url, request, env) {
  const id = url.pathname.slice(4).replace(/\/$/, '');
  const src = url.searchParams.get('src') ?? '';
  let links = {};
  try {
    links = JSON.parse(env.LINKS ?? '{}');
  } catch {}
  const target = links[id] ?? links.main;
  // Workers のログに残す（ダッシュボードの Observability で集計できる）
  console.log(JSON.stringify({ type: 'go', id, src, target: !!target, ref: request.headers.get('referer') ?? '', ua: request.headers.get('user-agent') ?? '', country: request.cf?.country ?? '' }));
  if (target) {
    return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer-when-downgrade' } });
  }
  return new Response(
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>準備中</title>
<style>body{font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f7fb;color:#1b2a44}div{text-align:center;padding:24px}a{color:#1c4f9c}</style>
<div><h1>査定サービスへの案内は準備中です</h1><p>提携手続きが完了するまで、このボタンはまだ使えません。</p><p><a href="javascript:history.back()">前のページに戻る</a></p></div>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } },
  );
}
