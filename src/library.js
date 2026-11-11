// 原文库：按类型、状态、语言与题名筛选
(() => {
  const rows = [...document.querySelectorAll('#lib-rows tr')].map((el) => ({ el, type: el.dataset.type, status: el.dataset.status, langs: el.dataset.langs.split(' '), text: el.textContent.toLowerCase() }));
  const filters = document.getElementById('filters');
  const q = document.getElementById('lib-q');
  const count = document.getElementById('lib-count');
  const picked = (name) => [...filters.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const apply = () => {
    const types = picked('type'), status = picked('status'), langs = picked('lang');
    const kw = q.value.trim().toLowerCase();
    let n = 0;
    for (const r of rows) {
      const ok = types.includes(r.type) && status.includes(r.status) && langs.every((l) => r.langs.includes(l)) && (!kw || r.text.includes(kw));
      r.el.hidden = !ok;
      if (ok) n++;
    }
    count.textContent = `${n} 篇${n === rows.length ? '' : `（共 ${rows.length} 篇）`}`;
  };
  // #type=book：从首页或面包屑进来时只看一种类型
  const fromHash = () => {
    const m = location.hash.match(/type=([a-z]+)/);
    if (!m) return;
    filters.querySelectorAll('input[name="type"]').forEach((i) => { i.checked = i.value === m[1]; });
  };
  fromHash();
  filters.addEventListener('change', apply);
  q.addEventListener('input', apply);
  addEventListener('hashchange', () => { fromHash(); apply(); });
  apply();
})();
