#!/bin/bash
# The VPS updater's runner. One build and at most one push per run.
#
#   vps/run.sh weekly          # standings + DUPR ratings (Wednesdays)
#
# Safe by default: DRY_RUN=1 (the default) does everything - pull, build, every
# check - but never pushes. Publishing needs DRY_RUN=0, set in the crontab only
# when Jay says so.
#
# From cron it runs at two UTC hours and only does anything at 10 AM New York
# time, so daylight saving needs no attention: pass --at-hour 10.

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
  weekly) ;;
  *) echo "usage: run.sh weekly [--at-hour H]"; exit 2 ;;
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
  alert "MIP Stats: skipped this week's update - server low on memory" "The weekly Stat Room update did not run because the server had only ${MEM} MB of free memory (it needs about 1 GB), and starting a browser then could slow down the estimator. It will try again next week. If this email repeats, ask Claude Code to look at memory use on the server."
  line "$JOB: skipped, low memory (${MEM} MB)"
  exit 1
fi

# Start from exactly what is published. This folder belongs to the updater
# alone, so nothing of anyone's is lost by resetting it.
git fetch -q origin && git reset -q --hard origin/main && git clean -qfd importer/live || {
  alert "MIP Stats: couldn't reach GitHub" "The weekly Stat Room update couldn't download the latest copy of the site from GitHub, so it stopped before changing anything. This is usually a brief GitHub outage and fixes itself next week. If it repeats, ask Claude Code to check the server's GitHub deploy key."
  line "$JOB: stopped, git fetch failed"; exit 1; }
npm ci --silent >/dev/null 2>&1 || true

npm run build > "$LOGS/.before.log" 2>&1
BEFORE=$(games "$LOGS/.before.log")
echo "games before: $BEFORE"

PULLED=()
PROBLEMS=()
LOGIN_NOTE=""

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
  PROBLEMS+=("DUPR: this week's ratings reading failed its checks and was not saved (a short reading would drop players from the chart). Details are in $OUT on the server.")
fi
# Practice-only: pretend this week's DUPR reading arrived (a copy of the last
# one under today's date) so the build/check/commit path can be exercised
# without DUPR. Refused unless DRY_RUN=1, so it can never be published.
if [ "${MIP_TEST_FAKE_DUPR:-}" = "1" ] && [ "$DRY_RUN" = "1" ]; then
  LAST=$(ls importer/live/dupr | grep -E '^[0-9-]+\.tsv$' | sort | tail -1)
  cp "importer/live/dupr/$LAST" "importer/live/dupr/$(TZ=America/New_York date +%F).tsv"
  echo "PRACTICE: copied $LAST as today's reading"
fi
[ -n "$(git status --porcelain -- importer/live/dupr)" ] && PULLED+=("dupr")

finish() {
  line "$JOB: $1$LOGIN_NOTE"
  if [ ${#PROBLEMS[@]} -gt 0 ]; then
    BODY="The weekly Stat Room update ran on $(TZ=America/New_York date '+%A %b %-d') and hit a problem:"
    for p in "${PROBLEMS[@]}"; do BODY+="

- $p"; done
    BODY+="

Result: $1

Nothing needs doing right now unless this email repeats next week. If it does, open Claude Code and say: \"The MIP Stats weekly update keeps failing - look at the latest log in /home/mipstats/logs on the VPS.\""
    alert "MIP Stats: the weekly update had a problem" "$BODY"
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
npm run test:page > "$LOGS/.page.log" 2>&1 || CHECKS_OK=0
kill $SP 2>/dev/null
if [ -z "$AFTER" ] || [ -z "$BEFORE" ] || [ "$AFTER" -lt "$BEFORE" ]; then CHECKS_OK=0; fi
echo "games after: $AFTER"

if [ $CHECKS_OK -ne 1 ]; then
  FIRST=$(grep -hE 'FAIL|ERROR|Error|failed' "$LOGS/.after.log" "$LOGS/.test.log" "$LOGS/.page.log" | grep -v ' 0 failed' | head -15)
  PROBLEMS+=("A check failed after fetching (${PULLED[*]}), so NOTHING was published - the site keeps last week's version. Games before: $BEFORE, after: ${AFTER:-unknown}. What the checks said:
$FIRST")
  git reset -q --hard origin/main
  finish "pulled ${PULLED[*]}, CHECKS FAILED, nothing pushed"
fi

MSG=()
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
  # Someone else (the cloud task, until Phase 4) published first. The build
  # output can't be merged, so leave it: next week's run starts from theirs.
  PROBLEMS+=("Publishing was refused because the site changed on GitHub while this run was working (probably the old cloud update). Nothing was lost; next week's run starts from the newer version.")
  git reset -q --hard origin/main
  finish "pulled ${PULLED[*]}, push REJECTED (remote moved)"
fi
