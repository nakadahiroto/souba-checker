// サイト全体の設定。ここを書き換えるだけで対象地域やリンク先を変えられる。
export default {
  siteName: '住まいの相場チェッカー',
  tagline: '実際の取引データで見る、あなたの街の不動産売却相場',
  // 公開後のURL（sitemap.xml と canonical に使う）
  siteUrl: 'https://www.souba-checker.workers.dev',

  // 運営者情報（ASPの審査と信頼性のために必要。空のままだと「準備中」と表示される）
  owner: {
    name: '',
    email: '',
    about: '',
  },

  // 査定ボタン。リンクはすべてサイト内の /go/<id> を経由し、Worker が wrangler.jsonc の LINKS（ASPのURL）へ転送する。
  // 転送先が未設定の間は「準備中」ページが出るので、リンク切れにはならない。
  affiliate: {
    url: '/go/main',
    label: '無料で査定額を比べる',
    note: '複数の不動産会社にまとめて査定を依頼できます（無料・約60秒）',
  },

  // 比較ガイドに載せる一括査定サービス。特徴は各社公式サイトの公開情報（2026年10月時点）。
  // fit: 向いている物件・地域（mansion/house/land/rural/urban/old/anxious/first）
  services: [
    {
      id: 'sumai-value',
      name: 'すまいValue',
      tagline: '大手6社に直接、まとめて査定',
      partners: '大手6社',
      max: '最大6社',
      fit: ['mansion', 'house', 'urban'],
      points: ['三井のリハウス・住友不動産販売・東急リバブルなど大手6社が直営', '都市部のマンション・戸建ての売却実績が豊富', '大手の販売網と顧客リストで買い手を探せる'],
      good: '都市部のマンション・戸建てを、大手の力で高く売りたい人',
    },
    {
      id: 'ieul',
      name: 'イエウール',
      tagline: '地方・土地・古い家に強い',
      partners: '2,500社以上',
      max: '最大6社',
      fit: ['mansion', 'house', 'land', 'rural', 'old'],
      points: ['提携2,500社以上。地方の地元業者まで幅広い', '農地・山林・店舗など、対応する物件の種類が広い', 'クレームの多い会社は提携を解除する仕組み'],
      good: '地方の土地・実家・築年数の古い家を売りたい人',
    },
    {
      id: 'homes',
      name: "LIFULL HOME'S 売却査定",
      tagline: '匿名で、まず金額だけ知れる',
      partners: '5,000社超',
      max: '最大10社',
      fit: ['mansion', 'house', 'land', 'urban', 'rural', 'anxious'],
      points: ['参加不動産会社5,000社超、業界最大級', 'メールアドレスだけで依頼できる匿名査定がある', 'ISO/IEC 27001 を取得し、個人情報の管理が厳格'],
      good: '営業電話が不安な人。まず匿名で金額感を知りたい人',
    },
    {
      id: 'home4u',
      name: 'HOME4U',
      tagline: 'NTTデータグループ運営の老舗',
      partners: '厳選2,500社',
      max: '最大6社',
      fit: ['mansion', 'house', 'land', 'urban', 'rural', 'first'],
      points: ['2001年開始、日本で最初の一括査定サービス', '厳選2,500社・累計75万件の査定実績', '依頼した会社以外からの連絡は来ない'],
      good: '初めての売却で、運営元の信頼性を重視する人',
    },
  ],

  // 対象の都道府県。'all' で全国、['23', '21'] のようにコードで絞ることもできる
  prefectures: 'all',

  // 何四半期分のデータを取得するか（40 = 約10年分）
  quarters: 40,

  // 地区ページを作るのに必要な最低取引件数（少なすぎると相場として誤解を招く）
  minDistrict: 60,
};
