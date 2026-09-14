import { splitSweep, sessionTsv, batchExport } from './sweep2026.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};
const ok = (c, what) => { if (c) pass++; else { fail++; console.log(`FAIL ${what}`); } };

const HEAD = '"#","","Date/Time","Game Num","Crt","Sport","Team 1","Team 2","Score","Score 2","Wait Duration","Play Duration","Submit Source","Type","Match Type","Schedule Id","Match ID"';
const ROW = (n, id) => `"${n}","","2026-03-02T02:14:28.000Z","","7","","A B. & C D.","E F. & G H.","9 - 11","11 - 9","","","Scoreboard","Live","","","${id}"`;

const SAMPLE = [
  '##### TOURNAMENT aaa\t1767315600\tMonday League S-3 Wk-1',
  '##### ROSTER',
  'Chasette Gold\tDanielle Farruggia\t3.396\tu1',
  'Paul H.\tPaul Heiser\t3.444\tu2',
  '##### MATCHLOG',
  HEAD,
  ROW(1, 'm1'),
  ROW(2, 'm2'),
  '##### TOURNAMENT bbb\t1767402000\tFriday Bracket B',
  '##### ROSTER',
  'Rob S.\tRob Sarraga\t3.1\tu3',
  '##### MATCHLOG',
  HEAD,
  ROW(1, 'm3'),
].join('\n');

// ------------------------------------------------------------ the basic split
{
  const t = splitSweep(SAMPLE);
  is(t.length, 2, 'two tournaments read');
  is(t[0].id, 'aaa', 'id read');
  is(t[0].ts, 1767315600, 'timestamp read');
  is(t[0].name, 'Monday League S-3 Wk-1', 'name read');
  is(t[0].roster.length, 2, 'roster rows read');
  is(t[0].roster[0].full, 'Danielle Farruggia', 'real name read');
  is(t[0].roster[0].user, 'u1', 'stable user id read');
  is(t[0].csv.length, 3, 'header plus two rows');
  is(t[1].csv.length, 2, 'second tournament kept separate');
}

// ------------------------------------------- a section header never leaks into data
{
  const t = splitSweep(SAMPLE);
  ok(!t.some((x) => x.csv.some((l) => l.startsWith('#####'))), 'no marker inside a csv');
  ok(!t.some((x) => x.roster.some((p) => p.display.startsWith('#####'))), 'no marker inside a roster');
}

// ----------------------------------------- a tournament with no log is not dropped
// The roster still names people, and those names resolve handles in OTHER
// tournaments. Losing it because the log failed would lose real names.
{
  const t = splitSweep([
    '##### TOURNAMENT ccc\t1\tNo log here',
    '##### ROSTER',
    'Andy\tAndrew Ryan\t3.0\tu9',
    '##### MATCHLOG',
  ].join('\n'));
  is(t.length, 1, 'kept');
  is(t[0].roster.length, 1, 'roster kept');
  is(t[0].csv.length, 0, 'no csv rows');
  is(batchExport(t), '\n', 'and it contributes no match log');
  is(sessionTsv(t), 'ccc\tAndy\tAndrew Ryan\n', 'but it does contribute its name');
}

// ------------------------------- the session TSV is per tournament, never global
// "Michael S." is two different men on different nights. The tournament id has
// to travel with every row or the resolver cannot tell them apart.
{
  const t = splitSweep([
    '##### TOURNAMENT n1\t1\tone',
    '##### ROSTER',
    'Michael S.\tMichael Spezio\t3.5\tu1',
    '##### MATCHLOG',
    '##### TOURNAMENT n2\t2\ttwo',
    '##### ROSTER',
    'Michael S.\tMichael Scancarello\t3.5\tu2',
    '##### MATCHLOG',
  ].join('\n'));
  is(sessionTsv(t), 'n1\tMichael S.\tMichael Spezio\nn2\tMichael S.\tMichael Scancarello\n',
    'each answer carries its own night');
}

// --------------------------------- a roster row with no real name is not emitted
{
  const t = splitSweep([
    '##### TOURNAMENT d\t1\tx',
    '##### ROSTER',
    'Just A Handle\t\t\tu4',
    'Real One\tReal Person\t3.0\tu5',
    '##### MATCHLOG',
  ].join('\n'));
  is(t[0].roster.length, 2, 'both rows parsed');
  is(sessionTsv(t), 'd\tReal One\tReal Person\n', 'only the named one is emitted');
}

// ------------------------------------- the batch export is what readBatch expects
{
  const out = batchExport(splitSweep(SAMPLE));
  const lines = out.trim().split('\n');
  is(lines[0], '##### TOURNAMENT aaa', 'marker first');
  is(lines[1], HEAD, 'then the header exactly as Scoreholio wrote it');
  is(lines.filter((l) => l.startsWith('##### TOURNAMENT')).length, 2, 'one marker per tournament');
  ok(out.includes('"9 - 11"'), 'the two-game score range survives untouched');
}

// ------------------------------------------------- trailing blank lines are trimmed
{
  const t = splitSweep('##### TOURNAMENT z\t1\tz\n##### ROSTER\n##### MATCHLOG\n' + HEAD + '\n' + ROW(1, 'm') + '\n\n\n');
  is(t[0].csv.length, 2, 'blank tail dropped, real rows kept');
}

console.log(`\nsweep2026: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
