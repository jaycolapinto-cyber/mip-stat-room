# How many Scoreholio tournaments are actually worth importing

Answered 2026-09-13 from a full pull of the organizer tournament list
(`mip-tournament-inventory-902.tsv`, 902 rows, every tournament in Dave's
account) plus a 45-tournament probe of pages we had never opened
(`mip-sample-probe-45.tsv`).

## The short answer

| Year | Tournaments | Valid | On the site | Still to collect | Games in those |
|------|------------:|------:|------------:|-----------------:|---------------:|
| 2023 |  24 |  13 |   0 |  13 |    421 |
| 2024 | 238 | 101 |  89 |  12 |    542 |
| 2025 | 280 | 234 | 231 |   3 |     76 |
| 2026 | 360 | 328 |   0 | 328 | 11,745 |
| **Total** | **902** | **676** | **320** | **356** | **~12,800** |

226 of the 902 are too small to be worth importing.

## What "valid" means here, and why the test changed

Jay's rule is **12 or more players**. Player counts are only knowable by
opening each tournament's roster, so we needed a proxy that can be read off
the list for all 902 at once.

**Games played >= 20** turns out to be that proxy. Checked against the 329
tournaments where we hold both the exact roster and the exact match log, it
classifies 323 correctly - 98.2%, with 3 valid nights missed and 3 small ones
let through. A 12-player round robin produces 33 games; the 5th percentile of
game counts for a >=12-player night is 29, the median is 33.

## Two fields on the list that look useful and are not

`gameregistered` is the **pre-registration** count, not who turned up. It
matched the true roster in 44 of 55 spot checks and was wrong in both
directions in the other 11 - one tournament showed 13 registered against a
roster of 1, another 6 registered against a roster of 23.

`progress.completed` is a **floor, never a ceiling**. Against 329 known
tournaments it undercounted 41 times and overcounted twice. 32 tournaments
that we successfully pulled full match logs from report `completed: 0`.
**Never use it to exclude a tournament.** Every count in the table above uses
a real measured game count where we have one, and falls back to `progress`
only where we do not - so the game totals are conservative.

For 2023 the field is unpopulated across the board: all 24 tournaments report
0 completed. Opening them found 510 real games.

## What the probe settled

**2023 is real and was never touched.** 22 of the 24 tournaments hold games,
510 in total; 13 clear the bar. The oldest is `Merrick in a pickle #1`,
2023-08-14. Note the account is missing #8 through #11 - four Monday nights
that were never entered into Scoreholio at all, so no amount of sweeping will
recover them.

**Jay's under-12 filter was right.** 21 of the 172 unswept low-registration
2024/2025 tournaments were opened at random: **none** reached 12 players, and
between them they held 201 games, averaging under 10 each. The 226 skipped
tournaments are genuinely minor and can stay skipped.

## 2026 is the whole remaining job, and it is not a duplicate of DUPR

The site's 10,884 games in 2026 all come from DUPR. Scoreholio's 2026 is a
different, larger set:

- **72 playing dates exist in Scoreholio with zero games on the site.**
- On 23 further shared dates Scoreholio holds more games than the site does.
- Conservatively **~4,500 games the site does not have**, on top of court and
  start-time metadata that DUPR never carries.

(On 87 shared dates the site appears to hold more, but that is the
`progress` undercount talking, not a real surplus.)

## Files

- `mip-tournament-inventory-902.tsv` - every tournament: id, unix time,
  progress, registered, template flag, status, format, type, sport, name.
- `mip-sample-probe-45.tsv` - measured player and match counts for all 24 of
  2023 plus 21 sampled low-registration 2024/2025 tournaments.
