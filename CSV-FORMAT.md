# Match export format

This is what to ask for when requesting a match export from DUPR, Scoreholio,
or anyone else. The importer already reads several common layouts, so an export
does not have to match this exactly — but the closer it is, the less there is to
check by hand.

To see what the importer makes of a file before anything is imported:

    node importer/csv.mjs path/to/export.csv

That prints which column it assigned to which role and why, lists any column it
ignored, and names every row it could not read and the reason. It writes
nothing. If it cannot work out the layout it stops and shows the headers it saw,
rather than guessing.

## The ideal file

One row per game, with a header row:

| Column             | Required | Example        | Notes |
|--------------------|----------|----------------|-------|
| `Date`             | strongly | `2026-09-11`   | ISO is safest. `9/11/2026` and unix timestamps also read. Without a date, games still import but the match log loses its ordering. |
| `Time`             | nice     | `9:04 AM`      | Orders games within a day. |
| `Court`            | nice     | `2`            | |
| `Event`            | nice     | `Friday AM`    | The session or league the game belongs to. |
| `Team 1 Player 1`  | yes      | `Stephen Rizzi`| Full real name. |
| `Team 1 Player 2`  | yes      | `Jeff Fein`    | |
| `Team 2 Player 1`  | yes      | `Frank Rossetti`| |
| `Team 2 Player 2`  | yes      | `Christie Simmons`| |
| `Team 1 Score`     | yes      | `11`           | |
| `Team 2 Score`     | yes      | `5`            | |

## Layouts that also work

- **Two team columns** instead of four player columns: `Team 1` = `Ann & Ben`.
  Players may be separated by `&`, `+`, `/`, `,`, `and` or `with`.
- **One combined score column**: `Score` = `11-6` (or `11 – 6`, or `11:6`).
- Header spellings vary freely: `Team A`/`Team B`, `Home`/`Away`,
  `Player 1`…`Player 4`, `Match Date`, `Played On`. Extra columns are ignored
  and listed so you can see what was skipped.

## The one thing that matters most: names

**Full real names, the same spelling every time.** This is the difference
between an import that takes a minute and one that takes an afternoon.

Nicknames are the single biggest source of work on this project. Scoreholio lets
each player type their own display name, so the same person shows up as
`Chase Gold`, `Sal F.` and `Sal Farruggia` across three files. The importer will
not guess between two people who share a first name — Merrick alone has two
Jeffs, two Rizzis, two Farruggias and two Jonathans — so an ambiguous name is
reported and its games are held back rather than assigned to the wrong player.
A wrong assignment is worse than a missing one: it silently hands one player
another player's record, and nothing downstream would catch it.

If the export can include a **stable player ID** alongside the name, include it.
An ID never changes when someone edits their display name, which makes every
future import trivial.

## What the importer refuses

Each of these skips the row, names the line number, and keeps going — one bad
row never discards the good ones:

- a tie (pickleball games do not end level)
- a score that is not a whole number, is negative, or is above 40
- fewer or more than two players on a side
- the same player twice in one game
- a date it cannot read, or a date in the future
- a name it cannot match to exactly one roster player

It stops the whole import only when it cannot identify the columns at all.
