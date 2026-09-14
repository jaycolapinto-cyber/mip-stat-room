# MIP Stat Room

Static site. No framework, no build step for the page itself — `dist/` is what
ships. Open it through any static server (ES modules need http, not file://).

    npm run serve      # http://127.0.0.1:8321
    npm run build      # regenerate dist/data.js from the sources
    npm test           # 1,408 checks across seven suites, plus `npm run test:page`

## What ships

| Path              | What it is |
|-------------------|------------|
| `dist/index.html` | Page shell, design system, controls |
| `dist/app.js`     | Rendering, selectors, comparison view, URL state |
| `dist/stats.js`   | All per-player calculations (`perspective`, `summarize`, `partners`, `pairGames`, `partnershipEdges`, `standings`, `recent`) |
| `dist/records.js` | Club-wide records for the home page, computed in the browser from the match list |
| `dist/data.js`    | GENERATED — the only file the importer writes |

Presentation never touches a source file, and the importer never touches
presentation. Every number on the page comes out of `stats.js`, so the totals in
one panel cannot disagree with another.

## Where the data comes from

Six sources, in descending order of how much we trust them.

**The match list has two spines, not one.** DUPR's record of this club begins
on 2026-01-30 - the day the club was created there, not the day the league
started. Everything before that was played and scored in Scoreholio and exists
nowhere else. So games dated before 2026-01-30 come from Scoreholio and ship
with an `sh:` id; everything after comes from DUPR. `verify.mjs` re-derives
both, independently, from their own sources.

1. **League ranking workbooks** (6 files) — full real names, complete standings
   as published. Canonical for identity.
2. **Head-to-head grid** — cumulative win/loss for every pair. Complete as
   published, but carries Scoreholio *display names*, not real names.
3. **"Added Games" sheet** — game-by-game detail for 169 of about 488 games on
   record. No dates, only a batch label.
4. **Scoreholio Match Log exports** (`importer/live/exports/Matchlog-<id>.xlsx`)
   — real timestamps, real court numbers and a stable Match ID per game, joined
   onto the batch games by signature. Preferred over a dashboard scrape: the
   dashboard's leftmost column looks like a court but is a display index, and
   reading it as one put courts 1, 2 and 3 on the site for games actually played
   on 6, 11 and 12.
5. **DUPR club readings** (`importer/live/dupr/YYYY-MM-DD.tsv`) — doubles
   ratings, one file per reading.
6. **DUPR match pastes** (`importer/live/dupr-matches/*.txt`) — the club match
   list copied as plain text. No court and no clock, but the only source that
   carries REAL NAMES, plus DUPR's own Match ID. Overlapping pastes are safe:
   duplicates are dropped on that id.

## Identity is the hard part

Scoreholio lets each player type their own display name, so the same person is
`Chase Gold` in one file and `Sal Farruggia` in another. Merrick has two Jeffs,
two Rizzis, two Farruggias and two Jonathans.

The rule throughout: **never guess.** `importer/resolve.mjs` reports an
ambiguous name rather than picking, `importer/suggest.mjs` requires surname
evidence before it will even propose a merge, and `importer/aliases.json` holds
only mappings a human confirmed. A wrong merge hands one player another player's
record, and nothing downstream would catch it.

**Scoreholio knew the answer all along.** Its organizer rosters carry
`playerFullName` beside `playerDisplay`, because it has to know who a player
really is in order to submit their results to DUPR. Every export this project
had ever pulled was the Match Log, which strips that out - so for months we
inferred names that could simply have been read. `scoreholioroster.mjs` reads
them now.

Resolution is **per tournament**, and that is not a detail. Scoreholio's own
rosters show `Michael S.` meaning Michael Spezio on 2025-11-21 and Michael
Scancarello on 2025-11-27 - and on 2025-12-04 both men played under it, so it
resolves to nobody and those 19 games are held back. A single global answer to
"who is Michael S." would have been wrong on half the nights and would have
handed one man a share of the other's record with nothing downstream to catch
it.

That harvest also confirmed thirteen aliases this project had derived the hard
way, from week-by-week win/loss fingerprints - `Chase Gold`, `BReady`, `Andy`,
`Juju`, `French Mike`, `Ron D.` and others. Two unrelated methods, same
answers.

Scoreholio also *abbreviates*: `Lauren G.`, `thomas P.`, `Laura, P`. Those are
not names any map holds, and the build used to give up on them — 46 handles and
543 games' worth. `resolve.mjs` exists for exactly this and is now wired into
the Scoreholio path. It refuses on ambiguity, so `Michael S.` stays unresolved
while the roster holds both a Scancarello and a Spezio, and `Danny M.` while it
holds both a Marino and a Miklin. Nine of the 46 fall on days DUPR also covers,
and all nine are confirmed there by games matching on all four players and both
scores — 79 games, none contradicted. The loosening is scoped to Scoreholio on
purpose: a DUPR name or a standings row is a full real name and should have to
match a full real name.

The 17 confirmed mappings were verified twice, independently:
`importer/checkmap.mjs` tested each against the workbook's own arithmetic
(18/18), and all 48 games of the Friday session then matched the workbook on
players and scores exactly (48/48).

## The importer

| Module | Job |
|--------|-----|
| `extract.mjs`  | Read the workbooks |
| `roster.mjs`   | Build one shared identity model |
| `resolve.mjs`  | Match an abbreviated name to exactly one player, or refuse |
| `suggest.mjs`  | Propose merges with evidence; never apply one |
| `scoreholio.mjs` | Read a Scoreholio Match Log export (.xlsx or .csv — they differ) |
| `sessions.mjs` | Join dated session sources to undated workbook games by signature |
| `dupr.mjs`     | Match the DUPR club listing; build rating history from dated readings |
| `duprpaste.mjs` | Turn a copied DUPR Ratings page into a dated snapshot (name, rating, **player id**, match count) |
| `scoreholioroster.mjs` | Read Scoreholio's own rosters - the one source that carries a player's REAL NAME beside their nickname |

**Two roster screens, and only one of them is complete.** The organizer modal's
Roster view leaves `playerFullName` blank for many players; the tournament
Admin screen's **Players/Teams** tab fills it in. Reading the wrong one is what
left "David A.", "Michael S.", "Ken K." and about fifty others unresolvable and
nearly turned into a night of asking Dave to identify people date by date. Both
files are read and merged, Players/Teams last so it wins.

A "full name" that merely echoes the display name ("Lauren G." -> "Lauren G")
is a BLANK, not a name, and is discarded. Keeping it would put a player called
"Lauren G" on the site alongside Lauren Glodny.
| `duprmatches.mjs` | Parse DUPR match-list pastes — real names and DUPR Match IDs |
| `csv.mjs`      | Import a CSV export, auto-detecting its columns — see `CSV-FORMAT.md` |
| `emit.mjs`     | Write `dist/data.js` |
| `verify.mjs`   | Re-read the sources independently and compare to what shipped |

`verify.mjs` is the safety net and it has earned its keep: it caught two
silently-merged players, a set of dangling standings references, and detailed
games exceeding the published grid. Run it after every build.

The Friday AM session is now confirmed three independent ways: the workbook's
own arithmetic, Scoreholio's export, and DUPR's list under real names. That
third check earned its keep immediately — it found the club's DUPR rating for
Sal Farruggia sitting on the wrong one of the two men with that name.

`scoreholio.test.mjs` is the known-answer test: it holds the same 48 games from
two independent sources and asserts they agree on players, scores and
timestamps — and that they *disagree* on the court column, which is how the
display-index mistake stays caught.

## Adding data

- **A new Scoreholio export**: drop `Matchlog-<id>.xlsx` or `.csv` in
  `importer/live/exports/`, add a row to `importer/live/sessions.json`, run
  `npm run build`. Both export buttons are understood: the .xlsx puts each
  side's score in its own column, the .csv puts both into each column as a
  range ("9 - 11" / "11 - 9"). The shape is detected per row and the two
  columns are checked against each other, because reading one as the other
  would give every game in the file a wrong score. Games are dated only where all four players and both scores
  match a workbook game exactly.
- **A new DUPR reading**: save the club listing as
  `importer/live/dupr/YYYY-MM-DD.tsv` and rebuild. See the README in that folder
  for why this is worth doing weekly.
- **A CSV export**: `node importer/csv.mjs file.csv` for a dry run that reports
  what it found and what it refused. Nothing is written until it is wired into
  `emit.mjs`.

## Deploying

`dist/` is the whole site. Cloudflare → Workers & Pages → the MIP worker → New
deployment → **folder** (not a file, not a zip) → select the folder → Deploy.

Before sending a link to anyone, fetch it anonymously and confirm it loads
without a sign-in wall.
