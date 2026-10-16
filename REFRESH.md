# Keeping the site current

**Since Oct 16 2026 the VPS owns updates.** A small updater on Jay's server
(user `mipstats`, code in `vps/`) pulls everything, runs every check and
publishes. Nothing needs a person week to week. The old cloud tasks and the
`mip-push` task on Jay's PC are retired; nothing else should push data to this
repo.

## What runs, and when

| When (New York time) | Job | What it does |
|---|---|---|
| Every day, 6 AM | `vps/run.sh daily` | Downloads the standings workbooks from Dave's OneDrive and takes a DUPR ratings reading |
| Every day, 11:15 PM | `vps/run.sh nightly` | Exports the finished league nights from Scoreholio (tonight's, plus a re-check of the last day) |

Each run starts from what is published, pulls, rebuilds, runs every check, and
pushes **only** if every check passes and the game count did not go down. A
run where nothing changed publishes nothing. The schedule is the `mipstats`
crontab; `DRY_RUN=1` there means practice mode (everything except the push).

Jay gets an email only when something needs attention: a login has expired
(the email is a full step-by-step sign-in guide), a pull or check failed, a
league's standings have not changed in 21 days, or no new games have arrived in
10 days. Every run is logged in `/home/mipstats/logs/` (`runs.log` is one line
per run).

## Logins

Scoreholio (Dave's organizer account, with his OK) and DUPR (Jay's) are read
through a browser profile on the server that Jay signed in to by hand. No
password is ever typed, stored or logged by the updater. When a login expires,
the updater stops for that site and emails the sign-in steps; see
`vps/HOW-TO-SIGN-IN.md`. DUPR is read only, and `api.dupr.com` is never called.

## If the server is ever down: the manual route

The site can still be refreshed by hand, exactly as before the VPS:

1. Open the Stats & Standings page on merrickinapickle.com and download all
   eight workbooks into `importer/live/standings/`, replacing what's there.
   Keep Chrome's `(11)` suffixes; the build matches on the Scoreholio id in the
   middle of the name and takes the newest.
2. Export the missing nights' match logs from Scoreholio into
   `importer/live/exports/` (follow the rules below).
3. Check, then commit and push:

       npm ci
       npm run build      # prints the game count and the staleness table
       npm test           # everything must be green

Don't do this while the server is running, or the two will race to publish.

## The job will not publish a broken site

Before anything goes live it runs the full suite — roughly 3,000 checks, the
importer's own re-derivation of every game from its original source, and the
duplicate-identity sweep. If any of it fails, **nothing publishes** and you get
told what broke. The last good site stays up, which is always better than a wrong
one.

It also reports how old each standings workbook is. Past 7 days behind the
newest game, they get flagged `<-- STALE`, because the one failure this pipeline
can produce silently is this week's games sitting beside last month's table with
every individual number correct.

That age comes from the file's last commit, not its timestamp on disk. Git does
not preserve timestamps, so in a fresh clone every file looks seconds old — a
staleness check trusting that would report "current" about a workbook nobody had
touched in a month.

## Publishing

Cloudflare builds from this repo and deploys on push. No API token lives here
and none is needed — which is the main reason the project is on GitHub rather
than in a synced folder.

## Why the workbooks are committed

They used to be read out of a Downloads folder. That works while a person is
sitting at that particular computer and cannot work for a job running on a fresh
machine. All eight together are under 200KB, so they live with the code and a
clone builds with no setup at all.

## Rules for the Scoreholio pull

This runs against Dave's organizer account — the live control panel for a
league that is actually being played. The standing rules, in force for every
run, automated or not:

**Never click UPCOMING.** Those events have not happened yet. Opening one puts
a tournament that is about to run, or is running, one click away from Advance
Game, Pause and Edit. There is nothing in an upcoming event worth having: the
games do not exist yet.

**PAST and ADMIN only.** The nights we want are finished, and the Admin screen
of a finished night is where the match log export lives.

**Read and export, never modify.** Never Edit, Clone, Make Template, Announce,
Advance Game, Pause, Settings, or anything under Options. If a screen offers no
obvious way back out without touching one of those, back out through the
browser, not through the page.

`playerEmail` appears in Scoreholio's roster data and is deliberately never
collected.

### The route to a night's match log

Proved live on 2026-09-14 against "Friday Bracket B - S3W6" (Sep 11):

    PAST  ->  the tournament row  ->  Admin  ->  Stats & Logs  ->  Match Log  ->  Export

`Play Duration` and `Wait Duration` are both on that page, which is the whole
reason for the Scoreholio pull: DUPR carries the games and the real names but
neither clock, and no court.

The tournament id sits in the admin URL as `game=<id>`, and it is the same id
the export filenames already use (`Matchlog-<id>.csv`), so a pulled night drops
straight into `importer/live/exports/` with no renaming.

Two things about that screen:

**Widen the window first.** At phone width the admin page collapses its nav
into a hamburger and puts **Advance Game** in the middle of the screen. Every
control worth avoiding ends up under the cursor. At desktop width the nav is a
row along the top and Stats & Logs is nowhere near anything destructive.

**"Import CSV" sits beside "Export".** Never click it. Export reads; Import
writes, into a live league's scoring data.

### One thing to know about finished nights

Scoreholio reported `GamePlay Status: Live` for a night played three days
earlier. It means the tournament was never formally closed out, not that a game
is in progress - so "Live" is not a reliable signal for whether it is safe to
open, and the DATE is. Past date, past tab, read and export only.
