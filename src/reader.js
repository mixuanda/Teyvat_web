// 章页：阅读进度、小节定位，以及随段落更新的证据侧栏
(() => {
  const { getEv, evCard } = window.Site;
  const rail = document.querySelector('.evrail');
  const cards = document.getElementById('rail-cards');
  const count = document.getElementById('rail-count');
  const paras = [...document.querySelectorAll('.para[data-evs]')];
  const narrow = () => matchMedia('(max-width: 960px)').matches;
  let active = null;

  const close = document.createElement('button');
  close.className = 'sheet-close';
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '×';
  close.addEventListener('click', () => rail.classList.remove('open'));
  rail.prepend(close);

  async function show(p, focusId) {
    if (p !== active) {
      active?.classList.remove('active');
      active = p;
      p.classList.add('active');
      const ids = p.dataset.evs.split(' ');
      const evs = (await Promise.all(ids.map(getEv))).filter(Boolean);
      if (active !== p) return;
      cards.innerHTML = evs.map((e) => evCard(e)).join('');
      count.textContent = evs.length;
      rail.scrollTop = 0;
    }
    if (focusId) {
      const card = document.getElementById(`card-${focusId}`);
      if (card) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1400);
      }
    }
  }

  // 桌面：指针所在段落；或滚动时视口上部的段落
  let pointerAt = 0;
  paras.forEach((p) => p.addEventListener('mouseenter', () => { if (!narrow()) { pointerAt = Date.now(); show(p); } }));
  const bar = document.getElementById('progress-bar');
  const prose = document.querySelector('.prose');
  const outline = [...document.querySelectorAll('.outline a')];
  const sections = outline.map((a) => document.getElementById(a.hash.slice(1)));
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const r = prose.getBoundingClientRect();
    bar.style.width = `${Math.max(0, Math.min(1, (innerHeight * 0.4 - r.top) / r.height)) * 100}%`;
    const line = innerHeight * 0.38;
    let cur = -1;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < line) cur = i; });
    outline.forEach((a, i) => a.classList.toggle('on', i === cur));
    if (!narrow() && Date.now() - pointerAt > 900) {
      const p = paras.find((x) => x.getBoundingClientRect().bottom > line);
      if (p) show(p);
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // 点击金色编号：定位到侧栏卡片（窄屏则从底部升起）
  window.Reader = {
    onCite(a) {
      const p = a.closest('.para[data-evs]');
      if (!p) return false;
      pointerAt = Date.now() + 2500;
      show(p, a.dataset.ev);
      if (narrow()) rail.classList.add('open');
      return true;
    },
  };
  document.addEventListener('click', (e) => {
    if (narrow() && rail.classList.contains('open') && !e.target.closest('.evrail') && !e.target.closest('[data-ev]')) rail.classList.remove('open');
  });
})();
