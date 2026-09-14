// Tests for how the build decides WHICH downloaded workbook is this week's.
//
// This is the failure that does not announce itself. Every other mistake in the
// pipeline throws, or shows up as a number that is obviously wrong. Reading
// "Player-Rankings-... (10).xlsx" when "(11)" is sitting beside it produces a
// site that is complete, internally consistent, and a week out of date. So the
// rules get tested one at a time: newest wins, lock files are not workbooks,
// another league's file is not this league's file, and nothing at all is an
// error rather than a silent skip.

import { newestMatching, LEAGUES, MASTER, HEAD2HEAD } from './sources.mjs';
import { standingsStaleness, resolved } from './extract.mjs';
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const dir = mkdtempSync(join(tmpdir(), 'sources-'));
/** Write a file and stamp it `daysAgo` days old, so "newest" means something. */
const put = (name, daysAgo = 0) => {
  const p = join(dir, name);
  writeFileSync(p, 'x');
  const when = Date.now() / 1000 - daysAgo * 86400;
  utimesSync(p, when, when);
  return p;
};
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

/* ---- picking the right file ---- */

put('Player-Rankings-ABC (10).xlsx', 7);
put('Player-Rankings-ABC (11).xlsx', 0);
t('the newest download wins, not the highest bracket number',
  newestMatching('Player-Rankings-ABC', 'ABC', dir).file === 'Player-Rankings-ABC (11).xlsx');

t('and the older copies are counted, not hidden',
  newestMatching('Player-Rankings-ABC', 'ABC', dir).alternatives === 1);

// The bracket number counts collisions in a folder, not versions of a file:
// clear out Downloads and tomorrow's export is "(1)" again, older than nothing.
put('Player-Rankings-DEF (9).xlsx', 30);
put('Player-Rankings-DEF.xlsx', 1);
t('a re-downloaded file with no number beats an old numbered one',
  newestMatching('Player-Rankings-DEF', 'DEF', dir).file === 'Player-Rankings-DEF.xlsx');

/* ---- what is not a workbook ---- */

put('~$Player-Rankings-GHI.xlsx', 0);   // Excel's lock file, written when Dave opens it
put('Player-Rankings-GHI (2).xlsx', 5);
t('an open-in-Excel lock file is not mistaken for the workbook',
  newestMatching('Player-Rankings-GHI', 'GHI', dir).file === 'Player-Rankings-GHI (2).xlsx');

put('Player-Rankings-JKL.csv', 0);
put('Player-Rankings-JKL (3).xlsx', 4);
t('a CSV of the same name is not read as a workbook',
  newestMatching('Player-Rankings-JKL', 'JKL', dir).file === 'Player-Rankings-JKL (3).xlsx');

put('Player-Rankings-MNO.xls', 0);
t('the older .xls format still counts',
  newestMatching('Player-Rankings-MNO', 'MNO', dir).file === 'Player-Rankings-MNO.xls');

/* ---- not finding one ---- */

const missing = threw(() => newestMatching('Player-Rankings-NOPE', 'Friday AM', dir));
t('a missing league stops the build instead of vanishing from the site', missing !== null);
t('and the message names the league in plain English', /Friday AM/.test(missing || ''), missing);
t('and says where to get it', /merrickinapickle\.com/.test(missing || ''), missing);

const noFolder = threw(() => newestMatching('anything', 'anything', join(dir, 'not-here')));
t('an unreadable downloads folder is its own error', /downloads folder/.test(noFolder || ''), noFolder);

/* ---- one league's file is never another's ---- */

const ids = LEAGUES.map((l) => l.match);
t('every league has a match prefix', ids.every((m) => typeof m === 'string' && m.length > 20));
t('no two leagues share a prefix', new Set(ids).size === ids.length);
t('no prefix is a prefix of another (one league would shadow the next)',
  ids.every((a) => ids.filter((b) => b !== a).every((b) => !b.startsWith(a))));
t('the master and head-to-head prefixes do not collide with a league',
  ids.every((a) => !a.startsWith(MASTER) && !a.startsWith(HEAD2HEAD)));

// A prefix that matched loosely would quietly hand Tuesday's numbers to Friday.
mkdirSync(join(dir, 'two'), { recursive: true });
const two = join(dir, 'two');
writeFileSync(join(two, `${LEAGUES[0].match} (1).xlsx`), 'x');
writeFileSync(join(two, `${LEAGUES[1].match} (1).xlsx`), 'x');
t('with two leagues side by side each resolves to its own file',
  newestMatching(LEAGUES[0].match, LEAGUES[0].label, two).file.startsWith(LEAGUES[0].match)
  && newestMatching(LEAGUES[1].match, LEAGUES[1].label, two).file.startsWith(LEAGUES[1].match));

/* ---- how old is this workbook, really ---- */
//
// The question the whole staleness check rests on. Outside a checkout it is the
// file's own timestamp. Inside one it must NOT be, because `git clone` stamps
// every file with the moment it was cloned - so on the machine running the
// Sunday job, a month-old workbook would report itself as seconds old and the
// check would confidently say "current" about standings nobody had touched.

t('outside a checkout, the file timestamp is the answer',
  newestMatching('Player-Rankings-ABC', 'ABC', dir).datedFrom === 'file');

{
  const repo = join(dir, 'repo');
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  let haveGit = true;
  try {
    git('init', '-q');
    git('config', 'user.email', 't@t'); git('config', 'user.name', 'T');
    writeFileSync(join(repo, 'Player-Rankings-ZZZ.xlsx'), 'x');
    git('add', '-A');
    execFileSync('git', ['commit', '-q', '-m', 'add', '--date', '2026-01-15T12:00:00'],
      { cwd: repo, stdio: 'ignore', env: { ...process.env, GIT_COMMITTER_DATE: '2026-01-15T12:00:00' } });
  } catch { haveGit = false; }

  if (!haveGit) { console.log('  (skipped the git checks - no usable git here)'); }
  else {
    // A checkout, so the timestamp on disk is meaningless. Make it obviously so.
    const future = new Date('2030-06-01').getTime() / 1000;
    utimesSync(join(repo, 'Player-Rankings-ZZZ.xlsx'), future, future);
    const hit = newestMatching('Player-Rankings-ZZZ', 'ZZZ', repo);
    t('inside a checkout the date comes from git, not the file', hit.datedFrom === 'git');
    t('and it is the date the workbook was last committed',
      new Date(hit.dated).toISOString().slice(0, 7) === '2026-01',
      new Date(hit.dated).toISOString());
    t('a clone-fresh timestamp cannot pass a stale file off as current',
      hit.dated < new Date('2027-01-01').getTime());
  }
}

/* ---- the staleness report ---- */
//
// Its whole job is to say "these standings are older than these games". It has
// to be readable at a glance, which mostly means it must never print something
// that makes a reader stop and work out what it meant.

const dayMs = 86400000;
const stale = (mtime, newestGame) => {
  resolved.length = 0;
  resolved.push({ what: 'test', file: 'test.xlsx', mtime, alternatives: 0 });
  return standingsStaleness(newestGame)[0];
};

// Noon Eastern, so neither the UTC nor the ET date is in doubt either way.
const noonET = (iso) => new Date(`${iso}T16:00:00Z`).getTime();

t('a file downloaded the day of the last game is current',
  stale(noonET('2026-09-11'), '2026-09-11').daysBehind === 0);
t('a week-old file is seven days behind',
  stale(noonET('2026-09-04'), '2026-09-11').daysBehind === 7);
t('and it reports the date it was downloaded',
  stale(noonET('2026-09-04'), '2026-09-11').downloaded === '2026-09-04');

// The bug this file was written after: a game's date has no clock on it, so it
// lands at midnight, and a workbook downloaded that same evening looked like it
// came from the future. "-1d behind" is not a thing anyone can act on.
t('an evening download after the last game is 0 behind, never negative',
  stale(new Date('2026-09-12T01:30:00Z').getTime(), '2026-09-11').daysBehind === 0);
t('a file downloaded days after the last game is still just current',
  stale(noonET('2026-09-20'), '2026-09-11').daysBehind === 0);

// Downloaded 9pm Thursday in Merrick is 1am Friday in UTC. Reading that as
// Friday would make every evening download look a day fresher than it is.
t('a late-evening download keeps its Eastern date',
  stale(new Date('2026-09-11T01:30:00Z').getTime(), '2026-09-14').downloaded === '2026-09-10');

t('the report leads with the most stale file', (() => {
  resolved.length = 0;
  resolved.push({ what: 'fresh', file: 'a.xlsx', mtime: Date.now(), alternatives: 0 });
  resolved.push({ what: 'ancient', file: 'b.xlsx', mtime: Date.now() - 40 * dayMs, alternatives: 0 });
  const rows = standingsStaleness(new Date().toISOString().slice(0, 10));
  return rows[0].what === 'ancient' && rows[0].daysBehind >= 39;
})());

resolved.length = 0;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
