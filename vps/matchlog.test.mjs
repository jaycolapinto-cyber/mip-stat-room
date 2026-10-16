import { readFileSync } from 'node:fs';
import { checkMatchLog } from './matchlog.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};

const real = readFileSync(new URL('../importer/live/exports/Matchlog-QLp7aBlvok0F6yEhWb0S.csv', import.meta.url), 'utf8');
is(checkMatchLog(real), { ok: true, games: 49 }, 'a real night (Carpenters Pub Week 4) is whole: 49 games');
is(checkMatchLog(real.replace(/\n/g, '\r\n')).ok, true, 'Windows line endings, as Scoreholio writes them, read the same');

const header = real.split('\n')[0];
is(checkMatchLog(header + '\n').ok, false, 'header only (table not loaded yet, the 175-byte file) is refused');
is(checkMatchLog('<html>error</html>').ok, false, 'an error page is refused');
const short = real.split('\n').filter((l, i) => i !== 5).join('\n');
is(checkMatchLog(short).ok, false, 'a missing game (48 rows, highest number 49) is refused');

console.log(`\n${pass} passed, ${fail} failed   (match log check)`);
if (fail) process.exit(1);
