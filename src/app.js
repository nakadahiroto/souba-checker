/* ブラウザ側の動き：場所探し（現在地・地図・住所・郵便番号）、計算機、動き（カウントアップ・グラフ描画）、固定ボタン */
(() => {
  const $ = (id) => document.getElementById(id);
  const GSI_REVERSE = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
  const GSI_SEARCH = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
  const ZIP = 'https://zipcloud.ibsnet.co.jp/api/search';
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let placesCache;
  const loadPlaces = async () => (placesCache ??= await fetch('/places.json').then((r) => r.json()));

  async function resolve(muniCd, town = '') {
    const places = await loadPlaces();
    const city = places[String(muniCd ?? '').padStart(5, '0')];
    if (!city) return null;
    return { name: city[0], url: city[1] + (town ? `?town=${encodeURIComponent(town)}` : '') };
  }

  async function reverse(lat, lon) {
    const geo = await fetch(`${GSI_REVERSE}?lat=${lat}&lon=${lon}`).then((r) => r.json());
    const { muniCd, lv01Nm = '' } = geo.results ?? {};
    return { muniCd, town: lv01Nm };
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((ok, ng) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${LEAFLET}.min.css`;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = `${LEAFLET}.min.js`;
      s.onload = ok;
      s.onerror = ng;
      document.head.appendChild(s);
    });
  }

  // ---------- 場所を探す ----------
  function setupFinder(root) {
    const el = (role) => root.querySelector(`[data-role="${role}"]`);
    const results = el('q-results');
    const msg = el('locate-msg');
    const say = (t) => { if (msg) { msg.hidden = !t; msg.textContent = t; } };
    const show = (html) => { results.innerHTML = html; };
    let map;
    let marker;

    root.querySelectorAll('.finder-tabs [data-pane]').forEach((btn) =>
      btn.addEventListener('click', () => {
        root.querySelectorAll('.finder-tabs [data-pane]').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelectorAll('.finder-pane').forEach((p) => (p.hidden = p.id !== btn.dataset.pane));
        if (btn.dataset.pane.endsWith('map')) initMap();
      }),
    );

    root.querySelectorAll('[data-locate]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!navigator.geolocation) return say('このブラウザは位置情報に対応していません。');
        say('現在地を確認しています…');
        navigator.geolocation.getCurrentPosition(
          async ({ coords }) => {
            try {
              const { muniCd, town } = await reverse(coords.latitude, coords.longitude);
              const hit = await resolve(muniCd, town);
              if (!hit) return say('現在地の地域のデータが見つかりませんでした。地図や住所から探してみてください。');
              say(`${hit.name}${town} のページへ移動します…`);
              location.href = hit.url;
            } catch {
              say('住所の判定に失敗しました。時間をおいて試してください。');
            }
          },
          () => say('位置情報を取得できませんでした。市区町村名・郵便番号・地図から探せます。'),
          { timeout: 10000, maximumAge: 600000 },
        );
      }),
    );

    async function initMap() {
      if (map) return;
      const box = el('map');
      if (!box) return;
      try {
        await loadLeaflet();
      } catch {
        box.textContent = '地図を読み込めませんでした。';
        return;
      }
      map = L.map(box, { zoomControl: true }).setView([36.2, 138.3], 5);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' }).addTo(map);
      map.on('click', (e) => pin(e.latlng.lat, e.latlng.lng));
      navigator.geolocation?.getCurrentPosition(({ coords }) => map.setView([coords.latitude, coords.longitude], 13), () => {}, { timeout: 5000 });
    }

    async function pin(lat, lon, zoomTo) {
      if (!marker) {
        marker = L.marker([lat, lon], { draggable: true }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); pin(p.lat, p.lng); });
      } else marker.setLatLng([lat, lon]);
      if (zoomTo) map.setView([lat, lon], 14);
      const hit = el('map-hit');
      hit.hidden = false;
      hit.textContent = '場所を調べています…';
      try {
        const { muniCd, town } = await reverse(lat, lon);
        const r = await resolve(muniCd, town);
        hit.innerHTML = r ? `<span>この場所：${r.name}${town}</span><a class="cta-btn small" href="${r.url}">この地域の相場を見る</a>` : '<span>この場所のデータはまだありません。</span>';
      } catch {
        hit.textContent = '場所を判定できませんでした。';
      }
    }

    async function search() {
      const q = el('q-text').value.trim();
      if (!q) return;
      show('<li class="msg">検索中…</li>');
      const places = await loadPlaces();
      const hits = Object.values(places).filter(([nm]) => nm.includes(q)).slice(0, 10);
      if (hits.length) return show(hits.map(([nm, u]) => `<li><a href="${u}">${nm}</a></li>`).join(''));
      try {
        const geo = await fetch(`${GSI_SEARCH}?q=${encodeURIComponent(q)}`).then((r) => r.json());
        if (!geo.length) return show('<li class="msg">見つかりませんでした。市区町村名や駅名で試してください。</li>');
        show(geo.slice(0, 5).map((g, i) => `<li><a href="#" data-i="${i}">${g.properties.title}</a></li>`).join(''));
        results.querySelectorAll('a').forEach((a) =>
          a.addEventListener('click', async (e) => {
            e.preventDefault();
            const [lon, lat] = geo[a.dataset.i].geometry.coordinates;
            root.querySelector('.finder-tabs [data-pane$="map"]').click();
            await initMap();
            pin(lat, lon, true);
          }),
        );
      } catch {
        show('<li class="msg">検索に失敗しました。</li>');
      }
    }
    el('q-go')?.addEventListener('click', search);
    el('q-text')?.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), search()));

    async function zip() {
      const z = el('q-zip').value.replace(/\D/g, '');
      if (z.length !== 7) return show('<li class="msg">郵便番号は7桁で入力してください。</li>');
      show('<li class="msg">検索中…</li>');
      try {
        const res = await fetch(`${ZIP}?zipcode=${z}`).then((r) => r.json());
        const a = res.results?.[0];
        if (!a) return show('<li class="msg">該当する住所がありませんでした。</li>');
        const places = await loadPlaces();
        const full = a.address1 + a.address2;
        const hit = Object.values(places).find(([nm]) => nm === full) ?? Object.values(places).find(([nm]) => full.startsWith(nm));
        if (!hit) return show(`<li class="msg">${full}${a.address3} のデータはまだありません。</li>`);
        show(`<li><a href="${hit[1]}?town=${encodeURIComponent(a.address3)}">${full}${a.address3} の相場を見る</a></li>`);
      } catch {
        show('<li class="msg">検索に失敗しました。</li>');
      }
    }
    el('q-zip-go')?.addEventListener('click', zip);
    el('q-zip')?.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), zip()));
  }

  const finder = $('finder');
  if (finder) setupFinder(finder);
  document.querySelectorAll('.search-card').forEach(setupFinder);
  $('finder-toggle')?.addEventListener('click', () => {
    finder.hidden = !finder.hidden;
    if (!finder.hidden) finder.querySelector('input')?.focus();
  });

  const town = new URLSearchParams(location.search).get('town');
  const dmap = $('district-map');
  if (town && dmap) {
    const d = JSON.parse(dmap.textContent);
    const key = Object.keys(d).filter((k) => town.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (key) location.replace(d[key] + '#calc-section');
  }

  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== btn.dataset.tab));
    }),
  );

  // ---------- 計算機 ----------
  const form = $('calc');
  const sticky = document.querySelector('.sticky-cta');
  const services = $('services-data') ? JSON.parse($('services-data').textContent) : null;
  if (form) {
    const result = $('calc-result');
    const areaLabel = $('area-label');
    const builtWrap = $('built-wrap');
    let data;
    const sync = () => {
      const t = form.type.value;
      areaLabel.textContent = t === 'mansion' ? '専有面積' : '土地面積';
      builtWrap.hidden = t === 'land';
      // ヒーローの種別と計算機の種別をそろえる
      document.querySelectorAll('[data-hero-type]').forEach((b) => b.classList.toggle('active', b.dataset.heroType === t));
    };
    form.addEventListener('change', (e) => e.target.name === 'type' && sync());
    sync();

    // ヒーローの「種別」ボタン → 計算機の種別を切り替え、査定リンクに種別を付ける
    document.querySelectorAll('[data-hero-type]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = form.querySelector(`input[name="type"][value="${b.dataset.heroType}"]`);
        if (r) { r.checked = true; sync(); }
        document.querySelectorAll('a[data-go]').forEach((a) => { const u = new URL(a.href, location.href); u.searchParams.set('t', b.dataset.heroType); a.href = u.pathname + u.search; });
      }),
    );
    // 「先に目安だけ見る」→ 計算機へ
    document.querySelectorAll('[data-quick]').forEach((b) =>
      b.addEventListener('click', () => {
        $('calc-section').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => $('calc-area')?.focus({ preventScroll: true }), 500);
      }),
    );

    const q = (arr, p) => {
      const s = [...arr].sort((a, b) => a - b);
      const i = (s.length - 1) * p;
      const lo = Math.floor(i);
      return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
    };
    const manYen = (v) => `${Math.round(v / 10000).toLocaleString()}万円`;
    // scripts/typeset.mjs と同じ処理（数字と単位に目印を付ける）。直すときは両方そろえる
    const typeset = (html) => html.split(/(<[^>]*>)/).map((part, i) => {
      if (i % 2 || !/\d/.test(part)) return part;
      const out = part.replace(
        /(&#?\w+;)|(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(万円\/坪|万円|万件|億|万|円|件|㎡|%|％|社|秒|つ|ステップ|店舗|倍)?/g,
        (all, ent, int, dec = '', unit) => ent || (unit ? `<span class="nu"><span class="d">${int}${dec}</span><span class="u">${unit}</span></span>` : `<span class="d">${int}${dec}</span>`),
      );
      return out === part ? part : `<span class="tx">${out}</span>`;
    }).join('');
    const typeName = { mansion: '中古マンション', house: '戸建て', land: '土地' };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      result.classList.remove('empty');
      if (!data) {
        result.innerHTML = '<p class="muted">取引データを読み込んでいます…</p>';
        try {
          data = await fetch(`/d/${form.dataset.code}.json`).then((r) => r.json());
        } catch {
          result.innerHTML = '<p class="muted">データを読み込めませんでした。時間をおいて試してください。</p>';
          return;
        }
      }
      const typeKey = form.type.value;
      const type = data.types.indexOf(typeKey);
      const district = data.districts.indexOf(form.district.value);
      const area = Number(form.area.value);
      const built = Number(form.built.value) || null;
      const lastQ = data.quarters.length - 1;
      const notes = [];

      let pool = data.rows.filter((r) => r[0] === type);
      const narrow = (fn, note) => {
        const p = pool.filter(fn);
        if (p.length >= 8) pool = p;
        else if (note) notes.push(note);
      };
      if (district >= 0) narrow((r) => r[1] === district, `${form.district.value}は事例が少ないため、全体の事例で計算しています`);
      if (built && typeKey !== 'land') {
        const near = pool.filter((r) => r[3] && Math.abs(r[3] - built) <= 5);
        if (near.length >= 8) pool = near;
        else narrow((r) => r[3] && Math.abs(r[3] - built) <= 10, '建築年が近い事例が少ないため、築年数を問わず計算しています');
      }
      narrow((r) => r[4] > lastQ - 12, '直近3年の事例が少ないため、古い取引も含めて計算しています');

      if (pool.length < 3) {
        result.innerHTML = `<p>比較できる取引事例が少なく、目安を出せませんでした。</p><p class="small muted">事例の少ない地域ほど、不動産会社ごとの査定額の差が大きくなります。無料の査定で実際の金額を確かめるのが近道です。</p><div class="result-cta">${ctaHtml('calc-nodata')}</div>`;
        return;
      }
      const units = pool.map((r) => r[2]);
      const mid = q(units, 0.5) * area;
      const low = q(units, 0.25) * area;
      const high = q(units, 0.75) * area;
      const p10 = q(units, 0.1) * area;
      const p90 = q(units, 0.9) * area;
      const pos = Math.min(95, Math.max(5, ((mid - p10) / (p90 - p10 || 1)) * 100));
      const { place } = form.dataset;
      const cond = `${typeName[typeKey]}・${area}㎡${built && typeKey !== 'land' ? `・${built}年築` : ''}`;
      const best = pickService(typeKey);
      result.innerHTML = typeset(`
        <p class="small muted">${place}／${cond}</p>
        <p class="result-label">似た条件の取引 <b class="num">${pool.length}</b> 件から出した目安</p>
        <p class="big" data-count>${manYen(mid)}</p>
        <p class="small">半数の取引は <b class="num">${manYen(low)}〜${manYen(high)}</b> に収まり、上位10%は <b class="num">${manYen(p90)}以上</b> で売れています。</p>
        <div class="gauge"><div class="gauge-bar"><i style="left:${pos.toFixed(0)}%"></i></div><div class="gauge-ends"><span>下位10% ${manYen(p10)}</span><span>上位10% ${manYen(p90)}</span></div></div>
        ${notes.map((nt) => `<p class="small muted">※${nt}</p>`).join('')}
        <div class="result-cta">
          <p><b class="num">${manYen(high - low)}</b>の幅のどこに入るかは、物件の状態と「どの会社に任せるか」で決まります。査定は無料で、売るかどうかはあとから決めて構いません。</p>
          ${ctaHtml('calc-result')}
          ${best ? `<p class="small">この条件なら <a href="/go/${best.id}?src=calc-fit&t=${typeKey}" target="_blank" rel="sponsored noopener"><b>${best.name}</b></a>（${best.tagline}）が向いています</p>` : ''}
        </div>`);
      animateCount(result.querySelector('[data-count]'));
      result.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      // 画面下の固定ボタンの文言を、出した目安に合わせる
      const stickyMain = sticky?.querySelector('.cta-btn');
      if (stickyMain) stickyMain.innerHTML = typeset(`目安 ${manYen(mid)} → 査定で確かめる`);
    });
  }

  function ctaHtml(src) {
    const label = form?.dataset.ctaLabel ?? '無料で査定額を比べる';
    return `<span class="cta-wrap"><span class="ribbon orange">かんたん60秒入力</span><a class="cta-btn" href="/go/main?src=${src}" target="_blank" rel="sponsored noopener"><span class="free">無料</span>${label}</a></span>`;
  }
  function pickService(typeKey) {
    if (!services) return null;
    const tags = [typeKey, services.urban ? 'urban' : 'rural'];
    return [...services.list].sort((a, b) => tags.filter((t) => b.fit.includes(t)).length - tags.filter((t) => a.fit.includes(t)).length)[0];
  }

  // ---------- 動き：数字のカウントアップ、グラフの描画、要素の浮き上がり ----------
  function animateCount(box) {
    if (!box || reduced || box.textContent.includes('億')) return;
    // 同じ数字を2回動かすと、途中の値を最終値と取り違えて止まるので1回だけにする
    if (box.dataset.counted) return;
    box.dataset.counted = '1';
    // 単位の目印（.u や small）を壊さないよう、数字の部分だけを書き換える
    const el = box.querySelector('.d') ?? box;
    const text = el.textContent.trim();
    const m = text.match(/^([\d,]+)(.*)$/);
    if (!m || text.includes('.')) return;
    const target = Number(m[1].replace(/,/g, ''));
    if (!target) return;
    const suffix = m[2];
    const t0 = performance.now();
    const dur = 900;
    const step = (now) => {
      // 描画タイミングの時刻は t0 より少し前になることがあるので 0 未満にしない
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // 描画が間引かれる環境（裏タブ・省電力など）でも、最後は必ず正しい数字にする
    setTimeout(() => { el.textContent = text; }, dur + 150);
  }

  if ('IntersectionObserver' in window) {
    // 浮き上がり
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-count]').forEach(animateCount);
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.content > section, .content > aside, .hero-stats div, .reason, .trust div').forEach((el) => { el.classList.add('reveal'); io.observe(el); });

    // グラフ：線は描かれるように、棒は下から伸びるように
    if (!reduced) {
      document.querySelectorAll('.chart svg').forEach((svg) => {
        svg.querySelectorAll('path.line').forEach((p) => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
        svg.querySelectorAll('rect.bar').forEach((r) => { r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'bottom'; r.style.transform = 'scaleY(0)'; });
      });
      const cio = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add('draw');
          cio.unobserve(en.target);
        });
      }, { threshold: 0.3 });
      document.querySelectorAll('.chart').forEach((c) => cio.observe(c));
    }
  }

  // ---------- 画面下の固定ボタン ----------
  const watch = document.querySelectorAll('.cta, .calc, .steps-cta, .search-card, .hero-cta-card');
  if (sticky && watch.length && 'IntersectionObserver' in window) {
    const visible = new Set();
    const update = () => sticky.classList.toggle('show', visible.size === 0 && window.scrollY > 300);
    const io = new IntersectionObserver((entries) => { entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target))); update(); });
    watch.forEach((el) => io.observe(el));
    window.addEventListener('scroll', update, { passive: true });
  }
})();
