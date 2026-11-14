# For agents taking over this repository (Codex and others)

This is the 「提瓦特考据」 (Teyvat Lore Research) website: a **purely static site** with no framework, no server, no environment variables and no secrets.

## The one-line task: deploy to Vercel

The repository already has a `vercel.json`, so no code changes are needed.

1. Create a new Vercel project, import the GitHub repository `mixuanda/Teyvat_web`, and choose `main` as the production branch.
2. Set Framework Preset to **Other**. Leave everything else empty; `vercel.json` takes over:
   - Install Command: `npm ci`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Node.js: 22 (declared in `engines` in `package.json`)
3. Deploy. When it finishes, go through the acceptance checklist below.

From the command line:

```bash
npm i -g vercel
vercel link
vercel --prod
```

## Acceptance checklist

After deploying, open each of these and confirm (replace `<domain>` with the real domain):

- `https://<domain>/` → the first visit redirects to `/gate/` (progress picker). Pick a chapter and click 「进入星图」 (Enter the star chart); the star chart appears and clicking a star responds.
- `https://<domain>/q/moon/` → with progress set to 「挪德卡莱」 (Nod-Krai) or later it shows the full content; with 「蒙德」 (Mondstadt) it shows 「还在迷雾里」 (still in the fog).
- `https://<domain>/study/` → the light-themed research-layer home page. Typing 「日月前事」 into the header search box returns results, and clicking 「搜全文」 (search full text) under the results continues the search in the body text.
- `https://<domain>/t/` → the source library shows about 12,000 texts and can be filtered and paged; `https://<domain>/terms/` → the term index loads.
- `https://<domain>/t/book/333` (**without** the trailing slash) → should redirect to `/t/book/333/`. This one matters: every link on the site is relative and relies on the trailing slash.
- `https://<domain>/a-page-that-does-not-exist` → shows the site's own 404 page.
- No errors in the browser console and no resource requests returning 404.

## Size

The build output is about 13,000 files and 285 MB, and the build itself takes only a dozen seconds or so. This is expected: the source library contains every Simplified Chinese text, one page each.

## Do not

- **Do not run `npm run sync`, `node scripts/corpus.mjs` or `node scripts/appendix.mjs`.** They pull data from a separate private research repository and an external corpus, neither of which exists on Vercel. Everything needed is already committed under `content/`.
- Do not set `trailingSlash` to `false`, and do not turn on `cleanUrls`.
- Do not add analytics scripts, comment systems or anything else that sends visitor information to a third party, unless the repository owner explicitly asks for it.
- Do not change anything in `content/curated/`; it has been checked by hand.

## Local commands

```bash
npm ci
npm test      # build + citation check + site-wide link check; must pass
npm run dev   # http://localhost:4173
```

When the build fails, read the error first. `引文核验未通过` (citation check failed) means a quotation in `content/curated/` does not match the source text. `发现 N 个坏链接` (N broken links found) means a template generated a link to a page or anchor that does not exist. Both are content or template problems, not deployment problems.

## Repository layout

```
content/            content snapshot (committed; the build reads only this)
content/curated/    hand-written content: star chart (star.json), topics (topics.json), progress rules (gates.json)
scripts/build.mjs   generates the whole site → dist/
scripts/check.mjs   link and anchor check
src/                styles and front-end scripts
vercel.json         Vercel configuration
.github/workflows/  CI (runs npm test on every PR and every push to main)
```

See `README.md` for more.
