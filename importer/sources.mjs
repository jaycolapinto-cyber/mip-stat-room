// Which downloaded workbook is which league.
//
// WHY THIS IS NOT JUST A LIST OF FILENAMES ANY MORE.
//
// It used to name each file exactly - "Player-Rankings-ytHsDHiSEPVfgTGrkiKj
// (10).xlsx". Those numbers in brackets are Chrome's, added because the file
// was already in the Downloads folder. So the moment Dave publishes new
// standings and someone downloads them, the same league arrives as "(11)" and
// the build carries on reading "(10)" - last week's numbers - without a word.
// Wrong output and no error is the worst failure a pipeline can have, and this
// one was waiting for the first weekly refresh to walk into it.
//
// What does NOT change is the id inside the name. Scoreholio mints one per
// league and puts it in the export filename, so `Player-Rankings-<id>` is
// stable across every re-download while the suffix churns. That id is what is
// matched on here, newest file wins, and a league with no file at all stops the
// build rather than quietly vanishing from the site.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/**
 * Where the eight standings workbooks live.
 *
 * IN THE REPO, not in somebody's Downloads folder. That was the arrangement
 * until now and it cannot survive a scheduled build: a weekly job starts on a
 * fresh machine with an empty disk, and "the file is in my Downloads" is not
 * something a fresh machine can act on. All eight together are under 200KB, so
 * they simply live with the code, and a clone builds with no further setup.
 *
 * The two escape hatches, in order:
 *   MIP_STANDINGS_DIR   - point the build at a folder somewhere else entirely
 *   the old Downloads path - used only when the in-repo folder is missing, so
 *                           an older working copy still builds
 */
const REPO_STANDINGS = fileURLToPath(new URL('./live/standings', import.meta.url));
const UPLOADS = '/mnt/user-data/uploads/Downloads';

export const DIR = process.env.MIP_STANDINGS_DIR
  || (existsSync(REPO_STANDINGS) ? REPO_STANDINGS : UPLOADS);

/**
 * Each league, keyed by the stable part of its export filename.
 *
 * `share` is the id inside Dave's OneDrive share link for that league's
 * workbook. He keeps each one as an Excel file in his own OneDrive, types the
 * week's results into it by hand, and links it from merrickinapickle.com. The
 * link is stable - it names the file, not a version of it - so the same six
 * ids fetch this week's numbers every week, and `downloadUrl()` below turns
 * one into a plain file download with no Excel Online in the way.
 *
 * There is deliberately no hand-written "Week 6" label here any more. There
 * used to be, and it was wrong within a week of being typed. What the site
 * prints instead is read from the workbook itself (its banner row, when Dave
 * gives it one) and from git (when the file last changed) - see readLeague in
 * extract.mjs. Nothing here needs editing when a new week is entered.
 *
 * `match` changes when a SEASON ends: Scoreholio mints a fresh id for the
 * next season and Dave starts a fresh workbook named after it. Until this
 * list is updated the build keeps reading the old season's final table and
 * says nothing, because that file is still a perfectly valid workbook. So
 * when a league's standings stop moving for weeks while its games keep
 * coming, this is the first place to look.
 */
export const LEAGUES = [
  { id: 'og-s9',         label: 'OG Season 9',             match: 'Player-Rankings-qPZaoc9bT9aNH9pGwC4t', share: 'IQCD90K-5FrYRqoXano6K34aAaF5iBmXGlS7rZzgzuZIPqQ' },
  { id: 'tue-am',        label: 'Tuesday AM',              match: 'Player-Rankings-TznNqHP1zjSPHUOSSnko', share: 'IQAofmLaJ1HuS41ioD1-enLRAefog8Qtx4Wztv41YraBNzU' },
  // `final`: the season is over and this is its closing table. It will never
  // change again, so the weekly job does not read "unchanged for a month" as a
  // sign Dave moved to a new workbook. Take the flag off when the league restarts.
  { id: 'tue-pickle',    label: 'Tuesday Pickle Club',     match: 'Player-Rankings-1POLChlc4FtKzhtRqQRF', share: 'IQDbLXIAd5bdSbPcwWLcOMiqAToZXiQa57xEVZts5lkQxkE', final: true },
  { id: 'wed-newbridge', label: 'Wednesday Newbridge Inn', match: 'Player-Rankings-HnAtFNN1bzW2DuOVGi3K', share: 'IQA6GlpMVisoSqL3cWOWYOtZAVI5qnZzx0qes3ejkBpXITI' },
  { id: 'thu-carpenters',label: 'Thursday Carpenters Pub', match: 'Player-Rankings-k946hMkXbiIfXMms8bKB', share: 'IQBbS7ywOp2wSpZhKQT0o3f4AXO0fnjXmAey1wnW_2lt7ws' },
  { id: 'fri-am',        label: 'Friday AM',               match: 'Player-Rankings-IpkPLQgrcTaT1jOUuymH', share: 'IQBijrfM5_s5TpWDh84NWQcfAdOyAoVP0d2K0ASOBXAAXO8' },
];

/**
 * A URL that downloads the league's workbook as the original .xlsx.
 *
 * The share link Dave hands out opens Excel Online, whose only way out is a
 * File > Export menu that has to be clicked through, and that is how a
 * scheduled run came to report success five times while delivering nothing.
 * The same link with `download=1` skips the viewer and serves the file. It is
 * the ORIGINAL workbook, every sheet intact, which also means the filename
 * carries the season id and `newestMatching` finds it unchanged.
 *
 * Opened in a browser this lands in Downloads under the workbook's own name,
 * with Chrome's " (1)" suffix if a copy is already there. The weekly job
 * copies it into the repo under the clean `${match}.xlsx` so the folder holds
 * one file per league and the git date on it is the date the numbers changed.
 */
export const downloadUrl = (l) =>
  `https://onedrive.live.com/:x:/g/personal/E914DC20F5C50B12/${l.share}?download=1`;

// These two carry no stable id, and the master's name states a count that grows
// - "8_Tournaments" becomes "9_Tournaments" - so they are matched on the part
// of the name that holds still.
export const MASTER = 'MIP_Master_Standings';
export const HEAD2HEAD = 'MIP_Updated_Head_to_Head';

/**
 * The newest file in DIR whose name starts with `prefix`, with its date.
 *
 * Newest by modification time rather than by the bracketed number, because the
 * number counts collisions in a folder and not versions of a workbook: delete
 * the older copies and the next download is "(1)" again.
 *
 * @throws when nothing matches. A missing league must stop the build - shipping
 *   a site with one league silently absent is worse than not shipping.
 */
/**
 * WHEN THIS WORKBOOK WAS LAST ACTUALLY REPLACED - which is not its mtime.
 *
 * Moving the workbooks into the repo cost us the timestamp. Git does not store
 * mtimes; a clone stamps every file with the moment it was checked out, so on
 * the machine that matters most - the one running the Sunday job from a fresh
 * clone - all eight workbooks claim to have been downloaded seconds ago, and a
 * staleness check that believes them is worse than no check at all, because it
 * reports "current" with total confidence about a file nobody has touched in a
 * month.
 *
 * What git DOES keep is when the file's contents last changed, so that is what
 * is asked for. Outside a checkout - a loose folder of downloads, which is
 * still supported - there is no history to ask and the mtime is the honest
 * answer.
 */
function lastChanged(dir, file, mtime) {
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    // A file that differs from HEAD - edited, or brand new and untracked - was
    // changed AFTER its last commit, so the commit date is the wrong answer
    // and the mtime is the right one. This is the normal state during the
    // weekly job: it fetches the workbooks, builds, and only THEN commits, so
    // at build time every refreshed workbook is exactly this case. Asking git
    // alone stamped each one with the previous week's date.
    if (git('status', '--porcelain', '--', file)) return { ms: mtime, from: 'file' };
    const iso = git('log', '-1', '--format=%cI', '--', file);
    if (iso) return { ms: new Date(iso).getTime(), from: 'git' };
  } catch { /* not a checkout, or no git on the machine */ }
  return { ms: mtime, from: 'file' };
}

export function newestMatching(prefix, what = prefix, dir = DIR) {
  let files;
  try {
    files = readdirSync(dir);
  } catch (e) {
    throw new Error(`cannot read the downloads folder ${dir} - ${e.message}`);
  }
  const hits = files
    .filter((f) => f.startsWith(prefix) && /\.xlsx?$/i.test(f) && !f.startsWith('~$'))
    .map((f) => ({ file: f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!hits.length) {
    throw new Error(
      `no workbook for ${what}: nothing in ${dir} starts with "${prefix}". `
      + `Download it again from the Stats & Standings page on merrickinapickle.com.`);
  }
  // Newest is still decided by mtime. Within one folder that is the right
  // question - which copy landed here last - and it is answerable for an
  // untracked download that git has never heard of.
  const best = hits[0];
  const changed = lastChanged(dir, best.file, best.mtime);
  return {
    file: best.file, mtime: best.mtime,
    dated: changed.ms, datedFrom: changed.from,
    alternatives: hits.length - 1,
  };
}
