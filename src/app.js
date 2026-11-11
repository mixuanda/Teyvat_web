// 全站共用：引证卡、搜索（考据层）、图像查看
(() => {
  const base = document.body.dataset.base || './';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── 引证数据：页面内嵌的优先；其余按需取全量 ──
  let evMap = null;
  let evPromise = null;
  const inlineEv = $('#ev-data');
  if (inlineEv) evMap = JSON.parse(inlineEv.textContent);
  const loadAll = () => (evPromise ||= fetch(`${base}data/evidence.json`).then((r) => r.json()).then((list) => {
    evMap = { ...Object.fromEntries(list.map((e) => [e.id, e])), ...(evMap || {}) };
    return list;
  }));
  const getEv = async (id) => { if (evMap?.[id]) return evMap[id]; await loadAll(); return evMap[id]; };
  const markQ = (t, qs) => {
    let out = esc(t);
    for (const q of [...new Set(qs)].sort((a, b) => b.length - a.length)) out = out.split(esc(q)).join(`\u0001${esc(q)}\u0002`);
    return out.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
  };
  const refsHTML = (e) => {
    const items = [
      ...(e.refs || []).map(([no, sec, title]) => `<a href="${base}read/${String(no).padStart(2, '0')}/#${sec}" title="${esc(title)}"><b>${String(no).padStart(2, '0')}</b>${esc(title)}</a>`),
      ...(e.events || []).map((id) => `<a href="${base}timeline/#${id}"><b>年表</b>${id}</a>`),
    ];
    return items.length ? `<div class="ev-refs">${items.join('')}</div>` : '';
  };
  const evCard = (e, { refs = false, hl = null } = {}) => {
    const h = (s) => (hl ? hl(esc(s)) : esc(s));
    const quotes = (e.ctx || []).map((c) => `<a class="ctx" href="${base}${e.href}#${c.a}" title="在原文中查看这一段">${c.s ? `<i>${esc(c.s)}</i>` : ''}${markQ(c.t, c.qs)}</a>`).join('')
      + ((e.ctx?.length ? e.loose : e.quotes) || []).map((q) => `<span>${h(q)}</span>`).join('');
    return `<article class="evcard" id="${refs ? e.id : `card-${e.id}`}" data-id="${e.id}">
<header><span class="ev-n">${e.n}</span><span class="ev-title">${h(e.title)}</span><span class="ev-id">${e.id}</span></header>
<blockquote>${quotes}</blockquote>
${e.note ? `<p class="ev-note">${h(e.note)}</p>` : ''}
<footer>${e.pending ? '<span class="pill amber">待确认</span>' : ''}${e.short ? `<code>${esc(e.short)}</code>` : ''}${e.href ? `<a href="${base}${e.href}${e.anchors?.[0] ? `#${e.anchors[0]}` : ''}">原文页 →</a>` : e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">出处 ↗</a>` : ''}${refs ? '' : `<a href="${base}evidence/#${e.id}">反查引用处 →</a>`}</footer>
${refs ? refsHTML(e) : ''}
</article>`;
  };

  // ── 引证浮层 ──
  let pop = null;
  let popFor = null;
  const closePop = () => { pop?.remove(); pop = null; popFor?.classList.remove('on'); popFor = null; };
  const openPop = async (a) => {
    const e = await getEv(a.dataset.ev);
    if (!e) return;
    closePop();
    popFor = a;
    a.classList.add('on');
    pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = evCard(e);
    document.body.append(pop);
    const r = a.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + pop.offsetHeight + 16 < innerHeight || r.top < pop.offsetHeight + 16;
    pop.style.left = `${left + scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + scrollY}px`;
  };
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-ev]');
    if (a) {
      if (ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      if (window.Reader?.onCite(a)) return;
      if (popFor === a) closePop(); else openPop(a);
      return;
    }
    if (pop && !ev.target.closest('.popover')) closePop();
    const copy = ev.target.closest('[data-copy]');
    if (copy) {
      const url = new URL(base + copy.dataset.copy.slice(1) + '/', location.href).href;
      navigator.clipboard?.writeText(url).then(() => { const t = copy.textContent; copy.textContent = '已复制'; setTimeout(() => { copy.textContent = t; }, 1400); });
    }
  });

  // ── 图像查看 ──
  document.addEventListener('click', (ev) => {
    const p = ev.target.closest('.panel');
    if (!p) return;
    const d = p.dataset;
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = `<div class="lightbox-img"><img src="${esc(d.full)}" alt="${esc(d.title)}"></div>
<aside class="lightbox-side"><h3>${esc(d.title)}</h3>
${d.obs ? `<h4>观察记录</h4><p>${esc(d.obs)}</p>` : ''}
${d.credit ? `<h4>来源</h4><p>${esc(d.credit)}${d.page ? `<br><a href="${esc(d.page)}" target="_blank" rel="noopener">出处页面 ↗</a>` : ''}</p>` : ''}</aside>
<button class="lightbox-close" type="button" aria-label="关闭">×</button>`;
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); p.focus(); };
    const onKey = (e) => e.key === 'Escape' && close();
    box.addEventListener('click', (e) => { if (!e.target.closest('.lightbox-side')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.append(box);
    $('.lightbox-close', box).focus();
  });

  // ── 搜索（考据层）：页头与首页的搜索框都打开同一个结果面板 ──
  let index = null;
  let searchEl = null;
  const openSearch = async (initial = '') => {
    if (searchEl) return;
    searchEl = document.createElement('div');
    searchEl.className = 'search';
    searchEl.innerHTML = '<div class="search-box" role="dialog" aria-label="搜索"><input type="search" placeholder="原文、专题或短链" autocomplete="off"><div class="search-results"><p class="search-tip">搜索原文题名与短链、专题、研究全文、年表和引证。</p></div></div>';
    document.body.append(searchEl);
    const input = $('input', searchEl);
    const results = $('.search-results', searchEl);
    input.value = initial;
    input.focus();
    let sel = -1;
    const close = () => { searchEl?.remove(); searchEl = null; };
    searchEl.addEventListener('click', (e) => { if (e.target === searchEl) close(); });
    const run = () => {
      const q = input.value.trim().toLowerCase();
      sel = -1;
      if (!q) { results.innerHTML = '<p class="search-tip">输入关键词开始搜索。</p>'; return; }
      if (!index) { results.innerHTML = '<p class="search-tip">正在载入索引…</p>'; return; }
      const order = { 专: 0, 文: 1, 章: 2, 节: 3, 年: 4, 证: 5 };
      const hits = [];
      for (const [k, title, url, text] of index) {
        const ti = title.toLowerCase().indexOf(q);
        const xi = text.toLowerCase().indexOf(q);
        if (ti < 0 && xi < 0) continue;
        hits.push({ k, title, url, text, xi, score: (ti >= 0 ? 0 : 10) + order[k] });
      }
      hits.sort((a, b) => a.score - b.score);
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const mark = (s) => esc(s).replace(re, (m) => `<mark>${m}</mark>`);
      results.innerHTML = hits.length
        ? hits.slice(0, 60).map((h) => {
          const from = h.xi > 24 ? h.xi - 24 : 0;
          return `<a href="${base}${h.url}"><i class="k">${h.k}</i><b>${mark(h.title)}</b><span>${mark((from ? '…' : '') + h.text.slice(from, from + 110))}</span></a>`;
        }).join('') + (hits.length > 60 ? `<p class="search-tip">共 ${hits.length} 处，只显示前 60 处。</p>` : '')
        : '<p class="search-tip">没有找到。换个说法试试。</p>';
    };
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 90); });
    searchEl.addEventListener('keydown', (e) => {
      const links = [...results.querySelectorAll('a')];
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!links.length) return;
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle('sel', i === sel));
        links[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links.length) { location.href = links[Math.max(sel, 0)].href; close(); }
    });
    results.addEventListener('click', (e) => { if (e.target.closest('a')) setTimeout(close, 0); });
    if (!index) index = await fetch(`${base}data/search.json`).then((r) => r.json());
    if (searchEl) run();
  };
  document.querySelectorAll('[data-search]').forEach((inp) => {
    const go = () => { const v = inp.value; inp.value = ''; inp.blur(); openSearch(v); };
    inp.addEventListener('input', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  });
  $('[data-search-go]')?.addEventListener('click', () => openSearch(''));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePop();
    if (e.key === '/' && document.body.classList.contains('study') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(''); }
  });

  window.Site = { base, esc, getEv, loadAll, evCard };
})();
