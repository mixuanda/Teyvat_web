// 星图：每篇被引用的文本是一颗星；同段共引的文本连成星座
(async () => {
  const { base, esc } = window.Site;
  const sky = document.getElementById('sky');
  const cv = document.getElementById('sky-canvas');
  const ctx = cv.getContext('2d');
  const tip = document.getElementById('sky-tip');
  const panel = document.getElementById('sky-panel');
  const hint = document.getElementById('sky-hint');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const data = await fetch(`${base}data/stars.json`).then((r) => r.json());
  const { stars, lines, consts, secTitles } = data;
  const byId = Object.fromEntries(stars.map((s, i) => [s.id, i]));

  // 光谱：文本类型 → 星色
  const SPECTRUM = { 书籍与可读文本: '#f4d07a', 对白与任务: '#a9c9ff', '角色、物品与资料': '#8fe3c2', 现实文献: '#dba8f5' };
  const GLYPH = { 书籍与可读文本: '书', 对白与任务: '言', '角色、物品与资料': '物', 现实文献: '典' };
  const sprite = {};
  for (const [k, c] of Object.entries(SPECTRUM)) {
    const s = document.createElement('canvas');
    s.width = s.height = 96;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.12, c); grad.addColorStop(0.3, `${c}66`); grad.addColorStop(1, `${c}00`);
    g.fillStyle = grad; g.fillRect(0, 0, 96, 96);
    sprite[k] = s;
  }
  stars.forEach((s, i) => { s.i = i; s.ph = (i * 2.399) % 6.283; });

  // ── 视图 ──
  let W, H, dpr;
  const view = { x: 0, y: 0, k: 0.2 };
  let bg = [];
  const bounds = (list) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + 160, h: y1 - y0 + 160 };
  };
  const fitTo = (b, pad = 1) => {
    // 宽屏时给左上角的标题留出位置
    const side = W > 1000 ? 300 : 0;
    const k = Math.min((W - side) / b.w, (H - 70) / b.h) * pad;
    return { x: b.x - side / 2 / k, y: b.y + 10 / k, k };
  };
  const all = bounds(stars);
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = sky.clientWidth; H = sky.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    bg = Array.from({ length: Math.round((W * H) / 3800) }, () => ({ x: rnd(), y: rnd(), r: rnd() * 0.9 + 0.2, a: rnd() * 0.5 + 0.1, z: rnd() * 0.06 + 0.01 }));
    dirty = true;
  };
  const sx = (x) => (x - view.x) * view.k + W / 2;
  const sy = (y) => (y - view.y) * view.k + H / 2;
  const starR = (s) => (1.5 + Math.sqrt(s.m) * 1.05) * Math.max(0.5, Math.min(2.4, view.k * 1.5));

  let selected = -1;
  let hover = -1;
  let dirty = true;
  let related = null; // Set of neighbor indices

  const draw = (t) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#141c2b'); g.addColorStop(1, '#080b12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 远景星
    ctx.fillStyle = '#c9d2e6';
    for (const b of bg) {
      const x = (((b.x * W - view.x * view.k * b.z) % W) + W) % W;
      const y = (((b.y * H - view.y * view.k * b.z) % H) + H) % H;
      ctx.globalAlpha = b.a; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 黄道环
    const ringR = Math.hypot(consts[1].x, consts[1].y);
    ctx.strokeStyle = 'rgba(216,190,140,.13)'; ctx.lineWidth = 1; ctx.setLineDash([2, 8]);
    ctx.beginPath(); ctx.arc(sx(0), sy(0), ringR * view.k, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);

    const dim = selected >= 0;
    // 星座：范围、连线、名字
    for (const c of consts) {
      if (!c.n) continue;
      const x = sx(c.x), y = sy(c.y), r = c.r * view.k;
      if (x + r < -200 || x - r > W + 200 || y + r < -200 || y - r > H + 200) continue;
      ctx.strokeStyle = `hsla(${c.hue},45%,65%,.12)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
      const fs = Math.max(11, Math.min(30, 15 + view.k * 14));
      ctx.textAlign = 'center';
      ctx.fillStyle = `hsla(${c.hue},50%,74%,${dim ? 0.35 : 0.85})`;
      ctx.font = `700 ${fs}px "Noto Serif SC", serif`;
      ctx.fillText(c.label, x, y - r - fs * 1.25);
      ctx.fillStyle = `hsla(${c.hue},30%,78%,${dim ? 0.25 : 0.55})`;
      ctx.font = `400 ${Math.max(10, fs * 0.6)}px "Noto Serif SC", serif`;
      ctx.fillText(c.name.replace(/^导论：/, ''), x, y - r - fs * 0.35);
    }
    ctx.lineWidth = Math.max(0.6, Math.min(1.4, view.k * 1.6));
    for (const [a, b] of lines) {
      const A = stars[a], B = stars[b];
      ctx.strokeStyle = `hsla(${consts[A.p].hue},45%,68%,${dim ? 0.1 : 0.34})`;
      ctx.beginPath(); ctx.moveTo(sx(A.x), sy(A.y)); ctx.lineTo(sx(B.x), sy(B.y)); ctx.stroke();
    }
    // 选中星的共引连线（可跨星座）
    if (dim) {
      const S = stars[selected];
      for (const [j, w] of S.nb) {
        const B = stars[j];
        ctx.strokeStyle = `rgba(242,212,137,${Math.min(0.9, 0.3 + w * 0.15)})`;
        ctx.lineWidth = Math.min(3, 0.8 + w * 0.4);
        ctx.beginPath(); ctx.moveTo(sx(S.x), sy(S.y)); ctx.lineTo(sx(B.x), sy(B.y)); ctx.stroke();
      }
    }
    // 星
    const labelMin = view.k < 0.3 ? 40 : view.k < 0.55 ? 12 : view.k < 0.9 ? 6 : view.k < 1.5 ? 3 : 0;
    const labels = [];
    for (const s of stars) {
      const x = sx(s.x), y = sy(s.y);
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      const r = starR(s);
      const lit = !dim || s.i === selected || related.has(s.i);
      const tw = reduce ? 1 : 0.82 + 0.18 * Math.sin(t * 0.0013 + s.ph);
      ctx.globalAlpha = (lit ? 1 : 0.22) * tw;
      const d = r * 6;
      ctx.drawImage(sprite[s.k], x - d / 2, y - d / 2, d, d);
      if (s.i === selected || s.i === hover) {
        ctx.globalAlpha = 1; ctx.strokeStyle = '#f2d489'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, r + 7, 0, 6.283); ctx.stroke();
        if (s.i === selected) { ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(x, y, r + 13 + (reduce ? 0 : Math.sin(t * 0.003) * 2), 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
      }
      if (s.i === selected || s.i === hover || (lit && (s.m >= labelMin || (dim && related.has(s.i))))) labels.push([s, x, y, r]);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.font = '13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    for (const [s, x, y, r] of labels) {
      const strong = s.i === selected || s.i === hover;
      ctx.fillStyle = strong ? '#fff' : 'rgba(236,231,218,.72)';
      ctx.shadowColor = '#080b12'; ctx.shadowBlur = 6;
      ctx.fillText(s.t.length > 18 && !strong ? `${s.t.slice(0, 17)}…` : s.t, x + r + 8, y + 4);
    }
    ctx.shadowBlur = 0;
  };

  let raf = 0;
  const loop = (t) => {
    if (tween) stepTween(t);
    if (!reduce || dirty || tween) { draw(t); dirty = false; }
    raf = requestAnimationFrame(loop);
  };

  // ── 缓动飞行 ──
  let tween = null;
  const fly = (to, ms = 800) => {
    if (reduce) { Object.assign(view, to); dirty = true; return; }
    tween = { from: { ...view }, to, t0: performance.now(), ms };
  };
  const stepTween = (t) => {
    const k = Math.min(1, (t - tween.t0) / tween.ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    view.x = tween.from.x + (tween.to.x - tween.from.x) * e;
    view.y = tween.from.y + (tween.to.y - tween.from.y) * e;
    view.k = Math.exp(Math.log(tween.from.k) + (Math.log(tween.to.k) - Math.log(tween.from.k)) * e);
    if (k >= 1) tween = null;
  };
  const zoomAt = (px, py, f) => {
    const k = Math.max(0.06, Math.min(6, view.k * f));
    const wx = (px - W / 2) / view.k + view.x, wy = (py - H / 2) / view.k + view.y;
    view.k = k;
    view.x = wx - (px - W / 2) / k; view.y = wy - (py - H / 2) / k;
    dirty = true;
  };

  // ── 选中与侧栏 ──
  const hit = (px, py) => {
    let best = -1, bd = 18 * 18;
    for (const s of stars) {
      const dx = sx(s.x) - px, dy = sy(s.y) - py, d = dx * dx + dy * dy;
      const lim = Math.max(bd, 0);
      if (d < lim && d < Math.pow(starR(s) + 12, 2)) { bd = d; best = s.i; }
    }
    return best;
  };
  const select = (i, { move = true, push = true } = {}) => {
    selected = i;
    dirty = true;
    hint.hidden = true;
    if (i < 0) { panel.hidden = true; related = null; if (push) history.replaceState(null, '', location.pathname); return; }
    const s = stars[i];
    related = new Set(s.nb.map((n) => n[0]));
    const c = consts[s.p];
    panel.hidden = false;
    panel.innerHTML = `<button class="sky-close" type="button" aria-label="关闭">×</button>
<p class="sky-kind" style="--sp:${SPECTRUM[s.k]}"><i>${GLYPH[s.k]}</i>${esc(s.k)} · ${c.label}</p>
<h2>${esc(s.t)}</h2>
<p class="sky-mag">在 <b>${s.m}</b> 段论述中被引用 · 与 <b>${s.nc}</b> 篇文本共引</p>
<blockquote>${s.q.map((q) => `<span>${esc(q)}</span>`).join('')}</blockquote>
<div class="sky-actions">${s.src ? `<a class="btn small primary" href="${base}text/${s.id}/">读原文全文</a>` : s.url ? `<a class="btn small primary" href="${esc(s.url)}" target="_blank" rel="noopener">出处 ↗</a>` : ''}<a class="btn small" href="${base}evidence/#${s.ev[0]}">引证详情</a></div>
<h3>被用在这些论述里</h3>
<div class="ev-refs">${s.refs.map((r) => { const [no, sec] = r.split('#'); return `<a href="${base}read/${no.padStart(2, '0')}/#${sec}"><b>${no.padStart(2, '0')}</b>${esc(secTitles[r] || '')}</a>`; }).join('')}</div>
${s.nb.length ? `<h3>常与它一起被引用</h3><ul class="sky-nb">${s.nb.slice(0, 10).map(([j, w]) => `<li><button type="button" data-star="${j}"><i style="background:${SPECTRUM[stars[j].k]}"></i><span>${esc(stars[j].t)}</span><em>×${w}</em></button></li>`).join('')}</ul>` : ''}`;
    panel.scrollTop = 0;
    if (push) history.replaceState(null, '', `#${s.id}`);
    if (move) {
      const off = W > 900 ? 190 : 0; // 给右侧面板让出位置
      const k = Math.max(view.k, 0.95);
      fly({ x: s.x + off / k, y: s.y + (W > 900 ? 0 : H * 0.18 / k), k });
    }
  };
  panel.addEventListener('click', (e) => {
    if (e.target.closest('.sky-close')) return select(-1);
    const b = e.target.closest('[data-star]');
    if (b) select(Number(b.dataset.star));
  });

  // ── 指针 ──
  const pts = new Map();
  let moved = 0, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); moved = 0; tween = null; });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) {
      const h = hit(e.offsetX, e.offsetY);
      if (h !== hover) { hover = h; dirty = true; cv.style.cursor = h >= 0 ? 'pointer' : 'grab'; }
      if (h >= 0) {
        const s = stars[h];
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(s.t)}</b><span>「${esc(s.q[0] || '')}」</span>`;
        tip.style.left = `${Math.min(W - 280, e.offsetX + 16)}px`;
        tip.style.top = `${e.offsetY + 18}px`;
      } else tip.hidden = true;
      return;
    }
    if (pts.size === 2) {
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d; moved = 99;
      return;
    }
    const dx = e.offsetX - p[0], dy = e.offsetY - p[1];
    moved += Math.abs(dx) + Math.abs(dy);
    view.x -= dx / view.k; view.y -= dy / view.k;
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    tip.hidden = true; dirty = true;
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); pinch = 0;
    if (moved < 6 && e.type === 'pointerup') select(hit(e.offsetX, e.offsetY), { move: true });
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { hover = -1; tip.hidden = true; dirty = true; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); tween = null; zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0016)); hint.hidden = true; }, { passive: false });
  document.getElementById('sky-in').addEventListener('click', () => fly({ ...view, k: Math.min(6, view.k * 1.6) }, 350));
  document.getElementById('sky-out').addEventListener('click', () => fly({ ...view, k: Math.max(0.06, view.k / 1.6) }, 350));
  document.getElementById('sky-home').addEventListener('click', () => { select(-1); fly(fitTo(all, 0.96)); });
  document.getElementById('sky-consts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = consts[b.dataset.c];
    select(-1);
    fly({ x: c.x, y: c.y, k: Math.min(W, H) / (c.r * 2 + 220) });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected >= 0) select(-1); });

  // ── 寻星 ──
  const q = document.getElementById('sky-q');
  const hits = document.getElementById('sky-hits');
  q.addEventListener('input', () => {
    const kw = q.value.trim().toLowerCase();
    if (!kw) { hits.hidden = true; return; }
    const found = stars.filter((s) => s.t.toLowerCase().includes(kw) || s.q.some((x) => x.toLowerCase().includes(kw))).sort((a, b) => b.m - a.m).slice(0, 8);
    hits.hidden = false;
    hits.innerHTML = found.length ? found.map((s) => `<li><button type="button" data-star="${s.i}"><i style="background:${SPECTRUM[s.k]}"></i>${esc(s.t)}</button></li>`).join('') : '<li class="none">没有这颗星</li>';
  });
  hits.addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (b) { select(Number(b.dataset.star)); hits.hidden = true; q.value = ''; } });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') hits.querySelector('button')?.click(); });

  // ── 启动 ──
  resize();
  addEventListener('resize', resize);
  const fromHash = () => { const i = byId[decodeURIComponent(location.hash.slice(1))]; if (i != null) select(i, { push: false }); };
  if (location.hash && byId[decodeURIComponent(location.hash.slice(1))] != null) {
    Object.assign(view, fitTo(all, 0.96));
    fromHash();
  } else {
    const f = fitTo(all, 0.96);
    Object.assign(view, { x: f.x, y: f.y, k: f.k * 0.55 });
    fly(f, 1600);
  }
  addEventListener('hashchange', fromHash);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(loop); });
  raf = requestAnimationFrame(loop);
})();
