// 原文页：语言切换；锚点落在别的语言时自动切过去
(() => {
  const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  if (!tabs.length) return;
  const show = (L) => {
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === L));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== L; });
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));
  const toHash = () => {
    const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const panel = el?.closest('[data-panel]');
    if (panel?.hidden) { show(panel.dataset.panel); el.scrollIntoView(); }
  };
  toHash();
  addEventListener('hashchange', toHash);
})();
