// 玩家版：主线进度与迷雾、进度选择页、星图、问题页的手机分步
(async () => {
  const { base, esc } = window.Site;
  let data = JSON.parse(document.getElementById('star-data')?.textContent || '{}');
  const stages = data.stages || [];
  const $ = (s, el = document) => el.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const saved = store.get('progress');
  let progress = saved == null || Number.isNaN(Number(saved)) ? -1 : Number(saved);
  const after = (g) => `${stages[g]}篇后可看`;
  const LOCK = '<svg class="lock" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';

  // ── 迷雾：按进度放行带剧情的内容 ──
  const applyFog = () => {
    document.querySelectorAll('[data-gate]').forEach((el) => el.classList.toggle('clear', progress >= Number(el.dataset.gate)));
    document.querySelectorAll('[data-fog]').forEach((el) => el.classList.toggle('clear', progress >= Number(el.dataset.fog)));
    const label = $('#progress-label');
    if (label) label.textContent = progress < 0 ? '选择进度' : `进度：${stages[progress]}篇结束`;
  };
  applyFog();

  // ── 进度选择页 ──
  const gateList = $('#gate-stages');
  if (gateList) {
    const said = $('#gate-said');
    const go = $('#gate-go');
    const line = $('#gate-line');
    const paint = () => {
      [...gateList.children].forEach((li, i) => {
        li.classList.toggle('done', i < progress);
        li.classList.toggle('cur', i === progress);
        $('button', li).setAttribute('aria-pressed', i === progress);
      });
      if (progress < 0) return;
      const pct = stages.length > 1 ? (progress / (stages.length - 1)) * 100 : 100;
      line.style.background = `linear-gradient(90deg, #E6C06A 0%, #E6C06A ${pct}%, #3A4763 ${Math.min(100, pct + 4)}%, #3A4763 100%)`;
      const next = stages[progress + 1];
      said.innerHTML = `已选：<strong>${esc(stages[progress])}篇结束</strong>，${next ? `${esc(stages.slice(progress + 1).join('、'))}的内容会显示为迷雾。` : '全部内容都会显示。'}`;
      go.setAttribute('aria-disabled', 'false');
    };
    gateList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-stage]');
      if (!b) return;
      progress = Number(b.dataset.stage);
      store.set('progress', String(progress));
      paint();
    });
    paint();
    return;
  }

  // ── 问题页：手机上一步一屏 ──
  const steps = [...document.querySelectorAll('.steps .step')];
  if (steps.length) {
    const bars = [...document.querySelectorAll('.stepbar span')];
    const prev = $('#step-prev'), next = $('#step-next');
    let cur = 0;
    const paint = () => {
      steps.forEach((s, i) => s.classList.toggle('cur', i === cur));
      bars.forEach((b, i) => b.classList.toggle('on', i <= cur));
      prev.disabled = cur === 0;
      next.disabled = cur === steps.length - 1;
    };
    prev.addEventListener('click', () => { cur = Math.max(0, cur - 1); paint(); });
    next.addEventListener('click', () => { cur = Math.min(steps.length - 1, cur + 1); paint(); });
    paint();
  }

  // ── 星图 ──
  const svg = $('#sky-svg');
  if (!svg) return;
  if (progress < 0) { location.replace(`${base}gate/`); return; }
  data = await fetch(`${base}data/star.json`).then((r) => r.json()); // 星图数据较大，只在这一页取
  const { nodes, edges, questions, kinds } = data;
  const N = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const visible = (id) => N[id].gate <= progress;
  const neighbors = (id) => edges.filter((e) => e.a === id || e.b === id).map((e) => ({ e, other: e.a === id ? e.b : e.a }));
  let q = null;        // 当前问题
  let sel = null;      // 选中的星
  let revealed = new Set();
  let showAll = false;
  const qlist = $('#qlist'), teaser = $('#qteaser'), detail = $('#detail');

  const startFrom = (question) => {
    q = question;
    showAll = false;
    revealed = new Set((q ? q.nodes : nodes.filter((n) => n.gate === 0).map((n) => n.id)).filter(visible));
    sel = q && visible(q.start) ? q.start : [...revealed][0] || null;
    if (q) store.set('q', q.id);
  };
  const select = (id) => {
    sel = id;
    showAll = false;
    revealed.add(id);
    neighbors(id).forEach(({ e, other }) => { if (!e.auto && e.gate <= progress && visible(other)) revealed.add(other); });
    render();
  };

  const render = () => {
    // 问题列表
    const btn = (x) => (x.gate <= progress
      ? `<button type="button" class="qbtn" data-q="${x.id}" aria-pressed="${q?.id === x.id}">${esc(x.title)}</button>`
      : `<button type="button" class="qbtn locked" disabled>${esc(x.title)}<span>${LOCK} ${after(x.gate)}</span></button>`);
    const groups = [...new Set(questions.map((x) => x.group))];
    qlist.innerHTML = groups.map((g) => `<h3>${esc(g)}</h3>${questions.filter((x) => x.group === g).map(btn).join('')}`).join('');
    teaser.hidden = !q;
    if (q) teaser.innerHTML = `<p>${esc(q.teaser)}</p><a href="${base}q/${q.id}/">读完整的故事 →</a>`;

    const shown = [...revealed].filter(visible);
    const inQ = new Set(q ? q.nodes : []);
    // 两种排法：手写的问题用星图上的固定位置；其余情况以选中的星为中心，把它的关系绕成几圈
    const mine = sel ? neighbors(sel).filter(({ e, other }) => !e.auto && e.gate <= progress && visible(other)) : [];
    const mineIds = [...new Set(mine.map((x) => x.other))];
    const ego = !showAll && sel && (!inQ.has(sel) || mineIds.length > 10);
    const pos = {};
    const P = (id) => pos[id] || N[id];
    let display = shown;
    const fogNodes = new Map();
    if (ego) {
      const fogIds = [...new Set(neighbors(sel).filter(({ e }) => !e.auto && e.gate > progress).map((x) => x.other))];
      const ring = [...mineIds.sort((a, b) => (N[a].kind + N[a].name).localeCompare(N[b].kind + N[b].name, 'zh')), ...fogIds.map((id) => `?${id}`)];
      pos[sel] = { x: 0, y: 0 };
      const caps = [12, 20, 28, 36, 48, 400];
      let k = 0;
      caps.forEach((cap, ri) => {
        const part = ring.slice(k, k + cap);
        part.forEach((id, i) => { const a = -Math.PI / 2 + (2 * Math.PI * (i + (ri % 2) / 2)) / part.length; const R = 250 + ri * 175; pos[id] = { x: Math.cos(a) * R * 1.25, y: Math.sin(a) * R }; });
        k += cap;
      });
      fogIds.forEach((id) => fogNodes.set(id, { id, ...pos[`?${id}`] }));
      display = [sel, ...mineIds];
    }
    // 全部展开且星很多时：按地区分成八团，不画连线，点一颗星再看它的关系
    const atlas = showAll && shown.length > 120;
    const heads = [];
    if (atlas) {
      stages.forEach((name, g) => {
        const ids = shown.filter((id) => N[id].gate === g).sort((x, y) => (N[x].kind + N[x].name).localeCompare(N[y].kind + N[y].name, 'zh'));
        if (!ids.length) return;
        const cx = (g % 4) * 760, cy = Math.floor(g / 4) * 800;
        ids.forEach((id, i) => { const r = 30 * Math.sqrt(i + 0.6), t = i * 2.39996; pos[id] = { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r }; });
        heads.push({ name: `${name} · ${ids.length}`, x: cx, y: cy - 30 * Math.sqrt(ids.length) - 50 });
      });
    }
    const drawn = [];
    for (const e of atlas ? [] : edges) {
      const open = e.gate <= progress;
      if (ego) {
        if (e.auto || (e.a !== sel && e.b !== sel)) continue;
        const other = e.a === sel ? e.b : e.a;
        if (open && visible(other)) drawn.push({ e, A: P(sel), B: P(other), hot: true });
        else if (!open && fogNodes.has(other)) drawn.push({ e, A: P(sel), B: fogNodes.get(other), fogged: true });
        continue;
      }
      if (open && revealed.has(e.a) && revealed.has(e.b)) drawn.push({ e, A: P(e.a), B: P(e.b), hot: !e.auto && ((inQ.has(e.a) && inQ.has(e.b)) || e.a === sel || e.b === sel) });
      else if (!open && !e.auto) {
        const [near, far] = revealed.has(e.a) && visible(e.a) ? [N[e.a], N[e.b]] : revealed.has(e.b) && visible(e.b) ? [N[e.b], N[e.a]] : [null, null];
        if (near && !(visible(far.id) && revealed.has(far.id))) { fogNodes.set(far.id, far); drawn.push({ e, A: near, B: far, fogged: true }); }
      }
    }
    // 画面框住的范围
    const nb = sel ? new Set([sel, ...neighbors(sel).map((x) => x.other)]) : null;
    const focus = ego || showAll || !sel ? display : display.filter((id) => nb.has(id) || (inQ.has(sel) && inQ.has(id)));
    const fogFocus = [...fogNodes.values()].filter((fg) => ego || showAll || !sel || nb.has(fg.id));
    const pts = [...focus.map(P), ...fogFocus, ...heads];
    const box = svg.getBoundingClientRect();
    const ratio = box.width && box.height ? box.width / box.height : 900 / 680;
    let x0 = Math.min(...pts.map((p) => p.x), Infinity), x1 = Math.max(...pts.map((p) => p.x), -Infinity);
    let y0 = Math.min(...pts.map((p) => p.y), Infinity), y1 = Math.max(...pts.map((p) => p.y), -Infinity);
    if (!pts.length) { x0 = 0; x1 = 900; y0 = 0; y1 = 680; }
    let vw = Math.max(x1 - x0 + 260, 560), vh = Math.max(y1 - y0 + 240, 420);
    if (vw / vh < ratio) vw = vh * ratio; else vh = vw / ratio;
    const vx = (x0 + x1) / 2 - vw / 2, vy = (y0 + y1) / 2 - vh / 2 + 10;
    svg.setAttribute('viewBox', `${vx.toFixed(0)} ${vy.toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`);
    const f = vw / Math.max(box.width, 320); // 每个屏幕像素对应多少画布单位：字号和星的大小保持不变
    const crowded = focus.length > 22;
    const mute = focus.length > 70; // 星太多时不写名字，悬停可见

    let out = `<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#E6C06A" stop-opacity="0.45"></stop><stop offset="100%" stop-color="#E6C06A" stop-opacity="0"></stop></radialGradient><radialGradient id="skybg" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#17243F"></stop><stop offset="100%" stop-color="#0D1424"></stop></radialGradient></defs><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#skybg)"></rect>`;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) out += `<circle cx="${(vx + rnd() * vw).toFixed(0)}" cy="${(vy + rnd() * vh).toFixed(0)}" r="${([0.6, 0.8, 1.1][i % 3] * f).toFixed(2)}" fill="#fff" fill-opacity="${[0.15, 0.25, 0.35][(i * 7) % 3]}"></circle>`;

    let lines = '', labels = '';
    const pills = ego ? mineIds.length <= 12 : true;
    for (const { e, A, B, hot, fogged } of drawn) {
      const thin = ego && mineIds.length > 12;
      lines += `<line class="edge${hot ? ' hot' : ''}${fogged ? ' fogged' : ''}${e.auto ? ' auto' : ''}${e.level === 'hypothesis' ? ' hyp' : ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke-width="${((hot ? (thin ? 1.4 : 3) : e.auto ? 1 : 1.6) * f).toFixed(2)}"${thin ? ' stroke-opacity=".55"' : ''}${e.level === 'hypothesis' ? ` stroke-dasharray="${6 * f} ${5 * f}"` : ''}></line>`;
      if (hot && e.label && pills && (!crowded || e.a === sel || e.b === sel)) {
        const w = (e.label.length * 14 + 22) * f, h = 26 * f, t = ego ? 0.58 : 0.5, mx = A.x + (B.x - A.x) * t, my = A.y + (B.y - A.y) * t;
        labels += `<g class="elabel"><rect x="${mx - w / 2}" y="${my - h / 2}" width="${w}" height="${h}" rx="${h / 2}" stroke-width="${f}"></rect><text x="${mx}" y="${my + 5 * f}" font-size="${13 * f}">${esc(e.label)}</text></g>`;
      }
    }
    out += lines + labels;
    for (const h of heads) out += `<text class="head" x="${h.x}" y="${h.y}" font-size="${15 * f}" text-anchor="middle" fill="#E6C06A">${esc(h.name)}</text>`;
    for (const id of display) {
      const n = N[id], p = P(id);
      const isSel = id === sel;
      const r = atlas ? (isSel ? 20 : 11) : (isSel ? 24 : crowded ? 9 : 15) * f;
      const more = !ego && neighbors(id).some(({ e, other }) => !e.auto && e.gate <= progress && visible(other) && !revealed.has(other));
      const name = n.name.length > 12 && !isSel ? `${n.name.slice(0, 11)}…` : n.name;
      out += `<g class="node${isSel ? ' sel' : ''}" data-node="${id}" tabindex="0" role="button" aria-label="${esc(n.name)}，${kinds[n.kind]}"><title>${esc(n.name)}</title>`
        + ((inQ.has(id) || isSel) ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.6}" fill="url(#glow)"></circle>` : '')
        + (isSel ? `<circle class="ring" cx="${p.x}" cy="${p.y}" r="${r + 9 * f}" stroke-width="${2 * f}"></circle>` : more ? `<circle class="ring" cx="${p.x}" cy="${p.y}" r="${r + 6 * f}" stroke-width="${1.5 * f}" stroke-dasharray="${2 * f} ${5 * f}" stroke-opacity=".5"></circle>` : '')
        + `<circle class="body k-${n.kind}" cx="${p.x}" cy="${p.y}" r="${r}"></circle>${mute && !isSel ? '' : `<text x="${p.x}" y="${p.y + r + 20 * f}" font-size="${(isSel ? 16 : crowded ? 12 : 14) * f}" stroke-width="${4 * f}">${esc(name)}</text>`}</g>`;
    }
    for (const fg of fogNodes.values()) out += `<g class="fognode"><circle cx="${fg.x}" cy="${fg.y}" r="${12 * f}" stroke-width="${f}" stroke-dasharray="${3 * f} ${3 * f}"></circle><text x="${fg.x}" y="${fg.y + 5 * f}" font-size="${14 * f}">?</text></g>`;
    svg.innerHTML = out;

    // 右栏：选中星的关系
    if (!sel) { detail.innerHTML = '<p class="blurb">选一个问题，或点一颗星。</p>'; return; }
    const n = N[sel];
    const rels = neighbors(sel);
    const open = rels.filter(({ e, other }) => e.gate <= progress && visible(other));
    const hand = open.filter(({ e }) => !e.auto), auto = open.filter(({ e }) => e.auto);
    const fogged = rels.filter(({ e }) => e.gate > progress && !e.auto);
    const life = n.events.filter((x) => x.g <= progress), lifeFog = n.events.length - life.length;
    const LV = { fact: '事实', inference: '推断', hypothesis: '假说' };
    const quoteHTML = (e) => (e.ctx
      ? `<p class="q ctxq">${e.ctx.w ? `<i>${esc(e.ctx.w)}</i>` : ''}${esc(e.ctx.t).split(esc(e.quote)).join(`<mark>${esc(e.quote)}</mark>`)}</p>`
      : `<p class="q">“${esc(e.quote)}”</p>`);
    const card = ({ e, other }) => `<div class="relcard">
<div class="who2"><span class="lv lv-${e.level}">${LV[e.level]}</span><button type="button" data-node="${other}">${esc(N[other].name)}</button>${e.label ? `<span class="rlabel">${esc(e.label)}</span>` : ''}</div>
<p>${esc(e.text)}</p>${quoteHTML(e)}
<p class="srcline"><a href="${base}${e.href}">${esc(e.src)}</a>${e.pending ? ' · 待确认' : ''}</p>
</div>`;
    detail.innerHTML = `<div><span class="kind">${kinds[n.kind]}</span><h2>${esc(n.name)}</h2></div>
<p class="blurb">${esc(n.blurb)}</p>
<a class="more" href="${base}who/${n.id}/">完整档案：${hand.length + auto.length} 条关系、${life.length} 件事 →</a>
${hand.map(card).join('')}
${fogged.length ? `<div class="fognote">${LOCK} 还有 ${fogged.length} 条关系在迷雾里，${stages[Math.min(...fogged.map(({ e }) => e.gate))]}篇后显示。</div>` : ''}
${life.length ? `<div class="lifebox"><h3>经历</h3><ol>${life.slice(0, 6).map((x) => `<li><span>${esc(x.d)}</span>${esc(x.t)}</li>`).join('')}</ol>${life.length > 6 ? `<a class="more" href="${base}who/${n.id}/">另外 ${life.length - 6} 件事 →</a>` : ''}${lifeFog ? `<p class="fogline">${LOCK} ${lifeFog} 件事还在迷雾里</p>` : ''}</div>` : ''}
${auto.length ? `<div class="lifebox"><h3>也一起出现在</h3><ul class="also">${auto.map(({ other }) => `<li><button type="button" data-node="${other}">${esc(N[other].name)}</button></li>`).join('')}</ul></div>` : ''}`;
  };

  qlist.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { startFrom(questions.find((x) => x.id === b.dataset.q)); render(); } });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
  svg.addEventListener('click', (e) => { const g = e.target.closest('[data-node]'); if (g) select(g.dataset.node); });
  svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const g = e.target.closest('[data-node]'); if (g) { e.preventDefault(); select(g.dataset.node); svg.querySelector(`[data-node="${g.dataset.node}"]`)?.focus(); } } });
  detail.addEventListener('click', (e) => { const b = e.target.closest('[data-node]'); if (b) select(b.dataset.node); });
  $('#sky-all').addEventListener('click', () => { showAll = true; revealed = new Set(nodes.filter((n) => visible(n.id)).map((n) => n.id)); render(); });
  $('#sky-reset').addEventListener('click', () => { startFrom(q); render(); });

  // 起点：链接指定的问题或星，否则上次看的问题，否则第一个已解锁的
  const hash = new URLSearchParams(location.hash.slice(1));
  const unlocked = questions.filter((x) => x.gate <= progress);
  const wanted = unlocked.find((x) => x.id === hash.get('q')) || unlocked.find((x) => x.id === store.get('q')) || [...unlocked].sort((a, b) => b.gate - a.gate)[0] || null;
  startFrom(wanted);
  const hn = hash.get('n');
  if (hn && N[hn] && visible(hn)) { q = null; revealed = new Set([hn]); sel = hn; neighbors(hn).forEach(({ e, other }) => { if (!e.auto && e.gate <= progress && visible(other)) revealed.add(other); }); }
  render();
})();
