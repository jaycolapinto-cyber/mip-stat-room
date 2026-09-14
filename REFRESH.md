# Keeping the site current

The site rebuilds every **Sunday morning**. This is what runs on its own, what
still needs a person, and why the split falls where it does.

## The short version

| Step | Who | Why |
|---|---|---|
| 1. Download the 8 standings workbooks | **You** | They are OneDrive share links — nothing automated can reach them |
| 2. Pull the week's new games | **You** | Scoreholio and DUPR both need a logged-in browser |
| 3. Drop both into the repo | **You** (one commit) | |
| 4. Rebuild, run every check, publish | Runs on its own | |
| 5. Tell you what happened | Runs on its own | |

Steps 4 and 5 are the ones that used to take the time. Steps 1–3 are about ten
minutes and can happen any evening during the week — the Sunday job just uses
whatever is there when it wakes up.

## Why steps 1 and 2 can't be automated

Not a limitation worth engineering around. Both are login walls:

**The standings** are eight `1drv.ms` links on Dave's OneDrive, posted on the
Stats & Standings page. Automated fetching of those is blocked, and working
around the block is not something to build a weekly job on.

**The games** come from Scoreholio (Dave's organizer account) and DUPR (yours).
Either needs a signed-in browser. A job running at 6am Sunday has two options:
lean on a saved login that will expire some week without warning and silently
stop feeding the site, or keep the passwords on disk. Neither is worth it —
especially the second, and especially for someone else's account.

So the rule is: **a person collects, the machine checks and publishes.** The
checking is the part that catches mistakes, and that part never gets skipped.

## The job will not publish a broken site

Before anything goes live it runs the full suite — roughly 3,000 checks, the
importer's own re-derivation of every game from its original source, and the
duplicate-identity sweep. If any of it fails, **nothing publishes** and you get
told what broke. Last week's site stays up, which is always better than a wrong
one.

It also reports how old each standings workbook is. Past 7 days behind the
newest game, they get flagged `<-- STALE`, because the one failure this pipeline
can produce silently is this week's games sitting beside last month's table with
every individual number correct.

That age comes from the file's last commit, not its timestamp on disk. Git does
not preserve timestamps, so in a fresh clone every file looks seconds old — a
staleness check trusting that would report "current" about a workbook nobody had
touched in a month.

## Your part, step by step

1. Open the Stats & Standings page on merrickinapickle.com and download all
   eight workbooks.
2. Drop them into `importer/live/standings/`, replacing what's there. Keep
   Chrome's `(11)` suffixes — the build matches on the Scoreholio id in the
   middle of the name and takes the newest, so the numbers don't matter.
3. Export the week's match logs from Scoreholio into `importer/live/exports/`.
4. Commit and push. That's it.

To check your work before pushing:

    npm ci
    npm run build      # prints the game count and the staleness table
    npm test           # everything must be green

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
