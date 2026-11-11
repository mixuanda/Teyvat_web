// 全站共用：昼夜切换、证据卡、图像查看、全文搜索
(() => {
  const base = document.body.dataset.base || './';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── 昼夜 ──
  $('#toggle-theme')?.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    document.dispatchEvent(new CustomEvent('themechange'));
  });

  // ── 证据数据：章页内嵌；其他页按需取全量 ──
  let evMap = null;
  let evPromise = null;
  const inlineEv = $('#ev-data');
  if (inlineEv) evMap = JSON.parse(inlineEv.textContent);
  const loadAll = () => (evPromise ||= fetch(`${base}data/evidence.json`).then((r) => r.json()).then((list) => {
    const all = Object.fromEntries(list.map((e) => [e.id, e]));
    evMap = { ...all, ...(evMap || {}) };
    return list;
  }));
  const getEv = async (id) => {
    if (evMap?.[id]) return evMap[id];
    await loadAll();
    return evMap[id];
  };
  const evCard = (e, { refs = false, hl = null } = {}) => {
    const h = (s) => (hl ? hl(esc(s)) : esc(s));
    return `<article class="evcard" id="${refs ? e.id : `card-${e.id}`}" data-id="${e.id}">
<header><span class="ev-n">${e.n}</span><span class="ev-title">${h(e.title)}</span><span class="ev-id">${e.id}</span></header>
<blockquote>${e.quotes.map((q) => `<span>${h(q)}</span>`).join('')}</blockquote>
${e.note ? `<p class="ev-note">${h(e.note)}</p>` : ''}
<footer>${e.speaker ? `<span>${esc(e.speaker)}</span>` : ''}${e.lang && e.lang !== 'CHS' ? `<span>${esc(e.lang)}</span>` : ''}${e.locator ? `<span>${esc(e.locator)}</span>` : ''}${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">固定版本原件 ↗</a>` : ''}${refs ? '' : `<a href="${base}evidence/#${e.id}">反查引用处 →</a>`}</footer>
${refs ? refsHTML(e) : ''}
</article>`;
  };
  const refsHTML = (e) => {
    const items = [
      ...(e.refs || []).map(([no, sec, title]) => `<a href="${base}read/${String(no).padStart(2, '0')}/#${sec}" title="${esc(title)}"><b>${String(no).padStart(2, '0')}</b>${esc(title)}</a>`),
      ...(e.events || []).map((id) => `<a href="${base}timeline/#${id}"><b>年表</b>${id}</a>`),
    ];
    return items.length ? `<div class="ev-refs">${items.join('')}</div>` : '';
  };

  // ── 证据浮层 ──
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
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + pop.offsetHeight + 16 < window.innerHeight || r.top < pop.offsetHeight + 16;
    pop.style.left = `${left + scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 8 : r.top - pop.offsetHeight - 8) + scrollY}px`;
  };
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-ev]');
    if (a) {
      if (ev.metaKey || ev.ctrlKey) return;
      ev.preventDefault();
      // 章页有自己的侧栏处理
      if (window.Reader?.onCite(a)) return;
      if (popFor === a) closePop(); else openPop(a);
      return;
    }
    if (pop && !ev.target.closest('.popover')) closePop();
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

  // ── 全文搜索 ──
  let index = null;
  let searchEl = null;
  const KIND = { 章: '章', 节: '节', 事: '年', 证: '证' };
  const openSearch = async () => {
    if (searchEl) return;
    searchEl = document.createElement('div');
    searchEl.className = 'search';
    searchEl.innerHTML = `<div class="search-box" role="dialog" aria-label="全文搜索"><input type="search" placeholder="搜索正文、事件与原文引证…" autocomplete="off"><div class="search-results"><p class="search-tip">在 43 章正文、217 项事件与 711 条引证中搜索。↑↓ 选择，回车打开，Esc 关闭。</p></div></div>`;
    document.body.append(searchEl);
    const input = $('input', searchEl);
    const results = $('.search-results', searchEl);
    input.focus();
    let sel = -1;
    const close = () => { searchEl?.remove(); searchEl = null; };
    searchEl.addEventListener('click', (e) => { if (e.target === searchEl) close(); });
    const run = () => {
      const q = input.value.trim().toLowerCase();
      sel = -1;
      if (!q) { results.innerHTML = '<p class="search-tip">输入关键词开始搜索。</p>'; return; }
      if (!index) { results.innerHTML = '<p class="search-tip">正在载入索引…</p>'; return; }
      const hits = [];
      for (const [k, title, url, text] of index) {
        const ti = title.toLowerCase().indexOf(q);
        const xi = text.toLowerCase().indexOf(q);
        if (ti < 0 && xi < 0) continue;
        hits.push({ k, title, url, text, xi, score: (ti >= 0 ? 0 : 10) + (k === '章' ? 0 : k === '节' ? 1 : k === '事' ? 2 : 3) });
      }
      hits.sort((a, b) => a.score - b.score);
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const mark = (s) => esc(s).replace(re, (m) => `<mark>${m}</mark>`);
      results.innerHTML = hits.length
        ? hits.slice(0, 60).map((h) => {
          const from = h.xi > 24 ? h.xi - 24 : 0;
          const snip = (from ? '…' : '') + h.text.slice(from, from + 110);
          return `<a href="${base}${h.url}"><i class="k">${KIND[h.k]}</i><b>${mark(h.title)}</b><span>${mark(snip)}</span></a>`;
        }).join('') + (hits.length > 60 ? `<p class="search-tip">共 ${hits.length} 处，仅显示前 60 处。</p>` : '')
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
    if (!index) { index = await fetch(`${base}data/search.json`).then((r) => r.json()); if (searchEl) run(); }
  };
  $('#open-search')?.addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closePop();
  });

  // ── 入场 ──
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -3% 0px' });
  document.querySelectorAll('.block, .toc-part, .plates .plate').forEach((el) => { el.classList.add('reveal'); io.observe(el); });

  window.Site = { base, esc, getEv, loadAll, evCard };
})();
