// 从研究仓库同步一份内容快照到 content/（正文、年表、证据、图版目录与压缩后的图像）。
// 用法：RESEARCH_DIR=../teyvat-research npm run sync
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.resolve(process.env.RESEARCH_DIR || path.join(root, '..', 'teyvat-research'));
const out = path.join(root, 'content');
if (!fs.existsSync(path.join(src, 'manuscript.md'))) {
  console.error(`找不到研究仓库：${src}（用 RESEARCH_DIR 指定）`);
  process.exit(1);
}
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(src, p), 'utf8'));
const writeJSON = (p, d) => fs.writeFileSync(path.join(out, p), JSON.stringify(d, null, 1) + '\n');
fs.mkdirSync(path.join(out, 'images'), { recursive: true });

// 正文与年表原样保留
for (const f of ['manuscript.md', 'chronology.json', 'build_statistics.json']) {
  fs.copyFileSync(path.join(src, f), path.join(out, f));
}

// 卷（part）→ 章标题
const structure = readJSON('authoring/structure.json');
writeJSON('parts.json', structure.map((p) => ({
  part: p.part || null,
  chapters: p.files.flatMap((f) =>
    [...fs.readFileSync(path.join(src, 'authoring', f), 'utf8').matchAll(/^## (.+)$/gm)].map((m) => m[1])),
})));

// 证据：只保留网站要展示的字段
const str = (v) => (typeof v === 'string' && v ? v : undefined);
writeJSON('evidence.json', readJSON('cited_evidence.json').map((e) => ({
  id: e.id,
  n: e.note_number,
  quotes: (e.quote ? [e.quote] : (e.fragments || [])).map((q) => (typeof q === 'string' ? q : q.text || q.quote || '')).filter(Boolean),
  title: e.source_title,
  note: str(e.source_note),
  speaker: str(e.speaker),
  lang: str(e.language),
  path: str(e.source_path),
  locator: str(e.locator),
  url: (Array.isArray(e.source_urls) && e.source_urls[0]) || str(e.source_url),
})));

// 年表约束：事件之间的类型化关系
const tc = readJSON('timeline_constraints.json');
writeJSON('relations.json', {
  explain: tc.relations_explanation,
  axes: tc.temporal_axis_definitions,
  reference_frame: tc.reference_frame,
  events: Object.fromEntries(tc.constraints.map((c) => [c.event_id, {
    precision: c.precision,
    relations: (c.relations || []).map((r) => ({ rel: r.relation, to: r.other_event_id, basis: r.basis, axis: r.temporal_axis })),
  }])),
});

// 图版目录 + 图像压缩为 webp
const ic = readJSON('image_catalog.json');
const images = {};
for (const im of ic.images) {
  const file = im.display_file || im.original_file || im.file;
  const name = path.basename(file).replace(/\.[^.]+$/, '') + '.webp';
  const input = sharp(path.join(src, file));
  const meta = await input.metadata();
  const small = meta.width <= 512;
  const piped = small ? input.webp({ lossless: true }) : input.resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 });
  const info = await piped.toFile(path.join(out, 'images', name));
  images[im.id] = {
    file: name, w: info.width, h: info.height,
    scene: im.scene, observation: im.visible_observation,
    credit: im.uploader_or_photographer, creator: im.game_creator,
    page: im.hosting_page || im.source_page || im.official_work_url,
    original: im.original_url || im.source_url,
    evidence: im.associated_text_evidence,
  };
}
writeJSON('plates.json', {
  groups: ic.figure_groups.map((g) => ({
    id: g.id, tex: path.basename(g.figure_tex), title: g.title, caption: g.caption,
    panels: g.panel_ids, evidence: g.text_evidence,
  })),
  images,
});

let commit = null;
try { commit = execSync('git rev-parse HEAD', { cwd: src }).toString().trim(); } catch {}
writeJSON('source.json', { research_commit: commit, corpus_version: tc.corpus_version, corpus_commit: tc.corpus_commit });
console.log(`已同步：${Object.keys(images).length} 幅图像，content/ 就绪`);
