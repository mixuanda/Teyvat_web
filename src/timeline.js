// 年表：按时间依据与关键词筛选，分组导航高亮
(() => {
  const q = document.getElementById('tl-q');
  const count = document.getElementById('tl-count');
  const empty = document.getElementById('tl-empty');
  const segs = [...document.querySelectorAll('.seg button')];
  const groups = [...document.querySelectorAll('.tl-group')].map((g) => ({
    el: g,
    events: [...g.querySelectorAll('.event')].map((e) => ({ el: e, basis: e.dataset.basis, text: e.textContent.toLowerCase() })),
  }));
  let basis = '';
  const apply = () => {
    const kw = q.value.trim().toLowerCase();
    let n = 0;
    for (const g of groups) {
      let shown = 0;
      for (const e of g.events) {
        const ok = (!basis || e.basis === basis) && (!kw || e.text.includes(kw));
        e.el.hidden = !ok;
        if (ok) shown++;
      }
      g.el.hidden = !shown;
      n += shown;
    }
    count.textContent = `${n} 项`;
    empty.hidden = n > 0;
  };
  q.addEventListener('input', apply);
  segs.forEach((b) => b.addEventListener('click', () => {
    basis = b.dataset.basis;
    segs.forEach((x) => x.setAttribute('aria-pressed', x === b));
    apply();
  }));

  // 跳到被筛掉的事件时，先清空筛选
  const reveal = () => {
    const el = location.hash && document.getElementById(location.hash.slice(1));
    if (el?.hidden || el?.closest('[hidden]')) {
      q.value = ''; basis = '';
      segs.forEach((x) => x.setAttribute('aria-pressed', x.dataset.basis === ''));
      apply();
      el.scrollIntoView();
    }
  };
  addEventListener('hashchange', reveal);

  const nav = [...document.querySelectorAll('.tl-nav a')];
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      let cur = 0;
      groups.forEach((g, i) => { if (!g.el.hidden && g.el.getBoundingClientRect().top < innerHeight * 0.4) cur = i; });
      nav.forEach((a, i) => a.classList.toggle('on', i === cur));
      nav[cur]?.scrollIntoView({ block: 'nearest' });
    });
  }, { passive: true });
})();
