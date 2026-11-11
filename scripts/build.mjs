// 静态站点生成：content/ + src/ → dist/
// 两层：玩家版「星图」（深色，首要入口）与「考据层」（浅色：原文库、专题、年表）。
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { diagrams } from './diagrams.mjs';
import { TYPES } from './originals.mjs';

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
const sources = readJSON('sources.json'); // 研究引用过的原文（多语言、带引文定位）
const citedCount = sources.length;
// 全量语料（简体中文）：与已引用的原文同一篇的不重复收
let corpusTerms = [];
if (fs.existsSync(C('corpus/index.json'))) {
  const idx = readJSON('corpus/index.json');
  const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(C(`corpus/${f}`))).toString('utf8'));
  const have = new Set(sources.map((s) => s.id));
  const havePath = new Set(sources.map((s) => s.path).filter((p) => /^Readable\/|CodexQuest/.test(p)));
  for (const part of idx.parts) for (const e of gz(part)) {
    if (have.has(e.id) || havePath.has(e.path)) continue;
    have.add(e.id);
    sources.push({ id: e.id, type: e.type, title: e.title, heading: e.group, path: e.path, url: `https://github.com/DimbreathBot/AnimeGameData/tree/${readJSON('source.json').corpus_commit}/${e.path}`, langs: { CHS: e.lines }, first: e.first, evidence: [], corpus: true });
  }
  corpusTerms = gz('terms.json.gz');
}
const SRC = Object.fromEntries(sources.map((x) => [x.id, x]));
const SRC2 = SRC;
const star = readJSON('curated/star.json');
const topics = readJSON('curated/topics.json');
const gateRules = readJSON('curated/gates.json');
const release = readJSON('curated/release.json');
const VERSION = (source.corpus_version || '').replace(/\.0$/, ''); // 7.2
const PREV = '7.1';
const OPEN = release.confirmed.includes(VERSION); // 当前数据版本是否已确认开放
const LANG_NAME = { CHS: '简体中文', EN: '英文', JP: '日文', KR: '韩文' };
const LEVEL = { fact: '事实', inference: '推断', hypothesis: '假说' };

// 原文的派生信息：状态、短链、锚点
for (const s of sources) {
  s.isNew = s.first === 'new';
  // 本版本新增、且本版本还没确认开放时，才算待确认
  s.pending = s.isNew && !OPEN;
  s.firstLabel = s.isNew ? VERSION : `${PREV} 及更早`;
  s.typeName = TYPES[s.type];
  s.href = `t/${s.id}/`;
  s.short = `/t/${s.id}`;
}
const HITS = {}; // 证据 id → [[语言, 行, 引文], …]
const anchorOf = (L, l) => (L === 'CHS' ? `p${l + 1}` : `${L.toLowerCase()}-p${l + 1}`);
// 引文在原文中的上下文：命中的整行（过长则截取引文周围）。待确认的原文不显示正文。
for (const e of evidenceList) {
  const src = SRC[e.src];
  if (!src) continue;
  e.pending = src.pending;
  e.isNew = src.isNew;
  e.href = src.href;
  e.short = src.short;
  const byLine = new Map();
  e.quotes.forEach((q, i) => { const h = e.hits?.[i]; if (h) { const k = `${h[0]}:${h[1]}`; (byLine.get(k) || byLine.set(k, { L: h[0], l: h[1], qs: [] }).get(k)).qs.push(q); } });
  e.anchors = [...byLine.values()].map((v) => anchorOf(v.L, v.l));
  e.ctx = src.pending ? [] : [...byLine.values()].sort((a, b) => a.l - b.l).map(({ L, l, qs }) => {
    const [who, full] = src.langs[L][l];
    const idx = qs.map((q) => full.indexOf(q)).filter((i) => i >= 0);
    let t = full;
    if (full.length > 170 && idx.length) {
      const from = Math.max(0, Math.min(...idx) - 55);
      const to = Math.min(full.length, Math.max(...idx.map((i, k) => i + qs[k].length)) + 55);
      t = (from ? '…' : '') + full.slice(from, to) + (to < full.length ? '…' : '');
    } else if (full.length > 170) t = `${full.slice(0, 170)}…`;
    return { a: anchorOf(L, l), s: who, t, qs };
  });
  e.loose = src.pending ? e.quotes : e.quotes.filter((q, i) => !e.hits?.[i]);
  HITS[e.id] = e.quotes.map((q, i) => (e.hits?.[i] ? [...e.hits[i], q] : null)).filter(Boolean);
  delete e.hits;
}

// 主线进度：按出处的任务名和地区判定（规则在 content/curated/gates.json）
const LAST = star.stages.length - 1;
const RULES = gateRules.rules.map(([g, pat]) => [g, new RegExp(pat)]);
const evGate = (id) => {
  const e = EV[id];
  if (!e) return null;
  if (id.startsWith('@')) return null; // 自动关系自带进度
  if (e.isNew) return LAST; // 本版本新增的出处，剧情上算最后一篇
  for (const [g, re] of RULES) if (re.test(e.title)) return g;
  return null;
};
// 引文所在的原文那一行（对白带说话人和上下各一句）；待确认的原文不给
const quoteCtx = (id, quote) => {
  const e = EV[id];
  const src = e && SRC[e.src];
  if (!src || src.pending) return null;
  let hit = (HITS[id] || []).find((h) => h[2] === quote) || null;
  if (!hit) { // 手写时直接摘的原文句子：到原文里找它所在的那一行
    for (const L of Object.keys(src.langs)) { const i = src.langs[L].findIndex((x) => x[1].includes(quote)); if (i >= 0) { hit = [L, i]; break; } }
  }
  if (!hit) return null;
  const [L, l] = hit;
  const lines = src.langs[L];
  const pick = (i) => (lines[i] && !lines[i][1].startsWith('＊') ? { who: lines[i][0], text: lines[i][1] } : null);
  const dialog = lines.some((x) => x[0]);
  return { anchor: anchorOf(L, l), line: pick(l), before: dialog ? pick(l - 1) : null, after: dialog ? pick(l + 1) : null };
};

// 核验：手写内容里的每条引文，必须是所挂引证的原文片段，否则不发布
{
  const bad = [];
  // 没写 quote 的，取该引证的第一条原文片段
  const fill = (x) => { if (x.ev && !x.quote && EV[x.ev]) x.quote = EV[x.ev].quotes[0]; };
  star.edges.forEach(fill);
  star.questions.forEach((q) => { q.steps.forEach(fill); if (q.open) fill(q.open); });
  topics.forEach((t) => t.claims.forEach((c) => (c.cites || []).forEach(fill)));
  const ids = new Set(star.nodes.map((n) => n.id));
  star.edges.forEach((x) => { if (!ids.has(x.a) || !ids.has(x.b)) bad.push(`关系指向不存在的星：${x.a}→${x.b}`); });
  star.questions.forEach((q) => [q.start, ...q.nodes].forEach((id) => { if (!ids.has(id)) bad.push(`问题 ${q.id} 指向不存在的星：${id}`); }));
  // 引文要么是该引证登记的片段，要么是它所在原文里逐字出现的一句
  const inSource = (ev, quote) => { const s = SRC[EV[ev]?.src]; return !!s && Object.values(s.langs).some((ls) => ls.some((l) => l[1].includes(quote))); };
  const check = (where, ev, quote) => { if (!EV[ev] || !(EV[ev].quotes.includes(quote) || inSource(ev, quote))) bad.push(`${where}: ${ev} “${quote}”`); };
  star.edges.forEach((x) => check(`关系 ${x.a}→${x.b}`, x.ev, x.quote));
  star.questions.forEach((q) => { q.steps.forEach((s, i) => check(`问题 ${q.id} 第 ${i + 1} 步`, s.ev, s.quote)); if (q.open?.ev) check(`问题 ${q.id} 未解部分`, q.open.ev, q.open.quote); });
  topics.forEach((t) => t.claims.forEach((c) => (c.cites || []).forEach((ci) => check(`专题 ${t.id}`, ci.ev, ci.quote))));
  if (bad.length) { console.error(`引文核验未通过，停止构建：\n${bad.join('\n')}`); process.exit(1); }
}

const groupByTex = Object.fromEntries(plates.groups.map((g) => [g.tex, g]));
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
const paraCites = []; // 每段引用的证据组（星图的共引关系）
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
      if (ids.length) paraCites.push({ no, sec: sec.id, ids });
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

// ───────────────────────── 通用片段 ─────────────────────────
const markFrags = (text, qs) => {
  let h = esc(text);
  for (const q of [...new Set(qs)].sort((a, b) => b.length - a.length)) { const eq = esc(q); if (eq) h = h.split(eq).join(`\u0001${eq}\u0002`); }
  return h.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
};

const SITE = '提瓦特考据';
const pill = (text, tone = 'blue') => `<span class="pill ${tone}">${esc(text)}</span>`;
const statusPill = (s) => (s.pending ? pill('待确认', 'amber') : pill('在线', 'green'));
const levelTag = (level) => `<span class="lv lv-${level}">${LEVEL[level]}</span>`;
const LOCK = '<svg class="lock" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
const chapterURL = (c) => `read/${pad(c.no)}/`;
// 待确认的原文不显示正文，所以不带段落锚点
const evLink = (e, base) => (e.href ? `${base}${e.href}${e.anchors?.[0] && !e.pending ? `#${e.anchors[0]}` : ''}` : `${base}evidence/#${e.id}`);
const stageAfter = (g) => `${star.stages[g]}篇后可看`;

const STUDY_NAV = [['t/', '原文库'], ['topic/', '专题'], ['timeline/', '年表'], ['hypothesis/', '假说'], ['updates/', '更新'], ['about/', '关于']];
const STAR_NAV = [['', '星图'], ['q/', '问题'], ['who/', '人物'], ['study/', '原文与证据']];
// 哪些路径属于导航里的哪一项
const NAV_OF = { t: 't/', terms: 't/', evidence: 't/', topic: 'topic/', read: 'topic/', plates: 'topic/', timeline: 'timeline/', hypothesis: 'hypothesis/', updates: 'updates/', about: 'about/', q: 'q/', who: 'who/', gate: '', '': '' };

function page({ url, title, desc, body, layer = 'study', cls = '', scripts = [], data = {}, bare = false }) {
  const depth = url.split('/').filter(Boolean).length;
  const base = depth ? '../'.repeat(depth) : './';
  const cur = NAV_OF[url.split('/')[0]];
  const navHTML = (items) => items.map(([u, t]) => `<a href="${base}${u}"${cur === u && !(layer === 'study' && url.startsWith('study')) ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const header = layer === 'star'
    ? `<header class="topbar">
<a class="brand" href="${base}">${SITE}</a>
<nav class="nav" aria-label="主导航">${navHTML(STAR_NAV)}</nav>
<a class="progress-btn" href="${base}gate/" aria-label="修改游戏进度"><i></i><span id="progress-label">选择进度</span></a>
</header>`
    : `<header class="topbar"><div class="wrap">
<a class="brand" href="${base}study/">${SITE}</a>
<nav class="nav" aria-label="主导航">${navHTML(STUDY_NAV)}</nav>
<label class="topsearch">搜索<input type="search" data-search placeholder="原文、专题或短链" autocomplete="off"></label>
</div></header>`;
  const footer = layer === 'star' ? '' : `<footer class="footer"><div class="wrap">
<p>本站是玩家的非营利研究项目，与米哈游及 HoYoverse 无关。游戏文本与图像的权利归权利人所有。</p>
<p>只收录已在游戏内开放的内容。文本固定于 ${esc(source.corpus_version || '')} 语料快照（${esc((source.corpus_commit || '').slice(0, 8))}）。<a href="${base}">回到星图</a></p>
</div></footer>`;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · ${SITE}` : SITE)}</title>
<meta name="description" content="${esc(desc || '《原神》文本的研究与存档：每个论断，都能回到游戏内的原文。')}">
<meta name="theme-color" content="${layer === 'star' ? '#0D1424' : '#FFFFFF'}">
<link rel="stylesheet" href="${base}assets/fonts.css">
<link rel="stylesheet" href="${base}assets/styles.css">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
</head>
<body class="${layer} ${cls}" data-base="${base}">
<a class="skip" href="#main">跳到正文</a>
${bare ? '' : header}
<main id="main">
${body}
</main>
${footer}
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
{
  // 自托管 Noto Serif SC（按 unicode-range 切片，浏览器只取用到的片）
  const fdir = path.join(dist, 'assets', 'fonts');
  fs.mkdirSync(fdir, { recursive: true });
  let css = '';
  const dir = path.join(root, 'node_modules', '@fontsource', 'noto-serif-sc');
  for (const w of [500, 700]) {
    css += fs.readFileSync(path.join(dir, `${w}.css`), 'utf8').replace(/src: url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)[^;]*;/g, (m, f) => {
      fs.copyFileSync(path.join(dir, 'files', f), path.join(fdir, f));
      return `src: url(fonts/${f}) format('woff2');`;
    });
  }
  fs.writeFileSync(path.join(dist, 'assets', 'fonts.css'), css);
  fs.writeFileSync(path.join(dist, 'assets', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0D1424"/><circle cx="16" cy="16" r="5" fill="#E6C06A"/><circle cx="16" cy="16" r="10" fill="none" stroke="#E6C06A" stroke-opacity=".5"/></svg>');
}

// 证据 → 年表事件 / 专题 / 问题 的反查表
const eventRefs = {};
for (const e of chronology) if (e.event_id) (e.sources || []).forEach((id) => (eventRefs[id] ||= []).push(e.event_id));
const topicRefs = {};
topics.forEach((t) => t.claims.forEach((c) => (c.cites || []).forEach((ci) => (topicRefs[ci.ev] ||= new Set()).add(t))));
const questionRefs = {};
star.questions.forEach((q) => q.steps.forEach((s) => (questionRefs[s.ev] ||= new Set()).add(q)));

// ───────────────────────── 玩家版：星图 ─────────────────────────
// ───────────────────────── 星图的自动部分 ─────────────────────────
// 手写的星之外，从全量语料里长出其余的：全部可玩角色、地理志的地点、魔神任务的每一幕、主线里台词多的人物。
// 每条自动关系都指向原文里的某一行（角色语音“关于某某”、角色资料的“所属”、地理志条目、任务里的第一句台词）。
if (fs.existsSync(C('corpus/starmeta.json'))) {
  const meta = readJSON('corpus/starmeta.json');
  const NATION = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '挪德卡莱', '至冬'];
  const ASSOC = { MONDSTADT: 0, LIYUE: 1, INAZUMA: 2, SUMERU: 3, FONTAINE: 4, NATLAN: 5, NODKRAI: 6, NODKRAI_ZIBAI: 1, HVISION: 6, SNEZHNAYA: 7, SNEZHNAYA_STAR: 7, RANGER: 0, OMNI_SCOURGE: 5 };
  const CITY = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7 };
  // 对白里用称号出现的人
  const TITLE = { '「公子」': '达达利亚', '「仆人」': '阿蕾奇诺', '「木偶」': '桑多涅', '「少女」': '哥伦比娅', '「散兵」': '流浪者', '「博士」': '博士', '「队长」': '队长', '雷电将军': '雷电影', '影': '雷电影', '温迪': '巴巴托斯', '钟离': '摩拉克斯', '多托雷': '博士' };
  const SKIP = new Set(['荧', '空', '参赛者', '纯水精灵？', '众人', '士兵', '愚人众士兵']);
  const byName = new Map();
  for (const n of star.nodes) { byName.set(n.name, n); (n.aliases || []).forEach((a) => { if (!byName.has(a)) byName.set(a, n); }); }
  const find = (name) => byName.get(name) || byName.get(TITLE[name]) || null;
  const slots = {}; // 每个簇里已经放了几颗
  const place = (cluster, cx, cy) => { const i = (slots[cluster] = (slots[cluster] || 0) + 1); const r = 62 * Math.sqrt(i), a = i * 2.39996; return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]; };
  const addNode = (n) => { n.auto = true; n.aliases ||= n.name.length >= 2 ? [n.name] : []; // 单字的名字不拿去匹配年表
    star.nodes.push(n); byName.set(n.name, n); return n; };
  let refN = 0;
  // 把“原文的某一行”登记成一条内部引证，后面的引文块、链接、档案页都照常用
  const ref = (src, line, quote) => {
    const id = `@${++refN}`;
    EV[id] = { id, n: '', title: src.title, quotes: [quote], src: src.id, href: src.href, short: src.short, pending: src.pending, isNew: src.isNew, anchors: [anchorOf('CHS', line)] };
    HITS[id] = [['CHS', line, quote]];
    return id;
  };
  const clip = (t, n = 46) => (t.length > n ? t.slice(0, n) : t);
  const addEdge = (a, b, label, text, src, line, gate, level = 'fact') => {
    if (!a || !b || a === b || src.pending) return;
    const quote = clip(src.langs.CHS[line][1]);
    star.edges.push({ a: a.id, b: b.id, label, level, text, ev: ref(src, line, quote), quote, gate, gen: true });
  };

  // 八个地区各一颗星，作为归属的落点
  const nation = NATION.map((name, g) => find(name) || addNode({ id: `nation${g}`, name, kind: 'place', gate: g, x: 3400 + (g % 4) * 1300, y: -300 + Math.floor(g / 4) * 1500, blurb: `${name}。地理志和角色资料里归在这里的地方与人物，都连到这颗星。`, hub: true }));
  const center = (g) => [3400 + (g % 4) * 1300, -300 + Math.floor(g / 4) * 1500];

  // 可玩角色
  const charOf = new Map();
  for (const a of meta.avatars) {
    if (a.assoc === 'MAINACTOR' || a.name === '旅行者') continue;
    const prof = SRC[`misc/avatar-${a.id}`];
    const voice = SRC[`voice/a${a.id}`];
    let gate = ASSOC[a.assoc];
    if (gate == null) gate = { 达达利亚: 1, 阿蕾奇诺: 4 }[a.name] ?? 6;
    let n = find(a.name);
    if (!n) {
      const intro = prof?.langs.CHS.find((l) => l[0] === '简介')?.[1] || '';
      const title = prof?.langs.CHS.find((l) => l[0] === '称号')?.[1] || '';
      const [x, y] = place(`c${gate}`, ...center(gate));
      n = addNode({ id: `a${a.id}`, name: a.name, kind: 'being', gate, x, y, blurb: [title && `「${title}」。`, intro].filter(Boolean).join('') || `${NATION[gate]}的角色。` });
    }
    n.profile = prof?.href; n.voice = voice?.href;
    charOf.set(a.name, { node: n, prof, voice, gate });
  }
  for (const { node, prof, voice, gate } of charOf.values()) {
    // 所属
    const li = prof ? prof.langs.CHS.findIndex((l) => l[0] === '所属') : -1;
    if (li >= 0 && nation[gate] !== node) addEdge(node, nation[gate], '所属', `角色资料里，${node.name}的所属写的是「${prof.langs.CHS[li][1]}」`, prof, li, Math.max(node.gate, gate));
    // 语音“关于某某”：一个角色怎么说另一个
    if (!voice) continue;
    voice.langs.CHS.forEach(([title, text], i) => {
      const m = title.match(/^关于(.+?)(…|·.*)?$/);
      const other = m && find(m[1].replace(/[「」]/g, ''));
      if (!other || other === node || other.hub) return;
      if (star.edges.some((e) => e.gen && e.label === '谈起' && e.a === node.id && e.b === other.id)) return;
      addEdge(node, other, '谈起', `${node.name}的语音「${title.replace(/…$/, '')}」`, voice, i, Math.max(node.gate, other.gate));
    });
  }

  // 魔神任务的每一幕，以及在里面说话的人
  const chapGate = (g) => { const m = g.match(/^(序章|第一章|第二章|第三章|第四章|第五章|第六章|第七章|空月之歌|间章 第一幕|间章 第二幕|间章 第三幕|间章 第四幕)/); return m ? { 序章: 0, 第一章: 1, 第二章: 2, 第三章: 3, 第四章: 4, 第五章: 5, 第六章: 6, 空月之歌: 6, 第七章: 7, '间章 第一幕': 2, '间章 第二幕': 2, '间章 第三幕': 3, '间章 第四幕': 4 }[m[1]] : null; };
  const chapters2 = new Map();
  for (const s of sources) { if (s.type !== 'aq' || !s.corpus || s.pending) continue; const g = chapGate(s.heading || ''); if (g == null) continue; (chapters2.get(s.heading) || chapters2.set(s.heading, { gate: g, quests: [] }).get(s.heading)).quests.push(s); }
  const order = [...chapters2].sort((a, b) => a[1].gate - b[1].gate || a[0].localeCompare(b[0], 'zh'));
  const speakers = new Map(); // 名字 → {lines, chapters:Set, first:{src,line}, gate}
  order.forEach(([title, c], ci) => {
    const name = title.replace(/^(\S+ \S+) /, '$1 · ');
    const first = c.quests[0];
    const node = addNode({ id: `ch${ci + 1}`, name, kind: 'event', gate: c.gate, x: 3000 + (ci % 13) * 420, y: -1500 - Math.floor(ci / 13) * 260 + (ci % 2) * 90, blurb: `魔神任务的一幕，共 ${c.quests.length} 个任务。${first.langs.CHS[0][0] ? '' : first.langs.CHS[0][1]}`, quests: c.quests.map((q) => [q.title, q.href]) });
    c.node = node;
    const seen = new Set();
    for (const q of c.quests) q.langs.CHS.forEach(([who, text], i) => {
      if (!who || /^[？?]+$/.test(who) || who.startsWith('{') || who === '旅行者' || who === '派蒙') return;
      const sp = speakers.get(who) || speakers.set(who, { lines: 0, chapters: new Set(), gate: c.gate }).get(who);
      sp.lines++; sp.chapters.add(name); sp.gate = Math.min(sp.gate, c.gate);
      if (!seen.has(who)) { seen.add(who); (c.firsts ||= []).push([who, q, i]); }
    });
  });
  // 主线里台词多、又还不是星的人物
  for (const [who, sp] of [...speakers].sort((a, b) => b[1].lines - a[1].lines)) {
    if (find(who) || sp.lines < 40 || SKIP.has(who)) continue;
    const [x, y] = place(`c${sp.gate}`, ...center(sp.gate));
    addNode({ id: `p${byName.size}`, name: who.replace(/[「」]/g, ''), kind: 'being', gate: sp.gate, x, y, blurb: `魔神任务里的人物，在「${[...sp.chapters][0]}」等 ${sp.chapters.size} 幕出场，共 ${sp.lines} 句对白。`, aliases: [who, who.replace(/[「」]/g, '')] });
    byName.set(who, byName.get(who.replace(/[「」]/g, '')));
  }
  for (const [, c] of order) for (const [who, q, i] of c.firsts || []) {
    const n = find(who);
    if (n && !n.hub) addEdge(n, c.node, '出场', `${n.name}在这一幕的第一句话，出自任务「${q.title}」`, q, i, Math.max(n.gate, c.gate));
  }

  // 地理志的地点
  const vc = SRC['misc/viewcodex'];
  if (vc) for (const p of meta.places) {
    const li = vc.langs.CHS.findIndex((l) => l[0] === p.name);
    const gate = CITY[p.city];
    if (li < 0 || gate == null || find(p.name)) continue;
    const [x, y] = place(`v${gate}`, center(gate)[0], center(gate)[1] + 3300);
    const n = addNode({ id: `v${byName.size}`, name: p.name, kind: 'place', gate, x, y, blurb: vc.langs.CHS[li][1] });
    addEdge(n, nation[gate], '位于', `地理志把「${p.name}」记在${NATION[gate]}`, vc, li, gate);
  }
  console.log(`星图自动部分：共 ${star.nodes.length} 颗星、${star.edges.length} 条关系`);
}

const nodeById = Object.fromEntries(star.nodes.map((n) => [n.id, n]));
// 关系的进度 = 两端的星、关系自身、所挂出处，四者中最晚的
const edgeGate = (x) => Math.max(nodeById[x.a].gate, nodeById[x.b].gate, x.gate || 0, evGate(x.ev) ?? 0);
// 一步的进度 = 所挂出处按规则得到的篇章；规则没覆盖到时用手写值，再没有就跟问题走
const stepGate = (q, s) => { const g = evGate(s.ev); return Math.max(s.gate ?? (g == null ? q.gate : 0), g ?? 0); };

// 年表里的每件事，挂到提到它的星上：这是每颗星的“经历”
const groupGate = (title) => { for (const [k, g] of Object.entries(gateRules.groups)) if (title.startsWith(k)) return g; return LAST; };
const starEvents = Object.fromEntries(star.nodes.map((n) => [n.id, []]));
const autoEdges = [];
{
  const linked = new Set(star.edges.flatMap((x) => [`${x.a}|${x.b}`, `${x.b}|${x.a}`]));
  let group = '';
  for (const row of chronology) {
    if (row.group) { group = row.group; continue; }
    const evs = (row.sources || []).filter((id) => EV[id]);
    const gs = evs.map(evGate);
    const gate = gs.length && gs.every((g) => g != null) ? Math.max(...gs) : Math.max(groupGate(group), ...gs.filter((g) => g != null));
    const hay = `${row.date} ${row.region} ${row.event}`;
    const hit = star.nodes.filter((n) => (n.aliases || [n.name]).some((a) => hay.includes(a)));
    const item = { id: row.event_id, date: row.date, text: row.event, basis: row.time_basis, gate, evs: evs.slice(0, 2) };
    hit.forEach((n) => starEvents[n.id].push(item));
    // 同一件事里一起出现、又没有手写关系的两颗星，自动连一条线
    // 只在事件正文里恰好提到两颗星时才连，三颗以上的关系太松
    const pair = star.nodes.filter((n) => !n.hub && (n.aliases || [n.name]).some((al) => row.event.includes(al)));
    if (pair.length === 2 && evs.length) {
      for (let i = 0; i < pair.length; i++) for (let j = i + 1; j < pair.length; j++) {
        const k = `${pair[i].id}|${pair[j].id}`;
        if (linked.has(k)) continue;
        linked.add(k); linked.add(`${pair[j].id}|${pair[i].id}`);
        autoEdges.push({ a: pair[i].id, b: pair[j].id, label: '', level: 'fact', text: row.event, ev: evs[0], quote: EV[evs[0]].quotes[0], gate, auto: true, event: row.event_id });
      }
    }
  }
}
const allEdges = [...star.edges, ...autoEdges];
const shortLine = (c, quote) => {
  if (!c?.line) return null;
  const full = c.line.text;
  const i = full.indexOf(quote);
  let t = full;
  if (full.length > 150 && i >= 0) { const from = Math.max(0, i - 50), to = Math.min(full.length, i + quote.length + 60); t = (from ? '…' : '') + full.slice(from, to) + (to < full.length ? '…' : ''); }
  else if (full.length > 150) t = `${full.slice(0, 150)}…`;
  return { w: c.line.who, t };
};
const starData = {
  stages: star.stages,
  kinds: star.kinds,
  nodes: star.nodes.map((n) => ({
    id: n.id, name: n.name, kind: n.kind, gate: n.gate, x: n.x, y: n.y, blurb: n.blurb,
    events: starEvents[n.id].map((e) => ({ id: e.id, d: e.date, t: e.text, g: Math.max(e.gate, n.gate) })),
  })),
  edges: allEdges.map((x) => {
    const e = EV[x.ev];
    return { a: x.a, b: x.b, label: x.label, level: x.level, gate: edgeGate(x), text: x.text, quote: x.quote, ctx: shortLine(quoteCtx(x.ev, x.quote), x.quote), src: e.title, href: evLink(e, ''), pending: !!e.pending, auto: x.auto ? 1 : undefined };
  }),
  questions: star.questions.map((q) => ({ id: q.id, title: q.title, short: q.short, group: q.group, gate: q.gate, nodes: q.nodes, start: q.start, teaser: q.teaser || q.answer })),
};
// 引文块：原文那一行（引用的片段标出），对白带上一句和下一句
const quoteBlock = (evId, quote, base, level) => {
  const e = EV[evId];
  const c = quoteCtx(evId, quote);
  const line = (x, cls) => (x ? `<p class="${cls}">${x.who ? `<i>${esc(x.who)}</i>` : ''}${cls === 'hitline' ? markFrags(x.text, [quote]) : esc(x.text.length > 120 ? `${x.text.slice(0, 120)}…` : x.text)}</p>` : '');
  return `<div class="quote${c?.line ? ' full' : ''}">${level ? levelTag(level) : ''}${c?.line ? `<blockquote>${line(c.before, 'ctxline')}${line(c.line, 'hitline')}${line(c.after, 'ctxline')}</blockquote>` : `<span class="q">“${esc(quote)}”</span>`}<span class="from"><a href="${evLink(e, base)}">${esc(e.title)}</a>${e.short ? `<code>${e.short}</code>` : ''}${e.pending ? pill('待确认', 'amber') : ''}</span></div>`;
};
{
  const body = `
<div class="explore" id="explore">
<aside class="qlist" aria-label="问题">
<h2>从一个问题开始</h2>
<div id="qlist"></div>
<div class="qteaser" id="qteaser" hidden></div>
</aside>
<section class="sky" aria-label="星图">
<div class="sky-tools"><button type="button" id="sky-all">展开全部已解锁</button><button type="button" id="sky-reset">回到起点</button></div>
<p class="sky-hint">点一颗星，它的关系会长出来。带“？”的还在迷雾里。</p>
<div class="sky-svg"><svg id="sky-svg" role="img" aria-label="关系星图" viewBox="0 0 900 680" preserveAspectRatio="xMidYMid meet"></svg></div>
<div class="sky-legend" aria-hidden="true"><span><i class="dot k-being"></i>人物与存在</span><span><i class="dot k-event"></i>事件</span><span><i class="dot k-place"></i>地方与物</span><span><i class="dot fog"></i>迷雾</span><span>虚线为假说</span></div>
</section>
<aside class="detail" id="detail" aria-label="节点详情"></aside>
</div>
<noscript><p class="noscript">星图需要启用 JavaScript。也可以直接进入<a href="study/">原文与证据</a>。</p></noscript>`;
  page({ url: '', title: '星图', layer: 'star', cls: 'explore-page', body, scripts: ['star.js'], data: { 'star-data': { stages: star.stages } } });
  fs.writeFileSync(path.join(dist, 'data', 'star.json'), JSON.stringify(starData));
}
// 进度选择
{
  const body = `
<div class="gate">
<p class="gate-brand">${SITE}</p>
<div class="gate-head">
<h1>你的魔神任务打到哪了？</h1>
<p>之后的剧情会藏在迷雾里，不会剧透你。随时可以改。</p>
</div>
<div class="gate-track">
<div class="gate-line" id="gate-line" aria-hidden="true"></div>
<ol aria-label="选择进度" id="gate-stages">${star.stages.map((s, i) => `<li><span class="gate-dot" aria-hidden="true"></span><button type="button" data-stage="${i}" aria-pressed="false">${esc(s)}</button></li>`).join('')}</ol>
</div>
<div class="gate-foot">
<p id="gate-said">选一个你已经打完的篇章。</p>
<a class="gate-go" id="gate-go" href="../" aria-disabled="true">进入星图</a>
<p class="gate-note">只记在这台设备上，不需要登录。</p>
</div>
</div>`;
  page({ url: 'gate/', title: '进度选择', layer: 'star', cls: 'gate-page', bare: true, body, scripts: ['star.js'], data: { 'star-data': { stages: star.stages } } });
}
// 问题页
const miniMap = (q) => {
  // 小图不用星图上的坐标（跨地区的问题会被拉得很扁），起点居中，其余绕一圈
  const set = new Set(q.nodes);
  const others = q.nodes.filter((id) => id !== q.start);
  const pos = { [q.start]: [300, 200] };
  others.forEach((id, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / others.length; pos[id] = [300 + Math.cos(a) * 210, 200 + Math.sin(a) * 140]; });
  const es = star.edges.filter((x) => set.has(x.a) && set.has(x.b));
  return `<svg viewBox="0 0 600 420" role="img" aria-label="${esc(q.title)} 的关系图">${es.map((x) => `<line data-gate="${edgeGate(x)}" x1="${pos[x.a][0].toFixed(0)}" y1="${pos[x.a][1].toFixed(0)}" x2="${pos[x.b][0].toFixed(0)}" y2="${pos[x.b][1].toFixed(0)}" class="${x.level === 'hypothesis' ? 'hyp' : ''}"/>`).join('')}${q.nodes.map((id) => { const n = nodeById[id]; const [x, y] = pos[id]; return `<g data-gate="${n.gate}"><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${id === q.start ? 16 : 11}" class="k-${n.kind}"/><text x="${x.toFixed(0)}" y="${(y + 36).toFixed(0)}">${esc(n.name)}</text></g>`; }).join('')}</svg>`;
};
star.questions.forEach((q, qi) => {
  const base = '../../';
  const next = star.questions[(qi + 1) % star.questions.length];
  const maxGate = Math.max(q.gate, ...q.steps.map((s) => stepGate(q, s)));
  const quoteBox = (s) => quoteBlock(s.ev, s.quote, base, s.level);
  const body = `
<div class="answer wrap">
<article>
<nav class="crumbs" aria-label="位置"><a href="${base}q/">问题</a> / ${esc(q.group)}</nav>
<div class="fogbox big" data-fog="${q.gate}">${LOCK}<div><strong>这个问题还在迷雾里</strong><p>${stageAfter(q.gate)}。<a href="${base}gate/">修改进度</a></p></div></div>
<div data-gate="${q.gate}">
<div class="answer-head">
<h1>${esc(q.title)}</h1>
<p class="lede">${esc(q.answer)}</p>
<p class="meta">读完约 ${Math.max(1, Math.round((q.answer.length + q.steps.reduce((a, s) => a + s.text.length, 0)) / 250))} 分钟 · 涉及${esc(star.stages[maxGate])}篇剧情 · ${new Set(q.steps.map((s) => s.ev)).size} 条游戏原文</p>
</div>
<div class="stepbar" aria-hidden="true">${q.steps.map(() => '<span></span>').join('')}</div>
<ol class="steps">
${q.steps.map((s, i) => `<li class="step">
<div class="rail" aria-hidden="true"><span class="n">${i + 1}</span><span class="line"></span></div>
<section>
<div class="fogbox" data-fog="${stepGate(q, s)}">${LOCK} 这一步在迷雾里，${stageAfter(stepGate(q, s))}。</div>
<div data-gate="${stepGate(q, s)}">
<p class="era" data-n="${i + 1}">${esc(s.era)}</p>
<h2>${esc(s.title)}</h2>
<p>${esc(s.text)}</p>
${quoteBox(s)}
</div>
</section>
</li>`).join('\n')}
</ol>
<div class="stepnav"><button type="button" id="step-prev">上一步</button><button type="button" id="step-next" class="primary">下一步</button></div>
<section class="open">
<div class="open-head">${levelTag('hypothesis')}<h2>还没有答案的部分</h2></div>
<p>${esc(q.open.text)}</p>
${q.open.ev ? quoteBox({ ...q.open, level: 'hypothesis' }) : ''}
</section>
<div class="answer-links">
<a href="${base}q/${next.id}/">下一个问题：${esc(next.title)}</a>
<a href="${base}t/">看全部原文与核验</a>
</div>
</div>
</article>
<aside data-gate="${q.gate}">
<h2>这条线在星图上</h2>
<div class="mini">${miniMap(q)}</div>
<a href="${base}#q=${q.id}">在星图里打开 →</a>
</aside>
</div>`;
  page({ url: `q/${q.id}/`, title: q.title, layer: 'star', cls: 'answer-page', body, scripts: ['star.js'], data: { 'star-data': { stages: star.stages } } });
});
// 问题列表、人物列表
{
  const base = '../';
  const groups = [...new Set(star.questions.map((q) => q.group))];
  page({
    url: 'q/', title: '问题', layer: 'star', cls: 'list-page', scripts: ['star.js'], data: { 'star-data': { stages: star.stages } },
    body: `<div class="wrap listing"><h1>问题</h1><p class="lede">每个问题一页，按时间一步步讲，每一步都挂着游戏里的原文。</p>
${groups.map((g) => `<section><h2>${esc(g)}</h2><div class="cards">${star.questions.filter((q) => q.group === g).map((q) => `<a class="card" href="${base}q/${q.id}/"><strong>${esc(q.title)}</strong><span data-gate="${q.gate}">${esc(q.teaser || q.answer)}</span><span class="locknote" data-fog="${q.gate}">${LOCK} ${stageAfter(q.gate)}</span></a>`).join('')}</div></section>`).join('\n')}</div>`,
  });
  page({
    url: 'who/', title: '人物', layer: 'star', cls: 'list-page', scripts: ['star.js'], data: { 'star-data': { stages: star.stages } },
    body: `<div class="wrap listing"><h1>人物</h1><p class="lede">星图上的每一颗星。还没到的剧情只显示为迷雾。</p>
${Object.entries(star.kinds).map(([k, name]) => `<section><h2><i class="dot k-${k}"></i>${name}</h2><div class="cards">${star.nodes.filter((n) => n.kind === k).map((n) => `<a class="card" href="${base}who/${n.id}/"><strong data-gate="${n.gate}">${esc(n.name)}</strong><span data-gate="${n.gate}">${esc(n.blurb)}</span><strong class="locknote" data-fog="${n.gate}">？</strong><span class="locknote" data-fog="${n.gate}">${LOCK} ${stageAfter(n.gate)}</span></a>`).join('')}</div></section>`).join('\n')}</div>`,
  });
}

// 每颗星一页：关系、经历、相关问题
for (const n of star.nodes) {
  const base = '../../';
  const rels = allEdges.filter((x) => x.a === n.id || x.b === n.id).map((x) => ({ x, other: nodeById[x.a === n.id ? x.b : x.a], gate: edgeGate(x) }));
  const hand = rels.filter((r) => !r.x.auto);
  const auto = rels.filter((r) => r.x.auto);
  const evs = starEvents[n.id];
  const qs = star.questions.filter((q) => q.nodes.includes(n.id));
  const relHTML = ({ x, other, gate }) => `<div class="fogbox" data-fog="${gate}">${LOCK} 一条关系在迷雾里，${stageAfter(gate)}。</div>
<section class="relrow" data-gate="${gate}"><div class="who2">${levelTag(x.level)}<a href="${base}who/${other.id}/">${esc(other.name)}</a>${x.label ? `<span class="rlabel">${esc(x.label)}</span>` : ''}</div><p>${esc(x.text)}</p>${quoteBlock(x.ev, x.quote, base)}</section>`;
  const body = `<div class="wrap profile">
<nav class="crumbs" aria-label="位置"><a href="${base}who/">人物</a> / ${star.kinds[n.kind]}</nav>
<div class="fogbox big" data-fog="${n.gate}">${LOCK}<div><strong>这颗星还在迷雾里</strong><p>${stageAfter(n.gate)}。<a href="${base}gate/">修改进度</a></p></div></div>
<div class="profile-in" data-gate="${n.gate}">
<header class="profile-head"><span class="kind"><i class="dot k-${n.kind}"></i>${star.kinds[n.kind]}</span><h1>${esc(n.name)}</h1><p class="lede">${esc(n.blurb)}</p>
<p class="meta">${hand.length + auto.length} 条关系 · ${evs.length} 件相关的事 · <a href="${base}#n=${n.id}">在星图里看 →</a></p>
${n.profile || n.voice ? `<p class="plinks">${n.profile ? `<a href="${base}${n.profile}">角色资料</a>` : ''}${n.voice ? `<a href="${base}${n.voice}">全部语音</a>` : ''}<a href="${base}t/#type=story">角色故事在原文库</a></p>` : ''}${n.quests ? `<p class="plinks">${n.quests.map(([t, h]) => `<a href="${base}${h}">${esc(t)}</a>`).join('')}</p>` : ''}</header>
${hand.length ? `<section class="pblock"><h2>关系</h2>${hand.map(relHTML).join('\n')}</section>` : ''}
${evs.length ? `<section class="pblock"><h2>经历</h2><p class="hint">年表里提到${esc(n.name)}的事，按年表的次序排列。</p><ol class="life">${evs.map((e) => { const g = Math.max(e.gate, n.gate); return `<li><div class="fogbox" data-fog="${g}">${LOCK} 一件事在迷雾里，${stageAfter(g)}。</div><div data-gate="${g}"><p class="era">${esc(e.date)}<span>${esc(e.basis || '')}</span></p><p>${esc(e.text)}</p>${e.evs[0] ? quoteBlock(e.evs[0], EV[e.evs[0]].quotes[0], base) : ''}<a class="tl" href="${base}timeline/#${e.id}">年表 ${e.id}</a></div></li>`; }).join('\n')}</ol></section>` : ''}
${auto.length ? `<section class="pblock"><h2>也一起出现在</h2><p class="hint">同一件事里一起被提到的星。</p>${auto.map(relHTML).join('\n')}</section>` : ''}
${qs.length ? `<section class="pblock"><h2>相关的问题</h2><div class="cards">${qs.map((q) => `<a class="card" href="${base}q/${q.id}/"><strong>${esc(q.title)}</strong><span data-gate="${q.gate}">${esc(q.teaser || q.answer)}</span><span class="locknote" data-fog="${q.gate}">${LOCK} ${stageAfter(q.gate)}</span></a>`).join('')}</div></section>` : ''}
</div></div>`;
  page({ url: `who/${n.id}/`, title: n.name, layer: 'star', cls: 'profile-page', body, scripts: ['star.js'], data: { 'star-data': { stages: star.stages } } });
}

// ───────────────────────── 考据层：首页 ─────────────────────────
const typeOrder = Object.keys(TYPES).filter((t) => sources.some((s) => s.type === t));
{
  const base = '../';
  const liveCount = sources.filter((s) => !s.pending).length;
  const body = `<div class="wrap stack">
<section class="hero">
<h1>每个论断，都能回到游戏内的原文</h1>
<p>《原神》文本的研究与存档。原文库按类型收录固定版本里的全部简体中文文本；专题不贴全文，只引用原文短链并标出所引的那一句。</p>
<form class="bigsearch" onsubmit="return false">
<label>搜索原文、专题或短链<input type="search" data-search placeholder="例如 日月前事，或 /t/book/333" autocomplete="off"></label>
<button type="button" data-search-go>搜索</button>
</form>
</section>
<section class="versionbar" aria-label="数据版本">
${pill(`数据版本 ${VERSION}`)}<span>原文库现收 ${fmt(sources.length)} 篇，${fmt(sources.filter((s) => !s.isNew).length)} 篇在 ${PREV} 及更早的版本里已经出现。</span><span class="muted">${OPEN ? `${VERSION} 已开放，新增的 ${fmt(sources.filter((s) => s.isNew).length)} 篇已收录。` : `${VERSION} 新增的 ${fmt(sources.length - liveCount)} 篇标为待确认，正文暂不显示。`}</span><a href="${base}about/#gate">上线规则</a>
</section>
<div class="grid3">
<section class="card"><h2>原文库</h2><p>${fmt(sources.length)} 篇文本，按类型存放，每篇有固定短链。另有<a href="${base}terms/">名词索引</a>。</p><ul class="twocol">${typeOrder.map((t) => `<li><a href="${base}t/#type=${t}">${TYPES[t]}</a></li>`).join('')}</ul></section>
<section class="card"><h2>专题</h2><p>一页回答一个问题，事实、推断、假说分开标。</p><ul>${topics.map((t) => `<li><a href="${base}topic/${t.id}/">${esc(t.title)}</a></li>`).join('')}<li><a href="${base}topic/#full">研究全文 · ${stats.sections} 章</a></li></ul></section>
<section class="card"><h2>年表</h2><p>文本自己写明的纪年、换算得到的年数、只知先后的次序，三者分开显示。</p><a href="${base}timeline/">打开年表</a></section>
</div>
<section class="stack-s">
<h2>可靠性靠什么保证</h2>
<div class="grid3">
<section class="card"><h3>逐条核验</h3><p>星图和专题里的每条引文，构建时与所挂的引证逐字比对，对不上就不发布。引证本身在同步时到固定版本的原文里定位到段落。</p></section>
<section class="card"><h3>上线门</h3><p>新版本的文本先标为待确认，不显示正文；确认这个版本已在游戏内开放之后才显示。${OPEN ? `${VERSION} 已确认开放。` : ''}</p></section>
<section class="card"><h3>分级标注</h3><p>每个论断标明是事实、推断还是假说，并写出什么证据会推翻它。</p></section>
</div>
</section></div>`;
  page({ url: 'study/', title: '原文与证据', body, cls: 'home' });
}

// ───────────────────────── 原文库 ─────────────────────────
{
  const base = '../';
  const langs = ['CHS', 'EN', 'JP', 'KR'];
  const check = (name, value, label, checked = true) => `<label><input type="checkbox" name="${name}" value="${value}"${checked ? ' checked' : ''}>${label}</label>`;
  const untitled = (s) => (/^（无题）|^？+$/.test(s.title) ? 1 : 0);
  const rows = [...sources].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || untitled(a) - untitled(b) || a.title.localeCompare(b.title, 'zh'));
  const cnt = (t) => sources.filter((s) => s.type === t).length;
  const body = `<div class="wrap stack">
<div class="pagehead">
<h1>原文库</h1>
<p>固定版本（${VERSION}）里的简体中文文本，共 ${fmt(sources.length)} 篇，按类型存放。其中研究引用过的 ${citedCount} 篇另有多语言文本和引文定位。${OPEN ? `${VERSION} 已确认开放，这一版新增的 ${fmt(sources.filter((s) => s.isNew).length)} 篇也在其中，“首见版本”一列标着 ${VERSION}。` : `状态说明：在线是这篇文本在 ${PREV} 及更早的版本里已经出现；待确认是 ${VERSION} 新增、尚未确认开放，正文暂不显示。`}<a href="${base}terms/">名词索引 →</a>　<a href="${base}evidence/">按引证浏览 →</a></p>
</div>
<div class="library">
<aside class="filters" aria-label="筛选" id="filters">
<fieldset><legend>类型</legend>${typeOrder.map((t) => check('type', t, `${TYPES[t]} <small>${cnt(t)}</small>`)).join('')}</fieldset>
<fieldset><legend>首见版本</legend>${check('first', 'old', `${PREV} 及更早`)}${check('first', 'new', VERSION)}</fieldset>
<fieldset><legend>范围</legend>${check('cited', '1', '只看研究引用过的', false)}</fieldset>
<fieldset><legend>还要有这些语言</legend>${langs.slice(1).map((l) => check('lang', l, LANG_NAME[l], false)).join('')}</fieldset>
</aside>
<div class="results">
<label class="libsearch">按题名或短链筛选<input type="search" id="lib-q" autocomplete="off"></label>
<p class="count" id="lib-count">正在载入…</p>
<div class="tablebox"><table>
<thead><tr><th scope="col">题名</th><th scope="col">类型</th><th scope="col">首见版本</th><th scope="col">状态</th><th scope="col">短链</th></tr></thead>
<tbody id="lib-rows"></tbody></table></div>
<div class="pagerow"><button type="button" class="btn" id="lib-prev">上一页</button><span class="count" id="lib-page"></span><button type="button" class="btn" id="lib-next">下一页</button></div>
</div>
</div></div>`;
  page({ url: 't/', title: '原文库', body, cls: 'library-page', scripts: ['library.js'], data: { 'lib-meta': { types: TYPES, version: VERSION, prev: PREV } } });
  // 每行：[id, 题名, 类型, 是否待确认, 语言, 是否被研究引用, 所属]
  fs.writeFileSync(path.join(dist, 'data', 'library.json'), JSON.stringify(rows.map((s) => [s.id, s.title, s.type, (s.pending ? 1 : 0) + (s.isNew ? 2 : 0), Object.keys(s.langs).join(''), s.corpus ? 0 : 1, s.corpus ? s.heading || '' : ''])));
}

// ───────────────────────── 原文页 ─────────────────────────
for (const s of sources) {
  const depth = s.href.split('/').filter(Boolean).length;
  const base = '../'.repeat(depth);
  const evs = s.evidence.map((id) => EV[id]).filter(Boolean);
  const langs = Object.keys(s.langs);
  // 行 → 引它的证据
  const cited = {};
  for (const evId of s.evidence) (HITS[evId] || []).forEach(([L, l, q]) => { const k = `${L}:${l}`; (cited[k] ||= { evs: new Set(), qs: [] }); cited[k].evs.add(evId); cited[k].qs.push(q); });
  const useCount = (ids) => { const n = new Set(); ids.forEach((id) => { (backrefs[id] || []).forEach((r) => n.add(`r${r[0]}#${r[1]}`)); (topicRefs[id] || []).forEach((t) => n.add(`t${t.id}`)); (questionRefs[id] || []).forEach((q) => n.add(`q${q.id}`)); }); return n.size; };
  const panel = (L) => {
    const dialog = s.langs[L].some((l) => l[0]);
    return s.langs[L].map(([who, t], i) => {
      const a = anchorOf(L, i);
      if (t.startsWith('＊')) return `<p class="sep">${esc(t.replace(/^＊\s*/, '') || '＊')}</p>`;
      const c = cited[`${L}:${i}`];
      return `<p id="${a}" class="para${c ? ' cited' : ''}"><a class="pn" href="#${a}">¶${i + 1}</a>${dialog && who ? `<span class="who">${esc(who)}</span>` : ''}${c ? markFrags(t, c.qs) : esc(t)}${c ? `<span class="pnote">被 ${useCount([...c.evs])} 处论述引用 · 锚点 ${s.short}#${a}${[...c.evs].map((id) => ` <a class="cite" href="${base}evidence/#${id}" data-ev="${id}">${EV[id].n}</a>`).join('')}</span>` : ''}</p>`;
    }).join('\n');
  };
  const sameLen = langs.length > 1 && langs.every((L) => s.langs[L].length === s.langs[langs[0]].length);
  const parallel = sameLen ? s.langs[langs[0]].map((_, i) => `<div class="prow"><span class="pn">¶${i + 1}</span>${langs.map((L) => `<p lang="${L === 'CHS' ? 'zh-CN' : L === 'EN' ? 'en' : L === 'JP' ? 'ja' : 'ko'}">${esc(s.langs[L][i][1])}</p>`).join('')}</div>`).join('\n') : '';
  const usedTopics = new Set(), usedQs = new Set(), usedRefs = new Map(), usedEvents = new Set();
  evs.forEach((e) => { (topicRefs[e.id] || []).forEach((t) => usedTopics.add(t)); (questionRefs[e.id] || []).forEach((q) => usedQs.add(q)); (backrefs[e.id] || []).forEach((r) => usedRefs.set(`${r[0]}#${r[1]}`, r)); (eventRefs[e.id] || []).forEach((x) => usedEvents.add(x)); });
  const refs = [...usedRefs.values()].sort((a, b) => a[0] - b[0]);
  const body = `<div class="wrap stack">
<nav class="crumbs" aria-label="位置"><a href="${base}t/">原文库</a> / <a href="${base}t/#type=${s.type}">${s.typeName}</a> / ${esc(s.title)}</nav>
<div class="source">
<article>
<div class="source-head">
<h1>${esc(s.title)}</h1>
${s.heading ? `<p class="muted">${esc(s.heading)}</p>` : ''}
<div class="pills">${pill(s.typeName)}${statusPill(s)}<code>${s.short}</code><button type="button" class="btn" data-copy="${s.short}">复制短链</button></div>
</div>
${s.pending ? `<div class="pending-note"><strong>正文暂不显示</strong><p>这篇文本是 ${VERSION} 新增的，还没有确认已在游戏内开放。确认之后会显示全文；在此之前，引用它的论述会标为“部分证据待确认”。</p></div>` : `
<div class="tabs" role="tablist" aria-label="语言">${langs.map((L, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${L}">${LANG_NAME[L]}</button>`).join('')}${sameLen ? `<button type="button" role="tab" aria-selected="false" data-tab="ALL">${langs.length === 4 ? '四语' : '双语'}对读</button>` : ''}</div>
${langs.map((L, i) => `<div class="textbox" role="tabpanel" data-panel="${L}"${i ? ' hidden' : ''}>\n${panel(L)}\n</div>`).join('\n')}
${sameLen ? `<div class="textbox parallel n${langs.length}" role="tabpanel" data-panel="ALL" hidden>\n${parallel}\n</div>` : ''}`}
</article>
<aside>
<section class="card"><h2>出处</h2><dl>
<div><dt>类型</dt><dd>${s.typeName}</dd></div>
<div><dt>首见版本</dt><dd>${s.firstLabel}</dd></div>
<div><dt>数据位置</dt><dd class="path"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.path)}</a></dd></div>
</dl></section>
<section class="card"><h2>核验</h2><dl>
<div><dt>固定版本</dt><dd>${esc(source.corpus_version || '')} · ${esc((source.corpus_commit || '').slice(0, 8))}</dd></div>
<div><dt>上线门</dt><dd>${s.pending ? `${VERSION} 新增，待确认` : s.isNew ? `${VERSION} 新增，${VERSION} 已确认开放` : `已在 ${PREV} 的数据里出现`}</dd></div>
${evs.length ? `<div><dt>引文定位</dt><dd>${evs.length} 条引证取自此篇，其中 ${evs.filter((e) => (HITS[e.id] || []).length).length} 条已在原文中定位到段落</dd></div>` : ''}
<div><dt>最近核验</dt><dd>${esc(stats.revision_date)}</dd></div>
</dl></section>
${evs.length ? `<section class="card"><h2>被引用于</h2>
${[...usedTopics].map((t) => `<a href="${base}topic/${t.id}/">${esc(t.title)}</a>`).join('')}
${[...usedQs].map((q) => `<a href="${base}q/${q.id}/">星图问题（含剧情）</a>`).slice(0, 1).join('')}
${refs.length ? `<ul class="reflist">${refs.slice(0, 12).map(([no, sec, title]) => `<li><a href="${base}read/${pad(no)}/#${sec}"><b>${pad(no)}</b>${esc(title)}</a></li>`).join('')}</ul>${refs.length > 12 ? `<p class="muted small">另有 ${refs.length - 12} 处</p>` : ''}` : ''}
${usedEvents.size ? `<p class="muted small">年表：${[...usedEvents].map((x) => `<a href="${base}timeline/#${x}">${x}</a>`).join('、')}</p>` : ''}
</section>` : ''}
</aside>
</div></div>`;
  page({ url: s.href, title: s.title, desc: s.pending ? '' : s.langs[langs[0]].slice(0, 3).map((l) => l[1]).join(' ').slice(0, 110), body, cls: 'source-page', scripts: ['source.js'], data: s.pending || !evs.length ? {} : { 'ev-data': Object.fromEntries(evs.map((e) => [e.id, e])) } });
}

// ───────────────────────── 专题 ─────────────────────────
const citeRow = (ci, base) => {
  const e = EV[ci.ev];
  const s = SRC[e.src];
  return `<div class="citerow"><span class="q">“${esc(ci.quote)}”</span><a href="${evLink(e, base)}">${esc(s ? s.title : e.title)}</a>${s ? `<code>${s.short}</code><span class="muted">首见 ${s.firstLabel}</span>${statusPill(s)}` : ''}</div>`;
};
const topicPending = (t) => t.claims.some((c) => (c.cites || []).some((ci) => EV[ci.ev].pending));
for (const t of topics) {
  const base = '../../';
  const ch = t.read && chapters[t.read.chapter - 1];
  const body = `<div class="wrap stack">
<nav class="crumbs" aria-label="位置"><a href="${base}topic/">专题</a> / ${esc(t.title)}</nav>
<article class="topic">
<div class="topic-head">
<h1>${esc(t.title)}</h1>
<p class="lede"><strong>结论：${esc(t.conclusion)}</strong>${esc(t.summary)}</p>
<p class="meta">对应游戏版本 ${VERSION} · 最近核验 ${esc(stats.revision_date)}${topicPending(t) ? ' · 部分证据待确认' : ''}</p>
</div>
${t.claims.map((c) => `<section class="card claim"><div>${levelTag(c.level)}</div><p>${esc(c.text)}</p>${(c.cites || []).map((ci) => citeRow(ci, base)).join('')}</section>`).join('\n')}
<section class="card falsify"><h2>什么会推翻这个结论</h2><p>${esc(t.falsify)}</p></section>
${topicPending(t) ? `<p class="muted">标为“待确认”的证据来自当前版本的新增文本。确认它已在游戏内开放之前，依赖它的论断在列表页显示为“部分证据待确认”。</p>` : ''}
${ch ? `<p class="muted">完整的论证见研究全文：<a href="${base}${chapterURL(ch)}${t.read.section ? `#${t.read.section}` : ''}">第 ${ch.no} 章 · ${esc(ch.sections.find((x) => x.id === t.read.section)?.title || ch.title)}</a></p>` : ''}
</article></div>`;
  page({ url: `topic/${t.id}/`, title: t.title, desc: `结论：${t.conclusion}${t.summary}`, body, cls: 'topic-page' });
}
{
  const base = '../';
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>专题</h1><p>一页回答一个问题。每个论断标明是事实、推断还是假说，引文只标出所引的那一句，并连回原文库。</p></div>
<div class="grid2">
${topics.map((t) => `<a class="card link" href="${base}topic/${t.id}/"><h2>${esc(t.title)}</h2><p><strong>结论：${esc(t.conclusion)}</strong>${esc(t.summary)}</p><p class="tags">${[...new Set(t.claims.map((c) => c.level))].map(levelTag).join('')}${topicPending(t) ? pill('部分证据待确认', 'amber') : ''}</p></a>`).join('\n')}
</div>
<section class="stack-s" id="full">
<h2>研究全文</h2>
<p class="muted">专题取自这份长稿：《提瓦特文明史与世界结构研究》${esc(stats.edition)}，${stats.sections} 章、${fmt(stats.body_han_characters)} 汉字、${stats.evidence} 条引证。读到哪一段，右栏列出该段引用的原文。另有 <a href="${base}plates/">${stats.image_plates} 组图版</a>。</p>
<div class="toc">
${parts.map((p) => `<section class="card"><h3><span>${p.label}</span>${esc(p.name)}</h3><ol>${p.chapters.map((c) => `<li><a href="${base}${chapterURL(c)}"><b>${pad(c.no)}</b><span>${esc(c.title)}</span><em>${fmt(c.chars)} 字 · ${c.cites.size} 证</em></a></li>`).join('')}</ol></section>`).join('\n')}
</div>
</section></div>`;
  page({ url: 'topic/', title: '专题', body, cls: 'topics-page' });
}

// ───────────────────────── 研究全文：各章 ─────────────────────────
chapters.forEach((c, i) => {
  const base = '../../';
  const prev = chapters[i - 1];
  const next = chapters[i + 1];
  const named = c.sections.filter((s) => s.title);
  const evData = Object.fromEntries([...c.cites].filter((id) => EV[id]).map((id) => [id, EV[id]]));
  const body = `
<div class="readbar" aria-hidden="true"><i id="progress-bar"></i></div>
<div class="wrap wide">
<header class="chapter-head">
<nav class="crumbs" aria-label="位置"><a href="${base}topic/">专题</a> / <a href="${base}topic/#full">研究全文</a> / ${c.part.label} · ${esc(c.part.name)}</nav>
<h1><span class="chapter-no">${pad(c.no)}</span>${esc(c.title)}</h1>
<p class="meta">${fmt(c.chars)} 字 · 约 ${Math.max(1, Math.round(c.chars / 450))} 分钟 · ${named.length} 小节 · ${c.cites.size} 条引证</p>
</header>
<div class="reader">
<aside class="outline" aria-label="本章小节"><h2>本章</h2><ol>${named.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ol></aside>
<article class="prose">
${c.sections.map((s) => `<section id="${s.id}">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
${s.html.join('\n')}
</section>`).join('\n')}
<nav class="pager">
${prev ? `<a href="${base}${chapterURL(prev)}"><span>上一章 · ${pad(prev.no)}</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
${next ? `<a class="next" href="${base}${chapterURL(next)}"><span>下一章 · ${pad(next.no)}</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
</nav>
</article>
<aside class="evrail" aria-label="本段证据"><h2>本段所据原文 <span id="rail-count"></span></h2>
<div id="rail-cards"><p class="muted small">把指针移到任一段落，或点文中的编号，这里列出该段引用的原文。</p></div>
</aside>
</div></div>`;
  page({ url: chapterURL(c), title: c.title, desc: plain(c.sections[0]?.text[0] || '').slice(0, 110), body, cls: 'chapter', scripts: ['reader.js'], data: { 'ev-data': evData } });
});

// ───────────────────────── 年表 ─────────────────────────
const REL = {
  before: '先于', after: '晚于', same_period: '同期', same_approximate_period: '近似同期', same_crisis: '同一危机', same_war_complex: '同一战争群',
  narrative_before: '叙述在前', narrative_after: '叙述在后', overlapping_research: '研究交叠', historical_reference: '历史回顾',
  interpretive_comparison: '解释性比较', parallel_regional_storyline: '并行地域情节', documented_stage_of: '文献所记阶段',
  historical_effect_of: '历史后果', cross_time_cause: '跨时原因', cross_time_effect: '跨时结果', contemporary_proposal: '当代方案',
};
const BASIS = { 文本纪年: 'text', 近似年代: 'approx', 纪年推算: 'approx', 相对顺序: 'rel', 当代叙事: 'now' };
const eventsById = Object.fromEntries(chronology.filter((x) => x.event_id).map((x) => [x.event_id, x]));
{
  const base = '../';
  const groups = [];
  for (const row of chronology) { if (row.group) groups.push({ title: row.group, events: [] }); else groups[groups.length - 1].events.push(row); }
  const short = (s, n = 34) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const eventHTML = (e) => {
    const r = relations.events[e.event_id];
    const rels = (r?.relations || []).filter((x) => eventsById[x.to]);
    const basis = BASIS[e.time_basis] || 'other';
    return `<li class="event" id="${e.event_id}" data-basis="${basis}">
<div class="event-date">${esc(e.date)}</div>
<div class="event-body">
<p class="event-region">${esc(e.region)} <a class="event-id" href="#${e.event_id}">${e.event_id}</a></p>
<p class="event-text">${esc(e.event)}</p>
<p class="event-meta">${pill(e.time_basis, basis === 'text' ? 'green' : basis === 'approx' ? 'blue' : 'grey')}${(e.sources || []).filter((id) => EV[id]).map((id) => `<a class="chip" href="${base}evidence/#${id}" data-ev="${id}">${esc(short(EV[id].title, 16))}</a>`).join('')}</p>
${rels.length ? `<details class="rels"><summary>${rels.length} 条时间关系</summary>${r?.precision ? `<p class="muted small">精度：${esc(r.precision)}</p>` : ''}<ul>${rels.map((x) => `<li><span class="rel">${REL[x.rel] || x.rel}</span><a href="#${x.to}">${esc(short(eventsById[x.to].event))}</a><small>${esc(x.basis || '')}</small></li>`).join('')}</ul></details>` : ''}
</div>
</li>`;
  };
  const gTitle = (t) => { const m = t.match(/^([^、：]{1,6})、(.+)$/); return m ? [m[1].replace('（续）', '·续'), m[2]] : ['', t]; };
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>年表</h1><p>${stats.chronology_events} 项事件。文本自己写明的纪年、换算得到的年数、只知先后的次序，三者分开显示：每项事件都标着它的时间是怎么定的。</p></div>
<div class="tl-controls" id="tl-controls">
<label class="libsearch">筛选事件、地区、年代<input type="search" id="tl-q" autocomplete="off"></label>
<div class="seg" role="group" aria-label="时间依据">
<button type="button" data-basis="" aria-pressed="true">全部</button>
<button type="button" data-basis="text" aria-pressed="false">文本纪年</button>
<button type="button" data-basis="approx" aria-pressed="false">换算年数</button>
<button type="button" data-basis="rel" aria-pressed="false">只知先后</button>
<button type="button" data-basis="now" aria-pressed="false">当代叙事</button>
<button type="button" data-basis="other" aria-pressed="false">文献内部次序</button>
</div>
<span class="count" id="tl-count">${stats.chronology_events} 项</span>
</div>
<div class="tl">
<aside class="tl-nav" aria-label="年表分组"><ol>${groups.map((g, i) => { const [n, t] = gTitle(g.title); return `<li><a href="#g${i}"><i>${esc(n || '·')}</i>${esc(t.split('：').pop())}</a></li>`; }).join('')}</ol></aside>
<div class="tl-main">
${groups.map((g, i) => { const [n, t] = gTitle(g.title); return `<section class="tl-group" id="g${i}">
<header><span class="tl-gno">${esc(n)}</span><h2>${esc(t)}</h2><span class="count">${g.events.length}</span></header>
<ol class="events">
${g.events.map(eventHTML).join('\n')}
</ol>
</section>`; }).join('\n')}
<p class="muted" id="tl-empty" hidden>没有符合条件的事件。</p>
</div>
</div></div>`;
  page({ url: 'timeline/', title: '年表', body, cls: 'timeline', scripts: ['timeline.js'] });
}

// ───────────────────────── 图版 ─────────────────────────
{
  const base = '../';
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>图版</h1><p>${stats.image_assets} 幅图像组成 ${stats.image_plates} 组图版，另有 ${stats.diagram_figures} 幅结构图。每幅都记录了“看到了什么”与来源；点开任一幅查看观察记录。</p></div>
<div class="plates">
${figureIndex.map((f) => (f.kind === 'plate' ? plateHTML(f.ref, f.no, base, { linkChapter: f.chapter }) : diagramHTML(f.ref, f.no, base, { linkChapter: f.chapter }))).join('\n')}
</div></div>`;
  page({ url: 'plates/', title: '图版', body, cls: 'plates-page' });
}

// ───────────────────────── 引证 ─────────────────────────
{
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>引证</h1><p>${stats.evidence} 条短引，出自 ${stats.source_titles} 种来源题名。每条都连着它所在的原文，也能反查它在研究全文与年表里被用在了哪里。<a href="../t/">按原文浏览 →</a></p></div>
<div class="ev-controls">
<label class="libsearch">搜索引文、来源题名、编号<input type="search" id="ev-q" autocomplete="off"></label>
<select id="ev-kind" aria-label="来源类型"><option value="">全部类型</option>${[...typeOrder.map((t) => TYPES[t]), '现实文献'].map((k) => `<option>${k}</option>`).join('')}</select>
<select id="ev-chap" aria-label="所在章"><option value="">全部章</option>${chapters.map((c) => `<option value="${c.no}">${pad(c.no)} ${esc(c.title.slice(0, 22))}</option>`).join('')}</select>
<select id="ev-sort" aria-label="排序"><option value="n">按首次出现</option><option value="refs">按被引次数</option></select>
<span class="count" id="ev-count"></span>
</div>
<div class="ev-list" id="ev-list"><p class="muted">正在载入…</p></div>
<button class="btn" id="ev-more" type="button" hidden>显示更多</button></div>`;
  page({ url: 'evidence/', title: '引证', body, cls: 'evidence-page', scripts: ['evidence.js'] });
  fs.writeFileSync(path.join(dist, 'data', 'evidence.json'), JSON.stringify(evidenceList.map((e) => ({
    ...e, kind: SRC[e.src]?.typeName || '现实文献', refs: backrefs[e.id] || [], events: eventRefs[e.id] || [],
  }))));
}

// ───────────────────────── 假说 ─────────────────────────
{
  const base = '../';
  const items = [];
  topics.forEach((t) => t.claims.filter((c) => c.level !== 'fact').forEach((c) => items.push({ level: c.level, text: c.text, from: t.title, href: `topic/${t.id}/`, cites: c.cites || [] })));
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>假说</h1><p>这里集中列出不是“事实”的论断：从原文推出来的是推断，证据还不足以定论的是假说。每条都写明出处；涉及主线剧情的假说放在<a href="${base}q/">星图的问题页</a>里，按你的进度显示。</p></div>
${items.map((x) => `<section class="card claim"><div>${levelTag(x.level)}</div><p>${esc(x.text)}</p>${x.cites.map((ci) => citeRow(ci, base)).join('')}<p class="muted small">出自专题：<a href="${base}${x.href}">${esc(x.from)}</a></p></section>`).join('\n')}
<section class="card"><h2>分级的含义</h2><dl class="levels"><div><dt>${levelTag('fact')}</dt><dd>游戏文本直接写明的内容，引文可逐字核对。</dd></div><div><dt>${levelTag('inference')}</dt><dd>由一条或几条事实推出，推理过程写在论断里。</dd></div><div><dt>${levelTag('hypothesis')}</dt><dd>有文本线索但不足以定论，或文本本身就以推测的语气说出。</dd></div></dl></section>
</div>`;
  page({ url: 'hypothesis/', title: '假说', body, cls: 'hyp-page' });
}

// ───────────────────────── 更新 ─────────────────────────
{
  const notes = fs.existsSync(C('release_notes.md')) ? fs.readFileSync(C('release_notes.md'), 'utf8') : '';
  const html = notes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('# ') ? `<h2>${esc(l.slice(2))}</h2>` : l.startsWith('## ') ? `<h3>${esc(l.slice(3))}</h3>` : `<p>${esc(l)}</p>`)).join('\n');
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>更新</h1><p>数据版本 ${VERSION}。研究稿现行版本：${esc(stats.edition)}（${esc(stats.revision_date)}）。</p></div>
<article class="card longtext">${html}</article></div>`;
  page({ url: 'updates/', title: '更新', body, cls: 'updates-page' });
}

// ───────────────────────── 关于 ─────────────────────────
{
  const base = '../';
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>关于</h1><p>把《原神》的文本当作一个文明留下的史料来读，并且让每一句结论都能被核对。</p></div>
<article class="card longtext">
<h2>两种读法</h2>
<p><a href="${base}">星图</a>给想弄明白剧情的玩家：先选主线进度，之后的内容藏在迷雾里；从一个问题出发，一步步看到相关的人物、事件和它们之间的关系。</p>
<p>考据层给想核对的人：<a href="${base}t/">原文库</a>收录固定版本里的 ${fmt(sources.length)} 篇简体中文文本（书籍、任务对白、角色故事与语音、物品说明等），另有<a href="${base}terms/">名词索引</a>；<a href="${base}topic/">专题</a>一页回答一个问题，<a href="${base}timeline/">年表</a>有 ${stats.chronology_events} 项事件。专题取自一份 ${fmt(stats.body_han_characters)} 字的长稿，全文也在专题页里。</p>
<h2 id="gate">上线规则</h2>
<p>全部文本固定于同一份语料快照（${esc(source.corpus_version || '')}，提交 <code>${esc((source.corpus_commit || '').slice(0, 12))}</code>）。一篇文本如果在上一版本（${PREV}）的快照里不存在，就算作 ${VERSION} 新增。新版本的文本在确认开放之前标为“待确认”：原文页不显示正文，引用它的论述标明“部分证据待确认”。${OPEN ? `${VERSION} 已经确认开放，所以这一版新增的文本现在正常显示。` : ''}</p>
<p>目前这道门做了两项检查：是否已过一个版本；是否带测试或未上线的标记（带标记的不收）。是否能追溯到已开放的任务或物品，还没有逐条核对，所以库里可能混有游戏内实际读不到的文本；限时活动的“已下线”状态也还没有标出。</p>
<h2>核验</h2>
<p>星图和专题里的每条引文，构建时都要与所挂引证的原文片段逐字比对，对不上构建就失败。研究全文的 ${stats.evidence} 条短引中，绝大多数已定位到原文的具体段落，可以从引证卡直接跳到那一段。</p>
<h2>声明</h2>
<p>本站是玩家的非营利研究项目，与米哈游及 HoYoverse 无关。游戏文本与图像的权利归权利人所有；图像来源与上传者逐幅列于<a href="${base}plates/">图版</a>页。</p>
</article></div>`;
  page({ url: 'about/', title: '关于', body, cls: 'about-page' });
}

// ───────────────────────── 搜索索引（仅考据层使用） ─────────────────────────
{
  const idx = [];
  for (const t of topics) idx.push(['专', t.title, `topic/${t.id}/`, `结论：${t.conclusion}${t.summary}`]);
  for (const s of sources) idx.push(['文', s.title, s.href, `${s.short} ${s.typeName}${s.corpus && s.heading ? ` · ${s.heading}` : ''}${s.pending || s.corpus ? '' : ` ${Object.values(s.langs)[0].slice(0, 3).map((l) => l[1]).join(' ').slice(0, 140)}`}`]);
  for (const c of chapters) {
    idx.push(['章', c.title, chapterURL(c), `${c.part.label} · 第 ${c.no} 章`]);
    for (const s of c.sections) idx.push(['节', s.title || c.title, `${chapterURL(c)}#${s.id}`, s.text.join(' ')]);
  }
  for (const e of chronology) if (e.event_id) idx.push(['年', `${e.date} · ${e.region}`, `timeline/#${e.event_id}`, e.event]);
  for (const e of evidenceList) idx.push(['证', e.title, `evidence/#${e.id}`, e.quotes.join(' / ')]);
  fs.writeFileSync(path.join(dist, 'data', 'search.json'), JSON.stringify(idx));
}

// ───────────────────────── 全文检索分片与名词索引 ─────────────────────────
{
  // 全文：每片约 1.5MB，搜索时按需逐片下载；待确认的原文不进全文
  const dir = path.join(dist, 'data', 'ft');
  fs.mkdirSync(dir, { recursive: true });
  let cur = [], size = 0, n = 0;
  const flush = () => { if (cur.length) { fs.writeFileSync(path.join(dir, `${n++}.json`), JSON.stringify(cur)); cur = []; size = 0; } };
  for (const s of sources) {
    if (s.pending) continue;
    const text = (s.langs.CHS || Object.values(s.langs)[0]).map((l) => l[1]).join('\n');
    if (size + text.length > 500000) flush();
    cur.push([s.id, s.title, text]);
    size += text.length;
  }
  flush();
  fs.writeFileSync(path.join(dist, 'data', 'ft.json'), JSON.stringify({ shards: n }));

  // 名词：只留指向已收录、正文可见的原文的
  const termRows = corpusTerms.filter((t) => SRC2[t[2]] && !SRC2[t[2]].pending).map((t) => [t[0], t[1], t[2], t[3]]);
  for (const n2 of star.nodes) termRows.push([n2.name, '星图', `who:${n2.id}`, null]);
  termRows.sort((a, b) => a[0].localeCompare(b[0], 'zh'));
  fs.writeFileSync(path.join(dist, 'data', 'terms.json'), JSON.stringify(termRows));
  const kinds = [...new Set(termRows.map((t) => t[1]))];
  const body = `<div class="wrap stack">
<div class="pagehead"><h1>名词索引</h1><p>游戏文本里有名字的东西：角色、人物、任务、书籍、武器、圣遗物、物品、魔物、地点等，共 ${fmt(termRows.length)} 个。每个名词连到写着它的那篇原文；星图上的星连到它的档案。<a href="../t/">回原文库 →</a></p></div>
<div class="ev-controls">
<label class="libsearch">查一个名字<input type="search" id="term-q" autocomplete="off"></label>
<select id="term-kind" aria-label="类别"><option value="">全部类别</option>${kinds.map((k) => `<option>${k}</option>`).join('')}</select>
<span class="count" id="term-count">正在载入…</span>
</div>
<ul class="termlist" id="term-list"></ul>
<div class="pagerow"><button type="button" class="btn" id="term-prev">上一页</button><span class="count" id="term-page"></span><button type="button" class="btn" id="term-next">下一页</button></div>
</div>`;
  page({ url: 'terms/', title: '名词索引', body, cls: 'terms-page', scripts: ['terms.js'] });
}

fs.writeFileSync(path.join(dist, '.nojekyll'), '');
// 404：不知道自己被放在哪一级目录下，所以样式内联，返回链接由脚本推算
fs.writeFileSync(path.join(dist, '404.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>没有这一页 · ${SITE}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D1424;color:#EEF2F8;font-family:'PingFang SC','Microsoft YaHei',sans-serif;text-align:center;padding:24px}h1{font-size:32px;margin:0 0 12px}p{color:#A6B1C4;margin:0 0 28px;line-height:28px}a{display:inline-flex;align-items:center;height:48px;padding:0 28px;border-radius:999px;background:#E6C06A;color:#0D1424;font-weight:700;text-decoration:none}</style></head>
<body><main><h1>这一页还在迷雾里</h1><p>地址可能写错了，或者这篇内容已经搬走。</p><a id="home" href="/">回到星图</a></main>
<script>(function(){var seg=location.pathname.split('/')[1];if(/github\\.io$/.test(location.hostname)&&seg)document.getElementById('home').href='/'+seg+'/'})()</script></body></html>
`);
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, f) => a + (f.isDirectory() ? count(path.join(d, f.name)) : 1), 0);
console.log(`原文 ${sources.length} 篇（研究引用 ${citedCount} 篇）`);
console.log(`已生成：${star.questions.length} 个问题、${star.nodes.length} 颗星、${allEdges.length} 条关系（其中 ${autoEdges.length} 条由年表自动连出）、${topics.length} 篇专题、${sources.length} 篇原文、${chapters.length} 章，共 ${count(dist)} 个文件 → dist/`);
