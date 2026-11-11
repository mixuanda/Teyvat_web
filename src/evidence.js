// 证据库：检索、筛选、反查引用处
(async () => {
  const { loadAll, evCard, esc } = window.Site;
  const list = document.getElementById('ev-list');
  const more = document.getElementById('ev-more');
  const count = document.getElementById('ev-count');
  const q = document.getElementById('ev-q');
  const kind = document.getElementById('ev-kind');
  const chap = document.getElementById('ev-chap');
  const sort = document.getElementById('ev-sort');
  const all = await loadAll();
  all.forEach((e) => { e._text = [e.id, e.title, e.note, e.speaker, ...e.quotes].join(' ').toLowerCase(); });
  const PAGE = 90;
  let hits = [];
  let shown = 0;
  let hl = null;

  const renderMore = () => {
    const next = hits.slice(shown, shown + PAGE);
    list.insertAdjacentHTML('beforeend', next.map((e) => evCard(e, { refs: true, hl })).join(''));
    shown += next.length;
    more.hidden = shown >= hits.length;
    more.textContent = `再显示 ${Math.min(PAGE, hits.length - shown)} 条（余 ${hits.length - shown}）`;
  };
  const apply = () => {
    const kw = q.value.trim().toLowerCase();
    const c = Number(chap.value);
    hits = all.filter((e) => (!kw || e._text.includes(kw)) && (!kind.value || e.kind === kind.value) && (!c || e.refs.some((r) => r[0] === c)));
    hits.sort(sort.value === 'refs' ? (a, b) => b.refs.length + b.events.length - a.refs.length - a.events.length || a.n - b.n : (a, b) => a.n - b.n);
    if (kw) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      hl = (s) => s.replace(re, (m) => `<mark>${m}</mark>`);
    } else hl = null;
    list.innerHTML = hits.length ? '' : '<p class="rail-hint">没有符合条件的引证。</p>';
    shown = 0;
    count.textContent = `${hits.length} 条`;
    renderMore();
  };
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 100); });
  [kind, chap, sort].forEach((el) => el.addEventListener('change', apply));
  more.addEventListener('click', renderMore);

  // #A001 直达某条证据
  const jump = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const i = hits.findIndex((e) => e.id === id);
    if (i < 0) {
      if (!all.some((e) => e.id === id)) return;
      q.value = ''; kind.value = ''; chap.value = ''; sort.value = 'n';
      apply();
      return jump();
    }
    while (shown <= i) renderMore();
    const el = document.getElementById(id);
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2600);
  };
  apply();
  jump();
  addEventListener('hashchange', jump);
})();
