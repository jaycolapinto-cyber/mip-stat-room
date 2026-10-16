// Tests for the DUPR Rankings reader. Until a saved copy of the real page is
// added (taken on the first supervised run), these use rows shaped the way the
// club list was read by hand all autumn.
import { rowsFromLeaves, judge } from './duprrows.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log(`FAIL ${what}`); } };

const R = (rank, name, id, badge, rating) =>
  ({ href: `/dashboard/player/${id}`, name, leaves: [String(rank), name, String(badge), rating] });

// ---------------------------------------------------------------- shape
{
  const { rows, problems } = rowsFromLeaves([R(2, 'Laura Zitzloff', '6191566621', 80, '4.690')]);
  is(problems, [], 'a clean row has no problems');
  is(rows[0], { rank: 2, name: 'Laura Zitzloff', duprId: '6191566621', matches: 80, rating: 4.69 }, 'every field read from its own element');
}

// The badge and rating are separate elements and must never merge ("804.690").
{
  const { rows } = rowsFromLeaves([R(1, 'Laura Zitzloff', '6191566621', 80, '4.690')]);
  is([rows[0].matches, rows[0].rating], [80, 4.69], 'badge 80 and rating 4.690 stay apart');
}

// Unrated members are kept with rating null, like the paste reader.
{
  const { rows } = rowsFromLeaves([R(9, 'New Member', '42', 0, 'NR')]);
  is(rows[0].rating, null, 'NR reads as no rating');
}

// The same player twice (list re-rendered while scrolling) is one row.
{
  const { rows } = rowsFromLeaves([R(1, 'A One', '11', 5, '3.100'), R(1, 'A One', '11', 5, '3.100')]);
  is(rows.length, 1, 'a repeated id is not two people');
}

// Extra decoration in the row (avatar initials, labels) doesn't confuse it.
{
  const { rows } = rowsFromLeaves([{ href: '/dashboard/player/77', name: 'Sal Farruggia', leaves: ['3', 'SF', 'Sal Farruggia', 'Merrick', '100', '4.698'] }]);
  is([rows[0].rank, rows[0].matches, rows[0].rating], [3, 100, 4.698], 'rank before the name, badge and rating after it');
}

// ---------------------------------------------------------------- judge
const club = (n, top, bottom) => Array.from({ length: n }, (_, i) =>
  ({ rank: i + 1, name: `P${i}`, duprId: String(1000 + i), matches: 50, rating: +(top - (top - bottom) * i / (n - 1)).toFixed(3) }));

ok(judge(club(360, 4.7, 2.8)).ok, 'a whole club reading passes');
ok(!judge(club(360, 4.7, 3.2)).ok, 'a floor above 3.0 means the list stopped short');
ok(!judge(club(120, 4.7, 2.8)).ok, 'too few players fails');
{
  const rows = club(360, 4.7, 2.8);
  [rows[10].rating, rows[11].rating] = [rows[11].rating, rows[10].rating];
  ok(!judge(rows).ok, 'ratings out of order fails');
}
{
  const rows = club(360, 4.7, 2.8);
  rows[5].duprId = rows[4].duprId;
  ok(!judge(rows).ok, 'duplicate ids fail');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
