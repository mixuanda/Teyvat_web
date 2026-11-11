// 原文库：上万篇，数据按需载入，在浏览器里筛选和翻页
(async () => {
  const { base, esc } = window.Site;
  const meta = JSON.parse(document.getElementById('lib-meta').textContent);
  const filters = document.getElementById('filters');
  const q = document.getElementById('lib-q');
  const count = document.getElementById('lib-count');
  const tbody = document.getElementById('lib-rows');
  const prev = document.getElementById('lib-prev'), next = document.getElementById('lib-next'), pageEl = document.getElementById('lib-page');
  const PAGE = 100;
  let page = 0;
  let hits = [];
  const fromHash = () => {
    const m = location.hash.match(/type=([a-z]+)/);
    if (m) filters.querySelectorAll('input[name="type"]').forEach((i) => { i.checked = i.value === m[1]; });
  };
  fromHash();
  const rows = (await fetch(`${base}data/library.json`).then((r) => r.json())).map((r) => ({ id: r[0], title: r[1], type: r[2], pending: r[3], langs: r[4], cited: r[5], group: r[6], key: `${r[1]} /t/${r[0]} ${r[6]}`.toLowerCase() }));
  const picked = (name) => [...filters.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const render = () => {
    const slice = hits.slice(page * PAGE, page * PAGE + PAGE);
    tbody.innerHTML = slice.map((s) => `<tr><td><a class="serif" href="${base}t/${s.id}/">${esc(s.title)}</a>${s.group ? `<span class="rowgroup">${esc(s.group)}</span>` : ''}${s.cited ? '<span class="pill">研究引用</span>' : ''}</td><td><span class="pill">${meta.types[s.type]}</span></td><td>${s.pending ? meta.version : `${meta.prev} 及更早`}</td><td>${s.pending ? '<span class="pill amber">待确认</span>' : '<span class="pill green">在线</span>'}</td><td><code>/t/${esc(s.id)}</code></td></tr>`).join('');
    const pages = Math.max(1, Math.ceil(hits.length / PAGE));
    pageEl.textContent = `第 ${page + 1} / ${pages} 页`;
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  };
  const apply = () => {
    const types = new Set(picked('type')), status = picked('status'), langs = picked('lang'), cited = picked('cited').length;
    const kw = q.value.trim().toLowerCase();
    hits = rows.filter((r) => types.has(r.type) && status.includes(r.pending ? 'pending' : 'live') && (!cited || r.cited) && langs.every((l) => r.langs.includes(l)) && (!kw || r.key.includes(kw)));
    count.textContent = `${hits.length.toLocaleString('en-US')} 篇${hits.length === rows.length ? '' : `（共 ${rows.length.toLocaleString('en-US')} 篇）`}`;
    page = 0;
    render();
  };
  filters.addEventListener('change', apply);
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 120); });
  prev.addEventListener('click', () => { page--; render(); scrollTo({ top: document.querySelector('.results').offsetTop - 80 }); });
  next.addEventListener('click', () => { page++; render(); scrollTo({ top: document.querySelector('.results').offsetTop - 80 }); });
  addEventListener('hashchange', () => { fromHash(); apply(); });
  apply();
})();
