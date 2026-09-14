# The nickname problem is solved at the source

Scoreholio stores BOTH names for every player. We spent weeks inferring real
names from nicknames because every export we ever pulled was the **Match Log**,
which carries only the display name. The organizer's **Roster** view carries
both, because Scoreholio has to know who a player really is in order to submit
their results to DUPR.

## Where it lives

Dave's organizer account -> Tournaments -> click a tournament row -> **Roster**.
The roster is an AG Grid; each grid row is a TEAM and carries a `players` array.
Each player object holds:

| field           | meaning                                  |
|-----------------|------------------------------------------|
| `playerDisplay` | the Scoreholio nickname ("Gregg D.")     |
| `playerFullName`| the real name ("Gregg Dukofsky")         |
| `playerUser`    | stable Scoreholio user id                |
| `duprDoubles`   | DUPR doubles rating (-999 = none)        |
| `duprSingles`   | DUPR singles rating (-999 = none)        |
| `totalMatches`  | matches played                           |
| `playerEmail`   | DELIBERATELY NOT COLLECTED - see below   |

`playerEmail` is present in the page data and is deliberately left out of
everything we store. The stats site has no use for 500 people's email
addresses, and collecting them because they happened to be in reach is not a
thing to do with other people's data.

## How to read it without scrolling or downloading

The grid exposes the standard AG Grid API, reachable by walking the React fiber
from `.ag-root-wrapper` for any object with a `getDataAsCsv` function. Once you
have it, `forEachNode` hands over every row regardless of what is scrolled into
view - no scrolling, no export button, no file download.

## Why this matters more than it sounds

Two rows from a single ten-player roster:

    Rob S.      -> Rob Sarraga
    Robert S.   -> Robert Seidner

Two different men, in the SAME tournament, who both reduce to "Rob/Robert S."
No amount of inference from initials could have separated them, and guessing
would have handed one man the other's record. This file is why `resolve.mjs`
refuses on ambiguity rather than picking.

It also independently confirms an alias we had derived the hard way:
`Stephen R.` -> Stephen Rizzi, which the week-fingerprint method had already
found. Two methods, same answer.

## Scale

The club has 902 tournaments: 24 in 2023, 238 in 2024, 280 in 2025, 360 in 2026.
Every one has a roster. The same people recur constantly, so the union of a
modest number of rosters should name nearly everyone.
