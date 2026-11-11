// 构建后的检查：dist/ 里每个站内链接、图片、脚本、样式都要指向存在的文件；带 # 的还要有对应的 id。
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const pages = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.html')) pages.push(p); } };
walk(dist);
const idsOf = new Map();
const ids = (file) => { if (!idsOf.has(file)) idsOf.set(file, new Set([...fs.readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))); return idsOf.get(file); };
// 引证页的卡片由脚本渲染，锚点对照数据文件
const evIds = new Set(JSON.parse(fs.readFileSync(path.join(dist, 'data', 'evidence.json'), 'utf8')).map((e) => e.id));
const bad = [];
let n = 0;
for (const page of pages) {
  if (path.basename(page) === '404.html') continue; // 它的返回链接由脚本推算
  const html = fs.readFileSync(page, 'utf8');
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|data:|#$)/.test(raw)) continue;
    n++;
    const [p, hash] = raw.split('#');
    let target = p ? path.resolve(path.dirname(page), decodeURIComponent(p)) : page;
    if (!target.startsWith(dist)) { bad.push(`${path.relative(dist, page)} → ${raw}（跑到站外）`); continue; }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) { bad.push(`${path.relative(dist, page)} → ${raw}（文件不存在）`); continue; }
    // 以 = 开头或含 = 的片段是脚本读取的参数（#q=moon、#type=book），不是锚点
    const known = target === path.join(dist, 'evidence', 'index.html') ? new Set([...evIds, ...ids(target)]) : ids(target);
    if (hash && !hash.includes('=') && target.endsWith('.html') && !known.has(decodeURIComponent(hash))) bad.push(`${path.relative(dist, page)} → ${raw}（没有这个锚点）`);
  }
}
if (bad.length) { console.error(`发现 ${bad.length} 个坏链接：\n${bad.slice(0, 60).join('\n')}`); process.exit(1); }
console.log(`链接检查通过：${pages.length} 个页面，${n} 个站内链接`);
