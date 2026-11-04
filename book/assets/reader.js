(() => {
  'use strict';

  const TOTAL = 166;
  const WINDOW_BACK = 2;
  const WINDOW_AHEAD = 3;
  const UNLOAD_DISTANCE = 7;

  const stage = document.getElementById('stage');
  const bookEl = document.getElementById('book');
  const bootEl = document.getElementById('boot');
  const spineEl = document.getElementById('spine');
  const bookShadowEl = document.getElementById('bookShadow');
  const edgeLeft = document.getElementById('edgeLeft');
  const edgeRight = document.getElementById('edgeRight');
  const hintEl = document.getElementById('hint');
  const slider = document.getElementById('slider');
  const pageLabel = document.getElementById('pageLabel');
  const jumpInput = document.getElementById('jumpInput');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnJump = document.getElementById('btnJump');

  const pad = (n) => String(n).padStart(3, '0');
  const pageUrl = (i) => `pages/page_${pad(i)}.jpg`;

  const imgs = new Array(TOTAL).fill(null);
  let pageFlip = null;
  let current = 0;
  let flipping = false;
  let unloadTimer = 0;
  let started = false;

  const coverPreload = new Image();
  coverPreload.src = pageUrl(1);

  function buildPages() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < TOTAL; i++) {
      const page = document.createElement('div');
      page.className = 'page';
      page.dataset.page = String(i + 1);
      if (i === 0) {
        page.dataset.density = 'hard';
        page.dataset.cover = 'front';
      }
      if (i === TOTAL - 1) {
        page.dataset.density = 'hard';
        page.dataset.cover = 'back';
      }

      const inner = document.createElement('div');
      inner.className = 'page-inner';

      const img = document.createElement('img');
      img.className = 'page-img';
      img.dataset.src = pageUrl(i + 1);
      img.alt = `第 ${i + 1} 页`;
      img.draggable = false;
      img.decoding = 'async';
      img.addEventListener('load', () => {
        if (!img.getAttribute('src')) return;
        img.classList.add('is-loaded');
        page.classList.add('is-loaded');
      });

      const loader = document.createElement('div');
      loader.className = 'page-loading';

      inner.appendChild(img);
      inner.appendChild(loader);
      page.appendChild(inner);
      frag.appendChild(page);
      imgs[i] = img;
    }
    bookEl.appendChild(frag);
  }

  function ensure(i) {
    if (i < 0 || i >= TOTAL) return;
    const img = imgs[i];
    if (!img || img.getAttribute('src')) return;
    img.src = img.dataset.src;
  }

  function ensureAround(index) {
    for (let i = index - WINDOW_BACK; i <= index + WINDOW_AHEAD; i++) ensure(i);
  }

  function releaseFar(index) {
    for (let i = 0; i < TOTAL; i++) {
      if (Math.abs(i - index) <= UNLOAD_DISTANCE) continue;
      const img = imgs[i];
      if (img && img.getAttribute('src')) {
        img.removeAttribute('src');
        img.classList.remove('is-loaded');
        img.parentElement.parentElement.classList.remove('is-loaded');
      }
    }
  }

  function scheduleRelease() {
    clearTimeout(unloadTimer);
    unloadTimer = setTimeout(() => {
      if (!flipping) releaseFar(current);
    }, 900);
  }

  function visibleInfo(index) {
    const last = TOTAL - 1;
    if (index <= 0) return { left: false, right: true, spine: false };
    if (index >= last) return { left: true, right: false, spine: false };
    return { left: true, right: true, spine: true };
  }

  function visibleBookRect() {
    const rect = pageFlip.getBoundsRect();
    const landscape = pageFlip.getOrientation() === 'landscape';
    return landscape
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : { left: rect.left + rect.pageWidth, top: rect.top, width: rect.pageWidth, height: rect.height };
  }

  // StPageFlip 在 disableFlipByClick=true 时，flipPrev 的固定坐标点会被“不在折角”判定拦截，
  // 这里在调用瞬间临时放开该开关，保证触摸区域的翻页动画照常触发。
  function animateFlip(dir, corner = 'bottom') {
    if (!pageFlip) return;
    const settings = pageFlip.getSettings();
    const old = settings.disableFlipByClick;
    settings.disableFlipByClick = false;
    try {
      if (dir === 'prev') pageFlip.flipPrev(corner);
      else pageFlip.flipNext(corner);
    } finally {
      settings.disableFlipByClick = old;
    }
  }

  function syncChrome() {
    if (!pageFlip) return;
    const rect = pageFlip.getBoundsRect();
    const view = visibleBookRect();
    const b = bookEl.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const ox = Math.round(b.left - s.left);
    const oy = Math.round(b.top - s.top);

    const info = visibleInfo(current);
    const landscape = pageFlip.getOrientation() === 'landscape';

    const top = oy + Math.round(rect.top);
    const left = ox + Math.round(view.left);
    const width = Math.round(view.width);
    const height = Math.round(rect.height);

    bookShadowEl.style.top = `${top}px`;
    bookShadowEl.style.left = `${left}px`;
    bookShadowEl.style.width = `${width}px`;
    bookShadowEl.style.height = `${height}px`;

    spineEl.style.top = `${top}px`;
    spineEl.style.height = `${height}px`;
    spineEl.style.left = `${left + Math.round(width / 2) - 15}px`;
    spineEl.classList.toggle('is-on', landscape && info.spine);

    edgeLeft.style.top = `${top + 2}px`;
    edgeLeft.style.height = `${Math.max(0, height - 4)}px`;
    edgeLeft.style.left = `${left - 6}px`;
    edgeLeft.classList.toggle('is-off', !info.left || !landscape);

    edgeRight.style.top = `${top + 2}px`;
    edgeRight.style.height = `${Math.max(0, height - 4)}px`;
    edgeRight.style.left = `${left + width - 1}px`;
    edgeRight.classList.toggle('is-off', !info.right);
  }

  function updateUI() {
    if (!pageFlip) return;
    current = Math.max(0, Math.min(TOTAL - 1, pageFlip.getCurrentPageIndex()));
    pageLabel.textContent = `${current + 1} / ${TOTAL}`;
    slider.value = String(current + 1);
    btnPrev.disabled = current <= 0;
    btnNext.disabled = current >= TOTAL - 1;

    ensureAround(current);
    syncChrome();
    scheduleRelease();
  }

  function goToPage(pageNumber, animated) {
    if (!pageFlip) return;
    const target = Math.max(1, Math.min(TOTAL, pageNumber));
    ensureAround(target - 1);
    if (animated) {
      const delta = target - 1 - current;
      if (delta === 1) {
        animateFlip('next');
        return;
      }
      if (delta === -1) {
        animateFlip('prev');
        return;
      }
    }
    pageFlip.turnToPage(target - 1);
    updateUI();
  }

  function showHint() {
    hintEl.classList.add('is-on');
    setTimeout(() => hintEl.classList.remove('is-on'), 3600);
  }

  function init() {
    if (started) return;
    started = true;
    if (typeof St === 'undefined' || !St.PageFlip) {
      bootEl.querySelector('.boot-sub').textContent = '翻页库加载失败';
      return;
    }

    pageFlip = new St.PageFlip(bookEl, {
      width: 420,
      height: 594,
      size: 'stretch',
      minWidth: 360,
      maxWidth: 760,
      minHeight: 200,
      maxHeight: 1200,
      showCover: true,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.55,
      flippingTime: 720,
      useMouseEvents: false,
      swipeDistance: 24,
      disableFlipByClick: true,
      mobileScrollSupport: true,
      autoSize: false,
      startPage: 0,
      startZIndex: 0
    });

    pageFlip.on('changeState', (e) => {
      flipping = e.data === 'flipping';
    });

    pageFlip.on('flip', () => {
      updateUI();
    });

    pageFlip.on('changeOrientation', () => {
      updateUI();
      setTimeout(syncChrome, 120);
    });

    pageFlip.on('init', () => {
      updateUI();
      bootEl.classList.add('is-done');
      setTimeout(showHint, 600);
    });

    pageFlip.loadFromHTML(Array.from(bookEl.querySelectorAll('.page')));
    window.__reader = {
      get pageFlip() { return pageFlip; },
      total: TOTAL,
      get current() { return current; },
      get ready() { return pageFlip !== null; }
    };

    // 兜底：封面图不可用时也不要卡在装订页
    setTimeout(() => bootEl.classList.add('is-done'), 4000);
  }

  /* ---------- 交互 ---------- */

  let pointerStart = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button, a')) return;
    pointerStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, { passive: true });

  stage.addEventListener('pointerup', (e) => {
    if (!pointerStart || !pageFlip) return;
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    const dt = Date.now() - pointerStart.t;
    pointerStart = null;

    // 横向滑动翻页（触屏与鼠标拖动均可用）
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx > 0) {
        if (current > 0) animateFlip('prev');
      } else {
        if (current < TOTAL - 1) animateFlip('next');
      }
      return;
    }

    if (Math.abs(dx) > 14 || Math.abs(dy) > 30 || dt > 600) return;

    // 点按页面左右三分之一
    const r = visibleBookRect();
    const bx = bookEl.getBoundingClientRect().left + r.left;
    if (e.clientX < bx + r.width / 3) {
      if (current > 0) animateFlip('prev');
    } else if (e.clientX > bx + (r.width * 2) / 3) {
      if (current < TOTAL - 1) animateFlip('next');
    }
  }, { passive: true });

  btnPrev.addEventListener('click', () => {
    if (current > 0) animateFlip('prev');
  });
  btnNext.addEventListener('click', () => {
    if (current < TOTAL - 1) animateFlip('next');
  });

  let sliderTimer = 0;
  slider.addEventListener('input', () => {
    pageLabel.textContent = `${slider.value} / ${TOTAL}`;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => goToPage(Number(slider.value), false), 140);
  });
  slider.addEventListener('change', () => goToPage(Number(slider.value), false));

  function doJump() {
    const n = Number(jumpInput.value);
    if (!Number.isFinite(n)) return;
    goToPage(Math.round(n), false);
    jumpInput.value = '';
    jumpInput.blur();
  }

  btnJump.addEventListener('click', doJump);
  jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJump();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (current > 0) animateFlip('prev');
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      if (current < TOTAL - 1) animateFlip('next');
    } else if (e.key === 'Home') {
      goToPage(1, false);
    } else if (e.key === 'End') {
      goToPage(TOTAL, false);
    }
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncChrome, 150);
  });

  /* ---------- 启动 ---------- */

  buildPages();

  const start = () => init();
  if (coverPreload.complete && coverPreload.naturalWidth > 0) {
    start();
  } else {
    coverPreload.addEventListener('load', start);
    coverPreload.addEventListener('error', start);
    setTimeout(start, 2500);
  }
})();
