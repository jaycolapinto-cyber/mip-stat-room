import { parsePaste, toTsv } from './duprpaste.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log(`FAIL ${what}`); } };

const L = (rank, name, id, m, r) => `${rank} [${name}](https://dashboard.dupr.com/dashboard/player/${id}) ${m} ${r}`;

// ---------------------------------------------------------------- shape
{
  const { rows, problems } = parsePaste(L(1, 'Laura Zitzloff', '6191566621', 80, '4.690'));
  is(problems, [], 'a clean row has no problems');
  is(rows.length, 1, 'one row read');
  is(rows[0], { rank: 1, name: 'Laura Zitzloff', duprId: '6191566621', matches: 80, rating: 4.69 }, 'every field read');
}

// One long line and one row per line must give the same answer. A paste
// arrives either way depending on where it was copied from.
{
  const three = [L(1, 'A One', '11', 5, '3.100'), L(2, 'B Two', '22', 6, '3.200'), L(3, 'C Three', '33', 7, '3.300')];
  const a = parsePaste(three.join('\n')).rows;
  const b = parsePaste(three.join(' ')).rows;
  is(a, b, 'newline-separated and space-separated parse identically');
  is(a.length, 3, 'all three read');
}

// ---------------------------------------------------------------- identity
// The whole reason for parsing the id: two accounts, one spelling apart.
{
  const { rows } = parsePaste([L(2, 'Sal Farruggia', '5447601035', 100, '4.653'),
                               L(255, 'Sal farruggia', '9990000111', 40, '3.354')].join('\n'));
  is(rows.length, 2, 'case-different names are two accounts, not one');
  ok(rows[0].duprId !== rows[1].duprId, 'they carry different player ids');
  is([rows[0].rating, rows[1].rating], [4.653, 3.354], 'and different ratings');
}

// An overlapping paste (the user copied a page twice) must not double a player.
{
  const row = L(7, 'Dupe Person', '4242', 9, '3.500');
  const { rows, problems } = parsePaste([row, row].join('\n'));
  is(rows.length, 1, 'the same id twice is one player');
  is(problems, [], 'and is not reported as a problem - overlapping pastes are normal');
}

// The same id under two spellings IS worth reporting.
{
  const { problems } = parsePaste([L(7, 'Bob Smith', '4242', 9, '3.500'),
                                   L(8, 'Robert Smith', '4242', 9, '3.500')].join('\n'));
  ok(problems.some((p) => p.includes('4242')), 'one id, two names is reported');
}

// ---------------------------------------------------------------- refusals
{
  const { rows, problems } = parsePaste(L(1, 'Way Too Good', '55', 10, '9.100'));
  is(rows.length, 0, 'a rating outside DUPR range is refused');
  ok(problems.length === 1, 'and reported');
}
{
  const { rows } = parsePaste('1 Laura Zitzloff 80 4.690');   // no markdown link
  is(rows.length, 0, 'a row with no player link is not a row');
}
{
  const { rows } = parsePaste('Merrick In A Pickle members 350 total');
  is(rows.length, 0, 'page furniture is ignored');
}

// NR - a member who has not been rated yet. Keep the name and the id.
{
  const { rows, problems } = parsePaste(L(300, 'New Member', '777', 2, 'NR'));
  is(problems, [], 'NR is not a problem');
  is(rows[0].rating, null, 'an unrated member has a null rating');
  is(rows[0].duprId, '777', 'but still carries an id');
}

// Thousands separators appear once a club member passes 1,000 matches.
{
  const { rows } = parsePaste(L(1, 'Busy Player', '99', '1,204', '4.100'));
  is(rows[0].matches, 1204, 'a comma in the match count is read as a number');
}

// ---------------------------------------------------------------- ordering
{
  const { rows } = parsePaste([L(3, 'Third', '3', 1, '3.000'), L(1, 'First', '1', 1, '4.000'),
                               L(2, 'Second', '2', 1, '3.500')].join('\n'));
  is(rows.map((r) => r.name), ['First', 'Second', 'Third'], 'rows come back in rank order');
}

// ---------------------------------------------------------------- output
{
  const { rows } = parsePaste([L(1, 'Laura Zitzloff', '6191566621', 80, '4.690'),
                               L(2, 'New Member', '777', 2, 'NR')].join('\n'));
  const tsv = toTsv(rows);
  is(tsv.split('\n')[0], 'Laura Zitzloff\t4.690\t6191566621\t80', 'the first two columns are the old format, unchanged');
  is(tsv.split('\n')[1], 'New Member\t\t777\t2', 'an unrated member writes an empty rating, not a zero');
  ok(tsv.endsWith('\n'), 'the file ends with a newline');
}

// The old two-column reader must still be able to read the new file.
{
  const { rows } = parsePaste(L(1, 'Laura Zitzloff', '6191566621', 80, '4.690'));
  const [name, rating] = toTsv(rows).trim().split('\n')[0].split('\t');
  is([name, Number(rating)], ['Laura Zitzloff', 4.69], 'name and rating still read off the first two columns');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
