# 住まいの相場チェッカー

国土交通省「不動産情報ライブラリ」の取引価格データから、全国の市区町村・区・地区ごとの不動産売却相場ページを自動生成する静的サイト。
公開先: https://www.souba-checker.workers.dev （Cloudflare Workers 静的アセット）

## 使い方

| コマンド | 内容 |
|---|---|
| `npm run munis` | 総務省のコード表から市区町村一覧（読み仮名・URL）を作る → `data/munis.json` |
| `npm run fetch` | APIから都道府県×四半期で実データを取得 → `data/raw/`（取得済みは飛ばすので再実行で続きから） |
| `npm run build` | `dist/` に全ページを生成（約70秒）。`node scripts/build.mjs 23 21` で県を絞れる |
| `node scripts/og.mjs` | SNS用画像（OGP）を `dist/og/` に生成（Edge のヘッドレスで撮影） |
| `npm run preview` | `dist/` を http://localhost:8080 で確認 |
| `npm run deploy` | ビルドして Cloudflare にアップロード（変更分だけ送るので2回目以降は速い） |

## 設定

- `config.mjs`：サイト名、公開URL、運営者情報、査定ボタンのリンク、比較ガイドのサービス、対象の都道府県、取得期間、地区ページのしきい値
- `.env`：`REINFOLIB_API_KEY=<APIキー>`（Gitには含めない）
- `wrangler.jsonc`：Cloudflare の設定。`run_worker_first: true` が必須（入口の認証を通すため）

## 限定公開と一般公開

`src/worker.js` が入口。Cloudflare のシークレット `SITE_PASSWORD` が設定されている間は Basic 認証（ユーザー名 guest）。
- 一般公開にする: `printf '' | npx wrangler secret put SITE_PASSWORD`（空文字にする。削除すると「準備中」503 になる）
- シークレットは PowerShell からではなく Bash の `printf` で渡す（PowerShell 5.1 は BOM が混ざる）

## 構成

- `scripts/fetch.mjs`：取得。政令指定都市は市コードでは取れないので県単位で取る。北海道〜栃木のコードは先頭の0が落ちて返るので build で補う
- `scripts/stats.mjs`：中央値・坪単価・推移・築年数別・価格の開き。5件未満は出さない
- `scripts/prose.mjs`：地域ごとの解説文（検索・AI回答向けの一次情報）
- `scripts/charts.mjs`：SVG グラフとスパークライン
- `scripts/build.mjs`：ページ生成（ヒーロー、カード、計算機、案内、比較ガイド、地区表、FAQ、構造化データ、sitemap、llms.txt、固定ページ）
- `src/app.js`：場所探し（現在地・地図・住所・郵便番号）、計算機、固定ボタン
- `src/style.css`：デザイントークンと部品

## 文字組み（数字の見せ方）

- `scripts/typeset.mjs` がページ書き出し時に「数字＋単位」へ目印を付ける（`.nu` 改行させない / `.d` 数字 / `.u` 単位 / `.k` 見出しで強調する「3つ」「6社」など）。計算機の結果は `src/app.js` の同じ処理で付ける。直すときは両方そろえる
- 見た目は `src/style.css` の「文字組み」の段落で場所ごとに決める。価格や実績は数字を大きく、単位を約半分に。数字の書体は Barlow
- flex の部品の中では目印ごとに間隔が空くため、数字を含む文は `.tx` で1つにまとめている。`.foo span { display: flex }` のような子孫指定は `.foo > span` にすること
- 数字のカウントアップ（app.js の animateCount）は1要素1回だけ。2回走ると途中の値で止まる

## イラスト

ページで使っているのは `src/img/*.webp`。Google Nano Banana 2.1 で生成したオリジナルで、`node scripts/gen-images.mjs` で作る。

- 絵の内容と書き出しサイズは `scripts/gen-images.mjs` の `ITEMS`。家族の絵（hero）を見本として渡し、残りのタッチをそろえている
- 作り直し: `node scripts/gen-images.mjs agent` のように名前を指定。加工（背景の透明化・縮小）だけやり直すなら `--process`
- 元画像は `art/ai/*.jpg`。API キーは `~/.config/gemini/api_key.txt`（前払い制。残高切れは 402 エラー）

旧イラスト `src/img/*.svg` は現在ページで未使用。「ソコスト」（https://soco-st.com/ ）のフリー素材。商用利用可・クレジット不要・点数制限なし・色変更やトリミング可。
禁止: 直リンク（自前配信が必須）、再配布・素材としての販売、AI学習や生成への利用、顔の改変、商標登録。追加する場合は各イラストページの `{id}_color.svg` をダウンロードして置く。

## アフィリエイトリンクの仕組み（/go/）

ページ内の査定ボタンはすべて `/go/<id>?src=<置き場所>` を指す（id: main / sumai-value / ieul / homes / home4u）。
`src/worker.js` が `wrangler.jsonc` の `vars.LINKS`（JSON）を見て、ASPのURLへ 302 で転送する。URLが空の間は「準備中」ページを返すのでリンク切れにならない。

- 提携URLを入れる: `wrangler.jsonc` の `LINKS` を書き換えて `npx wrangler deploy`（ページの再生成は不要、数十秒）
- クリックの記録: Worker が `{"type":"go","id":..,"src":..}` を console.log する。Cloudflare ダッシュボード → Workers & Pages → www → Logs（Observability）で、どのボタン（src）が押されているか集計できる
- src の値: hero（ヒーロー右のカード）/ conclusion（結論カード）/ calc-result（計算結果）/ calc-fit（結果の下の「この条件なら」）/ diff（差額の下）/ chooser（分岐）/ table（比較表）/ rail / rail-fit（サイドバー）/ block（案内ブロック）/ steps / sticky（画面下）

## 公開前に埋めるもの

- `config.owner`（運営者名・連絡先）：ASPの審査に必要
- `wrangler.jsonc` の `LINKS`：ASP で提携が通ったら貼る
