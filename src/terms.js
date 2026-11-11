// 名词索引：按名字和类别筛选、翻页
(async () => {
  const { base, esc } = window.Site;
  const q = document.getElementById('term-q'), kind = document.getElementById('term-kind'), count = document.getElementById('term-count');
  const list = document.getElementById('term-list');
  const prev = document.getElementById('term-prev'), next = document.getElementById('term-next'), pageEl = document.getElementById('term-page');
  const rows = await fetch(`${base}data/terms.json`).then((r) => r.json());
  const PAGE = 300;
  let hits = [], page = 0;
  const href = (t) => (t[2].startsWith('who:') ? `${base}who/${t[2].slice(4)}/` : `${base}t/${t[2]}/${t[3] != null ? `#p${t[3] + 1}` : ''}`);
  const render = () => {
    list.innerHTML = hits.slice(page * PAGE, page * PAGE + PAGE).map((t) => `<li><a href="${href(t)}">${esc(t[0])}</a><span>${esc(t[1])}</span></li>`).join('');
    const pages = Math.max(1, Math.ceil(hits.length / PAGE));
    pageEl.textContent = `第 ${page + 1} / ${pages} 页`;
    prev.disabled = page === 0; next.disabled = page >= pages - 1;
  };
  const apply = () => {
    const kw = q.value.trim().toLowerCase();
    hits = rows.filter((t) => (!kind.value || t[1] === kind.value) && (!kw || t[0].toLowerCase().includes(kw)));
    count.textContent = `${hits.length.toLocaleString('en-US')} 个`;
    page = 0; render();
  };
  let tm;
  q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(apply, 120); });
  kind.addEventListener('change', apply);
  prev.addEventListener('click', () => { page--; render(); scrollTo({ top: 0 }); });
  next.addEventListener('click', () => { page++; render(); scrollTo({ top: 0 }); });
  if (location.hash.startsWith('#q=')) q.value = decodeURIComponent(location.hash.slice(3));
  apply();
})();
