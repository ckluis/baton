(() => {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const A = window.anime;

  /* ---------------- reveal ---------------- */
  const rio = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  $$('.rv').forEach((el) => (RM ? el.classList.add('in') : rio.observe(el)));

  /* ---------------- counters ---------------- */
  const fmt = (v, dec) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US'));
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const el = e.target, to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    const o = { v: 0 };
    A({ targets: o, v: to, duration: 1700, easing: 'easeOutExpo', update: () => { el.textContent = fmt(o.v, dec); }, complete: () => { el.textContent = fmt(to, dec); } });
  }), { threshold: 0.6 });
  if (!RM && A) $$('[data-count]').forEach((el) => cio.observe(el));

  /* ---------------- side panels ---------------- */
  let openPanel = null, lastFocus = null;
  function openP(p) {
    if (openPanel) closeP(openPanel, false);
    lastFocus = document.activeElement;
    p.classList.add('open');
    p.setAttribute('aria-modal', 'true');
    openPanel = p;
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => p.focus({ preventScroll: true }), 40);
  }
  function closeP(p, restore = true) {
    p.classList.remove('open');
    p.removeAttribute('aria-modal');
    openPanel = null;
    document.documentElement.style.overflow = '';
    if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#p-"]');
    if (a) {
      const p = document.getElementById(a.getAttribute('href').slice(1));
      if (p && p.classList.contains('panel')) { e.preventDefault(); openP(p); }
      return;
    }
    const x = e.target.closest('.panel .x, .scrim');
    if (x) {
      const p = x.classList.contains('scrim') ? x.previousElementSibling : x.closest('.panel');
      if (p && p.classList.contains('open')) { e.preventDefault(); closeP(p); }
      return;
    }
    const t = e.target.closest('a[data-tab]');
    if (t) {
      const r = document.getElementById(t.dataset.tab);
      if (r) r.checked = true;
      if (t.dataset.row) openRow(+t.dataset.row);
    }
  });
  function trap(e) {
    const p = openPanel; if (!p) return;
    const f = $$('a[href], button, [tabindex]:not([tabindex="-1"])', p).filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === p)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- the mod mock ---------------- */
  const cc = $('#cc');
  const radios = ['t-watch', 't-mem', 't-sess', 't-env'].map((id) => document.getElementById(id));
  let ccVisible = false, ccActive = false, sel = 2;
  const agents = () => $$('.v-watch details.agent', cc);
  function mark() { agents().forEach((d, i) => d.classList.toggle('sel', i === sel)); }
  function openRow(i) {
    const list = agents(); if (!list[i]) return;
    sel = i; list.forEach((d, j) => { d.open = j === i; }); mark();
  }
  if (cc) {
    mark();
    new IntersectionObserver((es) => { ccVisible = es[0].intersectionRatio > 0.3; }, { threshold: [0, 0.3, 0.6] }).observe(cc);
    cc.addEventListener('pointerenter', () => { ccActive = true; });
    cc.addEventListener('pointerleave', () => { ccActive = false; });
    cc.addEventListener('focusin', () => { ccActive = true; });
    cc.addEventListener('focusout', () => { if (!cc.contains(document.activeElement)) ccActive = false; });
    cc.addEventListener('click', (e) => {
      const s = e.target.closest('summary.rw'); if (!s) return;
      sel = agents().indexOf(s.parentElement); mark();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openPanel) { closeP(openPanel); return; }
      const t = $('.panel:target');
      if (t) location.hash = $('.x', t).getAttribute('href');
      return;
    }
    if (e.key === 'Tab' && openPanel) { trap(e); return; }
    if (openPanel || !cc || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) && !document.activeElement.name) return;
    if (/^[1-4]$/.test(e.key) && ccVisible) { radios[+e.key - 1].checked = true; e.preventDefault(); return; }
    if (!ccActive || !radios[0].checked) return;
    const list = agents();
    if (e.key === 'ArrowDown' || e.key === 'j') { sel = Math.min(list.length - 1, sel + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && list[sel]) { list[sel].open = !list[sel].open; e.preventDefault(); }
  });

  /* live feed */
  const EV = [
    ['verify:parser', 'Bash  npm test -- parse --fuzz'],
    ['verify:importer', 'Read  test/import.test.ts'],
    ['run:bench', '<span class="st-bad">model</span> asked haiku → claude-haiku-4-5'],
    ['verify:importer', '<span class="st-ok">✓</span> no findings in the importer'],
    ['fix:round1', '◉ started · round 1 of 3 · claude-sonnet-5-5'],
    ['fix:round1', '✎ src/import/csv.ts <span class="st-ok">+9</span> <span class="st-bad">−3</span>'],
    ['fix:round1', '<span class="st-ok">✓</span> npm test 54/54'],
    ['fix:round1', '⎇ commit <span style="color:var(--yellow)">c07d4e2</span>'],
    ['re-verify', '◉ a fresh verifier · claude-opus-5-5'],
    ['re-verify', '<span class="st-ok">✓ confirmed</span> · 0 open findings'],
    ['merge queue', '⎇ PR #85 ready · waiting on you'],
    ['session', '● project:shop/session rewritten'],
  ];
  const feed = $('#feed');
  if (feed && !RM) {
    const base = feed.innerHTML;
    let i = 0, clock = 12 * 3600 + 42 * 60 + 2, usd = 3.84, eta = 38, n = 9;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setInterval(() => {
      if (!ccVisible || !radios[0].checked || document.hidden) return;
      if (i === EV.length) { i = 0; clock = 12 * 3600 + 42 * 60 + 2; usd = 3.84; eta = 38; n = 9; feed.innerHTML = base; }
      const [who, what] = EV[i++];
      clock += 14 + Math.floor(Math.random() * 20);
      usd += 0.03 + Math.random() * 0.05; eta = Math.max(1, eta - 3);
      if (who === 'fix:round1' && what.includes('started')) n = 10;
      if (who === 're-verify' && what.includes('confirmed')) n = 12;
      const hh = String(Math.floor(clock / 3600)).padStart(2, '0'), mm = String(Math.floor(clock / 60) % 60).padStart(2, '0'), ss = String(clock % 60).padStart(2, '0');
      const row = document.createElement('div');
      row.className = 'fe new';
      row.innerHTML = `<span class="ts">${hh}:${mm}:${ss}</span><span class="who">${who}</span><span>${what}</span>`;
      feed.appendChild(row);
      while (feed.children.length > 6) feed.removeChild(feed.firstElementChild);
      if (A) A({ targets: row, opacity: [0, 1], translateX: [-10, 0], duration: 500, easing: 'easeOutCubic' });
      setTimeout(() => row.classList.remove('new'), 1400);
      set('cc-usd', usd.toFixed(2)); set('cc-usd2', usd.toFixed(2));
      set('cc-eta', eta); set('cc-eta2', eta); set('cc-n', n); set('cc-n2', n);
    }, 2600);
  }
  const wb = $('#wakebar');
  if (wb && A && !RM) {
    new IntersectionObserver((es) => {
      if (es[0].isIntersecting) A({ targets: wb, width: ['0%', '34%'], duration: 1400, easing: 'easeOutExpo' });
    }, { threshold: 0.5 }).observe(wb);
  }

  /* ---------------- SVG stages ---------------- */
  if (RM || !A) return;
  const dash = (el) => { const L = el.getTotalLength(); el.style.strokeDasharray = L; return L; };
  function stage(id, build) {
    const svg = document.getElementById(id); if (!svg) return;
    let tl = null;
    new IntersectionObserver((es) => {
      const vis = es[0].isIntersecting;
      if (vis) { if (!tl) tl = build(svg); else if (tl.play) tl.play(); }
      else if (tl && tl.pause) tl.pause();
    }, { threshold: 0.2 }).observe(svg);
  }
  function along(path, t) { const L = path.getTotalLength(); return path.getPointAtLength(L * Math.max(0, Math.min(1, t))); }

  /* hero: knowledge flowing both ways */
  stage('sv-hero', (svg) => {
    const paths = $$('path[id^="hc"]', svg);
    const glow = $$('.hp', svg), core = $$('.hp2', svg);
    const leaves = $$('.hleaf', svg), cats = $$('.hcat circle', svg);
    const runs = glow.map((g, i) => {
      const p = paths[(i * 3) % paths.length], dir = i % 2 ? -1 : 1, o = { t: 0 };
      return A({
        targets: o, t: 1, duration: 2100 + (i % 3) * 500, delay: i * 420, loop: true, easing: 'easeInOutSine',
        update: () => {
          const pt = along(p, dir > 0 ? o.t : 1 - o.t);
          g.setAttribute('cx', pt.x); g.setAttribute('cy', pt.y);
          core[i].setAttribute('cx', pt.x); core[i].setAttribute('cy', pt.y);
        },
      });
    });
    let k = 0;
    const lit = setInterval(() => {
      if (!document.body.contains(svg) || document.hidden) return;
      const c = k++ % cats.length;
      A({ targets: cats[c], r: [11, 14, 11], duration: 900, easing: 'easeOutQuad' });
      A({ targets: leaves.filter((l) => +l.dataset.c === c), fill: ['#faff69', '#2a2a35'], stroke: ['#faff69', '#4a4a58'], duration: 1500, delay: A.stagger(120), easing: 'easeOutQuad' });
    }, 1300);
    const usd = $('#hb-usd', svg); let u = 3.84;
    const tick = setInterval(() => { if (!document.hidden) { u += 0.01; usd.textContent = u.toFixed(2); } }, 1800);
    return { play: () => runs.forEach((r) => r.play()), pause: () => runs.forEach((r) => r.pause()), lit, tick };
  });

  /* 01 watch */
  stage('sv-watch', (svg) => {
    const bars = $$('.wbar', svg), cards = $$('.fcard', svg), strike = $('#w-strike', svg), sel = $('#w-sel', svg);
    const L = dash(strike);
    const tl = A.timeline({ loop: true, easing: 'easeOutCubic' });
    tl.add({ targets: bars, width: [0, (el) => +el.dataset.w], duration: 900, delay: A.stagger(160) })
      .add({ targets: sel, opacity: [0, 1, 0.4, 1], duration: 900 }, '-=400')
      .add({ targets: cards, opacity: [0, 1], duration: 450, delay: A.stagger(520) }, '-=600')
      .add({ targets: strike, strokeDashoffset: [L, 0], duration: 600, easing: 'easeInOutQuad' })
      .add({ targets: {}, duration: 2600 })
      .add({ targets: cards, opacity: [1, 0], duration: 400, delay: A.stagger(60) });
    return tl;
  });

  /* 02 models */
  stage('sv-models', (svg) => {
    const bars = $$('.mbar', svg), rect = $('#m-badrect', svg), served = $('#m-served', svg), x = $('#m-x', svg);
    const tl = A.timeline({ loop: true, easing: 'easeOutCubic' });
    tl.add({ targets: [served, x], fill: ['#8b8b96', '#8b8b96'], opacity: [0.4, 0.4], duration: 1 })
      .add({ targets: rect, strokeOpacity: [0, 0], duration: 1 })
      .add({ targets: bars, width: [0, (el) => +el.dataset.w], duration: 1100, delay: A.stagger(140) })
      .add({ targets: [served, x], fill: '#f87171', opacity: 1, duration: 500 }, '-=300')
      .add({ targets: rect, strokeOpacity: [0, 0.9, 0.2, 0.9, 0.2, 0.9], duration: 1400, easing: 'linear' }, '-=300')
      .add({ targets: {}, duration: 2600 });
    return tl;
  });

  /* 03 memory: one question walks two hops */
  stage('sv-mem', (svg) => {
    const e1 = $('#mq-e1', svg), e2 = $('#mq-e2', svg), e3 = $('#mq-e3', svg);
    const leaf = $('#mq-leaf', svg), lab = $('#mq-leaflabel', svg), proj = $('#mq-proj', svg), ans = $('#mq-ans', svg), bar = $('#mq-bar', svg), tok = $('#mq-tok', svg);
    const L1 = dash(e1), L2 = dash(e2), L3 = dash(e3);
    const o = { v: 0 };
    const tl = A.timeline({ loop: true, easing: 'easeInOutQuad' });
    tl.add({ targets: [e1, e2, e3], opacity: 1, duration: 1 })
      .add({ targets: e1, strokeDashoffset: [L1, 0], duration: 900 })
      .add({ targets: e2, strokeDashoffset: [L2, 0], duration: 450 })
      .add({ targets: proj, strokeWidth: [1.8, 4, 1.8], duration: 600 }, '-=200')
      .add({ targets: e3, strokeDashoffset: [L3, 0], duration: 450 }, '-=300')
      .add({ targets: leaf, r: [4.5, 8, 6], fill: ['#2a2a35', '#faff69'], duration: 600 })
      .add({ targets: lab, opacity: [0.3, 1], duration: 400 }, '-=400')
      .add({ targets: ans, opacity: [0, 1], duration: 500 })
      .add({ targets: bar, width: [0, 98], duration: 900, easing: 'easeOutExpo' }, '-=300')
      .add({ targets: o, v: [0, 1.2], duration: 900, easing: 'easeOutExpo', update: () => { tok.textContent = o.v.toFixed(1) + 'k'; } }, '-=900')
      .add({ targets: {}, duration: 2600 })
      .add({ targets: [e1, e2, e3, ans], opacity: 0, duration: 500 })
      .add({ targets: leaf, fill: '#2a2a35', r: 4.5, duration: 300 }, '-=300');
    return tl;
  });

  /* 04 catalogs */
  stage('sv-cat', (svg) => {
    const lines = $$('.cl', svg).filter((p) => !p.getAttribute('stroke-dasharray'));
    const lens = lines.map(dash);
    const cards = $$('.cc1', svg), files = ['#cf-cwd', '#cf-pkg', '#cf-dock'].map((s) => $(s, svg));
    const tl = A.timeline({ loop: true, easing: 'easeOutCubic' });
    tl.add({ targets: cards, opacity: [0.25, 0.25], duration: 1 })
      .add({ targets: files, fill: ['#c9c9d1', '#c9c9d1'], duration: 1 });
    lines.forEach((l, i) => {
      tl.add({ targets: files[i] || files[0], fill: '#c4b5fd', duration: 300 })
        .add({ targets: l, strokeDashoffset: [lens[i], 0], duration: 650 }, '-=150')
        .add({ targets: cards[i], opacity: 1, duration: 400 }, '-=200');
    });
    tl.add({ targets: cards[3], opacity: 1, duration: 400 })
      .add({ targets: {}, duration: 2400 })
      .add({ targets: lines, strokeDashoffset: (el, i) => lens[i], duration: 500, easing: 'easeInQuad' });
    return tl;
  });

  /* 05 resume */
  stage('sv-resume', (svg) => {
    const fill = $('#r-fill', svg), wall = $('#r-wall', svg), morn = $('#r-morning', svg), lines = $$('.rline', svg);
    const ticks = $$('.rt circle', svg), labels = $$('.rt text', svg), saved = $('#r-saved', svg), node = $('#r-node', svg);
    const paint = (upto) => ticks.forEach((c, i) => {
      c.setAttribute('stroke', i < upto ? '#4ade80' : '#3a3a46');
      labels[i].setAttribute('class', 't-mono ' + (i < upto ? 't-body' : 't-mute2'));
    });
    const P9 = (8 / 13);
    let last = -1;
    const progress = (a, from, to) => {
      const p = from + (to - from) * (a.progress / 100);
      const k = Math.floor(p * 13 + 1e-6) + 1;
      if (k !== last) {
        last = k; paint(k);
        if (k <= 9) saved.textContent = 'saved after agent ' + k;
        A({ targets: node, r: [7, 11, 7], duration: 500, easing: 'easeOutQuad' });
      }
    };
    const tl = A.timeline({ loop: true, easing: 'linear' });
    tl.add({ targets: [wall, morn], opacity: 0, duration: 1, complete: () => { last = -1; paint(0); } })
      .add({ targets: lines, opacity: 0, duration: 1 })
      .add({ targets: fill, strokeDashoffset: [560, 560 - 560 * P9], duration: 3800, update: (a) => progress(a, 0, P9) })
      .add({ targets: wall, opacity: [0, 1], translateY: [-24, 0], duration: 500, easing: 'easeOutBack' })
      .add({ targets: {}, duration: 1100 })
      .add({ targets: morn, opacity: [0, 1], duration: 500, easing: 'easeOutCubic' })
      .add({ targets: lines, opacity: [0, 1], duration: 300, delay: A.stagger(320) })
      .add({ targets: wall, opacity: 0.25, duration: 400 })
      .add({ targets: fill, strokeDashoffset: [560 - 560 * P9, 0], duration: 2200, update: (a) => progress(a, P9, 1) })
      .add({ targets: {}, duration: 2400 });
    return tl;
  });

  /* 06 preflight */
  stage('sv-pre', (svg) => {
    const bad = $('#p-bad', svg), boom = $('#p-boom', svg), chk = $('#p-check', svg), good = $('#p-good', svg);
    const rows = $$('.pchk', svg), marks = $$('.pchk .ck', svg);
    boom.style.transformBox = 'fill-box'; boom.style.transformOrigin = 'center';
    const tl = A.timeline({ loop: true, easing: 'linear' });
    tl.add({ targets: boom, opacity: 0, duration: 1 })
      .add({ targets: rows, opacity: 0.25, duration: 1 })
      .add({ targets: marks, opacity: 0, duration: 1 })
      .add({ targets: [chk], strokeDashoffset: 28, duration: 1 })
      .add({ targets: [good], strokeDashoffset: 558, duration: 1 })
      .add({ targets: bad, strokeDashoffset: [396, 0], duration: 2300, easing: 'easeInQuad' })
      .add({ targets: boom, opacity: [0, 1], scale: [0.4, 1], duration: 450, easing: 'easeOutBack' })
      .add({ targets: chk, strokeDashoffset: [28, 0], duration: 900 })
      .add({ targets: rows, opacity: 1, duration: 200, delay: A.stagger(130) }, '-=900')
      .add({ targets: marks, opacity: [0, 1], duration: 200, delay: A.stagger(130) }, '-=900')
      .add({ targets: good, strokeDashoffset: [558, 0], duration: 1900, easing: 'easeOutQuad' })
      .add({ targets: {}, duration: 2400 });
    return tl;
  });

  /* 07 unit loop */
  stage('sv-loop', (svg) => {
    const ring = $('#l-ring', svg), tok = $('#l-token', svg), round = $('#l-round', svg);
    const find = $('#l-find', svg), branch = $('#l-branch', svg), design = $('#l-design', svg), qs = $$('.lq', svg);
    const LB = dash(branch);
    const o = { t: 0 };
    const tl = A.timeline({ loop: true });
    const lap = (n) => tl.add({
      targets: o, t: [0, 1], duration: 2600, easing: 'easeInOutSine',
      begin: () => { round.textContent = n + '/3'; },
      update: () => { const p = along(ring, o.t); tok.setAttribute('cx', p.x); tok.setAttribute('cy', p.y); },
    });
    tl.add({ targets: [find, design], opacity: 0, duration: 1 }).add({ targets: branch, strokeDashoffset: LB, duration: 1 });
    lap(1);
    tl.add({ targets: find, opacity: [0, 1], duration: 400, easing: 'easeOutCubic' });
    lap(2);
    tl.add({ targets: branch, strokeDashoffset: [LB, 0], duration: 700, easing: 'easeInOutQuad' })
      .add({ targets: design, opacity: [0, 1], duration: 500, easing: 'easeOutCubic' })
      .add({ targets: {}, duration: 2400 });
    const q = A({ targets: qs, cx: [40, 600], duration: 5200, delay: A.stagger(1700), loop: true, easing: 'linear' });
    return { play: () => { tl.play(); q.play(); }, pause: () => { tl.pause(); q.pause(); } };
  });

  /* 08 rulings */
  stage('sv-rul', (svg) => {
    const a = $('#ru-a', svg), b = $('#ru-b', svg), card = $('#ru-card', svg), file = $('#ru-file', svg);
    const lines = $$('#ru-lines path', svg), dots = $$('.ra', svg);
    const lens = lines.map(dash);
    const tl = A.timeline({ loop: true, easing: 'easeOutCubic' });
    tl.add({ targets: [card, file], opacity: 0, duration: 1 })
      .add({ targets: dots, fill: '#34343f', duration: 1 })
      .add({ targets: lines, strokeDashoffset: (el, i) => lens[i], duration: 1 })
      .add({ targets: a, strokeDashoffset: [34, 0], duration: 500, delay: 400 })
      .add({ targets: card, opacity: [0, 1], duration: 500 })
      .add({ targets: b, strokeDashoffset: [32, 0], duration: 400 })
      .add({ targets: file, opacity: [0, 1], duration: 450 })
      .add({ targets: lines, strokeDashoffset: (el, i) => [lens[i], 0], duration: 700, delay: A.stagger(110), easing: 'easeInOutQuad' })
      .add({ targets: dots, fill: '#e879f9', r: [5, 8, 5], duration: 500, delay: A.stagger(150) }, '-=500')
      .add({ targets: {}, duration: 2600 });
    return tl;
  });

  /* 09 ui check */
  stage('sv-ui', (svg) => {
    const scan = $('#ui-scan', svg), font = $('#ui-font', svg), empty = $('#ui-empty', svg);
    const tl = A.timeline({ loop: true, easing: 'easeInOutSine' });
    tl.add({ targets: [font, empty], opacity: 0, duration: 1 })
      .add({ targets: scan, y: [28, 276], duration: 1800 })
      .add({ targets: font, opacity: [0, 1], duration: 400 }, '-=500')
      .add({ targets: scan, y: [276, 28], duration: 900, opacity: [0.85, 0.2] })
      .add({ targets: empty, opacity: [0, 1, 0.5, 1], duration: 1200, easing: 'linear' })
      .add({ targets: {}, duration: 2400 })
      .add({ targets: scan, opacity: 0.85, duration: 1 });
    return tl;
  });

  /* 10 meter */
  stage('sv-meter', (svg) => {
    const chips = $$('.mc', svg), bar = $('#mt-bar', svg), n = $('#mt-n', svg), toast = $('#mt-toast', svg);
    let count = 0;
    const tl = A.timeline({ loop: true });
    tl.add({ targets: chips, opacity: 0, duration: 1, complete: () => { count = 0; n.textContent = '0'; bar.setAttribute('width', 0); } })
      .add({ targets: toast, opacity: 0, duration: 1 });
    chips.forEach((c) => {
      tl.add({
        targets: c, opacity: [0, 1], duration: 140, easing: 'easeOutQuad',
        complete: () => {
          if (c.dataset.c === '1') { count++; n.textContent = String(count); A({ targets: bar, width: 260 * count / 25, duration: 160, easing: 'easeOutQuad' }); }
        },
      });
    });
    tl.add({ targets: toast, opacity: [0, 1], duration: 500, easing: 'easeOutCubic' })
      .add({ targets: {}, duration: 3000 });
    return tl;
  });
})();
