# 提瓦特考据

《原神》文本的研究与存档网站。两层：

- **星图（玩家版，首页）**：先选主线进度，之后的剧情藏在迷雾里。从一个问题出发，星是人物、事件和地方，连线是它们之间的关系；每条关系标明事实／推断／假说，并挂着游戏里的原文。每个问题另有一页分步讲解。
- **考据层**：原文库（按类型存放的全文，每篇有固定短链和段落锚点）、专题（一页回答一个问题）、年表、假说、研究全文与引证。

研究本身（LaTeX 长稿、证据、年表、图像）在独立的研究仓库里维护；这个仓库只负责把它变成网站。

## 开发

```bash
npm install
npm run build     # content/ + src/ → dist/
npm run dev       # 构建并在 http://localhost:4173 预览
```

提交前跑一遍检查（构建 + 引文核验 + 全站链接）：

```bash
npm test
```

研究稿更新后，重新同步内容快照（需要联网）：

```bash
RESEARCH_DIR=../teyvat-research npm run sync
npm run build
```

## 内容从哪里来

| 位置 | 内容 | 来源 |
| --- | --- | --- |
| `content/curated/star.json` | 星图的星、关系、问题与分步讲解 | 手写 |
| `content/curated/topics.json` | 专题 | 手写 |
| `content/sources.json` | 原文全文（书籍四语、对白与资料中英） | `sync` 从固定版本的 [DimbreathBot/AnimeGameData](https://github.com/DimbreathBot/AnimeGameData) 取回 |
| `content/` 其余文件 | 研究全文、引证、年表、图版 | `sync` 从研究仓库复制 |

## 两条规则，都在构建时执行

- **逐条核验**：手写内容里的每条引文，必须是所挂引证的原文片段。对不上，`npm run build` 直接失败。
- **上线门**：导入时把每篇原文与上一版本（7.1）的语料快照对比，上一版本里没有的算作本版本新增。本版本还没确认开放时，这些文本标为“待确认”、不显示正文；确认开放后把版本号写进 `content/curated/release.json` 的 `confirmed`，它们就正常显示。7.2 已确认开放。

## 发布

`.github/workflows/site.yml` 在每个 PR 和每次推送到 `main` 时构建并检查。要发布到 GitHub Pages：在仓库 Settings → Pages 把 Source 设为 GitHub Actions，再把仓库变量 `DEPLOY_PAGES` 设为 `true`（或手动运行一次该工作流）。站内链接全部是相对路径，放在子目录下也能用。

## 全量语料

原文库收的是固定版本里全部面向玩家的简体中文文本（约 11,800 篇、1,500 万字，另有研究引用的 507 篇）：

- 书籍与文书、圣遗物和武器故事、角色故事（含剧情推进后换上的另一版）与语音、角色资料；
- 任务：有旅行日志的用日志，再补上日志里没有的分支对白、任务文件里直接写的对白、日志简介和每一步的说明与提示；没有日志的用对白文件拼。游戏里不显示题名的隐藏任务（内部名常带 `(test)`，台词是正式上线的）记作“（隐藏任务）……”；
- 邀约事件（`coop/`，一个邀约一篇）、过场字幕（`cutscene/`，Subtitle/CHS）、其余对白（按说话的 NPC 归拢；故事板、绽放事件、过场对白另行编号）；
- 物品、武器、圣遗物、摆设、生物志、地理志、成就、加载提示的说明，以及设定表里的叙事文字（提醒语、活动简介、秘境、地脉首领、邮件、委托、初见介绍、逸闻、深境螺旋题记、七圣召唤牌手与对白等，见 `scripts/corpus.mjs` 的 `TABLES`）。手册、教程、卡牌、千星奇域装扮这类混杂表只收成句的文字。

不收的是系统文本：技能与天赋数值、装备词条、按钮与标签、带参数占位的模板句、编辑器资源名，以及带开发标记的条目（`(test)`、`$UNRELEASED`、`test用`、以 test 开头的占位行、`NPC动作测试`、`（废弃）` 等；“测试！「暝导游船」！”“一把被废弃的刀”这类正式名字照收）。

压缩后的快照在 `content/corpus/`，构建只读它。已发布的短链在重新导入时保持不变：新类别各用自己的编号，补进旧篇目的内容一律接在原有段落之后。

重新导入要先取固定版本和上一版本（7.1，`c5ef717b77418e5a23234e990e7c0d3a829975ae`，用来判断“本版本新增”）的数据：

```bash
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/DimbreathBot/AnimeGameData .cache/agd-work
cd .cache/agd-work
git fetch --depth 1 origin d7f2135c7eb0052e842e0f187f4e5bb88c304737 && git checkout FETCH_HEAD
git sparse-checkout set TextMap/TextMapCHS.json TextMap/TextMap_MediumCHS.json Readable/CHS ExcelBinOutput \
  BinOutput/Quest BinOutput/CodexQuest BinOutput/Talk Subtitle/CHS
PREV=c5ef717b77418e5a23234e990e7c0d3a829975ae
git fetch --depth 1 origin $PREV
mkdir -p ../corpus/TextMap ../corpus/@$PREV/TextMap
cp TextMap/TextMapCHS.json TextMap/TextMap_MediumCHS.json ../corpus/TextMap/
for f in TextMapCHS TextMap_MediumCHS; do git show $PREV:TextMap/$f.json > ../corpus/@$PREV/TextMap/$f.json; done
git ls-tree -r --name-only $PREV > ../tree71.txt
cd ../.. && node --max-old-space-size=8000 scripts/corpus.mjs
```

研究稿里只在 PDF 出现的附录（全量语料与复核记录、图像来源与版面处理目录、大事记表头说明）由 `scripts/appendix.mjs` 从 LaTeX 转成 `content/appendix.json`：

```bash
RESEARCH_DIR=../teyvat-research node scripts/appendix.mjs
```

## 研究全文 PDF

研究稿的 PDF（约 300 页、45 MB）不进仓库。要提供下载时，把它挂在 GitHub Release 上（例如标签 `research-pdf-v10`），网站的“专题”页只放下载链接；目前还没有建 Release，所以专题页暂不显示下载链接。它在研究仓库里用 `compile.sh` 编译。建好 Release 后，把标签填进 `scripts/build.mjs` 开头的 `PDF_RELEASE`（留空就不显示链接），出新版时同样换标签和 `pdfMB`。

全文检索的数据按约 1.5 MB 一片放在 `dist/data/ft/`，只有访问者点“搜全文”时才逐片下载。

## 星图的内容是怎么来的

- **星、关系、问题**手写在 `content/curated/star.json`。每条关系和每一步都挂一条引证，页面上显示的是引文所在的原文那一行（对白带上一句和下一句）。
- **每颗星的“经历”**是自动的：年表里凡是提到这颗星（按 `aliases` 里的名字匹配）的事件，都会列进它的档案页。事件正文里恰好提到两颗星、而这两颗星还没有手写关系时，自动连一条线。
- **主线进度**按出处的任务名和地区判定，规则在 `content/curated/gates.json`，从上到下匹配出处题名；本版本新增的出处一律算最后一篇。改规则不用动代码。

## 写星图内容

星的 `x`、`y` 是画布坐标，按地区成簇摆放；画面会自动框住当前显示的星。关系和步骤可以不写 `quote`，构建时取所挂引证的第一条原文片段。

`star.json` 里每颗星、每条关系、每个问题、每一步都有 `gate`：看到它所需的主线进度（`stages` 的下标）。关系的实际进度取两端的星和关系自身三者中最晚的一个。进度只存在访问者自己的浏览器里。

## 结构

```
content/   内容快照与手写内容
scripts/   sync.mjs 同步 · originals.mjs 取回原文 · corpus.mjs 全量语料 · appendix.mjs 附录 · build.mjs 生成 · diagrams.mjs 结构图 · serve.mjs 预览
src/       样式与前端脚本（无框架）
dist/      构建产物（纯静态）
```

## 声明

玩家的非营利研究项目，与米哈游及 HoYoverse 无关。游戏文本与图像的权利归权利人所有。
