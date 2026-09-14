// Tests for the DUPR match-list parser.
//
// The parser's whole value is that it refuses what it does not understand.
// These tests pin BOTH halves of that: the two shapes it does understand are
// parsed exactly, and anything else is reported rather than guessed at.
import { parsePaste, parseDate } from './duprmatches.mjs';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

/* ------------------------------------------------------------------ dates */
t('a full date line parses', parseDate('September 11, 2026') === '2026-09-11');
t('a single-digit day is padded', parseDate('March 3, 2026') === '2026-03-03');
t('a non-date line is not a date', parseDate('Clear Filters') === null);
t('a nonsense month is not a date', parseDate('Smarch 3, 2026') === null);

/* ---------------------------------------------------------------- doubles */
const DOUBLES = `September 11, 2026
Jonathan Gottesmann
Jeffrey Fein
11
Danielle Farruggia
Jason Vargas
6
Match ID: L5LLOQRG5`;

{
  const r = parsePaste(DOUBLES);
  t('one doubles game', r.games.length === 1 && r.singles.length === 0);
  t('no problems', r.problems.length === 0, JSON.stringify(r.problems));
  const g = r.games[0];
  t('teams are read in order', g.a.join('|') === 'Jonathan Gottesmann|Jeffrey Fein');
  t('the second team is read in order', g.b.join('|') === 'Danielle Farruggia|Jason Vargas');
  t('scores follow their own side', g.sa === 11 && g.sb === 6);
  t('the match id is kept', g.matchId === 'L5LLOQRG5');
  t('the date is normalised', g.date === '2026-09-11');
}

/* ---------------------------------------------------------------- singles */
// Six lines, one name and one score per side. Real block from March 18 2026.
const SINGLES = `March 18, 2026
Albert Rocaberte
15
Vincent Vizcarra
10
Match ID: W6GR99XJQ`;

{
  const r = parsePaste(SINGLES);
  t('a singles block is understood, not refused', r.problems.length === 0, JSON.stringify(r.problems));
  t('singles never land in games', r.games.length === 0);
  t('singles land in singles', r.singles.length === 1);
  const s = r.singles[0];
  t('each singles side holds exactly one player', s.a.length === 1 && s.b.length === 1);
  t('singles players are read in order', s.a[0] === 'Albert Rocaberte' && s.b[0] === 'Vincent Vizcarra');
  t('singles scores follow their own side', s.sa === 15 && s.sb === 10);
  t('the singles match id is kept', s.matchId === 'W6GR99XJQ');
}

/* ------------------------------------------- the two shapes back to back */
// This is the case that matters: if the parser mis-measured either block it
// would consume the wrong number of lines and corrupt everything after it.
{
  const r = parsePaste(`${SINGLES}\n\n${DOUBLES}\n\n${SINGLES.replace('W6GR99XJQ', 'ZZZ11111')}`);
  t('mixed shapes all parse', r.problems.length === 0, JSON.stringify(r.problems));
  t('mixed: one doubles', r.games.length === 1 && r.games[0].matchId === 'L5LLOQRG5');
  t('mixed: two singles', r.singles.length === 2);
  t('mixed: the block AFTER a singles block is still read correctly',
    r.games[0].a.join('|') === 'Jonathan Gottesmann|Jeffrey Fein' && r.games[0].sa === 11);
  t('mixed: the second singles block survives the doubles block',
    r.singles[1].matchId === 'ZZZ11111' && r.singles[1].sa === 15);
}

/* ----------------------------------------------------------- it refuses */
{
  // A block with a name where a score belongs is not a shape we know.
  const r = parsePaste(`March 18, 2026
Albert Rocaberte
Vincent Vizcarra
Match ID: BROKEN01`);
  t('an unknown shape is reported, not guessed', r.problems.length === 1);
  t('an unknown shape produces no game', r.games.length === 0 && r.singles.length === 0);
}
{
  // Missing the Match ID line entirely.
  const r = parsePaste(`March 18, 2026
Albert Rocaberte
15
Vincent Vizcarra
10`);
  t('a singles block with no match id is refused', r.problems.length === 1 && r.singles.length === 0);
}
{
  const r = parsePaste(SINGLES.replace('\n10\n', '\n15\n'));
  t('a tied singles game is a problem, not a result', r.problems.length === 1 && r.singles.length === 0);
}
{
  const r = parsePaste(SINGLES.replace('Vincent Vizcarra', 'Albert Rocaberte'));
  t('a singles game against yourself is a problem', r.problems.length === 1 && r.singles.length === 0);
}
{
  const r = parsePaste(DOUBLES.replace('\n6\n', '\n11\n'));
  t('a tied doubles game is a problem, not a result', r.problems.length === 1 && r.games.length === 0);
}
{
  const r = parsePaste(DOUBLES.replace('Jason Vargas', 'Jeffrey Fein'));
  t('a doubles game listing one player twice is a problem', r.problems.length === 1 && r.games.length === 0);
}
{
  // Page furniture between matches must not knock the parser out of step.
  const r = parsePaste(`Sort\nSinglesDoubles\nClear Filters\n\n${DOUBLES}`);
  t('page furniture is skipped, not fatal', r.problems.length === 0 && r.games.length === 1);
  t('page furniture is counted as skipped lines', r.skippedLines === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
