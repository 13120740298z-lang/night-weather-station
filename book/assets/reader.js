/* 夜班气象站 · 漫画阅读器
   零依赖（翻书模式复用 vendor/StPageFlip），四模式、手势缩放、全屏/沉浸、进度记忆。 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TOTAL = 166;
  const BODY_START = 7;
  const PAGES_PER_VOL = 2;
  const STAGE_PAGES = { 7: '起 · 第 1 册', 47: '承 · 第 21 册', 97: '转 · 第 46 册', 137: '合 · 第 66 册' };
  const LS = 'nws.reader.v2';

  const app = $('app');
  const stage = $('stage');
  const views = {
    flip: $('viewFlip'),
    single: $('viewSingle'),
    scroll: $('viewScroll'),
    text: $('viewText'),
  };
  const bookEl = $('book');
  const flipWrap = $('flipWrap');
  const singleImg = $('singleImg');
  const singleZoom = $('singleZoom');
  const singleSkeleton = $('singleSkeleton');
  const scrollList = $('scrollList');
  const textView = $('viewText');
  const textBody = $('textBody');
  const textVolNo = $('textVolNo');
  const boot = $('boot');
  const bootBar = $('bootBar');
  const bootSub = $('bootSub');
  const slider = $('slider');
  const pageLabel = $('pageLabel');
  const pageVol = $('pageVol');
  const volLabel = $('volLabel');
  const btnPrev = $('btnPrev');
  const btnNext = $('btnNext');
  const toastEl = $('toast');
  const zoomChip = $('zoomChip');
  const zoomVal = $('zoomVal');
  const hintEl = $('gestureHint');
  const tocDrawer = $('tocDrawer');
  const tocMask = $('drawerMask');
  const tocList = $('tocList');
  const tocNow = $('tocNow');
  const sheet = $('sheet');
  const sheetMask = $('sheetMask');

  /* ---------------- 状态 ---------------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return {};
      const s = JSON.parse(raw);
      return s && typeof s === 'object' ? s : {};
    } catch (e) { return {}; }
  }

  const state = loadState();
  const viewportWide = () => window.innerWidth >= 901;
  const validMode = (m) => ['flip', 'single', 'scroll', 'text'].includes(m);
  const textDefaults = { size: 18, lh: 1.8, bg: 'paper', fw: 400 };
  const textOpts = Object.assign({}, textDefaults, state.text && typeof state.text === 'object' ? state.text : {});

  let mode = validMode(state.mode) ? state.mode : (viewportWide() ? 'flip' : 'single');
  let page = clamp(Number(state.page) || 1, 1, TOTAL);
  let tier = state.tier === 'm' || state.tier === 'd' ? state.tier : (viewportWide() ? 'd' : 'm');
  let resumePage = Number(state.resumePage) || 0;
  let textTarget = page <= 6 ? { kind: 'guide' } : { kind: 'volume', v: volOfPage(page) };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function supportsWebp() {
    try {
      const c = document.createElement('canvas');
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (e) { return false; }
  }
  const webpOK = supportsWebp();

  const pad3 = (n) => String(n).padStart(3, '0');
  function imgUrl(p) {
    if (!webpOK) return `pages_v4/page_${pad3(p)}.jpg`;
    return `${tier === 'm' ? 'pages_m' : 'pages_d'}/page_${pad3(p)}.webp`;
  }
  function volOfPage(p) { return clamp(Math.floor((p - BODY_START) / PAGES_PER_VOL) + 1, 1, 80); }
  function volStart(v) { return BODY_START + (v - 1) * PAGES_PER_VOL; }
  function volEnd(v) { return volStart(v) + PAGES_PER_VOL - 1; }

  let bookData = null;
  let dataPromise = null;

  function pageInfo(p) {
    if (p <= 5) return { kind: 'guide', label: p === 1 ? '封面 · 导读' : `导读 P.${p}` };
    if (p === 6) return { kind: 'toc', label: '总目录' };
    const v = volOfPage(p);
    const title = bookData && bookData.volumes[v - 1] ? bookData.volumes[v - 1].title : '';
    return { kind: 'volume', v, label: `第${v}册${title ? ' · ' + title : ''}` };
  }

  /* ---------------- 持久化 ---------------- */

  let saveTimer = 0;
  function save() {
    state.page = page;
    state.mode = mode;
    state.tier = tier;
    state.text = Object.assign({}, textOpts);
    state.updatedAt = Date.now();
    if (page >= BODY_START) { resumePage = page; state.resumePage = resumePage; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* 隐私模式忽略 */ }
    }, 220);
    updateResumeBtn();
  }
  function saveNow() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------------- UI 同步 ---------------- */

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function syncUI() {
    const info = pageInfo(page);
    pageLabel.textContent = `P.${page}`;
    pageVol.textContent = info.label;
    volLabel.textContent = info.label;
    slider.value = String(page);
    slider.style.setProperty('--p', `${((page - 1) / (TOTAL - 1)) * 100}%`);
    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= TOTAL;
    tocNow.textContent = `P.${page} · ${info.label}`;
    document.querySelectorAll('.toc-vol').forEach((el) => {
      el.classList.toggle('is-current', Number(el.dataset.page) === page);
    });
    document.querySelectorAll('.toc-link[data-page]').forEach((el) => {
      el.classList.toggle('is-current', Number(el.dataset.page) === page);
    });
    updateResumeBtn();
  }

  function updateResumeBtn() {
    const btn = $('btnResume');
    if (!btn) return;
    const more = resumePage > 0 && resumePage !== page;
    btn.hidden = !more;
    btn.textContent = `续读 P.${resumePage}`;
  }

  function showView() {
    Object.keys(views).forEach((k) => views[k].classList.toggle('active', k === mode));
    app.dataset.mode = mode;
    document.querySelectorAll('.mode-tabs button').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false');
    });
  }

  function showChrome() {
    app.classList.remove('chrome-hidden');
    if (isFullscreen() || immersive) scheduleChromeHide();
    setTimeout(() => { if (mode === 'flip' && pageFlip) pageFlip.update(); }, 320);
  }
  function hideChrome() {
    app.classList.add('chrome-hidden');
    clearTimeout(chromeTimer);
    setTimeout(() => { if (mode === 'flip' && pageFlip) pageFlip.update(); }, 320);
  }
  function toggleChrome() {
    if (app.classList.contains('chrome-hidden')) showChrome();
    else hideChrome();
  }
  let chromeTimer = 0;
  function scheduleChromeHide() {
    clearTimeout(chromeTimer);
    if (!isFullscreen() && !immersive) return;
    chromeTimer = setTimeout(() => { hideChrome(); }, 2400);
  }

  /* ---------------- 图片预取 ---------------- */

  const prefetched = new Map();
  function prefetch(p) {
    if (p < 1 || p > TOTAL || prefetched.has(p)) return;
    const im = new Image();
    im.decoding = 'async';
    im.fetchPriority = 'low';
    im.src = imgUrl(p);
    prefetched.set(p, im);
    if (prefetched.size > 16) {
      for (const [k, v] of prefetched) {
        if (Math.abs(k - page) > 4) { v.src = ''; prefetched.delete(k); }
      }
    }
  }
  function prefetchAround(radius = 2) {
    for (let d = 1; d <= radius; d++) { prefetch(page + d); prefetch(page - d); }
  }

  /* ---------------- 翻书模式 ---------------- */

  let pageFlip = null;
  let flipImgs = [];
  let flipRangeCenter = 0;

  function buildFlipDom() {
    bookEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    flipImgs = new Array(TOTAL + 1);
    for (let p = 1; p <= TOTAL; p++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'page';
      pageEl.dataset.page = String(p);
      pageEl.setAttribute('aria-label', `第 ${p} 页`);
      if (p === 1) { pageEl.dataset.density = 'hard'; pageEl.dataset.cover = 'front'; }
      if (p === TOTAL) { pageEl.dataset.density = 'hard'; pageEl.dataset.cover = 'back'; }

      const inner = document.createElement('div');
      inner.className = 'page-inner';
      const img = document.createElement('img');
      img.className = 'page-img';
      img.alt = `第 ${p} 页`;
      img.decoding = 'async';
      img.draggable = false;
      img.dataset.src = imgUrl(p);
      img.addEventListener('load', () => {
        if (!img.getAttribute('src')) return;
        img.classList.add('is-loaded');
        if (p === page) markFirstPage();
      });
      img.addEventListener('error', () => {
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';
        img.src = `pages_v4/page_${pad3(p)}.jpg`;
      });

      const loadBox = document.createElement('div');
      loadBox.className = 'page-loading';
      const loadTxt = document.createElement('span');
      loadTxt.textContent = `P.${p}`;
      loadBox.appendChild(loadTxt);

      inner.appendChild(img);
      inner.appendChild(loadBox);
      pageEl.appendChild(inner);
      frag.appendChild(pageEl);
      flipImgs[p] = img;
    }
    bookEl.appendChild(frag);
  }

  function ensureFlip(p, priority) {
    if (p < 1 || p > TOTAL) return;
    const img = flipImgs[p];
    if (!img || img.getAttribute('src')) return;
    img.fetchPriority = priority || 'auto';
    img.src = img.dataset.src;
  }

  function ensureFlipRange(center) {
    flipRangeCenter = center;
    for (let p = center - 2; p <= center + 3; p++) ensureFlip(p, Math.abs(p - center) <= 1 ? 'high' : 'auto');
  }

  function releaseFlipFar(center) {
    for (let p = 1; p <= TOTAL; p++) {
      if (Math.abs(p - center) <= 8) continue;
      const img = flipImgs[p];
      if (img && img.getAttribute('src')) {
        img.removeAttribute('src');
        img.classList.remove('is-loaded');
      }
    }
  }

  function flipTurn(dir) {
    if (!pageFlip) return;
    const settings = typeof pageFlip.getSettings === 'function' ? pageFlip.getSettings() : null;
    const old = settings ? settings.disableFlipByClick : undefined;
    if (settings) settings.disableFlipByClick = false;
    try {
      if (dir === 'prev') pageFlip.flipPrev('bottom');
      else pageFlip.flipNext('bottom');
    } finally {
      if (settings) settings.disableFlipByClick = old;
    }
  }

  function createPageFlip(startPage) {
    const pf = new St.PageFlip(bookEl, {
      width: 420,
      height: 594,
      size: 'stretch',
      minWidth: 280,
      maxWidth: 780,
      minHeight: 380,
      maxHeight: 1200,
      showCover: true,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: 680,
      useMouseEvents: false,
      swipeDistance: 20,
      disableFlipByClick: true,
      mobileScrollSupport: false,
      autoSize: false,
      startPage: Math.max(0, startPage - 1),
      startZIndex: 0,
    });
    pf.on('changeState', (e) => { if (e.data === 'flipping') clearTimeout(prefetchTimer); });
    pf.on('flip', () => {
      page = pf.getCurrentPageIndex() + 1;
      ensureFlipRange(page);
      prefetchAround(2);
      scheduleRelease();
      resetZoom(true);
      syncUI();
      save();
      markFirstPage();
    });
    pf.on('changeOrientation', () => { ensureFlipRange(page); });
    pf.on('init', () => {
      ensureFlipRange(page);
      setTimeout(() => {
        if (pageFlip && pageFlip.getCurrentPageIndex() !== page - 1) pageFlip.turnToPage(page - 1);
      }, 0);
    });
    pf.loadFromHTML(Array.from(bookEl.querySelectorAll('.page')));
    return pf;
  }

  let releaseTimer = 0;
  function scheduleRelease() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (mode === 'flip' && pageFlip) releaseFlipFar(page);
    }, 900);
  }

  let prefetchTimer = 0;
  function prefetchFlipSoon() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => { if (mode === 'flip') prefetchAround(2); }, 260);
  }

  function initFlip() {
    if (!(window.St && St.PageFlip)) { toast('翻书组件加载失败，请切换单页或竖滚'); return; }
    buildFlipDom();
    ensureFlipRange(page);
    flipWrap.style.transform = '';
    zoom.scale = 1; zoom.tx = 0; zoom.ty = 0;
    pageFlip = createPageFlip(page);
    if (pageFlip && typeof pageFlip.turnToPage === 'function') {
      try { pageFlip.turnToPage(page - 1); } catch (e) { /* init 后再处理 */ }
    }
    syncUI();
  }

  function destroyFlip() {
    if (pageFlip) {
      try { pageFlip.destroy(); } catch (e) { /* ignore */ }
      pageFlip = null;
    }
    bookEl.innerHTML = '';
    if (bookEl.parentElement !== flipWrap) flipWrap.appendChild(bookEl);
    flipImgs = [];
  }

  function rebuildFlip() {
    const at = page;
    destroyFlip();
    initFlip();
    page = at;
    syncUI();
  }

  /* ---------------- 单页模式 ---------------- */

  let singleLoaded = -1;
  function showSingle(p) {
    if (singleLoaded === p) {
      prefetchAround(2);
      return;
    }
    singleLoaded = p;
    singleImg.classList.remove('is-loaded');
    singleSkeleton.classList.remove('is-off');
    const skTxt = singleSkeleton.querySelector('span');
    if (skTxt) skTxt.textContent = `P.${p}`;
    singleImg.alt = `第 ${p} 页 · ${pageInfo(p).label}`;
    singleImg.onload = () => {
      if (singleLoaded !== p) return;
      singleImg.classList.add('is-loaded');
      singleSkeleton.classList.add('is-off');
      markFirstPage();
    };
    singleImg.onerror = () => {
      if (singleImg.dataset.fallback) return;
      singleImg.dataset.fallback = '1';
      singleImg.src = `pages_v4/page_${pad3(p)}.jpg`;
    };
    delete singleImg.dataset.fallback;
    singleImg.src = imgUrl(p);
    if (singleImg.complete && singleImg.naturalWidth > 0) {
      singleImg.classList.add('is-loaded');
      singleSkeleton.classList.add('is-off');
      markFirstPage();
    }
    prefetchAround(2);
  }

  /* ---------------- 竖滚模式 ---------------- */

  let scrollBuilt = false;
  let wtItems = [];
  let scrollIdx = 0;
  let loadIO = null;
  let cleanIO = null;
  let scrollRaf = 0;
  let lastScrollTop = 0;

  function buildScroll() {
    scrollList.innerHTML = '';
    wtItems = [];
    const frag = document.createDocumentFragment();
    for (let p = 1; p <= TOTAL; p++) {
      if (STAGE_PAGES[p]) {
        const sep = document.createElement('div');
        sep.className = 'wt-sep';
        sep.textContent = `P.${p} · ${STAGE_PAGES[p]}`;
        frag.appendChild(sep);
      }
      const fig = document.createElement('figure');
      fig.className = 'wt-item';
      fig.dataset.page = String(p);

      const sk = document.createElement('div');
      sk.className = 'wt-skeleton';
      const img = document.createElement('img');
      img.alt = `第 ${p} 页`;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.width = 1000;
      img.height = 1414;
      img.dataset.src = imgUrl(p);
      img.addEventListener('load', () => {
        img.classList.add('is-loaded');
        if (p === page) markFirstPage();
      });
      img.addEventListener('error', () => {
        if (img.dataset.fallback) return;
        img.dataset.fallback = '1';
        img.src = `pages_v4/page_${pad3(p)}.jpg`;
      });

      fig.appendChild(sk);
      fig.appendChild(img);
      frag.appendChild(fig);
      wtItems.push(fig);
    }
    scrollList.appendChild(frag);

    if (loadIO) loadIO.disconnect();
    if (cleanIO) cleanIO.disconnect();
    loadIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const img = en.target.querySelector('img');
        if (img && !img.getAttribute('src')) img.src = img.dataset.src;
      });
    }, { root: views.scroll, rootMargin: '900px 0px' });
    cleanIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) return;
        const img = en.target.querySelector('img');
        if (img && img.getAttribute('src') && Math.abs(Number(en.target.dataset.page) - page) > 10) {
          img.removeAttribute('src');
          img.classList.remove('is-loaded');
        }
      });
    }, { root: views.scroll, rootMargin: '1800px 0px' });
    wtItems.forEach((el) => { loadIO.observe(el); cleanIO.observe(el); });
    scrollBuilt = true;
    views.scroll.scrollTop = 0;
  }

  function scrollToPage(p, smooth) {
    const el = wtItems[p - 1];
    if (!el) return;
    views.scroll.scrollTo({ top: Math.max(0, el.offsetTop - 2), behavior: smooth ? 'smooth' : 'auto' });
    scrollIdx = p - 1;
  }

  function onScroll() {
    if (mode !== 'scroll') return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const top = views.scroll.scrollTop;
      const h = views.scroll.clientHeight;
      const y = top + h * 0.42;
      let i = scrollIdx;
      while (i + 1 < wtItems.length && wtItems[i + 1].offsetTop < y) i++;
      while (i > 0 && wtItems[i].offsetTop > y) i--;
      scrollIdx = i;
      const p = i + 1;
      if (p !== page) {
        page = p;
        syncUI();
        save();
      }
      const delta = top - lastScrollTop;
      lastScrollTop = top;
      if (delta > 24) { clearTimeout(chromeTimer); hideChrome(); }
      else if (delta < -16 && app.classList.contains('chrome-hidden')) showChrome();
    });
  }

  /* ---------------- 文字模式 ---------------- */

  function ensureData() {
    if (bookData) return Promise.resolve(bookData);
    if (dataPromise) return dataPromise;
    dataPromise = fetch('assets/data/book.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`book.json ${res.status}`);
        return res.json();
      })
      .then((data) => {
        bookData = data;
        afterData();
        return data;
      })
      .catch((err) => {
        console.warn('[reader] book.json', err);
        if (tocList) tocList.innerHTML = '<div class="toc-loading">目录数据加载失败，请刷新重试。</div>';
        return null;
      });
    return dataPromise;
  }

  function afterData() {
    renderToc();
    syncUI();
    if (mode === 'text') renderText();
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function cleanMd(s) { return String(s || '').replace(/\*\*/g, '').replace(/`/g, '').trim(); }

  function renderText() {
    textBody.innerHTML = '';
    views.text.scrollTop = 0;
    if (!bookData) {
      textBody.appendChild(el('div', 'text-loading', '文字层加载中…'));
      ensureData();
      return;
    }
    if (!textTarget || textTarget.kind === 'guide') {
      textTarget = { kind: 'guide' };
      renderGuideText();
      textVolNo.textContent = '导读';
      updateTextNavDisabled();
      return;
    }
    const v = clamp(textTarget.v, 1, 80);
    const vol = bookData.volumes[v - 1];
    if (!vol) return;
    textVolNo.textContent = `第 ${v} 册`;

    const stage = el('span', 't-stage', vol.stage || '');
    textBody.appendChild(stage);
    const h = el('h2', null, `第${v}册 · ${vol.title}`);
    textBody.appendChild(h);
    const meta = el('p', 't-meta', `P.${vol.range[0]}–P.${vol.range[1]} ｜ ${vol.stage} 篇`);
    textBody.appendChild(meta);
    if (vol.synopsis) textBody.appendChild(el('p', 't-synopsis', cleanMd(vol.synopsis)));

    vol.panels.forEach((p) => {
      const wrap = el('div', 't-panel');
      if (p.caption) wrap.appendChild(el('span', 't-panel-cap', cleanMd(p.caption)));
      if (p.line) {
        const line = el('div', 't-line');
        if (p.speaker) line.appendChild(el('span', 't-speaker', p.speaker));
        line.appendChild(el('span', 't-quote', `“${cleanMd(p.line)}”`));
        wrap.appendChild(line);
      }
      textBody.appendChild(wrap);
    });
    textBody.appendChild(el('div', 't-end', v >= 80 ? '— 全书完 —' : '翻到下册，故事还在继续 —'));
    updateTextNavDisabled();
  }

  function renderGuideText() {
    const g = bookData.guide;
    textBody.appendChild(el('h2', null, g.title || '通读导读'));
    if (g.oneLiner) textBody.appendChild(el('p', 't-synopsis', cleanMd(g.oneLiner)));
    g.sections.forEach((sec) => {
      const box = el('div', 't-guide-sec');
      box.appendChild(el('h3', null, cleanMd(sec.title)));
      sec.body.forEach((para) => box.appendChild(el('p', null, cleanMd(para))));
      textBody.appendChild(box);
    });
    textBody.appendChild(el('div', 't-end', '从补一片漏雨的云，到给整座城缝一道带灰色的彩虹。'));
  }

  function updateTextNavDisabled() {
    const prev = $('btnTextPrevVol');
    const next = $('btnTextNextVol');
    const isGuide = !textTarget || textTarget.kind === 'guide';
    prev.disabled = isGuide;
    next.disabled = !isGuide && textTarget.v >= 80;
    $('btnTextPrevVol').style.opacity = prev.disabled ? '0.35' : '1';
    $('btnTextNextVol').style.opacity = next.disabled ? '0.35' : '1';
  }

  function goTextVolume(v, opts = {}) {
    v = clamp(v, 1, 80);
    textTarget = { kind: 'volume', v };
    page = volStart(v);
    renderText();
    syncUI();
    save();
    if (opts.scroll !== false) views.text.scrollTop = 0;
  }

  function textStep(dir) {
    if (!textTarget || textTarget.kind === 'guide') {
      if (dir > 0) goTextVolume(1);
      return;
    }
    const next = textTarget.v + dir;
    if (next < 1) { textTarget = { kind: 'guide' }; renderText(); page = 1; syncUI(); save(); return; }
    if (next > 80) return;
    goTextVolume(next);
  }

  /* ---------------- 导航 ---------------- */

  function go(n, opts = {}) {
    const target = clamp(Math.round(Number(n) || 1), 1, TOTAL);
    if (mode === 'text') {
      page = target;
      textTarget = target <= 6 ? { kind: 'guide' } : { kind: 'volume', v: volOfPage(target) };
      renderText();
      views.text.scrollTop = 0;
      syncUI();
      save();
      return;
    }
    page = target;
    if (mode === 'flip') {
      if (pageFlip) {
        ensureFlipRange(target);
        pageFlip.turnToPage(target - 1);
      }
      resetZoom(true);
      prefetchAround(2);
      scheduleRelease();
    } else if (mode === 'single') {
      resetZoom(true);
      showSingle(target);
    } else if (mode === 'scroll') {
      if (!scrollBuilt) buildScroll();
      scrollToPage(target, !!opts.smooth);
      prefetch(target + 1);
    }
    syncUI();
    save();
    if (mode === 'flip') prefetchFlipSoon();
  }

  function stepPage(dir) {
    if (mode === 'text') { textStep(dir); return; }
    if (mode === 'flip' && pageFlip) {
      if ((dir < 0 && page <= 1) || (dir > 0 && page >= TOTAL)) return;
      resetZoom(true);
      if (dir < 0) flipTurn('prev'); else flipTurn('next');
      return;
    }
    const next = page + dir;
    if (next < 1 || next > TOTAL) return;
    go(next);
  }

  function nextPage() { stepPage(1); }
  function prevPage() { stepPage(-1); }

  /* ---------------- 缩放 ---------------- */

  const zoom = { scale: 1, tx: 0, ty: 0 };
  function zoomTargetEl() {
    if (mode === 'flip') return flipWrap;
    if (mode === 'single') return singleZoom;
    return null;
  }
  function zoomLimits() {
    const v = views[mode] || stage;
    return { w: v.clientWidth || stage.clientWidth, h: v.clientHeight || stage.clientHeight };
  }
  function clampTranslate() {
    const { w, h } = zoomLimits();
    const maxX = Math.max(0, (zoom.scale - 1) * w / 2);
    const maxY = Math.max(0, (zoom.scale - 1) * h / 2);
    zoom.tx = clamp(zoom.tx, -maxX, maxX);
    zoom.ty = clamp(zoom.ty, -maxY, maxY);
  }
  function applyZoom() {
    const target = zoomTargetEl();
    if (!target) return;
    target.style.transform = `translate3d(${zoom.tx}px, ${zoom.ty}px, 0) scale(${zoom.scale})`;
    const visible = zoom.scale > 1.02;
    zoomChip.hidden = !visible;
    if (visible) zoomVal.textContent = `${zoom.scale.toFixed(1)}×`;
  }
  function setZoom(scale, tx, ty, instant) {
    zoom.scale = clamp(scale, 1, 4);
    zoom.tx = tx; zoom.ty = ty;
    if (zoom.scale <= 1.001) { zoom.scale = 1; zoom.tx = 0; zoom.ty = 0; }
    clampTranslate();
    const target = zoomTargetEl();
    if (target) target.classList.toggle('no-anim', !!instant);
    applyZoom();
    if (instant && target) requestAnimationFrame(() => target.classList.remove('no-anim'));
  }
  function resetZoom(instant) {
    setZoom(1, 0, 0, instant !== false);
    const t = zoomTargetEl();
    if (t && !instant) t.classList.remove('no-anim');
  }
  function toggleZoomAt(x, y) {
    if (zoom.scale > 1.01) { resetZoom(); return; }
    if (mode !== 'flip' && mode !== 'single') return;
    const rect = views[mode].getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const s = 2.4;
    const px = x - cx;
    const py = y - cy;
    setZoom(s, (1 - s) * px, (1 - s) * py, false);
  }

  /* ---------------- 手势 ---------------- */

  const pointers = new Map();
  let gesture = null;
  let downInfo = null;
  let moved = false;
  let pinchUsed = false;
  let tapTimer = 0;
  let lastTap = null;
  let suppressTap = false;

  function canGesture() { return mode === 'flip' || mode === 'single'; }
  function viewRect() { return views[mode].getBoundingClientRect(); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function twoPointers() {
    const arr = Array.from(pointers.values());
    return arr.length >= 2 ? [arr[0], arr[1]] : null;
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!canGesture()) return;
    if (e.target.closest('button, input, a, .zoom-chip')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (pointers.size === 1) {
      downInfo = { x: e.clientX, y: e.clientY, t: Date.now(), top: views.scroll.scrollTop };
      moved = false;
      pinchUsed = false;
      suppressTap = false;
      gesture = zoom.scale > 1.01 ? { type: 'pan', x0: e.clientX, y0: e.clientY, tx0: zoom.tx, ty0: zoom.ty } : null;
    } else if (pointers.size === 2) {
      const pair = twoPointers();
      if (!pair) return;
      const [a, b] = pair;
      clearTimeout(tapTimer); tapTimer = 0; lastTap = null;
      gesture = {
        type: 'pinch',
        d0: Math.max(1, dist(a, b)),
        s0: zoom.scale,
        t0: { x: zoom.tx, y: zoom.ty },
        m0: mid(a, b),
      };
      pinchUsed = true;
      moved = true;
    }
  }, { passive: true });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && gesture.type === 'pinch' && pointers.size >= 2) {
      e.preventDefault();
      const pair = twoPointers();
      if (!pair) return;
      const [a, b] = pair;
      const d = Math.max(1, dist(a, b));
      const m = mid(a, b);
      const rect = viewRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const s = clamp(gesture.s0 * d / gesture.d0, 1, 4);
      const ratio = s / gesture.s0;
      const tx = (m.x - cx) - ratio * (gesture.m0.x - cx - gesture.t0.x);
      const ty = (m.y - cy) - ratio * (gesture.m0.y - cy - gesture.t0.y);
      setZoom(s, tx, ty, true);
      return;
    }
    if (gesture && gesture.type === 'pan' && pointers.size === 1) {
      e.preventDefault();
      zoom.tx = gesture.tx0 + (e.clientX - gesture.x0);
      zoom.ty = gesture.ty0 + (e.clientY - gesture.y0);
      clampTranslate();
      applyZoom();
      return;
    }
    if (downInfo && dist({ x: e.clientX, y: e.clientY }, downInfo) > 9) moved = true;
  }, { passive: false });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (gesture && gesture.type === 'pinch') {
      const pair = twoPointers();
      if (pair) return;
      if (pointers.size === 1) {
        const rest = Array.from(pointers.values())[0];
        gesture = zoom.scale > 1.01 ? { type: 'pan', x0: rest.x, y0: rest.y, tx0: zoom.tx, ty0: zoom.ty } : null;
        return;
      }
      gesture = null;
      if (zoom.scale <= 1.02) resetZoom();
      return;
    }
    if (gesture && gesture.type === 'pan') {
      if (pointers.size > 0) return;
      gesture = null;
      if (zoom.scale < 1.02) resetZoom();
      return;
    }
    if (pointers.size > 0) return;

    const info = downInfo;
    downInfo = null;
    if (!info || pinchUsed || suppressTap) return;
    const x = e.clientX;
    const y = e.clientY;
    const dx = x - info.x;
    const dy = y - info.y;
    const dt = Date.now() - info.t;

    const horizontal = Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.25;
    const vertical = mode === 'single' && Math.abs(dy) > 58 && Math.abs(dy) > Math.abs(dx) * 1.25;
    if (moved && zoom.scale <= 1.01 && dt < 700 && (horizontal || vertical)) {
      suppressTap = true;
      if (horizontal) { if (dx < 0) nextPage(); else prevPage(); }
      else { if (dy < 0) nextPage(); else prevPage(); }
      return;
    }
    if (moved || dt > 520) return;
    if (zoom.scale > 1.01) { toggleChrome(); return; }
    handleTap(x, y);
  }

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  function handleTap(x, y) {
    const now = Date.now();
    if (lastTap && now - lastTap.t < 330 && Math.hypot(x - lastTap.x, y - lastTap.y) < 34) {
      clearTimeout(tapTimer);
      tapTimer = 0;
      lastTap = null;
      toggleZoomAt(x, y);
      return;
    }
    lastTap = { x, y, t: now };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapTimer = 0;
      lastTap = null;
      singleTapAction(x, y);
    }, 280);
  }

  function singleTapAction(x, y) {
    if (app.classList.contains('chrome-hidden')) { showChrome(); return; }
    const rect = viewRect();
    const rel = (x - rect.left) / rect.width;
    if (rel < 0.3) prevPage();
    else if (rel > 0.7) nextPage();
    else toggleChrome();
    if (isFullscreen() || immersive) scheduleChromeHide();
  }

  // 桌面滚轮：Ctrl 缩放；普通滚轮在翻书/单页里翻页
  stage.addEventListener('wheel', (e) => {
    if (!canGesture()) return;
    if (e.ctrlKey) {
      e.preventDefault();
      const rect = viewRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const s = clamp(zoom.scale * (e.deltaY < 0 ? 1.12 : 0.89), 1, 4);
      const px = e.clientX - cx;
      const py = e.clientY - cy;
      const qx = (px - zoom.tx) / zoom.scale;
      const qy = (py - zoom.ty) / zoom.scale;
      setZoom(s, px - s * qx, py - s * qy, false);
      return;
    }
    if (zoom.scale > 1.01) return;
    if (Math.abs(e.deltaY) < 18) return;
    e.preventDefault();
    if (e.deltaY > 0) nextPage(); else prevPage();
  }, { passive: false });

  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  /* ---------------- 全屏 / 沉浸 ---------------- */

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let immersive = false;
  function isFullscreen() { return !!document.fullscreenElement; }
  function fsAvailable() { return !!document.documentElement.requestFullscreen; }
  function updateFullBtn() {
    const btn = $('btnFull');
    const active = isFullscreen() || immersive;
    btn.setAttribute('aria-label', active ? '退出全屏' : '全屏');
    document.body.classList.toggle('is-fullscreen', isFullscreen());
    document.body.classList.toggle('is-immersive', immersive);
  }
  function enterImmersive() {
    immersive = true;
    updateFullBtn();
    hideChrome();
    nudgeIOS();
    toast('已进入沉浸模式：轻点屏幕显示工具栏', 2600);
  }
  function exitImmersive() {
    immersive = false;
    updateFullBtn();
    showChrome();
  }
  function toggleImmersive() { if (immersive) exitImmersive(); else enterImmersive(); }
  function nudgeIOS() {
    if (!isIOS) return;
    try {
      const b = document.body;
      const oldPos = b.style.position;
      const oldH = b.style.height;
      b.style.position = 'relative';
      b.style.height = '101%';
      window.scrollTo(0, 1);
      setTimeout(() => { b.style.position = oldPos || 'fixed'; b.style.height = oldH || '100%'; window.scrollTo(0, 0); }, 120);
    } catch (e) { /* ignore */ }
  }
  async function toggleFullscreen() {
    if (immersive) { exitImmersive(); return; }
    if (isFullscreen()) {
      try { await document.exitFullscreen(); } catch (e) { /* ignore */ }
      return;
    }
    if (isIOS && !fsAvailable()) { enterImmersive(); return; }
    if (!fsAvailable()) { enterImmersive(); return; }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (e) {
      enterImmersive();
    }
  }
  document.addEventListener('fullscreenchange', () => {
    updateFullBtn();
    if (isFullscreen()) {
      toast('已进入全屏，轻点屏幕显示工具栏', 2200);
      scheduleChromeHide();
    } else {
      showChrome();
      clearTimeout(chromeTimer);
    }
    setTimeout(() => { if (mode === 'flip' && pageFlip) pageFlip.update(); }, 320);
  });

  /* ---------------- 目录 ---------------- */

  let tocBuilt = false;
  const expandedStages = new Set();

  function renderToc() {
    if (!bookData) return;
    tocList.innerHTML = '';
    const frag = document.createDocumentFragment();

    const guideLink = el('button', 'toc-link');
    guideLink.dataset.page = '1';
    guideLink.appendChild(el('span', 'toc-k', '导读'));
    guideLink.appendChild(el('span', 'toc-t', '通读导读 · 她怎么把城缝回来'));
    guideLink.appendChild(el('span', 'toc-p', 'P.1–5'));
    guideLink.addEventListener('click', () => {
      closeToc();
      if (mode === 'text') { textTarget = { kind: 'guide' }; page = 1; renderText(); syncUI(); save(); }
      else go(1);
    });
    frag.appendChild(guideLink);

    const tocLink = el('button', 'toc-link');
    tocLink.dataset.page = '6';
    tocLink.appendChild(el('span', 'toc-k', '目录'));
    tocLink.appendChild(el('span', 'toc-t', '总目录 · 全书 80 册一览'));
    tocLink.appendChild(el('span', 'toc-p', 'P.6'));
    tocLink.addEventListener('click', () => {
      closeToc();
      if (mode === 'text') { textTarget = { kind: 'guide' }; page = 1; renderText(); syncUI(); save(); }
      else go(6);
    });
    frag.appendChild(tocLink);

    bookData.stages.forEach((st) => {
      const group = el('div', 'toc-stage');
      const head = el('button', 'toc-stage-head');
      head.dataset.stage = st.key;
      head.setAttribute('aria-expanded', 'false');
      head.appendChild(el('span', 'stage-key', st.key));
      const title = el('span', 'stage-title', st.title.replace(/（.*?）/g, '').replace(/\s*$/g, ''));
      head.appendChild(title);
      head.appendChild(el('span', 'stage-count', `${st.volRange[0]}–${st.volRange[1]} 册`));
      const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chev.setAttribute('viewBox', '0 0 16 16');
      chev.setAttribute('class', 'chev');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M6 3l5 5-5 5');
      chev.appendChild(path);
      head.appendChild(chev);

      const vols = el('div', 'toc-vols');
      for (let v = st.volRange[0]; v <= st.volRange[1]; v++) {
        const vol = bookData.volumes[v - 1];
        const b = el('button', 'toc-vol');
        b.dataset.page = String(vol.range[0]);
        b.dataset.vol = String(v);
        b.appendChild(el('span', 'vno', String(v).padStart(2, '0')));
        b.appendChild(el('span', 'vtitle', vol.title));
        b.appendChild(el('span', 'vpage', `P.${vol.range[0]}`));
        b.addEventListener('click', () => {
          closeToc();
          if (mode === 'text') goTextVolume(v);
          else go(vol.range[0]);
        });
        vols.appendChild(b);
      }

      head.addEventListener('click', () => {
        const open = !vols.classList.contains('open');
        vols.classList.toggle('open', open);
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) expandedStages.add(st.key); else expandedStages.delete(st.key);
      });

      group.appendChild(head);
      group.appendChild(vols);
      frag.appendChild(group);
    });

    tocList.appendChild(frag);
    tocBuilt = true;
    // 默认展开当前阶段
    const cv = page <= 6 ? 1 : volOfPage(page);
    const st = bookData.stages.find((s) => cv >= s.volRange[0] && cv <= s.volRange[1]);
    if (st) {
      const head = tocList.querySelector(`.toc-stage-head[data-stage="${st.key}"]`);
      if (head) head.click();
    }
    syncUI();
  }

  function openToc() {
    if (!tocBuilt) { ensureData().then(renderToc); }
    tocMask.hidden = false;
    tocDrawer.classList.add('show');
    tocDrawer.setAttribute('aria-hidden', 'false');
    $('btnToc').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => tocMask.classList.add('show'));
  }
  function closeToc() {
    tocDrawer.classList.remove('show');
    tocDrawer.setAttribute('aria-hidden', 'true');
    $('btnToc').setAttribute('aria-expanded', 'false');
    tocMask.classList.remove('show');
    setTimeout(() => { tocMask.hidden = true; }, 240);
  }

  /* ---------------- 设置面板 ---------------- */

  function applyTextPrefs() {
    textView.classList.remove('theme-paper', 'theme-green', 'theme-night');
    textView.classList.add(`theme-${textOpts.bg}`);
    textView.style.setProperty('--tx-size', `${textOpts.size}px`);
    textView.style.setProperty('--tx-lh', String(textOpts.lh));
    textView.style.setProperty('--tx-fw', String(textOpts.fw));
    $('setFontVal').textContent = String(textOpts.size);
    setSeg($('segLeading'), 'lh', String(textOpts.lh));
    setSeg($('segBg'), 'bg', textOpts.bg);
    setSeg($('segWeight'), 'fw', String(textOpts.fw));
    setSeg($('segTier'), 'tier', tier);
    $('tierNote').textContent = tier === 'm'
      ? '当前：省流档 1000px · 单页约 170 KB，首屏 3 页约 157 KB。'
      : '当前：高清档 1600px · 单页约 440 KB，适合 Wi-Fi 与大屏。';
  }
  function setSeg(container, key, value) {
    if (!container) return;
    container.querySelectorAll('button').forEach((b) => {
      const v = b.dataset[key];
      b.setAttribute('aria-pressed', v === value ? 'true' : 'false');
    });
  }
  function openSheet() {
    sheetMask.hidden = false;
    sheet.classList.add('show');
    sheet.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => sheetMask.classList.add('show'));
    applyTextPrefs();
  }
  function closeSheet() {
    sheet.classList.remove('show');
    sheet.setAttribute('aria-hidden', 'true');
    sheetMask.classList.remove('show');
    setTimeout(() => { sheetMask.hidden = true; }, 260);
  }
  function setFontSize(n) {
    textOpts.size = clamp(Math.round(n), 14, 30);
    applyTextPrefs();
    save();
  }
  function setTier(t) {
    if (t !== 'm' && t !== 'd') return;
    if (t === tier) return;
    tier = t;
    state.tier = t;
    prefetched.clear();
    singleLoaded = -1;
    if (mode === 'flip') { rebuildFlip(); }
    else if (mode === 'single') { showSingle(page); }
    else if (mode === 'scroll') { scrollBuilt = false; buildScroll(); scrollToPage(page); }
    applyTextPrefs();
    save();
    toast(t === 'm' ? '已切换到省流档 · 1000px' : '已切换到高清档 · 1600px');
  }

  /* ---------------- 模式切换 ---------------- */

  function setMode(next) {
    if (!validMode(next) || next === mode) return;
    resetZoom(true);
    if (mode === 'flip') destroyFlip();
    mode = next;
    showView();
    showChrome();
    if (mode === 'flip') {
      initFlip();
    } else if (mode === 'single') {
      singleLoaded = -1;
      showSingle(page);
    } else if (mode === 'scroll') {
      if (!scrollBuilt) buildScroll();
      requestAnimationFrame(() => scrollToPage(page));
    } else {
      if (!bookData) ensureData().then(() => { if (mode === 'text') renderText(); });
      textTarget = page <= 6 ? { kind: 'guide' } : { kind: 'volume', v: volOfPage(page) };
      renderText();
    }
    syncUI();
    save();
    prefetchAround(2);
  }

  /* ---------------- 事件绑定 ---------------- */

  $('btnToc').addEventListener('click', openToc);
  $('btnTocClose').addEventListener('click', closeToc);
  tocMask.addEventListener('click', closeToc);
  $('btnSettings').addEventListener('click', openSheet);
  $('btnSheetClose').addEventListener('click', closeSheet);
  sheetMask.addEventListener('click', closeSheet);
  $('btnFull').addEventListener('click', toggleFullscreen);
  $('btnFull2').addEventListener('click', toggleFullscreen);
  $('btnZoomReset').addEventListener('click', () => resetZoom());
  $('btnZoomReset2').addEventListener('click', () => resetZoom());
  $('btnResume').addEventListener('click', () => { go(resumePage); closeToc(); });

  btnPrev.addEventListener('click', prevPage);
  btnNext.addEventListener('click', nextPage);

  slider.addEventListener('input', () => {
    pageLabel.textContent = `P.${slider.value}`;
    slider.style.setProperty('--p', `${((Number(slider.value) - 1) / (TOTAL - 1)) * 100}%`);
  });
  slider.addEventListener('change', () => go(Number(slider.value)));

  document.querySelectorAll('.mode-tabs button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  $('btnTextPrevVol').addEventListener('click', () => textStep(-1));
  $('btnTextNextVol').addEventListener('click', () => textStep(1));
  $('btnTextSettings').addEventListener('click', openSheet);
  $('btnFontMinus').addEventListener('click', () => setFontSize(textOpts.size - 1));
  $('btnFontPlus').addEventListener('click', () => setFontSize(textOpts.size + 1));
  $('btnSetFontMinus').addEventListener('click', () => setFontSize(textOpts.size - 1));
  $('btnSetFontPlus').addEventListener('click', () => setFontSize(textOpts.size + 1));

  $('segLeading').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lh]');
    if (!b) return;
    textOpts.lh = Number(b.dataset.lh);
    applyTextPrefs(); save();
  });
  $('segBg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bg]');
    if (!b) return;
    textOpts.bg = b.dataset.bg;
    applyTextPrefs(); save();
  });
  $('segWeight').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fw]');
    if (!b) return;
    textOpts.fw = Number(b.dataset.fw);
    applyTextPrefs(); save();
  });
  $('segTier').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tier]');
    if (b) setTier(b.dataset.tier);
  });

  views.scroll.addEventListener('scroll', onScroll, { passive: true });

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      if (sheet.classList.contains('show')) { closeSheet(); return; }
      if (tocDrawer.classList.contains('show')) { closeToc(); return; }
      if (immersive) { exitImmersive(); return; }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevPage(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); nextPage(); }
    else if (e.key === 'Home') { e.preventDefault(); go(1); }
    else if (e.key === 'End') { e.preventDefault(); go(TOTAL); }
    else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    else if (e.key === 't' || e.key === 'T') { toggleChrome(); }
    else if (e.key >= '1' && e.key <= '4') {
      const modes = ['flip', 'single', 'scroll', 'text'];
      setMode(modes[Number(e.key) - 1]);
    }
  });

  let resizeTimer = 0;
  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (mode === 'flip' && pageFlip && (Math.abs(w - lastW) > 40 || Math.abs(h - lastH) > 40)) {
        rebuildFlip();
      } else if (mode === 'flip' && pageFlip) {
        pageFlip.update();
      }
      if (mode === 'scroll' && scrollBuilt && (Math.abs(w - lastW) > 40 || Math.abs(h - lastH) > 40)) {
        scrollToPage(page);
      }
      if (zoom.scale > 1.01) clampTranslate();
      lastW = w; lastH = h;
    }, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { setTimeout(onResize, 260); });
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  /* ---------------- 首屏与启动 ---------------- */

  let firstPageMarked = false;
  const bootT0 = performance.now();
  function markFirstPage() {
    if (firstPageMarked) return;
    firstPageMarked = true;
    performance.mark('nws-first-page');
    try {
      const ent = performance.getEntriesByName('nws-first-page')[0];
      if (window.__reader) window.__reader.perf.firstPageMs = Math.round(ent.startTime);
    } catch (e) { /* ignore */ }
  }
  function finishBoot() {
    if (boot.classList.contains('is-done')) return;
    bootBar.style.width = '100%';
    boot.classList.add('is-done');
    if (!firstPageMarked) markFirstPage();
    try { window.__reader.ready = true; } catch (e) { /* ignore */ }
    setTimeout(() => ensureData(), 300);
    if (mode === 'single') prefetchAround(2);
    if (mode === 'flip') prefetchAround(3);
    if (resumePage > 1 && resumePage !== page) {
      setTimeout(() => toast(`上次读到 P.${resumePage}，目录里可“续读”`, 2600), 900);
    }
    showGestureHintOnce();
  }
  function showGestureHintOnce() {
    try { if (new URLSearchParams(location.search).has('nohint')) return; } catch (e) { /* ignore */ }
    let once = false;
    try { once = sessionStorage.getItem('nws.hint') === '1'; } catch (e) { once = true; }
    if (once) return;
    try { sessionStorage.setItem('nws.hint', '1'); } catch (e) { /* ignore */ }
    setTimeout(() => {
      hintEl.classList.add('show');
      setTimeout(() => hintEl.classList.remove('show'), 4200);
    }, 1400);
  }

  function startFirstImage() {
    bootBar.style.width = '55%';
    const probe = new Image();
    probe.decoding = 'async';
    probe.src = imgUrl(page);
    const done = () => { bootBar.style.width = '85%'; setTimeout(finishBoot, 60); };
    if (probe.complete && probe.naturalWidth > 0) { done(); return; }
    probe.addEventListener('load', done, { once: true });
    probe.addEventListener('error', done, { once: true });
    setTimeout(done, 3200);
  }

  function bootUp() {
    applyTextPrefs();
    showView();
    syncUI();

    if (mode === 'flip') {
      initFlip();
    } else if (mode === 'single') {
      showSingle(page);
    } else if (mode === 'scroll') {
      buildScroll();
      requestAnimationFrame(() => scrollToPage(page));
    } else {
      renderText();
    }
    startFirstImage();
    setTimeout(finishBoot, 4500);

    window.__reader = {
      ready: false,
      perf: { bootStart: Math.round(bootT0), firstPageMs: null, tier: tier, mode: mode },
      get page() { return page; },
      get mode() { return mode; },
      get tier() { return tier; },
      get zoom() { return { scale: zoom.scale, tx: zoom.tx, ty: zoom.ty }; },
      get data() { return bookData; },
      get total() { return TOTAL; },
      go, setMode, next: nextPage, prev: prevPage,
      resetZoom, hideChrome, showChrome, toggleFullscreen,
      openToc, closeToc, openSheet, closeSheet,
      goVolume: goTextVolume,
      zoomTo(scale, x, y) { toggleZoomAt(x == null ? window.innerWidth / 2 : x, y == null ? window.innerHeight / 2 : y); },
      pageBytes(p) {
        const e = performance.getEntriesByType('resource').find((r) => r.name.includes(`page_${pad3(p)}`));
        return e ? e.encodedBodySize || e.transferSize || 0 : 0;
      },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUp);
  else bootUp();
})();
