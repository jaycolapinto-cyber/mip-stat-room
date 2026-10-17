#!/bin/bash
# The VPS updater's runner. One build and at most one push per run.
#
#   vps/run.sh weekly          # standings + DUPR ratings (the old Wednesday job)
#   vps/run.sh daily           # the same, every morning at 6 AM (live)
#   vps/run.sh nightly         # finished league nights from Scoreholio (11:15 PM)
#
# Safe by default: DRY_RUN=1 (the default) does everything - pull, build, every
# check - but never pushes. Publishing needs DRY_RUN=0, set in the crontab only
# when Jay says so.
#
# From cron each job is listed at two UTC hours and does nothing unless it is
# the right New York hour (--at-hour 10 / 6 / 23), so daylight saving
# needs no attention.

set -uo pipefail
REPO=/home/mipstats/mip-stat-room
LOGS=/home/mipstats/logs
DRY_RUN=${DRY_RUN:-1}
JOB=${1:-}
mkdir -p "$LOGS"

if [ "${2:-}" = "--at-hour" ]; then
  [ "$(TZ=America/New_York date +%-H)" = "${3:-x}" ] || exit 0
fi

case "$JOB" in
  weekly) WHEN="weekly"; NEXT="next week" ;;
  daily) WHEN="daily"; NEXT="tomorrow" ;;
  nightly) WHEN="nightly"; NEXT="tomorrow night" ;;
  *) echo "usage: run.sh weekly|daily|nightly [--at-hour H]"; exit 2 ;;
esac

# Overlap-proof: a second run waits for the first instead of doubling up.
exec 9>"$LOGS/.run.lock"
flock 9

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$LOGS/run-$JOB-$STAMP.log"
exec > >(tee -a "$OUT") 2>&1
cd "$REPO" || exit 1
echo "== $JOB run $STAMP (DRY_RUN=$DRY_RUN)"

line() { node -e 'import("./vps/lib.mjs").then(m => m.logLine(process.argv[1]))' "$1"; }
alert() { node -e 'import("./vps/lib.mjs").then(m => m.sendAlert(process.argv[1], process.argv[2]))' "$1" "$2"; }
login_alert() { node -e 'import("./vps/lib.mjs").then(m => { const e = m.loginExpiredEmail(process.argv[1]); return m.sendAlert(e.subject, e.body); })' "$1"; }
games() { grep -oE '^matches +[0-9]+' "$1" | grep -oE '[0-9]+$'; }

MEM=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM" -lt 1024 ]; then
  alert "MIP Stats: skipped an update - server low on memory" "The $WHEN Stat Room update did not run because the server had only ${MEM} MB of free memory (it needs about 1 GB), and starting a browser then could slow down the estimator. It will try again $NEXT. If this email repeats, ask Claude Code to look at memory use on the server."
  line "$JOB: skipped, low memory (${MEM} MB)"
  exit 1
fi

# Start from exactly what is published. This folder belongs to the updater
# alone, so nothing of anyone's is lost by resetting it.
git fetch -q origin && git reset -q --hard origin/main && git clean -qfd importer/live || {
  alert "MIP Stats: couldn't reach GitHub" "The $WHEN Stat Room update couldn't download the latest copy of the site from GitHub, so it stopped before changing anything. This is usually a brief GitHub outage and fixes itself by $NEXT. If it repeats, ask Claude Code to check the server's GitHub deploy key."
  line "$JOB: stopped, git fetch failed"; exit 1; }
npm ci --silent >/dev/null 2>&1 || true

# Practice-only: forget one night the site already has (a local commit that is
# never pushed), so it is pulled again and the whole path runs, publish step
# included up to the push. Refused unless DRY_RUN=1.
if [ -n "${MIP_TEST_DROP_NIGHT:-}" ] && [ "$DRY_RUN" = "1" ] && [ "$JOB" = "nightly" ]; then
  git rm -q "importer/live/exports/Matchlog-$MIP_TEST_DROP_NIGHT.csv" && git commit -q -m "practice: forget $MIP_TEST_DROP_NIGHT"
  echo "PRACTICE: forgot Matchlog-$MIP_TEST_DROP_NIGHT.csv so it is pulled again"
fi

npm run build > "$LOGS/.before.log" 2>&1
BEFORE=$(games "$LOGS/.before.log")
echo "games before: $BEFORE"

PULLED=()
PROBLEMS=()
LOGIN_NOTE=""
NOTE=""
NIGHTS_MSG=""

if [ "$JOB" = "weekly" ] || [ "$JOB" = "daily" ]; then
echo "-- standings"
node vps/pull-standings.mjs > "$LOGS/.standings.log" 2>&1; S=$?
cat "$LOGS/.standings.log"
SUM=$(tail -1 "$LOGS/.standings.log")
if [ $S -ne 0 ]; then
  FAILED=$(node -e 'try{console.log(JSON.parse(process.argv[1]).failed.join(", "))}catch{console.log("unknown")}' "$SUM")
  PROBLEMS+=("Standings: these workbooks would not download from Dave's OneDrive, even after a retry: $FAILED. The others were still updated.")
fi
STALE=$(node -e 'try{console.log(JSON.parse(process.argv[1]).stale.join("\n  "))}catch{}' "$SUM")
if [ -n "$STALE" ]; then
  alert "MIP Stats: a league's standings haven't changed in 3 weeks" "These standings workbooks on Dave's OneDrive haven't changed for 21 days or more, while the league keeps playing:

  $STALE

That usually means Dave started a new season in a NEW workbook, so the Stat Room is still reading last season's file.

What to do:
  1. Ask Dave for the link to the new season's standings for that league (it's on the Stats & Standings page of merrickinapickle.com).
  2. Open Claude Code and say: \"Dave started a new season for <league name>; here is the new link: <paste link>. Update importer/sources.mjs on the VPS Stat Room.\"

If the league has simply finished for the year, tell Claude Code that instead and it will mark it as final so this email stops."
fi
git diff --quiet -- importer/live/standings || PULLED+=("standings")

echo "-- dupr"
node vps/pull-dupr.mjs; D=$?
if [ $D -eq 3 ]; then
  # The sign-in email says everything; no second "problem" email for this.
  login_alert dupr
  LOGIN_NOTE=" (DUPR needs signing in again - emailed)"
elif [ $D -ne 0 ]; then
  PROBLEMS+=("DUPR: the ratings reading failed its checks and was not saved (a short reading would drop players from the chart). Details are in $OUT on the server.")
fi
# Practice-only: pretend today's DUPR reading arrived (a copy of the last
# one under today's date) so the build/check/commit path can be exercised
# without DUPR. Refused unless DRY_RUN=1, so it can never be published.
if [ "${MIP_TEST_FAKE_DUPR:-}" = "1" ] && [ "$DRY_RUN" = "1" ]; then
  LAST=$(ls importer/live/dupr | grep -E '^[0-9-]+\.tsv$' | sort | tail -1)
  cp "importer/live/dupr/$LAST" "importer/live/dupr/$(TZ=America/New_York date +%F).tsv"
  echo "PRACTICE: copied $LAST as today's reading"
fi
[ -n "$(git status --porcelain -- importer/live/dupr)" ] && PULLED+=("dupr")
fi

if [ "$JOB" = "nightly" ]; then
# Every run can "succeed" while nothing new arrives - say so after 10 quiet
# days (then once a week, not every night).
NEWEST=$(grep -oE '^matches .* to [0-9]{4}-[0-9]{2}-[0-9]{2}' "$LOGS/.before.log" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}$')
if [ -n "$NEWEST" ]; then
  QUIET=$(( ( $(date -d "$(TZ=America/New_York date +%F)" +%s) - $(date -d "$NEWEST" +%s) ) / 86400 ))
  if [ "$QUIET" -ge 10 ] && [ $(( (QUIET - 10) % 7 )) -eq 0 ]; then
    alert "MIP Stats: no new league games for $QUIET days" "The Stat Room's newest game is from $NEWEST - $QUIET days ago - even though the nightly update has been running.

That usually means one of three things:
  - the leagues are on a break (then nothing is wrong; ignore this),
  - Dave's nights are being run from a different Scoreholio account, or
  - Scoreholio changed its pages and the update can't see new nights.

If the leagues have been playing, open Claude Code and say: \"MIP Stats has had no new games for $QUIET days - check the nightly Scoreholio pull on the VPS.\""
  fi
fi
echo "-- scoreholio"
node vps/pull-scoreholio.mjs > "$LOGS/.scoreholio.log" 2>&1; H=$?
cat "$LOGS/.scoreholio.log"
HSUM=$(tail -1 "$LOGS/.scoreholio.log")
if [ $H -eq 3 ]; then
  login_alert scoreholio
  LOGIN_NOTE=" (Scoreholio needs signing in again - emailed)"
elif [ $H -ne 0 ]; then
  WHY=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log([j.stopped&&("it stopped: "+j.stopped), j.failed?.length&&("these nights did not export after a retry: "+j.failed.join("; "))].filter(Boolean).join(". "))}catch{console.log("see the log")}' "$HSUM")
  PROBLEMS+=("Scoreholio: $WHY. Anything that did export was still used. Details are in $OUT on the server.")
fi
[ -n "$(git status --porcelain -- importer/live/exports)" ] && PULLED+=("scoreholio")
NIGHTS_MSG=$(node -e '
  try {
    const j = JSON.parse(process.argv[1]); const n = j.nights || [];
    if (!n.length) process.exit(0);
    const d = (s) => new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const days = [...new Set(n.map((x) => x.date))].sort();
    const when = days.length === 1 ? d(days[0]) : `${d(days[0])}-${d(days[days.length - 1]).replace(/^[A-Za-z]+ /, "")}`;
    console.log(`Add ${when} league night${days.length > 1 ? "s" : ""} from Scoreholio (+${j.games} games)`);
  } catch {}' "$HSUM")
fi

finish() {
  line "$JOB: $1$LOGIN_NOTE$NOTE"
  if [ ${#PROBLEMS[@]} -gt 0 ]; then
    BODY="The $WHEN Stat Room update ran on $(TZ=America/New_York date '+%A %b %-d') and hit a problem:"
    for p in "${PROBLEMS[@]}"; do BODY+="

- $p"; done
    BODY+="

Result: $1

Nothing needs doing right now unless this email repeats $NEXT. If it does, open Claude Code and say: \"The MIP Stats $WHEN update keeps failing - look at the latest log in /home/mipstats/logs on the VPS.\""
    alert "MIP Stats: the $WHEN update had a problem" "$BODY"
  fi
  exit 0
}

if [ ${#PULLED[@]} -eq 0 ]; then
  finish "nothing new (games $BEFORE), nothing pushed"
fi

echo "-- build and checks"
CHECKS_OK=1
npm run build > "$LOGS/.after.log" 2>&1 || CHECKS_OK=0
AFTER=$(games "$LOGS/.after.log")
npm test > "$LOGS/.test.log" 2>&1 || CHECKS_OK=0
grep -q 'ERRORS (our pipeline) : 0' "$LOGS/.test.log" || CHECKS_OK=0
node build/serve.cjs > "$LOGS/.serve.log" 2>&1 & SP=$!
sleep 1
# The page checks drive a real browser, which can blip; one blip must not
# cost a night's games. A real breakage fails both tries.
if ! npm run test:page > "$LOGS/.page.log" 2>&1; then
  echo "page checks failed once - trying again:"; tail -25 "$LOGS/.page.log"
  if npm run test:page > "$LOGS/.page.log" 2>&1; then NOTE=" (page checks passed on the 2nd try)"; else CHECKS_OK=0; fi
fi
kill $SP 2>/dev/null
if [ -z "$AFTER" ] || [ -z "$BEFORE" ] || [ "$AFTER" -lt "$BEFORE" ]; then CHECKS_OK=0; fi
echo "games after: $AFTER"

if [ $CHECKS_OK -ne 1 ]; then
  # Keep what the checks said in this run's own log; the next run reuses
  # the scratch logs.
  for f in .after .test .page; do echo "--- $f.log (end)"; tail -40 "$LOGS/$f.log"; done
  FIRST=$(grep -hE 'FAIL|ERROR|Error|failed' "$LOGS/.after.log" "$LOGS/.test.log" "$LOGS/.page.log" | grep -v ' 0 failed' | head -15)
  PROBLEMS+=("A check failed after fetching (${PULLED[*]}), so NOTHING was published - the site keeps its last good version. Games before: $BEFORE, after: ${AFTER:-unknown}. What the checks said:
$FIRST")
  git reset -q --hard origin/main
  finish "pulled ${PULLED[*]}, CHECKS FAILED, nothing pushed"
fi

MSG=()
[ -n "$NIGHTS_MSG" ] && MSG+=("$NIGHTS_MSG")
[[ " ${PULLED[*]} " == *" dupr "* ]] && MSG+=("DUPR ratings reading for $(ls importer/live/dupr | grep -E '^[0-9-]+\.tsv$' | sort | tail -1 | cut -c1-10)")
[[ " ${PULLED[*]} " == *" standings "* ]] && MSG+=("Standings refreshed from Dave's OneDrive")
SUBJECT=$(IFS=';'; echo "${MSG[*]}" | sed 's/;/; /g')

git add -A importer dist
git commit -q -m "$SUBJECT" -m "From the VPS updater ($JOB run $STAMP)."
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN: would push: $SUBJECT"
  git reset -q --hard origin/main
  finish "pulled ${PULLED[*]}, games $AFTER, checks passed, DRY RUN (not pushed): $SUBJECT"
fi

if git push -q origin HEAD:main; then
  finish "pulled ${PULLED[*]}, games $AFTER, PUSHED: $SUBJECT"
else
  # Someone else published first (a hand push). The build
  # output can't be merged, so leave it: next week's run starts from theirs.
  PROBLEMS+=("Publishing was refused because the site changed on GitHub while this run was working (someone pushed by hand). Nothing was lost; the next run starts from the newer version.")
  git reset -q --hard origin/main
  finish "pulled ${PULLED[*]}, push REJECTED (remote moved)"
fi
