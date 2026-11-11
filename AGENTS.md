# 给接手这个仓库的代理（Codex 等）

这是「提瓦特考据」网站：一个**纯静态站**，没有框架、没有服务端、没有环境变量、没有密钥。

## 一句话任务：部署到 Vercel

仓库里已经有 `vercel.json`，不需要改任何代码。

1. 在 Vercel 新建项目，导入 GitHub 仓库 `mixuanda/Teyvat_web`，生产分支选 `main`。
2. Framework Preset 选 **Other**。其余设置留空，`vercel.json` 会接管：
   - Install Command：`npm ci`
   - Build Command：`npm run build`
   - Output Directory：`dist`
   - Node.js：22（`package.json` 的 `engines` 已声明）
3. 部署。完成后按下面的清单验收。

用命令行的话：

```bash
npm i -g vercel
vercel link
vercel --prod
```

## 验收清单

部署后逐条打开确认（把 `<域名>` 换成实际域名）：

- `https://<域名>/` → 第一次访问会跳到 `/gate/`（进度选择）。选一篇后点“进入星图”，能看到星图，点星有反应。
- `https://<域名>/q/moon/` → 进度选“挪德卡莱”或更后时显示完整内容，选“蒙德”时显示“还在迷雾里”。
- `https://<域名>/study/` → 浅色的考据层首页；页头搜索框输入“日月前事”能出结果；点结果下方的“搜全文”能继续在正文里搜。
- `https://<域名>/t/` → 原文库显示约 9,700 篇，可以筛选和翻页；`https://<域名>/terms/` → 名词索引能载入。
- `https://<域名>/t/book/333`（**不带**结尾斜杠）→ 应当自动跳到 `/t/book/333/`。这一条很重要：站内全部是相对链接，靠结尾斜杠定位。
- `https://<域名>/不存在的页面` → 显示站内的 404 页。
- 浏览器控制台没有报错，没有 404 的资源请求。

## 体量

构建产物约 1 万个文件、230 MB，构建本身只要几秒。这是正常的：原文库收了全部简体中文文本，每篇一页。

## 不要做的事

- **不要运行 `npm run sync` 和 `node scripts/corpus.mjs`。** 它要从另一个私有的研究仓库和外部语料库取数据，Vercel 上没有这些；需要的内容已经提交在 `content/` 里。
- 不要把 `trailingSlash` 改成 `false`，不要打开 `cleanUrls`。
- 不要给站点加分析脚本、评论系统或任何会把访问者信息发到第三方的东西，除非仓库所有者明确要求。
- 不要改 `content/curated/` 里的内容；那是人工核对过的。

## 本地命令

```bash
npm ci
npm test      # 构建 + 引文核对 + 全站链接检查，必须通过
npm run dev   # http://localhost:4173
```

构建失败时先看报错：`引文核验未通过` 说明 `content/curated/` 里有引文和原文对不上，`发现 N 个坏链接` 说明模板生成了指向不存在页面或锚点的链接。两者都是内容或模板问题，不是部署问题。

## 仓库结构

```
content/            内容快照（已提交，构建只读它）
content/curated/    手写内容：星图（star.json）、专题（topics.json）、进度规则（gates.json）
scripts/build.mjs   生成整站 → dist/
scripts/check.mjs   链接与锚点检查
src/                样式与前端脚本
vercel.json         Vercel 配置
.github/workflows/  CI（每个 PR 和 main 推送都跑 npm test）
```

更多说明见 `README.md`。
