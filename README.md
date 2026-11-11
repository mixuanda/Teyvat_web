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
- **上线门**：`sync` 把每篇原文与上一版本（7.1）的语料快照对比。上一版本里没有的算作本版本新增，标为“待确认”，原文页不显示正文。

## 发布

`.github/workflows/site.yml` 在每个 PR 和每次推送到 `main` 时构建并检查。要发布到 GitHub Pages：在仓库 Settings → Pages 把 Source 设为 GitHub Actions，再把仓库变量 `DEPLOY_PAGES` 设为 `true`（或手动运行一次该工作流）。站内链接全部是相对路径，放在子目录下也能用。

## 写星图内容

星的 `x`、`y` 是画布坐标，按地区成簇摆放；画面会自动框住当前显示的星。关系和步骤可以不写 `quote`，构建时取所挂引证的第一条原文片段。

`star.json` 里每颗星、每条关系、每个问题、每一步都有 `gate`：看到它所需的主线进度（`stages` 的下标）。关系的实际进度取两端的星和关系自身三者中最晚的一个。进度只存在访问者自己的浏览器里。

## 结构

```
content/   内容快照与手写内容
scripts/   sync.mjs 同步 · originals.mjs 取回原文 · build.mjs 生成 · diagrams.mjs 结构图 · serve.mjs 预览
src/       样式与前端脚本（无框架）
dist/      构建产物（纯静态）
```

## 声明

玩家的非营利研究项目，与米哈游及 HoYoverse 无关。游戏文本与图像的权利归权利人所有。
