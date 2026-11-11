// 从固定版本语料（DimbreathBot/AnimeGameData）取回每条引证所在的完整原文。
// 下载内容缓存在 .cache/corpus/（不入库）；结果写入 content/sources.json。
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cache = path.join(root, '.cache', 'corpus');

export async function resolveOriginals(evidence, commit) {
  const RAW = `https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/${commit}/`;
  const BLOB = `https://github.com/DimbreathBot/AnimeGameData/blob/${commit}/`;
  const fetchFile = async (p) => {
    const local = path.join(cache, p);
    if (!fs.existsSync(local)) {
      fs.mkdirSync(path.dirname(local), { recursive: true });
      let lastErr;
      for (let i = 0; i < 4; i++) {
        try {
          const r = await fetch(RAW + p.split('/').map(encodeURIComponent).join('/'));
          if (r.status === 404) { fs.writeFileSync(local + '.404', ''); return null; }
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
  const json = async (p) => { const t = await fetchFile(p); return t ? JSON.parse(t) : null; };

  // 文本表：普通 + Medium（长文本）
  const maps = {};
  const TM = async (lang) => (maps[lang] ||= { ...(await json(`TextMap/TextMap${lang}.json`)), ...(await json(`TextMap/TextMap_Medium${lang}.json`)) });
  const clean = (s) => String(s ?? '')
    .replace(/\\n/g, '\n').replace(/<[^>]+>/g, '').replace(/\{NICKNAME\}/g, '旅行者')
    .replace(/\{M#([^}]*)\}\{F#([^}]*)\}/g, '$1/$2').replace(/\{F#([^}]*)\}\{M#([^}]*)\}/g, '$2/$1')
    .replace(/\{RUBY#\[[A-Z]\][^}]*\}/g, '').replace(/^#/, '').trim();
  const npcs = Object.fromEntries((await json('ExcelBinOutput/NpcExcelConfigData.json')).map((n) => [String(n.id), n.nameTextMapHash]));

  const sources = {}; // key → source
  const out = {}; // evidence id → { src, hits }
  const ensure = async (key, make) => {
    if (!(key in sources)) sources[key] = await make();
    return sources[key];
  };
  const splitLines = (text, speaker = '') => clean(text).split('\n').map((t) => t.trim()).filter(Boolean).map((t) => [speaker, t]);

  for (const e of evidence) {
    const paths = Array.isArray(e.source_path) ? e.source_path : e.source_path ? [e.source_path] : [];
    if (!paths.length) continue;
    const p = paths[0];
    const lang = ['EN', 'JP', 'KR'].includes(e.language) ? e.language : 'CHS';
    let src = null;
    try {
      if (p.startsWith('Readable/')) {
        const files = paths.filter((x) => x.startsWith('Readable/'));
        src = await ensure(files.join('+'), async () => {
          const lines = [];
          for (const f of files) {
            const t = await fetchFile(f);
            if (t == null) return null;
            if (lines.length) lines.push(['', '＊']);
            lines.push(...splitLines(t));
          }
          return { kind: '书籍与可读文本', lang: (p.match(/^Readable\/(\w+)\//) || [])[1] || 'CHS', path: files[0], lines };
        });
      } else if (p.startsWith('BinOutput/Talk/')) {
        const tm = await TM(lang === 'EN' ? 'EN' : 'CHS');
        src = await ensure(`${p}@${lang === 'EN' ? 'EN' : 'CHS'}`, async () => {
          const d = await json(p);
          if (!d?.dialogList) return null;
          const lines = [];
          for (const dl of d.dialogList) {
            const text = tm[dl.talkContentTextMapHash];
            if (!text) continue;
            const role = dl.talkRole || {};
            let who = '';
            if (dl.talkRoleNameTextMapHash && tm[dl.talkRoleNameTextMapHash]) who = clean(tm[dl.talkRoleNameTextMapHash]);
            else if (role.type === 'TALK_ROLE_PLAYER') who = lang === 'EN' ? 'Traveler' : '旅行者';
            else if (role.type === 'TALK_ROLE_NPC' && npcs[role.id ?? role._id]) who = clean(tm[npcs[role.id ?? role._id]] || '');
            else if (role.type === 'TALK_ROLE_BLACK_SCREEN') who = '';
            lines.push(...splitLines(text, who));
          }
          return lines.length ? { kind: '对白与任务', lang: lang === 'EN' ? 'EN' : 'CHS', path: p, lines } : null;
        });
      } else if (p.startsWith('BinOutput/CodexQuest/')) {
        const tm = await TM(lang === 'EN' ? 'EN' : 'CHS');
        src = await ensure(`${p}@${lang === 'EN' ? 'EN' : 'CHS'}`, async () => {
          const d = await json(p);
          if (!d?.subQuests) return null;
          const lines = [];
          const heading = [d.chapterTitle?.textId, d.mainQuestTitle?.textId].map((h) => h && tm[h]).filter(Boolean).map(clean);
          for (const s of d.subQuests) {
            const before = lines.length;
            const st = s.subQuestTitle?.textId && tm[s.subQuestTitle.textId];
            if (st) lines.push(['', `＊ ${clean(st)}`]);
            for (const it of s.items || []) {
              const who = it.speakerText?.textId ? clean(tm[it.speakerText.textId] || '') : '';
              const walk = (o, k) => {
                if (!o || typeof o !== 'object' || k === 'speakerText') return;
                if (o.textId && tm[o.textId]) { lines.push(...splitLines(tm[o.textId], who)); return; }
                for (const [kk, v] of Object.entries(o)) walk(v, kk);
              };
              walk(it, '');
            }
            if (st && lines.length === before + 1) lines.pop();
          }
          return lines.length ? { kind: '对白与任务', lang: lang === 'EN' ? 'EN' : 'CHS', path: p, heading: heading.join(' · '), lines } : null;
        });
      } else if (p.startsWith('ExcelBinOutput/')) {
        const tm = await TM(lang === 'EN' ? 'EN' : 'CHS');
        const hashes = (e.text_hashes?.length ? e.text_hashes : [e.text_hash]).filter(Boolean).map(String);
        if (hashes.length) {
          src = await ensure(`${p}#${hashes[0]}@${lang === 'EN' ? 'EN' : 'CHS'}`, async () => {
            const lines = [];
            for (const h of hashes) { if (tm[h]) { if (lines.length) lines.push(['', '＊']); lines.push(...splitLines(tm[h])); } }
            return lines.length ? { kind: '角色、物品与资料', lang: lang === 'EN' ? 'EN' : 'CHS', path: p, lines } : null;
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
    out[e.id] = { src, hits: frags.map((f) => src.lines.findIndex((l) => norm(l[1]).includes(norm(f)))) };
  }

  // 编号并输出
  const list = Object.values(sources).filter((s) => s && s.evidence?.length);
  list.forEach((s, i) => { s.id = `t${String(i + 1).padStart(3, '0')}`; });
  const links = Object.fromEntries(Object.entries(out).map(([id, v]) => [id, { src: v.src.id, hits: v.hits }]));
  const total = Object.values(links).reduce((a, v) => a + v.hits.length, 0);
  const found = Object.values(links).reduce((a, v) => a + v.hits.filter((h) => h >= 0).length, 0);
  console.log(`原文：${list.length} 篇，覆盖 ${Object.keys(links).length}/${evidence.length} 条引证；引文定位 ${found}/${total}`);
  return { sources: list, links };
}
