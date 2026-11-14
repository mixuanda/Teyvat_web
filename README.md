# 提瓦特考据 (Teyvat Lore Research)

A research and archive website for the text of *Genshin Impact*. It has two layers:

- **Star chart (player view, the home page):** pick your main-story progress first; story beyond that point stays hidden in the fog. You start from a question. Stars are characters, events and places, and the lines between them are their relationships. Each relationship is labelled as fact, inference or hypothesis, and carries the original in-game text. Each question also has a step-by-step explanation page.
- **Research layer:** the source library (full texts stored by type, each with a fixed short link and paragraph anchors), topics (one page answers one question), a timeline, hypotheses, and the full research text with citations.

The research itself (the long LaTeX manuscript, evidence, timeline, images) is maintained in a separate research repository; this repository only turns it into a website.

## Development

```bash
npm install
npm run build     # content/ + src/ → dist/
npm run dev       # build and preview at http://localhost:4173
```

Run the checks before committing (build + citation check + site-wide links):

```bash
npm test
```

After the research manuscript changes, re-sync the content snapshot (needs network access):

```bash
RESEARCH_DIR=../teyvat-research npm run sync
npm run build
```

## Where the content comes from

| Location | Content | Source |
| --- | --- | --- |
| `content/curated/star.json` | Star chart stars, relationships, questions and step-by-step explanations | Hand-written |
| `content/curated/topics.json` | Topics | Hand-written |
| `content/sources.json` | Full source texts (books in four languages; dialogue and profiles in Chinese and English) | Fetched by `sync` from a pinned commit of [DimbreathBot/AnimeGameData](https://github.com/DimbreathBot/AnimeGameData) |
| Everything else in `content/` | Full research text, citations, timeline, plates | Copied by `sync` from the research repository |

## Two rules, both enforced at build time

- **Every quotation is checked:** each quotation in the hand-written content must be a fragment of the source text of the citation it is attached to. If one doesn't match, `npm run build` fails.
- **Release gate:** on import, every source text is compared with the corpus snapshot of the previous version (7.1); anything not present in the previous version counts as new in this version. Until this version is confirmed as released, those texts are marked 「待确认」 (pending confirmation) and their body is hidden. Once it is confirmed, add the version number to `confirmed` in `content/curated/release.json` and they display normally. 7.2 is confirmed as released.

## Publishing

`.github/workflows/site.yml` builds and checks on every PR and every push to `main`. To publish to GitHub Pages: in the repository's Settings → Pages, set Source to GitHub Actions, then set the repository variable `DEPLOY_PAGES` to `true` (or run the workflow once by hand). All links on the site are relative, so it also works from a subdirectory.

## Full corpus

The source library contains every player-facing Simplified Chinese text in the pinned version (about 11,800 texts and 15 million characters, plus 507 texts cited by the research):

- Books and documents, artifact and weapon stories, character stories (including the alternate versions that replace them as the story progresses) and voice lines, and character profiles;
- Quests: where a quest has a travel log, the log is used, supplemented with branch dialogue missing from the log, dialogue written directly in the quest file, the log summary, and each step's description and hints; quests without a log are assembled from the dialogue files. Hidden quests whose title the game never shows (their internal names often carry `(test)`, but their lines were released) are recorded as 「（隐藏任务）……」 (hidden quest);
- Hangout events (`coop/`, one text per hangout), cutscene subtitles (`cutscene/`, Subtitle/CHS), and other dialogue (grouped by the speaking NPC; storyboards, bloom events and cutscene dialogue are numbered separately);
- Descriptions of items, weapons, artifacts, furnishings, the living-beings archive, the geography archive, achievements and loading tips, plus the narrative text in the data tables (reminders, event summaries, domains, ley line bosses, mail, commissions, first-encounter introductions, anecdotes, Spiral Abyss epigraphs, Genius Invokation TCG players and dialogue, and so on; see `TABLES` in `scripts/corpus.mjs`). From mixed tables such as the handbook, tutorials, cards and Miliastra Wonderland cosmetics, only full sentences are kept.

System text is left out: skill and talent values, equipment stats, buttons and labels, template sentences with parameter placeholders, editor asset names, and entries with development markers (`(test)`, `$UNRELEASED`, `test用`, placeholder lines starting with test, `NPC动作测试`, `（废弃）` and so on; proper names such as 「测试！「暝导游船」！」 and 「一把被废弃的刀」 are still kept).

The compressed snapshot lives in `content/corpus/`, and the build reads only that. Published short links stay the same across re-imports: new categories each get their own numbering, and content added to an existing text is always appended after its existing paragraphs.

Re-importing first needs the data for the pinned version and the previous version (7.1, `c5ef717b77418e5a23234e990e7c0d3a829975ae`, used to decide what is "new in this version"):

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

The appendices that appear only in the research PDF (the full-corpus and review record, the catalogue of image sources and layout treatment, and the notes on the chronicle table headings) are converted from LaTeX into `content/appendix.json` by `scripts/appendix.mjs`:

```bash
RESEARCH_DIR=../teyvat-research node scripts/appendix.mjs
```

## Full research PDF

The research PDF (about 300 pages, 45 MB) is not in the repository. When it should be downloadable, attach it to a GitHub Release (for example with the tag `research-pdf-v10`); the site's Topics page then only links to it. No Release exists yet, so the Topics page currently shows no download link. The PDF is compiled in the research repository with `compile.sh`. Once the Release exists, put its tag in `PDF_RELEASE` at the top of `scripts/build.mjs` (leave it empty to hide the link); for each new edition, change the tag and `pdfMB` the same way.

The full-text search data is split into pieces of about 1.5 MB in `dist/data/ft/`, and pieces are downloaded one at a time only when a visitor clicks 「搜全文」 (search full text).

## How the star chart content is made

- **Stars, relationships and questions** are hand-written in `content/curated/star.json`. Every relationship and every step carries a citation, and the page shows the source line the quotation comes from (for dialogue, with the line before and after).
- **Each star's history** is automatic: every timeline event that mentions the star (matched against the names in `aliases`) is listed on its profile page. When an event's text mentions exactly two stars that have no hand-written relationship yet, a line between them is added automatically.
- **Main-story progress** is decided by the quest name and region of each source. The rules are in `content/curated/gates.json` and are matched against source titles from top to bottom; sources new in this version always count as the last chapter. Changing the rules needs no code change.

## Writing star chart content

A star's `x` and `y` are canvas coordinates, clustered by region; the view automatically frames the stars currently shown. Relationships and steps may omit `quote`; at build time they take the first source fragment of the attached citation.

Every star, relationship, question and step in `star.json` has a `gate`: the main-story progress needed to see it (an index into `stages`). A relationship's effective progress is the latest of its two stars and itself. Progress is stored only in the visitor's own browser.

## Layout

```
content/   content snapshot and hand-written content
scripts/   sync.mjs sync · originals.mjs fetch source texts · corpus.mjs full corpus · appendix.mjs appendices · build.mjs generate · diagrams.mjs structure diagrams · serve.mjs preview
src/       styles and front-end scripts (no framework)
dist/      build output (purely static)
```

## Disclaimer

A non-profit research project by players, not affiliated with miHoYo or HoYoverse. Rights to game text and images belong to their owners.
