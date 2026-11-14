# Pending review: 17 readables whose titles contain "(test)"

In the pinned 7.2 snapshot, 39 readables under `Readable/CHS/` have `(test)` in their title. The import script skips every entry with a development marker (see `TEST` in `scripts/corpus.mjs`). Of those 39, 22 are placeholder text, or the same text is already in the source library under its proper title (for example Book603 matches `book/602` 「某人的备忘」, Book671 matches `book/639` 「灵光碑文」, and Book236's text appears in quest dialogue).

The remaining 17 read like real content, but there is no way to confirm they were ever released in the game, so they are **not included for now**. Once evidence of release turns up, add them to the source library one by one.

| File | Document id | Title in the data | Body length (characters) | Content |
| --- | --- | --- | --- | --- |
| Book571 | 120260 | (test)提纳里的来信 (letter from Tighnari) | 200 | On "a flower that does not exist in the world" |
| Book572 | 120261 | (test)阿贝多的来信 (letter from Albedo) | 155 | Same theme |
| Book573 | 120262 | (test)砂糖的来信 (letter from Sucrose) | 156 | Same theme |
| Book574 | 120263 | (test)丽莎的来信 (letter from Lisa) | 100 | On "a legend that never ends" |
| Book575 | 120264 | (test)可莉的来信 (letter from Klee) | 46 | Same theme |
| Book576 | 120265 | (test)柯莱的来信 (letter from Collei) | 93 | Same theme |
| Book577 | 120266 | (test)莫娜的来信 (letter from Mona) | 114 | On "guiding others" |
| Book578 | 120267 | (test)班尼特的来信 (letter from Bennett) | 156 | Same theme |
| Book579 | 120268 | (test)安柏的来信 (letter from Amber) | 249 | Same theme |
| Book580 | 120269 | (test)米卡的来信 (letter from Mika) | 202 | Same theme |
| Book581 | 120270 | (test)赛诺的来信 (letter from Cyno) | 117 | On "not lying" |
| Book582 | 120271 | (test)罗莎莉亚的来信 (letter from Rosaria) | 289 | Same theme |
| Book583 | 120272 | (test)雷泽的来信 (letter from Razor) | 56 | Same theme |
| Book367 | 101761 | (test)方碑解谜笔记文本·其三 (obelisk puzzle notes, part 3) | 47 | Puzzle notes |
| Book369 | 101762 | (test)方碑解谜笔记文本·其四 (obelisk puzzle notes, part 4) | 28 | Same |
| Book370 | 101763 | (test)方碑解谜笔记文本·其五 (obelisk puzzle notes, part 5) | 20 | Same |
| Book1059 | 121249 | (test)书信 (letter) | 48 | A camp and a mascot |

Body length counts the text after removing the `(test)` placeholder lines.

## What counts as "released"

As with the exception clause of the release gate, record one piece of evidence per readable:

- a dated screenshot or recording of the text being readable in the game; or
- an official announcement or event page that mentions the event or quest it belongs to.

Once confirmed, allow the file in `scripts/corpus.mjs`, drop `(test)` from its title, and re-import. Readables without evidence stay out.
