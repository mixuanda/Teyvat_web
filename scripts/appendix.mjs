// 研究稿 LaTeX 里只在 PDF 出现的部分：附录“全量语料、资产清单与逐项复核记录”、附录“图像来源与版面处理目录”、
// 大事记的表头说明。转成结构化数据写入 content/appendix.json，构建只读它。
// 用法：RESEARCH_DIR=../teyvat-research node scripts/appendix.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.resolve(process.env.RESEARCH_DIR || path.join(root, '..', 'teyvat-research'));
const tex = fs.readFileSync(path.join(src, 'teyvat_civilization_history.tex'), 'utf8');

const between = (start, end) => {
  const a = tex.indexOf(start);
  const b = tex.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`研究稿里找不到 ${start} … ${end}`);
  return tex.slice(a + start.length, b);
};

// 行内命令 → 文本与链接片段 [[文本, 链接?], …]。遇到不认识的命令直接报错，不悄悄丢字
const SIMPLE = [
  [/\\allowbreak\{?\}?/g, ''], [/\\mbox\{-\}/g, '-'], [/\\,/g, ' '], [/\\texttimes\{?\}?/g, '×'], [/\\%/g, '%'], [/\\&/g, '&'],
  [/\\_/g, '_'], [/\\#/g, '#'], [/\\quad/g, ' '], [/~/g, ' '], [/---/g, '—'], [/--/g, '–'], [/\\label\{[^}]*\}/g, ''],
  [/\\(?:texttt|textbf|emph|textit|mbox)\{([^{}]*)\}/g, '$1'],
];
function segs(s) {
  for (const [re, to] of SIMPLE) s = s.replace(re, to);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(/\\href\{([^}]*)\}\{([^}]*)\}/g)) {
    if (m.index > last) out.push([s.slice(last, m.index)]);
    out.push([m[2], m[1]]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push([s.slice(last)]);
  const flat = out.map(([t, u]) => [t.replace(/\s*\n\s*/g, '').replace(/\s{2,}/g, ' '), u]).filter(([t]) => t);
  const left = flat.map(([t]) => t).join('').match(/\\[a-zA-Z]+/);
  if (left) throw new Error(`附录里有没处理的 LaTeX 命令 ${left[0]}：${s.slice(0, 120)}`);
  return flat;
}
// 按 & 分栏；\href 的网址里可能有 &，先换成占位再分
const cells = (row) => {
  const urls = [];
  const masked = row.replace(/\\href\{([^}]*)\}/g, (m, u) => `\\href{\u0000${urls.push(u) - 1}\u0000}`);
  return masked.split(/(?<!\\)&/).map((c) => c.trim().replace(/\u0000(\d+)\u0000/g, (m, i) => urls[i]));
};

// ── 附录：全量语料、资产清单与逐项复核记录 ──
const corpusTex = between('\\section{全量语料、资产清单与逐项复核记录}', '\\section{图像来源与版面处理目录}').replace(/\\clearpage/g, '');
const blocks = [];
for (const part of corpusTex.split(/(\\subsection\{[^}]*\}|\\begin\{table\}[\s\S]*?\\end\{table\})/)) {
  if (!part.trim()) continue;
  const h = part.match(/^\\subsection\{([^}]*)\}$/);
  if (h) { blocks.push({ type: 'h', text: h[1] }); continue; }
  if (part.startsWith('\\begin{table}')) {
    const body = part.match(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/)[1];
    const cap = part.match(/\\caption\{([\s\S]*)\}\s*\\end\{table\}/);
    const rows = body.replace(/\\toprule|\\bottomrule/g, '').split(/\\\\/).map((r) => r.trim()).filter(Boolean);
    const [head, ...rest] = rows.join('\\\\').split(/\\midrule/);
    blocks.push({ type: 'table', head: cells(head.replace(/\\\\$/, '')).map((c) => segs(c)), rows: rest.join('').split(/\\\\/).map((r) => r.trim()).filter(Boolean).map((r) => cells(r).map((c) => segs(c))), caption: cap ? segs(cap[1]) : [] });
    continue;
  }
  for (const p of part.split(/\n\s*\n/)) { const sg = p.trim() && segs(p.trim()); if (sg && sg.length) blocks.push({ type: 'p', segs: sg }); }
}

// ── 附录：图像来源与版面处理目录 ──
const imgTex = between('\\section{图像来源与版面处理目录}', '\\end{longtable}');
const intro = segs(imgTex.split('\\begingroup')[0].trim());
const images = imgTex.split('\\endlastfoot')[1].split(/\\\\\s*\n/).map((r) => r.trim()).filter(Boolean).map((r) => {
  const [id, scene, keeper, proc] = cells(r.replace(/\\\\$/, ''));
  return { id: id.replace(/\\_/g, '_'), scene: segs(scene), keeper: segs(keeper), proc: segs(proc) };
});

// ── 大事记的表头说明 ──
const tlIntro = segs(between('\\section{提瓦特文明大事记}', '\\begingroup').trim());

const out = { corpus: { title: '全量语料、资产清单与逐项复核记录', blocks }, images: { title: '图像来源与版面处理目录', intro, rows: images }, timeline: { intro: tlIntro } };
fs.writeFileSync(path.join(root, 'content', 'appendix.json'), `${JSON.stringify(out, null, 1)}\n`);
const chars = (x) => JSON.stringify(x).length;
console.log(`附录：语料复核 ${blocks.length} 段（${blocks.filter((b) => b.type === 'h').length} 小节、${blocks.filter((b) => b.type === 'table').length} 表），图像目录 ${images.length} 行；共 ${chars(out)} 字节`);
