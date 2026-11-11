// 首页：星盘动画、数字滚动、随手抽一条原文
(() => {
  // ── 星盘 ──
  const cv = document.getElementById('astrolabe');
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 七元素：风 岩 雷 草 水 火 冰
  const ELEMENTS = ['#74c2a8', '#e3b342', '#b08fd8', '#9ccc5a', '#4cc2f1', '#ef7a35', '#a8e0ee'];
  let W, H, cx, cy, R, dpr, stars = [], gold, ink, faint;
  const readTheme = () => {
    const s = getComputedStyle(document.documentElement);
    gold = s.getPropertyValue('--gold').trim();
    ink = s.getPropertyValue('--ink-3').trim();
    faint = s.getPropertyValue('--line-2').trim();
  };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W > 900;
    R = Math.min(H * 0.46, W * (wide ? 0.34 : 0.6));
    cx = wide ? W * 0.73 : W * 0.72;
    cy = wide ? H * 0.48 : H * 0.3;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    stars = Array.from({ length: Math.round((W * H) / 5200) }, () => ({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.1 + 0.2, p: rnd() * 6.28, s: rnd() * 0.8 + 0.3 }));
  };
  const ring = (r, w = 1, dash = null, color = faint) => {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.setLineDash(dash || []); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
  };
  const ticks = (r, n, len, every, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const l = i % every === 0 ? len * 2 : len;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r - l), Math.sin(a) * (r - l));
    }
    ctx.stroke();
  };
  const draw = (t) => {
    ctx.clearRect(0, 0, W, H);
    // 星空（虚假之天）
    for (const s of stars) {
      ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(s.p + t * 0.0006 * s.s));
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.1);
    g.addColorStop(0, 'rgba(216,169,63,0.10)'); g.addColorStop(1, 'rgba(216,169,63,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, 6.283); ctx.fill();

    // 外环：刻度
    ctx.save(); ctx.rotate(t * 0.00002);
    ring(R, 1, null, faint); ring(R * 0.965, 0.6, null, faint);
    ticks(R * 0.965, 240, R * 0.014, 10, faint);
    ctx.restore();
    // 黄道环：四十三章刻度
    ctx.save(); ctx.rotate(-t * 0.00004);
    ring(R * 0.84, 1, [2, 7], gold);
    ticks(R * 0.84, 43, R * 0.03, 43, gold);
    ctx.restore();
    // 七元素环
    ctx.save(); ctx.rotate(t * 0.00007);
    ring(R * 0.66, 1, null, faint);
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { // 七芒星连线
      const a = ((i * 3) % 7 / 7) * 6.283 - 1.5708;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66);
    }
    ctx.closePath(); ctx.strokeStyle = faint; ctx.lineWidth = 0.7; ctx.stroke();
    ELEMENTS.forEach((c, i) => {
      const a = (i / 7) * 6.283 - 1.5708;
      const x = Math.cos(a) * R * 0.66, y = Math.sin(a) * R * 0.66;
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, Math.max(3, R * 0.014), 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, Math.max(7, R * 0.032), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
    });
    ctx.restore();
    // 三月
    ctx.save(); ctx.rotate(-t * 0.00011);
    ring(R * 0.42, 0.8, [1, 5], faint);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283;
      const x = Math.cos(a) * R * 0.42, y = Math.sin(a) * R * 0.42, r = R * 0.045;
      ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; // 月相缺口
      ctx.beginPath(); ctx.arc(x + r * (0.35 + i * 0.25), y - r * 0.2, r * 0.92, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // 中心：晨星
    ctx.save(); ctx.rotate(t * 0.00016);
    ctx.fillStyle = gold; ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283, r = i % 2 ? R * 0.028 : R * (i % 4 ? 0.12 : 0.16);
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ring(R * 0.2, 0.7, null, faint);
    ctx.restore();
  };
  let raf;
  const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
  const start = () => { cancelAnimationFrame(raf); if (reduce) draw(40000); else raf = requestAnimationFrame(loop); };
  readTheme(); resize(); start();
  addEventListener('resize', () => { resize(); if (reduce) draw(40000); });
  document.addEventListener('themechange', () => { readTheme(); if (reduce) draw(40000); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });

  // ── 星图入口：把真实的星图画成一张小图 ──
  const sc = document.getElementById('skycard-canvas');
  if (sc) fetch(`${window.Site.base}data/stars.json`).then((r) => r.json()).then(({ stars, lines, consts }) => {
    const COLORS = { 书籍与可读文本: '#f4d07a', 对白与任务: '#a9c9ff', '角色、物品与资料': '#8fe3c2', 现实文献: '#dba8f5' };
    const paint = () => {
      const d = Math.min(devicePixelRatio || 1, 2), w = sc.clientWidth, h = sc.clientHeight;
      sc.width = w * d; sc.height = h * d;
      const c = sc.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const g = c.createRadialGradient(w * 0.6, h * 0.5, 0, w * 0.6, h * 0.5, w * 0.7);
      g.addColorStop(0, '#162033'); g.addColorStop(1, '#080b12');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const xs = stars.map((s) => s.x), ys = stars.map((s) => s.y);
      const k = Math.min(w / (Math.max(...xs) - Math.min(...xs)), h / (Math.max(...ys) - Math.min(...ys))) * 1.25;
      const X = (x) => x * k + w * 0.7, Y = (y) => y * k + h * 0.5;
      c.lineWidth = 0.7;
      for (const [a, b] of lines) { c.strokeStyle = `hsla(${consts[stars[a].p].hue},45%,68%,.35)`; c.beginPath(); c.moveTo(X(stars[a].x), Y(stars[a].y)); c.lineTo(X(stars[b].x), Y(stars[b].y)); c.stroke(); }
      for (const s of stars) {
        const r = 0.6 + Math.sqrt(s.m) * 0.55;
        c.fillStyle = COLORS[s.k]; c.shadowColor = COLORS[s.k]; c.shadowBlur = r * 4;
        c.beginPath(); c.arc(X(s.x), Y(s.y), r, 0, 6.283); c.fill();
      }
      c.shadowBlur = 0;
      const fade = c.createLinearGradient(0, 0, w * 0.62, 0);
      fade.addColorStop(0, 'rgba(8,11,18,.96)'); fade.addColorStop(0.45, 'rgba(8,11,18,.8)'); fade.addColorStop(1, 'rgba(8,11,18,0)');
      c.fillStyle = fade; c.fillRect(0, 0, w, h);
    };
    paint();
    addEventListener('resize', paint);
  });

  // ── 数字滚动 ──
  const nums = document.querySelectorAll('[data-count]');
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    if (reduce) return;
    const to = Number(e.target.dataset.count);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 1400);
      e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 4))).toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  nums.forEach((n) => io.observe(n));

  // ── 抽一条原文 ──
  const pool = JSON.parse(document.getElementById('draw-data').textContent);
  const quote = document.getElementById('draw-quote');
  const title = document.getElementById('draw-title');
  const link = document.getElementById('draw-link');
  let last = -1;
  const pick = () => {
    let i;
    do i = Math.floor(Math.random() * pool.length); while (i === last && pool.length > 1);
    last = i;
    const e = pool[i];
    quote.classList.add('out');
    setTimeout(() => {
      quote.textContent = `「${e.q}」`;
      title.textContent = `—— ${e.t}`;
      link.href = `${window.Site.base}evidence/#${e.id}`;
      quote.classList.remove('out');
    }, reduce ? 0 : 280);
  };
  document.getElementById('draw-again').addEventListener('click', pick);
  pick();
})();
