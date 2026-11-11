// 静态站点生成：content/ + src/ → dist/
import fs from 'node:fs';
import path from 'node:path';
import { diagrams } from './diagrams.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const C = (p) => path.join(root, 'content', p);
const dist = path.join(root, 'dist');
const readJSON = (p) => JSON.parse(fs.readFileSync(C(p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('en-US');
const pad = (n) => String(n).padStart(2, '0');
const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

// ───────────────────────── 数据 ─────────────────────────
const stats = readJSON('build_statistics.json');
const source = readJSON('source.json');
const evidenceList = readJSON('evidence.json');
const EV = Object.fromEntries(evidenceList.map((e) => [e.id, e]));
const chronology = readJSON('chronology.json');
const relations = readJSON('relations.json');
const plates = readJSON('plates.json');
const partsDef = readJSON('parts.json');
const groupByTex = Object.fromEntries(plates.groups.map((g) => [g.tex, g]));

// 每卷一个色相（取自壁画的石青与赭金之间）
const PART_HUES = [42, 205, 28, 350, 170, 265, 190, 95, 320, 230, 12, 60];
const parts = partsDef.map((p, i) => ({
  idx: i,
  name: p.part || '导论：共同的时间坐标',
  label: i === 0 ? '导论' : `卷${CN[i]}`,
  hue: PART_HUES[i % PART_HUES.length],
  titles: p.chapters,
  chapters: [],
}));
const partOfTitle = new Map(parts.flatMap((p) => p.titles.map((t) => [t, p])));

// ───────────────────────── 正文解析 ─────────────────────────
const backrefs = {}; // 证据 id → 引用位置
let figureCounter = 0;
const figureIndex = []; // {no, id, chapter, title}

function citeRun(ids, base) {
  return `<span class="cites">${ids.map((id) => {
    const e = EV[id];
    return `<a class="cite" href="${base}evidence/#${id}" data-ev="${id}">${e ? e.n : id}</a>`;
  }).join('')}</span>`;
}
function inline(text, ctx) {
  return esc(text).replace(/(?:\[@[A-Za-z0-9]+\])+/g, (run) => {
    const ids = [...run.matchAll(/\[@([A-Za-z0-9]+)\]/g)].map((m) => m[1]);
    ids.forEach((id) => ctx.cite(id));
    return citeRun(ids, ctx.base);
  });
}
const plain = (text) => text.replace(/\[@[A-Za-z0-9]+\]/g, '');

function panelHTML(id, i, n, base) {
  const im = plates.images[id];
  const label = n > 1 ? `(${String.fromCharCode(97 + i)}) ` : '';
  return `<button class="panel" type="button" data-full="${base}images/${im.file}" data-title="${esc(im.scene || '')}" data-obs="${esc(im.observation || '')}" data-credit="${esc(im.credit || '')}" data-page="${esc(im.page || '')}">
<img loading="lazy" src="${base}images/${im.file}" width="${im.w}" height="${im.h}" alt="${esc(im.scene || id)}">
<span class="panel-label">${label}${esc(im.scene || id)}</span></button>`;
}
function plateHTML(g, no, base, { linkChapter } = {}) {
  const ims = g.panels.map((id) => plates.images[id]);
  const icons = ims.every((im) => im.w <= 256);
  const portrait = ims.every((im) => im.h > im.w);
  const cls = icons ? 'icons' : portrait ? 'portrait' : `n${Math.min(g.panels.length, 4)}`;
  const chap = linkChapter ? `<a class="plate-where" href="${base}read/${pad(linkChapter.no)}/#fig-${g.id}">见第 ${linkChapter.no} 章 →</a>` : '';
  return `<figure class="plate" id="fig-${g.id}">
<div class="plate-panels ${cls}">${g.panels.map((id, i) => panelHTML(id, i, g.panels.length, base)).join('')}</div>
<figcaption><span class="fig-no">图版 ${no}</span><strong>${esc(g.title)}</strong><span class="fig-cap">${esc(g.caption)}</span>${g.evidence?.length ? citeRun(g.evidence.filter((id) => EV[id]), base) : ''}${chap}</figcaption>
</figure>`;
}
function diagramHTML(d, no, base, { linkChapter } = {}) {
  const chap = linkChapter ? `<a class="plate-where" href="${base}read/${pad(linkChapter.no)}/#fig-${d.id}">见第 ${linkChapter.no} 章 →</a>` : '';
  return `<figure class="plate diagram" id="fig-${d.id}">
<div class="diagram-wrap">${d.svgs.join('')}</div>
<figcaption><span class="fig-no">结构图 ${no}</span><strong>${esc(d.title)}</strong><span class="fig-cap">${esc(d.caption)}</span>${citeRun(d.evidence.filter((id) => EV[id]), base)}${chap}</figcaption>
</figure>`;
}

const md = fs.readFileSync(C('manuscript.md'), 'utf8');
const chapters = md.split(/^## /m).slice(1).map((raw, ci) => {
  const nl = raw.indexOf('\n');
  const title = raw.slice(0, nl).trim();
  const no = ci + 1;
  const part = partOfTitle.get(title);
  const base = '../../';
  const chapter = { no, title, part, sections: [], cites: new Set(), chars: 0, figures: [] };
  part.chapters.push(chapter);
  const secRaw = raw.slice(nl + 1).split(/^### /m);
  secRaw.forEach((sraw, si) => {
    let stitle = null;
    let body = sraw;
    if (si > 0) {
      const k = sraw.indexOf('\n');
      stitle = sraw.slice(0, k < 0 ? undefined : k).trim();
      body = k < 0 ? '' : sraw.slice(k + 1);
    }
    if (!body.trim() && !stitle) return;
    const sec = { id: `s${si}`, title: stitle, html: [], text: [] };
    const ctx = {
      base,
      cite(id) {
        chapter.cites.add(id);
        const list = (backrefs[id] ||= []);
        if (!list.some((r) => r[0] === no && r[1] === sec.id)) list.push([no, sec.id, stitle || title]);
      },
    };
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('!FIGURE:')) {
        const tex = line.slice(8).trim();
        const fno = ++figureCounter;
        const g = groupByTex[tex];
        const d = diagrams[tex];
        if (g) { sec.html.push(plateHTML(g, fno, base)); g.evidence?.forEach((id) => EV[id] && ctx.cite(id)); figureIndex.push({ no: fno, kind: 'plate', ref: g, chapter }); }
        else if (d) { sec.html.push(diagramHTML(d, fno, base)); d.evidence.forEach((id) => EV[id] && ctx.cite(id)); figureIndex.push({ no: fno, kind: 'diagram', ref: d, chapter }); }
        else console.warn('未知图版', tex);
        continue;
      }
      if (line.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
        i--;
        const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const head = cells(rows[0]);
        const bodyRows = rows.slice(2).map(cells);
        sec.html.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        sec.text.push(rows.map(plain).join(' '));
        continue;
      }
      const ids = [...new Set([...line.matchAll(/\[@([A-Za-z0-9]+)\]/g)].map((m) => m[1]))];
      sec.html.push(`<p class="para"${ids.length ? ` data-evs="${ids.join(' ')}"` : ''}>${inline(line, ctx)}</p>`);
      const t = plain(line);
      sec.text.push(t);
      chapter.chars += (t.match(/[\u4e00-\u9fff]/g) || []).length;
    }
    chapter.sections.push(sec);
  });
  return chapter;
});
figureIndex.forEach((f) => f.chapter.figures.push(f));

// ───────────────────────── 页面骨架 ─────────────────────────
const NAV = [
  ['read/', '读本', '读'],
  ['timeline/', '年表', '年'],
  ['evidence/', '证据', '证'],
  ['plates/', '图版', '图'],
  ['about/', '关于', '记'],
];
const SITE = '提瓦特文明史';
const SIGIL = `<svg class="sigil" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 3"/><path d="M20 2.5v6M20 31.5v6M2.5 20h6M31.5 20h6" stroke="currentColor" stroke-width="1"/><path d="M20 12.5l2.2 5.3 5.3 2.2-5.3 2.2L20 27.5l-2.2-5.3-5.3-2.2 5.3-2.2z" fill="currentColor"/></svg>`;

function page({ url, title, desc, body, cls = '', scripts = [], data = {}, hue }) {
  const depth = url.split('/').filter(Boolean).length;
  const base = depth ? '../'.repeat(depth) : './';
  const section = url.split('/')[0];
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · ${SITE}` : `${SITE}与世界结构研究`)}</title>
<meta name="description" content="${esc(desc || '以年代、元素、循环、图像与多语对读重建提瓦特文明史：43 章正文、217 项编年事件、711 条原文引证。')}">
<meta name="theme-color" content="#10151f">
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}})()</script>
<link rel="stylesheet" href="${base}assets/fonts.css">
<link rel="stylesheet" href="${base}assets/styles.css">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
</head>
<body class="${cls}" data-base="${base}"${hue != null ? ` style="--part-h:${hue}"` : ''}>
<a class="skip" href="#main">跳到正文</a>
<header class="topbar">
<a class="brand" href="${base}">${SIGIL}<span class="brand-text"><b>${SITE}</b><i>与世界结构研究</i></span></a>
<nav class="nav" aria-label="主导航">${NAV.map(([u, t]) => `<a href="${base}${u}"${section === u.replace('/', '') ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
<div class="tools">
<button class="tool" id="open-search" type="button" aria-label="搜索"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>搜索</span><kbd>/</kbd></button>
<button class="tool icon" id="toggle-theme" type="button" aria-label="切换昼夜"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5A6 6 0 0 1 10 2.5z" fill="currentColor"/></svg></button>
</div>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
<div class="footer-in">
<p><b>${esc(stats.edition)}</b> · ${esc(stats.revision_date)} · 文本固定于《原神》${esc(source.corpus_version || '')} 语料快照</p>
<p>非官方同人研究。《原神》及其文本、图像的权利归 HoYoverse / miHoYo 所有；图像来源与上传者逐幅列于<a href="${base}plates/">图版</a>页。</p>
</div>
</footer>
<nav class="tabbar" aria-label="底部导航">${[['', '首页', '首'], ...NAV].map(([u, t, g]) => `<a href="${base}${u}"${(section || '') === u.replace('/', '') ? ' aria-current="page"' : ''}><i>${g}</i><span>${t}</span></a>`).join('')}</nav>
${Object.entries(data).map(([k, v]) => `<script type="application/json" id="${k}">${JSON.stringify(v).replace(/</g, '\\u003c')}</script>`).join('\n')}
<script src="${base}assets/app.js" defer></script>
${scripts.map((s) => `<script src="${base}assets/${s}" defer></script>`).join('\n')}
</body>
</html>
`;
  const file = path.join(dist, url, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ───────────────────────── 构建开始 ─────────────────────────
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.mkdirSync(path.join(dist, 'data'), { recursive: true });
fs.cpSync(C('images'), path.join(dist, 'images'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'src'))) fs.copyFileSync(path.join(root, 'src', f), path.join(dist, 'assets', f));

// 字体：自托管的 Noto Serif SC（按 unicode-range 切片，浏览器只取用到的片）+ Cormorant Garamond
{
  const fdir = path.join(dist, 'assets', 'fonts');
  fs.mkdirSync(fdir, { recursive: true });
  let css = '';
  const take = (pkg, cssFile) => {
    const dir = path.join(root, 'node_modules', '@fontsource', pkg);
    const src = fs.readFileSync(path.join(dir, cssFile), 'utf8');
    css += src.replace(/src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)[^;]*;/g, (m, f) => {
      fs.copyFileSync(path.join(dir, 'files', f), path.join(fdir, f));
      return `src: url(fonts/${f}) format('woff2');`;
    });
  };
  for (const w of [400, 700, 900]) take('noto-serif-sc', `${w}.css`);
  for (const f of ['latin-500.css', 'latin-600.css', 'latin-500-italic.css']) take('cormorant-garamond', f);
  fs.writeFileSync(path.join(dist, 'assets', 'fonts.css'), css);
}
fs.writeFileSync(path.join(dist, 'assets', 'favicon.svg'), SIGIL.replace('class="sigil"', 'xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/g, '#d8a93f'));

const chapterURL = (c) => `read/${pad(c.no)}/`;
const eraAnchors = [
  ['六千余年', '钟离的个人经历', 6000],
  ['三千七百年前', '璃月建立', 3700],
  ['约三千年前', '甘雨参战', 3000],
  ['约两千六百年前', '旧蒙德革命', 2600],
  ['两千年前', '魔神战争结束', 2000],
  ['一千年前', '温妮莎革命', 1000],
  ['五百年前', '跨地域灾变', 500],
  ['当代', '旅行者时代', 0],
];
function eraRibbon(base) {
  const pos = (y) => (100 - Math.pow(y / 6000, 0.75) * 100).toFixed(2);
  return `<div class="era" role="img" aria-label="可以对照的距今年代">
<div class="era-line"></div>
${eraAnchors.map(([d, t, y], i) => `<a class="era-pt ${i % 2 ? 'up' : 'down'}" style="left:${pos(y)}%" href="${base}read/01/#s2"><i></i><b>${d}</b><span>${t}</span></a>`).join('')}
</div>`;
}

// ───────────────────────── 首页 ─────────────────────────
{
  const base = './';
  const statItems = [
    [stats.body_han_characters, '正文汉字'],
    [stats.sections, '章'],
    [stats.subsections, '小节'],
    [stats.chronology_events, '编年事件'],
    [stats.evidence, '原文引证'],
    [stats.source_titles, '来源题名'],
    [stats.image_assets, '幅图像'],
  ];
  const mosaicIds = ['MOON1', 'TSU1', 'NAT2', 'CHEN1', 'REM1', 'GUR1', 'SNOW1', 'CHASM2', 'TSU7'].filter((id) => plates.images[id]);
  const body = `
<section class="hero">
<canvas id="astrolabe" aria-hidden="true"></canvas>
<div class="hero-in">
<p class="eyebrow">${esc(stats.edition)} · ${esc(stats.revision_date)}</p>
<h1><span>提瓦特</span><span>文明史</span></h1>
<p class="hero-sub">与世界结构研究</p>
<p class="hero-lede">年代、元素、循环、图像与多语对读。<br>一部每句话都能追到游戏原文的长篇研究——在这里，它可以被读、被查、被质疑。</p>
<div class="hero-cta">
<a class="btn primary" href="${base}read/01/">从第一章读起</a>
<a class="btn" href="${base}timeline/">沿年表进入</a>
</div>
</div>
<a class="hero-scroll" href="#numbers" aria-label="向下">↓</a>
</section>

<section class="numbers" id="numbers">
${statItems.map(([n, l]) => `<div class="num"><b data-count="${n}">${fmt(n)}</b><span>${l}</span></div>`).join('')}
</section>

<section class="block ways">
<header class="block-head"><p class="eyebrow">Three Ways In</p><h2>三种读法</h2><p>同一份研究，三个入口。论证、时间、出处互相连通，从任何一处都能走到另外两处。</p></header>
<div class="way-grid">
<a class="way" href="${base}read/"><span class="way-glyph">读</span><h3>读本</h3><p>十一卷 ${stats.sections} 章的连续正文。右栏随你读到的段落，同步摆出它所依据的原文。</p><em>论证 →</em></a>
<a class="way" href="${base}timeline/"><span class="way-glyph">年</span><h3>年表</h3><p>${stats.chronology_events} 项事件按共同年代与并行地域谱系排列，标明每个时间是纪年、推算还是相对次序。</p><em>时间 →</em></a>
<a class="way" href="${base}evidence/"><span class="way-glyph">证</span><h3>证据</h3><p>${stats.evidence} 条短引，带来源题名、定位和固定版本原件链接，并反查它在正文中被用在哪里。</p><em>出处 →</em></a>
</div>
</section>

<section class="block draw">
<div class="draw-card" id="draw">
<p class="eyebrow">随手抽一条原文</p>
<blockquote id="draw-quote">…</blockquote>
<p class="draw-src"><span id="draw-title"></span><a id="draw-link" href="${base}evidence/">它支撑了哪些论述 →</a></p>
<button class="btn small" id="draw-again" type="button">再抽一条</button>
</div>
</section>

<section class="block">
<header class="block-head"><p class="eyebrow">Anchors</p><h2>可以对照的距今年代</h2><p>不同地区的历史，靠几个明确的“距今多少年”放进同一条时间轴。</p></header>
${eraRibbon(base)}
</section>

<section class="block">
<header class="block-head"><p class="eyebrow">Volumes</p><h2>全书结构</h2></header>
<ol class="shelf">
${parts.map((p) => `<li style="--part-h:${p.hue}"><a href="${base}read/#part-${p.idx}"><span class="shelf-label">${p.label}</span><b>${esc(p.name)}</b><span class="shelf-meta">${p.chapters.length} 章 · ${fmt(p.chapters.reduce((a, c) => a + c.chars, 0))} 字</span></a></li>`).join('\n')}
</ol>
</section>

<section class="block">
<header class="block-head"><p class="eyebrow">Plates</p><h2>图像也是史料</h2><p>壁画、纹样与教程图被逐幅观察、记录来源，再与文本互证。</p></header>
<a class="mosaic" href="${base}plates/">${mosaicIds.map((id) => { const im = plates.images[id]; return `<img loading="lazy" src="${base}images/${im.file}" width="${im.w}" height="${im.h}" alt="${esc(im.scene || '')}">`; }).join('')}<span class="mosaic-more">查看全部 ${plates.groups.length} 组图版 →</span></a>
</section>`;
  const draw = evidenceList.filter((e) => e.quotes.join('').length >= 12 && !e.lang || e.lang === 'CHS').filter((e) => e.quotes[0].length >= 10 && e.quotes[0].length <= 60)
    .map((e) => ({ id: e.id, q: e.quotes[0], t: e.title }));
  page({ url: '', title: '', body, cls: 'home', scripts: ['home.js'], data: { 'draw-data': draw } });
}

// ───────────────────────── 读本目录 ─────────────────────────
{
  const base = '../';
  const maxChars = Math.max(...chapters.map((c) => c.chars));
  const body = `
<header class="page-head">
<p class="eyebrow">Reader</p>
<h1>读本</h1>
<p class="page-lede">全书 ${stats.sections} 章、${stats.subsections} 小节、${fmt(stats.body_han_characters)} 汉字。每一章都可以单独读；右侧的长条表示篇幅。</p>
</header>
<div class="toc">
${parts.map((p) => `<section class="toc-part" id="part-${p.idx}" style="--part-h:${p.hue}">
<header><span class="toc-label">${p.label}</span><h2>${esc(p.name)}</h2></header>
<ol>
${p.chapters.map((c) => `<li><a href="${base}${chapterURL(c)}"><span class="toc-no">${pad(c.no)}</span><span class="toc-title">${esc(c.title)}</span><span class="toc-meta">${fmt(c.chars)} 字 · ${c.cites.size} 证${c.figures.length ? ` · ${c.figures.length} 图` : ''}</span><span class="toc-bar"><i style="width:${Math.max(2, (c.chars / maxChars) * 100).toFixed(1)}%"></i></span></a></li>`).join('\n')}
</ol>
</section>`).join('\n')}
</div>`;
  page({ url: 'read/', title: '读本', body, cls: 'toc-page' });
}

// ───────────────────────── 各章 ─────────────────────────
chapters.forEach((c, i) => {
  const base = '../../';
  const prev = chapters[i - 1];
  const next = chapters[i + 1];
  const named = c.sections.filter((s) => s.title);
  const evData = Object.fromEntries([...c.cites].filter((id) => EV[id]).map((id) => [id, EV[id]]));
  const body = `
<div class="progress" aria-hidden="true"><i id="progress-bar"></i></div>
<header class="chapter-head">
<p class="crumbs"><a href="${base}read/">读本</a><span>/</span><a href="${base}read/#part-${c.part.idx}">${c.part.label} · ${esc(c.part.name)}</a></p>
<div class="chapter-no">${pad(c.no)}</div>
<h1>${esc(c.title)}</h1>
<p class="chapter-meta"><span>${fmt(c.chars)} 字</span><span>约 ${Math.max(1, Math.round(c.chars / 450))} 分钟</span><span>${named.length} 小节</span><span>${c.cites.size} 条引证</span></p>
</header>
<div class="reader">
<aside class="outline" aria-label="本章小节">
<p class="rail-title">本章</p>
<ol>${named.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ol>
</aside>
<article class="prose">
${c.sections.map((s) => `<section id="${s.id}">${s.title ? `<h2><a class="anchor" href="#${s.id}" aria-label="本节链接">§</a>${esc(s.title)}</h2>` : ''}
${s.html.join('\n')}
</section>`).join('\n')}
<nav class="pager">
${prev ? `<a class="prev" href="${base}${chapterURL(prev)}"><span>← 上一章 · ${pad(prev.no)}</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
${next ? `<a class="next" href="${base}${chapterURL(next)}"><span>下一章 · ${pad(next.no)} →</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
</nav>
</article>
<aside class="evrail" aria-label="本段证据">
<p class="rail-title">本段所据原文 <span id="rail-count"></span></p>
<div id="rail-cards"><p class="rail-hint">把指针移到任一段落，或点击文中的金色编号，这里会列出该段引用的原文。</p></div>
</aside>
</div>`;
  page({ url: chapterURL(c), title: c.title, desc: plain(c.sections[0]?.text[0] || '').slice(0, 110), body, cls: 'chapter', scripts: ['reader.js'], data: { 'ev-data': evData }, hue: c.part.hue });
});

// ───────────────────────── 年表 ─────────────────────────
const REL = {
  before: '先于', after: '晚于', same_period: '同期', same_approximate_period: '近似同期', same_crisis: '同一危机', same_war_complex: '同一战争群',
  narrative_before: '叙述在前', narrative_after: '叙述在后', overlapping_research: '研究交叠', historical_reference: '历史回顾',
  interpretive_comparison: '解释性比较', parallel_regional_storyline: '并行地域情节', documented_stage_of: '文献所记阶段',
  historical_effect_of: '历史后果', cross_time_cause: '跨时原因', cross_time_effect: '跨时结果', contemporary_proposal: '当代方案',
};
const BASIS = { 相对顺序: 'rel', 文本纪年: 'text', 近似年代: 'approx', 当代叙事: 'now' };
const eventsById = Object.fromEntries(chronology.filter((x) => x.event_id).map((x) => [x.event_id, x]));
const eventRefs = {}; // 证据 → 事件
{
  const base = '../';
  const groups = [];
  for (const row of chronology) {
    if (row.group) groups.push({ title: row.group, events: [] });
    else groups[groups.length - 1].events.push(row);
  }
  const short = (s, n = 34) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const eventHTML = (e) => {
    const r = relations.events[e.event_id];
    const rels = (r?.relations || []).filter((x) => eventsById[x.to]);
    (e.sources || []).forEach((id) => (eventRefs[id] ||= []).push(e.event_id));
    const extra = ['internal_time_constraint', 'temporal_layer', 'original_date'].filter((k) => typeof e[k] === 'string').map((k) => `<p class="ev-extra">${esc(e[k])}</p>`).join('');
    return `<li class="event" id="${e.event_id}" data-basis="${BASIS[e.time_basis] || 'other'}">
<div class="event-date">${esc(e.date)}</div>
<div class="event-body">
<p class="event-region">${esc(e.region)}<a class="event-id" href="#${e.event_id}">${e.event_id}</a></p>
<p class="event-text">${esc(e.event)}</p>
<p class="event-meta"><span class="basis" title="这个时间是怎么定的">${esc(e.time_basis)}</span>${(e.sources || []).filter((id) => EV[id]).map((id) => `<a class="chip" href="${base}evidence/#${id}" data-ev="${id}">${esc(short(EV[id].title, 16))}</a>`).join('')}</p>
${rels.length || extra ? `<details class="rels"><summary>${rels.length ? `${rels.length} 条时间关系` : '定位说明'}</summary>${extra}${r?.precision ? `<p class="ev-extra">精度：${esc(r.precision)}</p>` : ''}<ul>${rels.map((x) => `<li><span class="rel rel-${x.rel.replace(/_.*/, '')}">${REL[x.rel] || x.rel}</span><a href="#${x.to}">${esc(short(eventsById[x.to].event))}</a><small>${esc(x.basis || '')}</small></li>`).join('')}</ul></details>` : ''}
</div>
</li>`;
  };
  const gTitle = (t) => { const m = t.match(/^([^、：]{1,6})、(.+)$/); return m ? [m[1].replace('（续）', '·续'), m[2]] : ['', t]; };
  const body = `
<header class="page-head">
<p class="eyebrow">Chronology</p>
<h1>年表</h1>
<p class="page-lede">${stats.chronology_events} 项事件。先是宇宙与共同年代的锚点，再是并行的地域谱系，然后在五百年前汇成同一截面，最后进入旅行者时代。${esc(relations.reference_frame.split('。')[0])}。</p>
</header>
${eraRibbon(base)}
<div class="tl-controls" id="tl-controls">
<input type="search" id="tl-q" placeholder="筛选事件、地区、年代…" aria-label="筛选事件">
<div class="seg" role="group" aria-label="时间依据">
<button type="button" data-basis="" aria-pressed="true">全部</button>
<button type="button" data-basis="text" aria-pressed="false">文本纪年</button>
<button type="button" data-basis="approx" aria-pressed="false">近似年代</button>
<button type="button" data-basis="rel" aria-pressed="false">相对顺序</button>
<button type="button" data-basis="now" aria-pressed="false">当代叙事</button>
<button type="button" data-basis="other" aria-pressed="false">文献内部次序</button>
</div>
<span class="tl-count" id="tl-count">${stats.chronology_events} 项</span>
</div>
<div class="tl">
<aside class="tl-nav" aria-label="年表分组"><ol>${groups.map((g, i) => { const [n, t] = gTitle(g.title); return `<li><a href="#g${i}"><i>${esc(n || '·')}</i>${esc(t.split('：').pop())}</a></li>`; }).join('')}</ol></aside>
<div class="tl-main">
${groups.map((g, i) => { const [n, t] = gTitle(g.title); return `<section class="tl-group" id="g${i}">
<header><span class="tl-gno">${esc(n)}</span><h2>${esc(t)}</h2><span class="tl-gcount">${g.events.length}</span></header>
<ol class="events">
${g.events.map(eventHTML).join('\n')}
</ol>
</section>`; }).join('\n')}
<p class="tl-empty" id="tl-empty" hidden>没有符合条件的事件。</p>
</div>
</div>`;
  page({ url: 'timeline/', title: '年表', body, cls: 'timeline', scripts: ['timeline.js'] });
}

// ───────────────────────── 图版 ─────────────────────────
{
  const base = '../';
  const body = `
<header class="page-head">
<p class="eyebrow">Plates</p>
<h1>图版</h1>
<p class="page-lede">${stats.image_assets} 幅图像组成 ${stats.image_plates} 组图版，另有 ${stats.diagram_figures} 幅结构图。每幅都记录了“看到了什么”与来源；点开任一幅查看观察记录。</p>
</header>
<div class="plates">
${figureIndex.map((f) => (f.kind === 'plate' ? plateHTML(f.ref, f.no, base, { linkChapter: f.chapter }) : diagramHTML(f.ref, f.no, base, { linkChapter: f.chapter }))).join('\n')}
</div>`;
  page({ url: 'plates/', title: '图版', body, cls: 'plates-page' });
}

// ───────────────────────── 证据 ─────────────────────────
const KIND = (e) => (!e.path ? '教程与外部原典' : e.path.startsWith('Readable') ? '书籍与可读文本' : e.path.startsWith('BinOutput') ? '对白与任务' : '角色、物品与资料');
{
  const kinds = [...new Set(evidenceList.map(KIND))];
  const body = `
<header class="page-head">
<p class="eyebrow">Evidence</p>
<h1>证据</h1>
<p class="page-lede">${stats.evidence} 条短引，出自 ${stats.source_titles} 种来源题名。每条都能点回固定版本的原件，也能反查它在正文与年表里被用在了哪里。</p>
</header>
<div class="ev-controls">
<input type="search" id="ev-q" placeholder="搜索引文、来源题名、编号…" aria-label="搜索证据">
<select id="ev-kind" aria-label="来源类型"><option value="">全部类型</option>${kinds.map((k) => `<option>${k}</option>`).join('')}</select>
<select id="ev-chap" aria-label="所在章"><option value="">全部章</option>${chapters.map((c) => `<option value="${c.no}">${pad(c.no)} ${esc(c.title.slice(0, 22))}</option>`).join('')}</select>
<select id="ev-sort" aria-label="排序"><option value="n">按首次出现</option><option value="refs">按被引次数</option></select>
<span class="tl-count" id="ev-count"></span>
</div>
<div class="ev-list" id="ev-list"><p class="rail-hint">正在载入证据…</p></div>
<button class="btn" id="ev-more" type="button" hidden>显示更多</button>`;
  page({ url: 'evidence/', title: '证据', body, cls: 'evidence-page', scripts: ['evidence.js'], data: { 'chapter-titles': Object.fromEntries(chapters.map((c) => [c.no, c.title])) } });
  fs.writeFileSync(path.join(dist, 'data', 'evidence.json'), JSON.stringify(evidenceList.map((e) => ({
    ...e, kind: KIND(e), refs: backrefs[e.id] || [], events: eventRefs[e.id] || [],
  }))));
}

// ───────────────────────── 关于 ─────────────────────────
{
  const base = '../';
  const body = `
<header class="page-head">
<p class="eyebrow">Colophon</p>
<h1>关于这项研究</h1>
<p class="page-lede">它试图回答一个问题：如果把《原神》的全部文本当作一个文明留下的史料，能写出怎样一部文明史？</p>
</header>
<article class="prose about">
<section>
<h2>它是什么</h2>
<p>《提瓦特文明史与世界结构研究》是一部长篇研究稿，副题为“年代、元素、循环、图像与多语对读”。现行版本是${esc(stats.edition)}（${esc(stats.revision_date)}）：正文 ${fmt(stats.body_han_characters)} 汉字，${stats.sections} 章、${stats.subsections} 小节；${stats.chronology_events} 项编年事件；${stats.evidence} 条原文短引，出自 ${stats.source_titles} 种来源题名；${stats.image_assets} 幅图像组成 ${stats.image_plates} 组图版。</p>
<p>这个网站是它的阅读界面。论文原本以 LaTeX 排成 ${stats.pdf_pages} 页 PDF；网站不改动任何论述，只是把正文、年表、证据与图版之间本来就存在的联系，变成可以点击的路径。</p>
</section>
<section>
<h2>和一般 wiki 有什么不同</h2>
<p>wiki 按词条组织，回答“某某是什么”。这里按论证组织，回答“凭什么这么说”。正文每一处论断后都有编号，指向一条原文短引；每条短引又记着来源题名、文本定位和固定版本原件的地址。</p>
<p>年表也不把所有事件压成一条线。每个时间都标明依据——是文本自己给出的纪年、据此推算的近似年代、仅有的相对先后，还是当代叙事中的位置；事件之间的先后、同期与跨时因果，分别登记为不同类型的关系。</p>
</section>
<section>
<h2>文本从哪里来</h2>
<p>全部游戏文本固定于同一份语料快照（版本 ${esc(source.corpus_version || '')}，提交 <code>${esc((source.corpus_commit || '').slice(0, 12))}</code>），引文以中文为主，关键段落作中、英、日、韩四语对读，数字与称谓的异文单独记录。</p>
<p>网站只展示短引、分析与出处。完整的游戏原件、视频与字幕不随站发布。</p>
</section>
<section>
<h2>怎样读</h2>
<p><a href="${base}read/">读本</a>适合从头到尾读；<a href="${base}timeline/">年表</a>适合带着“某件事发生在何时”的问题进入；<a href="${base}evidence/">证据</a>适合反过来查——从一句原文出发，看它支撑了哪些论述。任何页面按 <kbd>/</kbd> 都可以全文搜索。</p>
</section>
<section>
<h2>声明</h2>
<p>本站为非官方的同人研究，与 HoYoverse / miHoYo 无关。《原神》及其文本、图像的权利归其权利人所有。站内图像仅作研究引用，来源与上传者逐幅列于<a href="${base}plates/">图版</a>页。</p>
</section>
</article>`;
  page({ url: 'about/', title: '关于', body, cls: 'about-page' });
}

// ───────────────────────── 搜索索引 ─────────────────────────
{
  const idx = [];
  for (const c of chapters) {
    idx.push(['章', c.title, chapterURL(c), `${c.part.label} · 第 ${c.no} 章`]);
    for (const s of c.sections) idx.push(['节', s.title || c.title, `${chapterURL(c)}#${s.id}`, s.text.join(' '), c.no]);
  }
  for (const e of chronology) if (e.event_id) idx.push(['事', `${e.date} · ${e.region}`, `timeline/#${e.event_id}`, e.event]);
  for (const e of evidenceList) idx.push(['证', e.title, `evidence/#${e.id}`, e.quotes.join(' / ')]);
  fs.writeFileSync(path.join(dist, 'data', 'search.json'), JSON.stringify(idx));
}

fs.writeFileSync(path.join(dist, '.nojekyll'), '');
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, f) => a + (f.isDirectory() ? count(path.join(d, f.name)) : 1), 0);
console.log(`已生成 ${chapters.length} 章、${figureIndex.length} 幅图版，共 ${count(dist)} 个文件 → dist/`);
