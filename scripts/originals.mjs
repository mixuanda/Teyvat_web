// 从固定版本语料（DimbreathBot/AnimeGameData）取回每条引证所在的完整原文。
// 每篇原文一个条目：短链 id、类型、可用语言的全文、首见版本（与上一版本快照对比）。
// 下载内容缓存在 .cache/corpus/（不入库）；结果写入 content/sources.json。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cacheRoot = path.join(root, '.cache', 'corpus');

export const TYPES = {
  book: '书籍与文书', relic: '圣遗物故事', weapon: '武器故事', story: '角色故事', voice: '角色语音',
  aq: '魔神任务', lq: '传说任务', wq: '世界任务', iq: '委托任务', eq: '活动任务', coop: '邀约事件', cutscene: '过场字幕',
  quest: '任务对白', npc: 'NPC 对白', event: '活动对白', talk: '其他对白', item: '物品与图鉴', misc: '其他资料',
};

export async function resolveOriginals(evidence, commit, prevCommit) {
  const BLOB = `https://github.com/DimbreathBot/AnimeGameData/blob/${commit}/`;
  const fetchFile = async (p, at = commit) => {
    const local = path.join(cacheRoot, at === commit ? '' : `@${at.slice(0, 8)}`, p);
    if (fs.existsSync(`${local}.404`)) return null;
    if (!fs.existsSync(local)) {
      fs.mkdirSync(path.dirname(local), { recursive: true });
      let lastErr;
      for (let i = 0; i < 4; i++) {
        try {
          const r = await fetch(`https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/${at}/${p.split('/').map(encodeURIComponent).join('/')}`);
          if (r.status === 404) { fs.writeFileSync(`${local}.404`, ''); return null; }
          if (!r.ok) throw new Error(`${r.status} ${p}`);
          fs.writeFileSync(local, Buffer.from(await r.arrayBuffer()));
          lastErr = null;
          break;
        } catch (e) { lastErr = e; await new Promise((s) => setTimeout(s, 1500 * (i + 1))); }
      }
      if (lastErr) throw lastErr;
    }
    return fs.readFileSync(local, 'utf8');
  };
  const json = async (p, at) => { const t = await fetchFile(p, at); return t ? JSON.parse(t) : null; };

  const maps = {};
  const TM = async (lang, at = commit) => (maps[lang + at] ||= { ...(await json(`TextMap/TextMap${lang}.json`, at)), ...(await json(`TextMap/TextMap_Medium${lang}.json`, at)) });
  const prevTM = prevCommit ? await TM('CHS', prevCommit) : null;
  const clean = (s) => String(s ?? '')
    .replace(/\\n/g, '\n').replace(/<[^>]+>/g, '').replace(/\{NICKNAME\}/g, '旅行者')
    .replace(/\{M#([^}]*)\}\{F#([^}]*)\}/g, '$1/$2').replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, '$2/$1')
    .replace(/\{RUBY#\[[A-Z]\][^}]*\}/g, '').replace(/^#/, '').trim();
  const npcs = Object.fromEntries((await json('ExcelBinOutput/NpcExcelConfigData.json')).map((n) => [String(n.id), n.nameTextMapHash]));
  const splitLines = (text, who = '') => clean(text).split('\n').map((t) => t.trim()).filter(Boolean).map((t) => [who, t]);
  const TLANG = ['CHS', 'EN']; // 文本表类原文收录的语言
  const RLANG = ['CHS', 'EN', 'JP', 'KR']; // 可读文本收录的语言

  const sources = {};
  const links = {};
  const ensure = async (key, make) => { if (!(key in sources)) sources[key] = await make(); return sources[key]; };

  for (const e of evidence) {
    const paths = Array.isArray(e.source_path) ? e.source_path : e.source_path ? [e.source_path] : [];
    if (!paths.length) continue;
    const p = paths[0];
    const evLang = ['EN', 'JP', 'KR'].includes(e.language) ? e.language : 'CHS';
    let src = null;
    try {
      if (p.startsWith('Readable/')) {
        // 归一到中文文件名：Readable/EN/Book782_EN.txt → Book782
        const stems = paths.filter((x) => x.startsWith('Readable/')).map((x) => path.basename(x).replace(/(_(EN|JP|KR))?\.txt$/, ''));
        const stem = stems[0];
        src = await ensure(`R:${stems.join('+')}`, async () => {
          const langs = {};
          for (const L of RLANG) {
            const lines = [];
            for (const s of stems) {
              const t = await fetchFile(L === 'CHS' ? `Readable/CHS/${s}.txt` : `Readable/${L}/${s}_${L}.txt`);
              if (t == null) { lines.length = 0; break; }
              if (lines.length) lines.push(['', '＊']);
              lines.push(...splitLines(t));
            }
            if (lines.length) langs[L] = lines;
          }
          if (!Object.keys(langs).length) return null;
          const m = stem.match(/^([A-Za-z]+?)_?(\d+.*)$/) || [null, 'Misc', stem];
          const type = { Book: 'book', Relic: 'relic', Weapon: 'weapon' }[m[1]] || 'item';
          const first = prevCommit && (await fetchFile(`Readable/CHS/${stem}.txt`, prevCommit)) == null ? 'new' : 'old';
          return { type, sid: (type === 'item' ? stem : m[2]).toLowerCase(), path: `Readable/CHS/${stem}.txt`, langs, first };
        });
      } else if (p.startsWith('BinOutput/Talk/') || p.startsWith('BinOutput/CodexQuest/')) {
        const codex = p.startsWith('BinOutput/CodexQuest/');
        src = await ensure(`T:${p}`, async () => {
          const d = await json(p);
          if (!d) return null;
          const langs = {};
          let heading = '';
          const hashes = [];
          for (const L of TLANG) {
            const tm = await TM(L);
            const lines = [];
            if (codex) {
              if (!d.subQuests) return null;
              if (L === 'CHS') heading = [d.chapterTitle?.textId, d.mainQuestTitle?.textId].map((h) => h && tm[h]).filter(Boolean).map(clean).join(' · ');
              for (const s of d.subQuests) {
                const before = lines.length;
                const st = s.subQuestTitle?.textId && tm[s.subQuestTitle.textId];
                if (st) lines.push(['', `＊ ${clean(st)}`]);
                for (const it of s.items || []) {
                  const who = it.speakerText?.textId ? clean(tm[it.speakerText.textId] || '') : '';
                  const walk = (o, k) => {
                    if (!o || typeof o !== 'object' || k === 'speakerText') return;
                    if (o.textId && tm[o.textId]) { hashes.push(o.textId); lines.push(...splitLines(tm[o.textId], who)); return; }
                    for (const [kk, v] of Object.entries(o)) walk(v, kk);
                  };
                  walk(it, '');
                }
                if (st && lines.length === before + 1) lines.pop();
              }
            } else {
              if (!d.dialogList) return null;
              for (const dl of d.dialogList) {
                const text = tm[dl.talkContentTextMapHash];
                if (!text) continue;
                hashes.push(dl.talkContentTextMapHash);
                const role = dl.talkRole || {};
                let who = '';
                if (dl.talkRoleNameTextMapHash && tm[dl.talkRoleNameTextMapHash]) who = clean(tm[dl.talkRoleNameTextMapHash]);
                else if (role.type === 'TALK_ROLE_PLAYER') who = L === 'EN' ? 'Traveler' : '旅行者';
                else if (role.type === 'TALK_ROLE_NPC' && npcs[role.id ?? role._id]) who = clean(tm[npcs[role.id ?? role._id]] || '');
                lines.push(...splitLines(text, who));
              }
            }
            if (lines.length) langs[L] = lines;
          }
          if (!Object.keys(langs).length) return null;
          const seg = p.split('/')[2];
          const type = codex ? 'quest' : { Quest: 'quest', Npc: 'npc', Activity: 'event' }[seg] || 'talk';
          const first = prevTM && !hashes.some((h) => prevTM[h]) ? 'new' : 'old';
          return { type, sid: (codex ? 'c' : '') + path.basename(p, '.json'), path: p, heading, langs, first };
        });
      } else if (p.startsWith('ExcelBinOutput/')) {
        const hashes = (e.text_hashes?.length ? e.text_hashes : [e.text_hash]).filter(Boolean).map(String);
        if (hashes.length) {
          src = await ensure(`X:${p}#${hashes[0]}`, async () => {
            const langs = {};
            for (const L of TLANG) {
              const tm = await TM(L);
              const lines = [];
              for (const h of hashes) if (tm[h]) { if (lines.length) lines.push(['', '＊']); lines.push(...splitLines(tm[h])); }
              if (lines.length) langs[L] = lines;
            }
            if (!Object.keys(langs).length) return null;
            const file = path.basename(p);
            const type = file.startsWith('FetterStory') ? 'story' : file.startsWith('Fetters') ? 'voice' : /Material|Codex|Furniture|Costume/.test(file) ? 'item' : 'misc';
            const first = prevTM && !hashes.some((h) => prevTM[h]) ? 'new' : 'old';
            return { type, sid: hashes[0], path: p, langs, first };
          });
        }
      }
    } catch (err) { console.warn(`原文取回失败 ${e.id}: ${err.message}`); }
    if (!src) continue;
    src.title ||= e.source_title;
    src.url ||= BLOB + src.path;
    (src.evidence ||= []).push(e.id);
    const frags = e.quote ? [e.quote] : (e.fragments || []).filter((f) => typeof f === 'string');
    const norm = (s) => s.replace(/\s+/g, '');
    // 先在引证所用语言里找，找不到再试其他语言
    const order = [evLang, ...Object.keys(src.langs).filter((l) => l !== evLang)].filter((l) => src.langs[l]);
    const hits = frags.map((f) => {
      for (const L of order) { const i = src.langs[L].findIndex((l) => norm(l[1]).includes(norm(f))); if (i >= 0) return [L, i]; }
      return null;
    });
    links[e.id] = { src, hits };
  }

  const list = Object.values(sources).filter((s) => s && s.evidence?.length);
  const seen = new Set();
  for (const s of list) {
    let id = `${s.type}/${s.sid}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    s.id = id;
    delete s.sid;
  }
  const out = Object.fromEntries(Object.entries(links).map(([id, v]) => [id, { src: v.src.id, hits: v.hits }]));
  const total = Object.values(out).reduce((a, v) => a + v.hits.length, 0);
  const found = Object.values(out).reduce((a, v) => a + v.hits.filter(Boolean).length, 0);
  console.log(`原文：${list.length} 篇（其中本版本新增 ${list.filter((s) => s.first === 'new').length} 篇），覆盖 ${Object.keys(out).length}/${evidence.length} 条引证；引文定位 ${found}/${total}`);
  return { sources: list, links: out };
}
