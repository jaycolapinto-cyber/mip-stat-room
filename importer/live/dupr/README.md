# DUPR club rating snapshots

One file per reading, named `YYYY-MM-DD.tsv`, tab-separated:

    Player Name<TAB>4.653<TAB>5447601035<TAB>100
    ^ name          ^ rating ^ DUPR player id ^ matches played

The last two columns are newer and optional — the older two-column files still
read fine, and anything that only wants a rating still reads columns one and
two. The **player id** is the column worth having: it is DUPR's own key, so it
settles identity in a way a name cannot. "Sal Farruggia" and "Sal farruggia"
are two separate DUPR accounts with two ids and two very different ratings, and
this project has already put one man's rating on the other man once.

**The fast way to take a reading.** Open the club's Ratings page, select the
list, copy it, save it to a file, then:

    node importer/duprpaste.mjs pasted.txt importer/live/dupr/YYYY-MM-DD.tsv

That reads DUPR's `1 [Name](.../player/<id>) <matches> <rating>` rows, refuses
anything that is not one, drops a paste that overlapped itself, and keeps a
member who is not rated yet (`NR`) for the name and the id.

Each file is the Merrick In A Pickle club member list (club 8246685522) exactly
as DUPR showed it on that date. Nothing here is computed, interpolated or
carried forward — a player who is absent from a snapshot simply has no reading
for that date, and the chart skips it rather than drawing a flat line.

**Why snapshots at all.** DUPR shows a club's members and their *current*
ratings. It does not show what those ratings were last month, and once a rating
moves the old value is gone. So every reading we do not take is history we can
never recover. Taking one a week costs a minute and, by the end of a season,
produces a real rating chart for every player.

**Adding one.** Read the club member list, save it here as today's date, and
re-run `node importer/emit.mjs`. The history rebuilds itself from whatever
files are present.

Ratings are DUPR's own doubles ratings. They are not derived from the wins and
losses on this site, and nothing on this site writes back to DUPR.
