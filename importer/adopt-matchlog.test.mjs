// Tests for adopting a downloaded Scoreholio export.
//
// The property under test is not "a good file is copied" - it is "a file that
// is NOT this week's match log is refused." An unattended job runs against a
// Downloads folder with years of clutter in it, and the cost of adopting the
// wrong file is a week of games silently attributed to the wrong night.

import { adopt, isMatchLog, headerOf, newestDownload } from './adopt-matchlog.mjs';
import { mkdtempSync, writeFileSync, utimesSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const dir = mkdtempSync(join(tmpdir(), 'adopt-'));
const into = join(dir, 'exports');
mkdirSync(into, { recursive: true });

const HEAD = '﻿"#","","Date/Time","Game Num","Crt","Sport","Team 1","Team 2","Score","Score 2",'
  + '"Wait Duration","Play Duration","Submit Source","Type","Match Type","Schedule Id","Match ID"';
const ROW = '"27","","2026-09-11T18:57:37.000Z","","2","","Winnie Gao & Frederick Halikias",'
  + '"Jackie Mahoney & Karen Mangione","11 - 9","9 - 11","00:00:53","00:10:24","Scoreboard","Live","","","mF0sljUp8RoVLU3EigTW"';

const put = (name, body, secondsAgo = 0) => {
  const p = join(dir, name);
  writeFileSync(p, body);
  const when = Date.now() / 1000 - secondsAgo;
  utimesSync(p, when, when);
  return p;
};
const ID = 'Gd74j4mX1TLc0txQvI7t';

/* ---- recognising the file ---- */

t('the BOM does not break the first column', headerOf(HEAD)[2] === 'Date/Time');
t('a real export is recognised', isMatchLog(HEAD + '\n' + ROW).ok);
t('a CSV missing the clocks is not a match log',
  !isMatchLog('"Date/Time","Crt","Team 1","Team 2","Score","Match ID"').ok);
t('and it says which columns were missing',
  isMatchLog('"Date/Time"').missing.includes('Play Duration'));
t('an unrelated download is not a match log', !isMatchLog('name,amount\nfoo,1').ok);

/* ---- picking the file ---- */

put('CreditCardStatement.pdf', '%PDF-1.4 nonsense', 5);
put('export.tmp', HEAD + '\n' + ROW, 1);
t('the newest file wins regardless of extension',
  newestDownload(dir).file === 'export.tmp');

// The real thing arrives as a GUID with a .tmp extension, not Matchlog-*.csv.
{
  const r = adopt(ID, dir, { into });
  t('a .tmp GUID download is adopted on its contents, not its name', r.ok, r.reason);
  t('and lands under the name the importer looks for',
    r.ok && r.file.endsWith(`Matchlog-${ID}.csv`), r.file);
  t('with the games intact', r.matches === 1, String(r.matches));
  t('and the bytes are unchanged',
    readFileSync(join(into, `Matchlog-${ID}.csv`), 'utf8').includes('00:10:24'));
}

/* ---- refusing ---- */

{
  put('something-else.pdf', 'not a csv at all', 0);
  const r = adopt(ID, dir, { into });
  t('a non-match-log landing last is refused, not adopted', !r.ok, JSON.stringify(r));
  t('and the refusal names what it found', /not a match log/.test(r.reason || ''), r.reason);
}

{
  // Stale clutter must not be mistaken for a fresh export.
  const old = mkdtempSync(join(tmpdir(), 'adopt-old-'));
  writeFileSync(join(old, 'Matchlog-ancient.csv'), HEAD + '\n' + ROW);
  const when = Date.now() / 1000 - 7 * 86400;
  utimesSync(join(old, 'Matchlog-ancient.csv'), when, when);
  const r = adopt(ID, old, { into });
  t('a week-old file is not treated as a fresh export', !r.ok, JSON.stringify(r));
  t('and says nothing was downloaded', /nothing downloaded/.test(r.reason || ''), r.reason);
}

{
  const empty = mkdtempSync(join(tmpdir(), 'adopt-empty-'));
  writeFileSync(join(empty, 'header-only.tmp'), HEAD);
  t('a header with no games is refused', !adopt(ID, empty, { into }).ok);
}

t('a bogus tournament id is refused before anything is touched',
  !adopt('../../etc/passwd', dir, { into }).ok);
t('and so is an empty one', !adopt('', dir, { into }).ok);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
