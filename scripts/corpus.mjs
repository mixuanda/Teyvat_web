// 全量导入：把固定版本里的全部简体中文文本整理成一篇篇原文，写入 content/corpus/*.json.gz。
// 需要先有语料的本地副本（.cache/agd-work，见 README 的 "Full corpus" 一节）。
// 用法：node scripts/corpus.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = path.resolve(process.env.CORPUS_DIR || path.join(root, '.cache', 'agd-work'));
const outDir = path.join(root, 'content', 'corpus');
const J = (p) => JSON.parse(fs.readFileSync(path.join(A, p), 'utf8'));
const X = (name) => J(`ExcelBinOutput/${name}.json`);
const cacheTM = (name) => JSON.parse(fs.readFileSync(path.join(root, '.cache', 'corpus', name), 'utf8'));

// 当前版本与上一版本的文本表（上一版本用来判断“本版本新增”）
const tm = { ...cacheTM('TextMap/TextMapCHS.json'), ...cacheTM('TextMap/TextMap_MediumCHS.json') };
const prevDir = fs.readdirSync(path.join(root, '.cache', 'corpus')).find((d) => d.startsWith('@'));
const prevTM = { ...cacheTM(`${prevDir}/TextMap/TextMapCHS.json`), ...cacheTM(`${prevDir}/TextMap/TextMap_MediumCHS.json`) };
const prevTree = new Set(fs.readFileSync(path.join(root, '.cache', 'tree71.txt'), 'utf8').split('\n'));

const clean = (s, nick = '旅行者') => String(s ?? '')
  .replace(/\\n/g, '\n').replace(/<[^>]+>/g, '').replace(/\{NICKNAME\}/g, nick)
  .replace(/\{M#([^}]*)\}\{F#([^}]*)\}/g, '$1/$2').replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, '$2/$1')
  .replace(/\{NON_BREAK_SPACE\}/g, ' ').replace(/\{RUBY#\[[A-Z]\][^}]*\}/g, '').replace(/\{[A-Z_]+#[^}]*\}/g, '').replace(/\{[A-Z_]+\}/g, '').replace(/^#/, '').trim();
const T = (h) => (h && tm[h] ? clean(tm[h]) : '');

// ── 英文：同一固定版本的英文文本表 ──
// 每段中文按它在文本表里的条目找到同一条目的英文，挂在这段的第一行上（行的第三项），add() 时收成 e.en。
// 同一段中文对应多个条目时取第一个；句末 $HIDDEN 去掉后的写法也能查到
const tmEN = { ...cacheTM('TextMap/TextMapEN.json'), ...cacheTM('TextMap/TextMap_MediumEN.json') };
const zhToEn = new Map();
for (const [h, s] of Object.entries(tm)) {
  if (!tmEN[h]) continue;
  const zh = clean(s);
  const en = clean(tmEN[h], 'Traveler');
  if (!zh || !en) continue;
  if (!zhToEn.has(zh)) zhToEn.set(zh, en);
  const bare = zh.replace(/\$HIDDEN\s*/g, '').trim();
  if (bare !== zh && !zhToEn.has(bare)) zhToEn.set(bare, en.replace(/\$HIDDEN\s*/g, '').trim());
}
// 不在文本表里的署名和本站自己加的分隔说明
const EN_LABEL = { 旅行者: 'Traveler', 称号: 'Title', 所属: 'Affiliation', 命之座: 'Constellation', 神之眼: 'Vision', 简介: 'Description', 任务回顾以外的对白: 'Dialogue not in the quest recap', 任务回顾简介: 'Quest recap summary', 任务中的其他对白: 'Other dialogue in the quest', 任务步骤: 'Quest steps' };
const enOf = (zh) => (zh ? EN_LABEL[zh] || zhToEn.get(clean(zh)) || '' : '');
const enLines = (zh, who = '') => { const t = enOf(zh); const w = who ? enOf(who) || who : ''; return t ? t.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => [w, x]) : []; };
const split = (text, who = '', en = enLines(text, who)) => {
  const ls = clean(text).split('\n').map((t) => t.trim()).filter(Boolean).map((t) => [who, t]);
  if (ls.length) ls[0][2] = en;
  return ls;
};
// 分隔行：“＊”或“＊ 小标题”
const SEP = (label = '') => ['', label ? `＊ ${label}` : '＊', [['', label && enOf(label) ? `＊ ${enOf(label)}` : '＊']]];
// 英文版文件（阅读物、字幕）：按行切，不经文本表
const splitFile = (text) => clean(text, 'Traveler').split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ['', t]);
// 测试与未上线内容的标记
// 当前数据版本是否已确认开放（见 content/curated/release.json）
const OPEN = JSON.parse(fs.readFileSync(path.join(root, 'content', 'curated', 'release.json'), 'utf8')).confirmed.includes('7.2');
// 题名、人名、物品名的开发标记。不能单看“测试”“废弃”两个字：「测试！「暝导游船」！」「一把被废弃的刀」是正式内容，
// 「NPC动作测试1-男」「废弃-奇玛」「（废弃）祝圣之滴」才是开发残留
const TEST = /([（(]\s*test\s*[)）]|\$UNRELEASED|\$HIDDEN|test用|临时文本|\btest\b|测试用|动作测试|[（(]事件测试[)）]|测试礼包|[（(]\s*废弃\s*[)）]|废弃\s*[-－])/i;
// 正文的一行只看显式标记：“测试”“废弃”在故事里是普通的词（“废弃了许多失败品”），不能整句删掉
// 以 test 开头的行（“test救命！”“*废弃 test”“TESTSUNKEN”）和单独的 test 一词是开发占位
const LINE_TEST = /([（(]\s*test\s*[)）]|\$UNRELEASED|\$HIDDEN|test用|临时文本|^\s*[*＊]?\s*(废弃\s*)?test|\btest\b)/i;
const EN_TEST = /([（(]\s*test\s*[)）]|\$UNRELEASED|\$HIDDEN|test用|临时文本)/i;
const isNew = (hashes) => hashes.length > 0 && !hashes.some((h) => prevTM[h]);

const entries = [];
const terms = []; // [名词, 类别, 原文 id, 行号]
const seen = new Set();
const add = (e) => {
  const keep = e.lines.filter((l) => l[1] && !LINE_TEST.test(l[1]));
  // 英文里 test 是普通词（“test scores”“passed the Level 1 test”），只认显式标记；中文被滤掉的行，它的英文已随之去掉
  const en = (e.en || keep.flatMap((l) => l[2] || [])).filter((l) => l[1] && !EN_TEST.test(l[1]));
  e.lines = keep.map(([w, t]) => [w, t]);
  if (en.length) e.en = en; else delete e.en;
  if (!e.lines.length || !e.title || TEST.test(e.title)) return null;
  let id = e.id;
  while (seen.has(id)) id += 'x';
  seen.add(id);
  e.id = id;
  entries.push(e);
  return e;
};
const term = (name, kind, id, line) => { if (name && !TEST.test(name) && name.length <= 40) terms.push([name, kind, id, line ?? null]); };

// ── 人物名 ──
const npcName = Object.fromEntries(X('NpcExcelConfigData').map((n) => [String(n.id), T(n.nameTextMapHash)]));
const avatars = X('AvatarExcelConfigData').filter((a) => T(a.nameTextMapHash) && String(a.id).startsWith('1000') && a.id < 10000900);
const avatarName = Object.fromEntries(avatars.map((a) => [a.id, T(a.nameTextMapHash)]));

// ── 可读文本：书籍、圣遗物故事、武器故事等 ──
{
  const loc = Object.fromEntries(X('LocalizationExcelConfigData').map((l) => [l.id, (Object.values(l).find((v) => typeof v === 'string' && v.includes('/Readable/')) || '').split('/').pop().replace(/_[A-Z]{2,3}$/, '')]));
  const titleOf = {};
  for (const d of X('DocumentExcelConfigData')) {
    const title = T(d.titleTextMapHash);
    const ids = Object.values(d).filter(Array.isArray).flat().filter((v) => loc[v]);
    // 同一个文件可能同时挂在测试文档和正式文档下：测试文档的题名不能盖掉正式题名
    ids.forEach((id, i) => {
      const k = loc[id];
      if (title && !(TEST.test(title) && titleOf[k] && !TEST.test(titleOf[k]))) titleOf[k] = ids.length > 1 ? `${title}（${i + 1}/${ids.length}）` : title;
    });
  }
  const weaponName = Object.fromEntries(X('WeaponExcelConfigData').map((w) => [w.id, T(w.nameTextMapHash)]));
  const dir = path.join(A, 'Readable', 'CHS');
  for (const f of fs.readdirSync(dir).sort()) {
    const stem = f.replace(/\.txt$/, '');
    const m = stem.match(/^([A-Za-z]+?)_?(\d+.*)$/) || [null, 'Misc', stem];
    const type = { Book: 'book', Relic: 'relic', Weapon: 'weapon' }[m[1]] || 'item';
    const title = titleOf[stem] || (type === 'weapon' && weaponName[Number(m[2])]) || '';
    const e = add({
      id: `${type}/${(type === 'item' ? stem : m[2]).toLowerCase()}`, type, title: title || `（无题）${stem}`,
      path: `Readable/CHS/${f}`, first: prevTree.has(`Readable/CHS/${f}`) ? 'old' : 'new',
      lines: split(fs.readFileSync(path.join(dir, f), 'utf8'), '', []),
      en: (() => { const p = path.join(A, 'Readable', 'EN', `${stem}_EN.txt`); return fs.existsSync(p) ? splitFile(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) : []; })(),
    });
    if (e && title) term(title.replace(/（\d+\/\d+）$/, ''), { book: '书籍', relic: '圣遗物', weapon: '武器' }[type] || '物品', e.id);
  }
}

// ── 对白文件：每一句 [说话人, 文本哈希] ──
// 多数文件是 dialogList / talkContentTextMapHash；邀约事件的文件字段名被混淆，loose 时
// 按值的形状认：带 _type 的对象是说话人，落在文本表里的数值里最长的是台词，另一个短的是署名
const dialogsOf = (d, loose = false) => {
  const list = d.dialogList || (loose ? Object.values(d).find((v) => Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object') : null) || [];
  const out = [];
  for (const dl of list) {
    let hash = dl.talkContentTextMapHash, nameHash = dl.talkRoleNameTextMapHash, role = dl.talkRole;
    if (loose && !('talkContentTextMapHash' in dl)) {
      const vals = Object.values(dl);
      role = vals.find((v) => v && typeof v === 'object' && !Array.isArray(v) && (v._type || v.type));
      const hs = vals.filter((v) => (typeof v === 'number' || typeof v === 'string') && v !== '' && tm[v]).sort((a, b) => tm[b].length - tm[a].length);
      hash = hs[0];
      nameHash = hs[1] && tm[hs[1]].length <= 12 && !/[\n。！？，]/.test(tm[hs[1]]) ? hs[1] : undefined;
    }
    if (!hash || !tm[hash]) continue;
    role ||= {};
    const type = role.type || role._type;
    let who = '';
    if (nameHash && tm[nameHash]) who = T(nameHash);
    else if (type === 'TALK_ROLE_PLAYER') who = '旅行者';
    else if (type === 'TALK_ROLE_NPC') who = npcName[role.id ?? role._id] || '';
    else if (type === 'TALK_ROLE_MATE_AVATAR') who = '派蒙';
    out.push([who, hash]);
  }
  return out;
};
const dialogsIn = (file, loose = false) => {
  const p = path.join(A, 'BinOutput', 'Talk', file);
  return fs.existsSync(p) ? dialogsOf(JSON.parse(fs.readFileSync(p, 'utf8')), loose) : [];
};

// ── 任务：有旅行日志的用日志，没有的用对白文件拼 ──
const usedTalk = new Set();
{
  const chapter = Object.fromEntries(X('ChapterExcelConfigData').map((c) => [c.id, [T(c.chapterNumTextMapHash), T(c.chapterTitleTextMapHash)].filter(Boolean).join(' ')]));
  const KIND = { AQ: ['aq', '魔神任务'], LQ: ['lq', '传说任务'], WQ: ['wq', '世界任务'], EQ: ['eq', '活动任务'], IQ: ['iq', '委托任务'] };
  const talkLines = (file, hashes) => dialogsIn(file).flatMap(([who, h]) => { hashes?.push(h); return split(tm[h], who); });
  const qdir = path.join(A, 'BinOutput', 'Quest');
  for (const f of fs.readdirSync(qdir).sort((a, b) => parseInt(a) - parseInt(b))) {
    const q = JSON.parse(fs.readFileSync(path.join(qdir, f), 'utf8'));
    const [type, typeName] = KIND[q.type] || KIND.AQ;
    // 带 $HIDDEN 的是游戏里不显示题名的任务（送礼、日常对话、隐藏挑战）。其中不少内部名带 (test)，
    // 对白却是正式上线的台词：去掉标记，题名记作“（隐藏任务）……”。带 $UNRELEASED 的是未上线内容，不收
    const rawTitle = T(q.titleTextMapHash);
    const hidden = /\$HIDDEN/.test(rawTitle) && !/\$UNRELEASED/.test(rawTitle);
    let title = rawTitle.replace(/\$HIDDEN\s*/g, '').trim();
    if (hidden && /[（(]\s*test\s*[)）]|^test/i.test(title)) title = `（隐藏任务）${title.replace(/[（(]\s*test\s*[)）]/gi, '').replace(/^test/i, '').trim().replace(/^隐藏[-－]?/, '')}`;
    const hashes = [];
    let lines = [];
    const codexPath = path.join(A, 'BinOutput', 'CodexQuest', `${q.id}.json`);
    let from = `BinOutput/Quest/${f}`;
    let codex = null;
    if (fs.existsSync(codexPath)) {
      const d = JSON.parse(fs.readFileSync(codexPath, 'utf8'));
      codex = d;
      from = `BinOutput/CodexQuest/${q.id}.json`;
      for (const s of d.subQuests || []) {
        const before = lines.length;
        const st = T(s.subQuestTitle?.textId);
        if (st) lines.push(SEP(st));
        for (const it of s.items || []) {
          const who = T(it.speakerText?.textId);
          const walk = (o, k) => {
            if (!o || typeof o !== 'object' || k === 'speakerText') return;
            if (o.textId && tm[o.textId]) { hashes.push(o.textId); lines.push(...split(tm[o.textId], who)); return; }
            for (const [kk, v] of Object.entries(o)) walk(v, kk);
          };
          walk(it, '');
        }
        if (st && lines.length === before + 1) lines.pop();
      }
    }
    for (const t of q.talks || []) usedTalk.add(String(t.id));
    if (!lines.length) {
      for (const t of q.talks || []) {
        const ls = talkLines(`Quest/${t.id}.json`, hashes);
        if (ls.length) { if (lines.length) lines.push(SEP()); lines.push(...ls); }
      }
    }
    // 只有步骤说明、没有对白的任务，按步骤说明判断是不是本版本新增
    const stepHashes = (q.subQuests || []).flatMap((s) => [s.descTextMapHash, s.stepDescTextMapHash]).filter((h) => tm[h]);
    const isNewQuest = isNew(hashes.length ? hashes : stepHashes);
    // 以下都接在已有内容之后，原有段落的锚点不动
    const seenText = new Set([...lines.map((l) => l[1]), ...split(T(q.descTextMapHash)).map((l) => l[1])]);
    const more = (head, ls) => { const fresh = ls.filter((l) => !seenText.has(l[1])); fresh.forEach((l) => seenText.add(l[1])); if (fresh.length) lines.push(SEP(head), ...fresh); };
    if (codex) {
      // 任务回顾只收了主线对白；分支、选项后的对白在对白文件里
      const have = new Set(hashes.map(String));
      more('任务回顾以外的对白', (q.talks || []).flatMap((t) => dialogsIn(`Quest/${t.id}.json`).filter(([, h]) => !have.has(String(h))).flatMap(([who, h]) => split(tm[h], who))));
      const brief = T(codex.mainQuestDesp?.textId);
      if (brief && brief !== T(q.descTextMapHash)) more('任务回顾简介', split(brief));
    }
    // 任务文件里直接写着的对白（多见于活动任务）
    { const have = new Set(hashes.map(String)); more('任务中的其他对白', dialogsOf(q).filter(([, h]) => !have.has(String(h))).flatMap(([who, h]) => split(tm[h], who))); }
    // 每一步：步骤名、详细说明、提示。详细说明和提示常在句末挂 $HIDDEN（界面上不显示的说明），去掉标记照收；
    // 步骤名带 $HIDDEN 的是“和古田聊聊”这类内部叫法，仍由行过滤去掉
    const unhide = (h) => split(T(h).replace(/\$HIDDEN\s*/g, '').trim());
    more('任务步骤', [...(q.subQuests || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).flatMap((s) => [...split(T(s.descTextMapHash)), ...unhide(s.stepDescTextMapHash), ...unhide(s.guideTipsTextMapHash)]));
    if (!lines.length) continue;
    if (!title) title = `（无题）任务 ${q.id}`;
    if (title === '（隐藏任务）') {
      const count = {};
      lines.forEach(([w]) => { if (w && w !== '旅行者' && w !== '派蒙') count[w] = (count[w] || 0) + 1; });
      title += Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || q.id;
    }
    const desc = T(q.descTextMapHash);
    const e = add({ id: `${type}/${q.id}`, type, title, group: chapter[q.chapterId] || typeName, path: from, first: isNewQuest ? 'new' : 'old', lines: desc ? [['', desc, enLines(desc)], ...(lines[0][1].startsWith('＊') ? [] : [SEP()]), ...lines] : lines });
    if (e) term(title, typeName, e.id);
  }

  // ── 其余对白：按说话的 NPC 归拢 ──
  const byNpc = new Map();
  for (const sub of ['Npc', 'NpcOther', 'FreeGroup', 'Activity', 'Gadget', 'Quest']) {
    const d = path.join(A, 'BinOutput', 'Talk', sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort((a, b) => parseInt(a) - parseInt(b))) {
      if (sub === 'Quest' && usedTalk.has(f.replace('.json', ''))) continue;
      const hashes = [];
      const lines = talkLines(`${sub}/${f}`, hashes);
      if (!lines.length) continue;
      const count = {};
      lines.forEach(([w]) => { if (w && w !== '旅行者' && w !== '派蒙') count[w] = (count[w] || 0) + 1; });
      // 文件名不是编号的是汇总文件（如 GlobalDialog），里面的对白没有归到任何任务
      const who = !/^\d/.test(f) ? '未归入任务的对白' : Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || (sub === 'Activity' ? '活动对白' : sub === 'Gadget' ? '物件与机关' : '旁白与其他');
      const g = byNpc.get(who) || byNpc.set(who, { lines: [], hashes: [], activity: 0, n: 0 }).get(who);
      if (g.lines.length) g.lines.push(SEP());
      g.lines.push(...lines); g.hashes.push(...hashes); g.n++; if (sub === 'Activity') g.activity++;
    }
  }
  let k = 0;
  for (const [who, g] of [...byNpc].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
    // 一个 NPC 的对白太长时切成几篇
    const chunks = [];
    let cur = [];
    for (const l of g.lines) { cur.push(l); if ((cur.length > 700 && l[1] === '＊') || cur.length > 1000) { chunks.push(cur); cur = []; } }
    if (cur.length) chunks.push(cur);
    chunks.forEach((lines, i) => {
      const type = g.activity > g.n / 2 ? 'event' : 'npc';
      const e = add({ id: `${type}/n${++k}`, type, title: chunks.length > 1 ? `${who}（${i + 1}/${chunks.length}）` : who, group: type === 'event' ? '活动对白' : 'NPC 对白', path: 'BinOutput/Talk/', first: isNew(g.hashes) ? 'new' : 'old', lines });
      if (e && i === 0 && !/对白|旁白|物件|留言|？？？/.test(who)) term(who, '人物', e.id);
    });
  }

  // 一组对白的主讲人：出现最多的、不是旅行者和派蒙的说话人
  const mainSpeaker = (lines) => {
    const count = {};
    lines.forEach(([w]) => { if (w && w !== '旅行者' && w !== '派蒙') count[w] = (count[w] || 0) + 1; });
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };
  const numeric = (a, b) => a.localeCompare(b, 'en', { numeric: true });

  // ── 邀约事件：文件名是“邀约编号_段落”，一个邀约一篇 ──
  {
    const dir = path.join(A, 'BinOutput', 'Talk', 'Coop');
    const chains = new Map();
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort(numeric) : []) {
      const hashes = [];
      const lines = dialogsIn(`Coop/${f}`, true).flatMap(([who, h]) => { hashes.push(h); return split(tm[h], who); });
      if (!lines.length) continue;
      const c = chains.get(f.split('_')[0]) || chains.set(f.split('_')[0], { lines: [], hashes: [] }).get(f.split('_')[0]);
      if (c.lines.length) c.lines.push(SEP());
      c.lines.push(...lines); c.hashes.push(...hashes);
    }
    const perWho = {};
    const rows = [...chains].map(([id, c]) => ({ id, c, who: mainSpeaker(c.lines) || '邀约事件' }));
    rows.forEach((r) => { r.n = (perWho[r.who] = (perWho[r.who] || 0) + 1); });
    for (const r of rows) {
      const many = perWho[r.who] > 1;
      add({ id: `coop/${r.id}`, type: 'coop', title: `${r.who}·邀约事件${many ? `（${r.n}）` : ''}`, group: r.who, path: `BinOutput/Talk/Coop/${r.id}_*.json`, first: isNew(r.c.hashes) ? 'new' : 'old', lines: r.c.lines });
    }
  }

  // ── 故事板、绽放事件、过场里的对白和根目录的零散对白：按主讲人归拢，各自编号 ──
  for (const [sub, prefix, label] of [['Storyboard', 'sb', '故事板对白'], ['Blossom', 'bl', '绽放事件对白'], ['Cutscene', 'cs', '过场对白'], ['', 'rt', '零散对白']]) {
    const dir = path.join(A, 'BinOutput', 'Talk', sub);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && fs.statSync(path.join(dir, f)).isFile()).sort(numeric);
    const byWho = new Map();
    for (const f of files) {
      const hashes = [];
      const lines = talkLines(sub ? `${sub}/${f}` : f, hashes);
      if (!lines.length) continue;
      const who = mainSpeaker(lines) || label;
      const g = byWho.get(who) || byWho.set(who, { lines: [], hashes: [] }).get(who);
      if (g.lines.length) g.lines.push(SEP());
      g.lines.push(...lines); g.hashes.push(...hashes);
    }
    let n = 0;
    for (const [who, g] of [...byWho].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
      const chunks = [];
      for (let i = 0; i < g.lines.length; i += 1000) chunks.push(g.lines.slice(i, i + 1000));
      chunks.forEach((lines, i) => add({ id: `npc/${prefix}${++n}`, type: 'npc', title: `${who === label ? label : `${who}·${label}`}${chunks.length > 1 ? `（${i + 1}/${chunks.length}）` : ''}`, group: label, path: `BinOutput/Talk/${sub ? `${sub}/` : ''}`, first: isNew(g.hashes) ? 'new' : 'old', lines }));
    }
  }
}

// ── 角色：故事、语音、资料 ──
{
  const stories = X('FetterStoryExcelConfigData');
  for (const s of stories) {
    const name = avatarName[s.avatarId];
    if (!name) continue;
    const h = s.storyContextTextMapHash;
    add({ id: `story/${h}`, type: 'story', title: `${name}·${T(s.storyTitleTextMapHash) || '故事'}`, group: name, path: 'ExcelBinOutput/FetterStoryExcelConfigData.json', first: isNew([h]) ? 'new' : 'old', lines: split(tm[h] || '') });
    // 有些故事在剧情推进后会换成另一版正文
    const h2 = s.storyContext2TextMapHash;
    if (h2 && tm[h2] && T(h2) !== T(h)) add({ id: `story/${h2}`, type: 'story', title: `${name}·${T(s.storyTitle2TextMapHash) || T(s.storyTitleTextMapHash) || '故事'}（另一版）`, group: name, path: 'ExcelBinOutput/FetterStoryExcelConfigData.json', first: isNew([h2]) ? 'new' : 'old', lines: split(tm[h2]) });
  }
  const voices = {};
  for (const v of X('FettersExcelConfigData')) (voices[v.avatarId] ||= []).push(v);
  const info = Object.fromEntries(X('FetterInfoExcelConfigData').map((i) => [i.avatarId, i]));
  for (const a of avatars) {
    const name = avatarName[a.id];
    const vs = voices[a.id] || [];
    const hs = vs.map((v) => v.voiceFileTextTextMapHash);
    const e = add({ id: `voice/a${a.id}`, type: 'voice', title: `${name}·语音`, group: name, path: 'ExcelBinOutput/FettersExcelConfigData.json', first: isNew(hs) ? 'new' : 'old', lines: vs.flatMap((v) => split(tm[v.voiceFileTextTextMapHash] || '', T(v.voiceTitleTextMapHash))) });
    const i = info[a.id];
    const prof = i ? [['称号', T(i.avatarTitleTextMapHash)], ['所属', T(i.avatarNativeTextMapHash)], ['命之座', T(i.avatarConstellationBeforTextMapHash)], ['神之眼', T(i.avatarVisionBeforTextMapHash)], ['简介', T(i.avatarDetailTextMapHash)], ['简介', T(a.descTextMapHash)]].filter((l) => l[1]).map(([k, v]) => [k, v, enLines(v, k)]) : [];
    const p = prof.length ? add({ id: `misc/avatar-${a.id}`, type: 'misc', title: `${name}·角色资料`, group: name, path: 'ExcelBinOutput/FetterInfoExcelConfigData.json', first: isNew([i.avatarDetailTextMapHash]) ? 'new' : 'old', lines: prof }) : null;
    term(name, '角色', (p || e)?.id);
  }
}

// ── 成组的短文本：物品、武器、圣遗物、摆设、图鉴、成就、提示 ──
{
  const group = (id, type, title, kind, rows) => {
    // rows: [名字, 说明, [哈希]]；本版本还没确认开放时，新增的条目不进正文
    const lines = [];
    const kept = rows.filter((r) => r[0] && r[1] && (OPEN || !isNew(r[2])));
    const chunks = [];
    for (let i = 0; i < kept.length; i += 400) chunks.push(kept.slice(i, i + 400));
    chunks.forEach((chunk, ci) => {
      const e = add({ id: chunks.length > 1 ? `${id}-${ci + 1}` : id, type, title: chunks.length > 1 ? `${title}（${ci + 1}/${chunks.length}）` : title, group: '说明文字', path: 'ExcelBinOutput/', first: 'old', lines: chunk.flatMap(([n, d]) => split(d, n)) });
      if (!e) return;
      let li = 0;
      for (const [n, d] of chunk) { const c = split(d, n).filter((l) => !LINE_TEST.test(l[1])).length; if (c) { if (kind) term(n, kind, e.id, li); li += c; } }
    });
    void lines;
  };
  const MT = { MATERIAL_QUEST: '任务道具', MATERIAL_FOOD: '食物', MATERIAL_CONSUME: '消耗品', MATERIAL_AVATAR_MATERIAL: '养成材料', MATERIAL_EXCHANGE: '素材', MATERIAL_NAMECARD: '名片', MATERIAL_WIDGET: '小道具', MATERIAL_FURNITURE_FORMULA: '摆设图纸', MATERIAL_BGM: '曲目', MATERIAL_WOOD: '木材', MATERIAL_HOME_SEED: '种子', MATERIAL_FLYCLOAK: '风之翼', MATERIAL_COSTUME: '衣装', MATERIAL_CHEST: '礼包', MATERIAL_TALENT: '天赋材料', MATERIAL_AVATAR_TALENT_MATERIAL: '天赋材料', MATERIAL_SPICE_FOOD: '特色料理', MATERIAL_FISH_BAIT: '钓具', MATERIAL_FISH_ROD: '钓具', MATERIAL_ELEM_CRYSTAL: '元素晶球', MATERIAL_ADSORBATE: '晶蝶与微粒', MATERIAL_GCG_CARD: '七圣召唤', MATERIAL_GCG_CARD_FACE: '七圣召唤', MATERIAL_GCG_CARD_BACK: '七圣召唤', MATERIAL_WEAPON_SKIN: '武器外观', MATERIAL_AVATAR: '角色' };
  const byType = {};
  for (const m of X('MaterialExcelConfigData')) { const k = MT[m.materialType] || '其他物品'; (byType[k] ||= []).push([T(m.nameTextMapHash), T(m.descTextMapHash), [m.nameTextMapHash, m.descTextMapHash]]); }
  Object.entries(byType).forEach(([k, rows], i) => group(`item/m${i + 1}`, 'item', `物品说明·${k}`, k === '角色' ? null : '物品', rows));
  group('item/weapons', 'item', '武器说明', '武器', X('WeaponExcelConfigData').map((w) => [T(w.nameTextMapHash), T(w.descTextMapHash), [w.nameTextMapHash]]));
  const relicSeen = new Set();
  group('item/relics', 'item', '圣遗物说明', '圣遗物', X('ReliquaryExcelConfigData').filter((r) => { const k = r.nameTextMapHash; if (relicSeen.has(k)) return false; relicSeen.add(k); return true; }).map((r) => [T(r.nameTextMapHash), T(r.descTextMapHash), [r.nameTextMapHash]]));
  group('item/furniture', 'item', '摆设说明', '摆设', X('HomeWorldFurnitureExcelConfigData').map((r) => [T(r.nameTextMapHash), T(r.descTextMapHash), [r.nameTextMapHash]]));
  const mName = Object.fromEntries(X('MonsterDescribeExcelConfigData').map((m) => [m.id, T(m.nameTextMapHash)]));
  const aName = Object.fromEntries(X('AnimalDescribeExcelConfigData').map((m) => [m.id, T(m.nameTextMapHash)]));
  const codex = X('AnimalCodexExcelConfigData');
  group('misc/codex-monster', 'misc', '生物志·魔物', '魔物', codex.filter((c) => c.type === 'CODEX_MONSTER').map((c) => [mName[c.describeId], T(c.descTextMapHash), [c.descTextMapHash]]));
  group('misc/codex-animal', 'misc', '生物志·野生生物', '生物', codex.filter((c) => c.type !== 'CODEX_MONSTER').map((c) => [aName[c.describeId] || mName[c.describeId], T(c.descTextMapHash), [c.descTextMapHash]]));
  group('misc/viewcodex', 'misc', '地理志', '地点', X('ViewCodexExcelConfigData').map((v) => [T(v.nameTextMapHash), T(v.descTextMapHash), [v.descTextMapHash]]));
  group('misc/achievements', 'misc', '成就', '成就', X('AchievementExcelConfigData').map((v) => [T(v.titleTextMapHash), T(v.descTextMapHash), [v.titleTextMapHash]]));
  group('misc/loadingtips', 'misc', '加载提示', null, X('LoadingTipsExcelConfigData').map((v) => [T(v.tipsTitleTextMapHash), T(v.tipsDescTextMapHash), [v.tipsDescTextMapHash]]));
}

// ── 过场字幕：Subtitle/CHS 的 .srt，一个过场一篇 ──
{
  const dir = path.join(A, 'Subtitle', 'CHS');
  const questTitle = Object.fromEntries(fs.readdirSync(path.join(A, 'BinOutput', 'Quest')).map((f) => { const q = JSON.parse(fs.readFileSync(path.join(A, 'BinOutput', 'Quest', f), 'utf8')); return [q.id, T(q.titleTextMapHash).replace(/\$HIDDEN\s*/g, '').trim()]; }));
  const VARIANT = { Boy: '（男主）', Girl: '（女主）' };
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  // 同一任务常有几段过场：同名时按出现顺序编号
  const seenTitle = {};
  for (const f of files) {
    const stem = f.replace(/_CHS\.srt$/i, '').replace(/\.srt$/i, '');
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '');
    // srt：序号、时间轴、字幕正文、空行
    const srt = (t) => t.split(/\r?\n/).filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l));
    const lines = srt(text).flatMap((l) => split(l, '', []));
    const enPath = path.join(A, 'Subtitle', 'EN', `${stem}_EN.srt`);
    const en = fs.existsSync(enPath) ? srt(fs.readFileSync(enPath, 'utf8').replace(/^\uFEFF/, '')).flatMap((l) => splitFile(l)) : [];
    // 文件名里的编号（Cs_102106、Cs_Inazuma_AQ202004、Cs_Activity_4001103）是子任务或任务号：依次试原号、去掉末两位、末四位
    const q = (stem.match(/\d{4,}/g) || []).flatMap((d) => [Number(d), Math.floor(Number(d) / 100), Math.floor(Number(d) / 10000)]).map((n) => questTitle[n]).find((t) => t && !TEST.test(t));
    const variant = Object.entries(VARIANT).find(([k]) => new RegExp(`_${k}$`, 'i').test(stem))?.[1] || '';
    const base = q ? `${q}·过场` : `过场·${stem.replace(/^Cs_/i, '').replace(/_(Boy|Girl)$/i, '').replace(/_/g, ' ')}`;
    const n = (seenTitle[base + variant] = (seenTitle[base + variant] || 0) + 1);
    add({ id: `cutscene/${stem.toLowerCase()}`, type: 'cutscene', title: `${base}${n > 1 ? ` ${n}` : ''}${variant}`, group: q ? '任务过场' : '其他过场', path: `Subtitle/CHS/${f}`, first: prevTree.has(`Subtitle/CHS/${f}`) ? 'old' : 'new', lines, en });
  }
}

// ── 设定表里的叙事文字：活动简介、秘境、地脉首领、提醒语、邮件、委托、初见、逸闻…… ──
// 每行取它引用的全部文本：短的题名/人名当署名，其余当正文。混杂表（手册、教程、牌、装扮）只收成句的文字，
// 不收按钮、标签和带参数占位的数值说明
{
  const PLACEHOLDER = /\{param|%\d+%|#\d+#|\$\[|\{\d+\}|\{[A-Z_]+\}/;
  const prose = (t) => t.length >= 8 && /[。！？…」]/.test(t) && !PLACEHOLDER.test(t);
  const TABLES = [
    // [文件名（去掉 ExcelConfigData）, 标题, 是否只收成句的文字]
    ['Reminder', '提醒语', false], ['NewActivityPreviewConfigData', '活动简介', false], ['Dungeon', '秘境说明', false],
    ['LeyLineLevelConfig', '地脉首领', false], ['NpcFirstMet', '初见介绍', false], ['Anecdote', '逸闻', false],
    ['ReputationRequest', '声望委托', false], ['DailyTask', '每日委托', false], ['CoopPoint', '邀约事件结局', false],
    ['Mail', '邮件', false], ['HuntingMonster', '讨伐悬赏', false], ['MaterialCodex', '物品图鉴', false],
    ['AquariumDivingItem', '潜水图鉴', false], ['GroupLinksBundle', '游记与见闻', false], ['SLTMapContent', '地图记事', false],
    ['AutoChessEvent', '冒险事件', false], ['QuestAbyssWarLevel', '战线记录', false], ['MonsterChessV2Card', '兵棋', false],
    ['TeyvatDispatchTask', '派遣任务', false], ['ActivityPhotographPos', '摄影地点', false], ['AvatarVideoSheet', '角色介绍', false],
    ['TowerSchedule', '深境螺旋题记', false], ['RoleCombatFortuneTeller', '剧诗占卜', false], ['GCGWorldLevel', '七圣召唤·牌手', false],
    ['GCGTalkDetail', '七圣召唤·牌局对白', false], ['DungeonEntry', '秘境入口', false], ['AvatarCostume', '角色衣装', false],
    ['SubQuestCatalog', '任务目录说明', false], ['InvestigationMonsterConfigData', '生物调查', false], ['FishPool', '钓点', false],
    ['PersonalLineActivity', '传说任务简介', false], ['AquariumDivingTask', '潜水任务', false], ['TpsGlassesChatMessage', '观测镜讯息', false],
    ['UgcMonster', '千星奇域·造物', true], ['BeyondMonsterTemplate', '千星奇域·魔物', true], ['BeyondHallFacility', '千星奇域·大厅物件', true],
    ['ManualTextMapConfigData', '界面文字', true], ['TutorialDetail', '教程', true], ['GCGCard', '七圣召唤·卡牌', true],
    ['GCGDeckCard', '七圣召唤·牌组', true], ['BeyondCostume', '千星奇域·装扮', true], ['BeyondCostumeSuit', '千星奇域·套装', true],
    ['BeyondCostumeDrawing', '千星奇域·图样', true], ['BydMaterial', '千星奇域·物品', true],
  ];
  const fileOf = (n) => [`${n}ExcelConfigData.json`, `${n}.json`].find((f) => fs.existsSync(path.join(A, 'ExcelBinOutput', f)));
  for (const [name, title, mixed] of TABLES) {
    const f = fileOf(name);
    if (!f) throw new Error(`找不到设定表 ${name}`);
    const seenRow = new Set();
    const rows = [];
    for (const row of J(`ExcelBinOutput/${f}`)) {
      const texts = [];
      const walk = (o, k) => {
        if (Array.isArray(o)) { o.forEach((v) => walk(v, k)); return; }
        if (o && typeof o === 'object') { Object.entries(o).forEach(([kk, v]) => walk(v, kk)); return; }
        if ((typeof o === 'number' || typeof o === 'string') && o !== '' && tm[o]) { const t = T(o); if (t && !texts.some((x) => x[1] === t)) texts.push([k, t, o]); }
      };
      walk(row, '');
      const label = texts.find(([k, t]) => /name|title|speaker/i.test(k) && t.length <= 30 && !t.includes('\n'));
      // 带参数占位的句子（“您抵达了第{0}层”）是系统模板，哪张表都不收
      const body = texts.filter((x) => x !== label).filter(([, t]) => !PLACEHOLDER.test(t) && (!mixed || prose(t)));
      if (!body.length) continue;
      const key = body.map((x) => x[1]).join('\n');
      if (seenRow.has(key)) continue; // 同一段文字挂在多行上
      seenRow.add(key);
      // 一行的几个字段拼成一段中文；英文按字段各自查
      rows.push([label?.[1] || '', body.map((x) => x[1]).join('\n'), [...(label ? [label[2]] : []), ...body.map((x) => x[2])], body.flatMap(([, t]) => enLines(t, label?.[1] || ''))]);
    }
    const chunks = [];
    for (let i = 0; i < rows.length; i += 400) chunks.push(rows.slice(i, i + 400));
    chunks.forEach((chunk, ci) => add({ id: `misc/t-${name.toLowerCase()}${chunks.length > 1 ? `-${ci + 1}` : ''}`, type: 'misc', title: chunks.length > 1 ? `${title}（${ci + 1}/${chunks.length}）` : title, group: '设定表', path: `ExcelBinOutput/${f}`, first: chunk.every((r) => isNew(r[2])) ? 'new' : 'old', lines: chunk.flatMap(([n, d, , en]) => split(d, n, en)) }));
  }
}

// ── 写出：按类型分片压缩 ──
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const parts = [];
let cur = [], size = 0;
const flush = () => { if (!cur.length) return; const name = `part-${String(parts.length + 1).padStart(2, '0')}.json.gz`; fs.writeFileSync(path.join(outDir, name), zlib.gzipSync(JSON.stringify(cur), { level: 9 })); parts.push(name); cur = []; size = 0; };
for (const e of entries) { const s = JSON.stringify(e).length; if (size + s > 14e6) flush(); cur.push(e); size += s; }
flush();
const uniq = new Map();
for (const t of terms) { const k = `${t[0]}|${t[1]}`; if (!uniq.has(k) && t[2]) uniq.set(k, t); }
fs.writeFileSync(path.join(outDir, 'terms.json.gz'), zlib.gzipSync(JSON.stringify([...uniq.values()]), { level: 9 }));
const byT = {};
entries.forEach((e) => { byT[e.type] = (byT[e.type] || 0) + 1; });
const chars = entries.reduce((a, e) => a + e.lines.reduce((b, l) => b + l[1].length, 0), 0);
const withEn = entries.filter((e) => e.en).length;
const enChars = entries.reduce((a, e) => a + (e.en || []).reduce((b, l) => b + l[1].length, 0), 0);
fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify({ parts, entries: entries.length, new: entries.filter((e) => e.first === 'new').length, chars, withEn, enChars, terms: uniq.size, byType: byT }, null, 1)}\n`);
console.log(`英文：${withEn} 篇有英文，${(enChars / 1e6).toFixed(1)} 百万字符`);
console.log(`全量语料：${entries.length} 篇，${(chars / 1e6).toFixed(1)} 百万字，本版本新增 ${entries.filter((e) => e.first === 'new').length} 篇；名词 ${uniq.size} 个；${parts.length} 个分片`);
console.log(byT);
