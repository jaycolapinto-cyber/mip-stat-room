// The known-answer test.
//
// We hold the same 48 games from two independent sources: a scrape of
// Scoreholio's public dashboard, and Scoreholio's own organizer export. They
// must agree on who played and what the score was. Where they disagree - the
// court number - the export is right and the dashboard column was a display
// index, which is exactly the kind of mistake this test exists to keep caught.
import { readExport, tournamentIdFromFilename, readScores, readCourt, readDuration, readWait } from './scoreholio.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

/* ---- the two export shapes ---- */
// .xlsx: a plain number in each column.
t('xlsx shape reads', JSON.stringify(readScores('11', '6')) === '[11,6]');
// .csv: "9 - 11" in Score, mirrored in Score 2. Both mean team 1 scored 9.
t('csv shape reads, and is not reversed', JSON.stringify(readScores('9 - 11', '11 - 9')) === '[9,11]');
t('csv shape tolerates loose spacing', JSON.stringify(readScores('10-12', '12-10')) === '[10,12]');
// If the two columns disagree the row is refused, not averaged or guessed at.
t('disagreeing columns are refused', readScores('9 - 11', '11 - 8') === null);
t('nonsense is refused', readScores('', '') === null && readScores('abc', 'def') === null);
// A range in Score with an empty Score 2 is still readable - the mirror is a
// check when present, not a requirement.
t('a lone range still reads', JSON.stringify(readScores('15 - 13', '')) === '[15,13]');

t('a csv filename yields its tournament id',
  tournamentIdFromFilename('Matchlog-NHAIcwI0obnhGPWUUi59.csv') === 'NHAIcwI0obnhGPWUUi59');

/* ---- the csv export end to end ---- */
const CSV = new URL('./live/exports/Matchlog-NHAIcwI0obnhGPWUUi59.csv', import.meta.url);
const c = readExport(CSV);
t('the csv export reads cleanly', c.games.length === 33 && c.problems.length === 0);
t('csv games carry unique Match IDs', new Set(c.games.map((g) => g.matchId)).size === 33);
t('csv scores are never tied', c.games.every((g) => g.sa !== g.sb));
t('csv games have two players a side',
  c.games.every((g) => g.handlesA.length === 2 && g.handlesB.length === 2));

const EXPORT = new URL('./live/exports/Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx', import.meta.url);
const e = readExport(EXPORT);

t('tournament id comes from the filename',
  tournamentIdFromFilename('Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx') === 'lMFLQ14a6PQdtFLojKWt');
t('a non-Scoreholio filename yields no id', tournamentIdFromFilename('whatever.xlsx') === null);
t('the export reads cleanly', e.games.length === 48 && e.problems.length === 0);
t('every game has a Match ID and they are unique',
  new Set(e.games.map((g) => g.matchId)).size === 48);
t('games come back oldest first', e.games.every((g, i) => i === 0 || e.games[i - 1].ts <= g.ts));
t('every game has two players a side',
  e.games.every((g) => g.handlesA.length === 2 && g.handlesB.length === 2));
t('no game is tied', e.games.every((g) => g.sa !== g.sb));

const sig = (a, b, sa, sb) => {
  const A = [...a].map((s) => s.trim()).sort().join('+');
  const B = [...b].map((s) => s.trim()).sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
};

const tsv = readFileSync(new URL('./live/friday-2026-09-11.tsv', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => {
    const c = l.split('\t');
    return { ts: +c[0], court: c[1], sig: sig(c[2].split('&'), c[4].split('&'), +c[3], +c[5]) };
  });

t('both sources hold the same number of games', tsv.length === e.games.length);

const pool = new Map();
for (const g of e.games) { if (!pool.has(g.sig ?? sig(g.handlesA, g.handlesB, g.sa, g.sb))) pool.set(sig(g.handlesA, g.handlesB, g.sa, g.sb), []); }
for (const g of e.games) pool.get(sig(g.handlesA, g.handlesB, g.sa, g.sb)).push(g);

let matched = 0, sameTs = 0, sameCourt = 0;
for (const r of tsv) {
  const q = pool.get(r.sig);
  if (!q?.length) continue;
  const g = q.shift();
  matched++;
  if (g.ts === r.ts) sameTs++;
  if (g.court === r.court) sameCourt++;
}
t('every game matches the other source on players and scores', matched === 48, `${matched}/48`);
t('every game matches the other source on timestamp', sameTs === 48, `${sameTs}/48`);

// This is the assertion that documents the bug. The dashboard's leftmost column
// is NOT a court, so the two sources must NOT agree here - and the export's
// courts must be the real ones.
t('the dashboard column disagrees with the real court, as expected', sameCourt === 0, `${sameCourt}/48 agreed`);
t('real courts are the ones from the export',
  [...new Set(e.games.map((g) => g.court))].sort().join(',') === '11,12,6');

/* ---------------------------------------------- harvest batch format */
// A harvest batch is many tournaments' CSVs in one file, each under a
// "##### TOURNAMENT <id>" header. It must go through exactly the same parser as
// a single export - a second, looser reader is how two sources start
// disagreeing about the same game.
{
  const { rowsToGames } = await import('./scoreholio.mjs');
  const rows = [
    { '#': '1', 'Date/Time': '2026-09-04T13:01:04.000Z', 'Crt': '6',
      'Team 1': 'Jay C & Chase Gold', 'Team 2': 'Bill L. & D-Hub27',
      'Score': '13 - 11', 'Score 2': '11 - 13', 'Match ID': 'AAA111' },
  ];
  const r = rowsToGames(rows, 'test');
  t('batch rows parse through the shared reader', r.games.length === 1 && r.problems.length === 0,
    JSON.stringify(r.problems));
  t('batch keeps the real court', r.games[0].court === '6');
  t('batch reads the mirrored score shape', r.games[0].sa === 13 && r.games[0].sb === 11);
  t('batch splits both teams', r.games[0].handlesA.length === 2 && r.games[0].handlesB.length === 2);
  t('batch keeps the match id', r.games[0].matchId === 'AAA111');

  // The same refusals must still apply inside a batch.
  const tied = rowsToGames([{ ...rows[0], 'Score': '11 - 11', 'Score 2': '11 - 11', 'Match ID': 'B' }], 'test');
  t('a tied game inside a batch is refused', tied.games.length === 0 && tied.problems.length === 1);

  const short = rowsToGames([{ ...rows[0], 'Team 1': 'Only One', 'Match ID': 'C' }], 'test');
  t('a one-player side inside a batch is refused', short.games.length === 0 && short.problems.length === 1);

  let threw = false;
  try { rowsToGames([{ foo: 'bar' }], 'test'); } catch { threw = true; }
  t('a file with no Match ID column is refused outright', threw);
}

/* ------------------------------------------- the real batch on disk */
{
  const { readAllExports } = await import('./scoreholio.mjs');
  const all = readAllExports();
  const batch = all.filter((e) => /\.txt$/.test(e.file));
  t('the harvest batch on disk is read', batch.length >= 1, String(batch.length));
  if (batch.length) {
    t('each batch entry carries its tournament id', batch.every((e) => /^[A-Za-z0-9]{10,}$/.test(e.tournamentId)),
      batch.map((e) => e.tournamentId).join());
    // A 338-tournament harvest legitimately contains a few events that were
    // created and never played, so "every entry has games" is too strong. What
    // must hold is that the bulk carry games AND that courts survived the
    // round trip - the court column is the one this project has got wrong
    // before, by reading a display index as a court number.
    const withGames = batch.filter((e) => e.games.length > 0);
    t('nearly every batch entry yields games', withGames.length >= batch.length * 0.9,
      `${withGames.length} of ${batch.length}`);
    t('the batch games carry courts', withGames.every((e) => e.games.some((g) => g.court)));

    // Parse problems are allowed, but ONLY the known one: Scoreholio logs
    // singles and odd-sized teams alongside doubles, and this importer is a
    // doubles importer. Any OTHER refusal means the file shape has changed and
    // should fail loudly rather than be absorbed.
    const problems = batch.flatMap((e) => e.problems);
    const unexpected = problems.filter((p) => !/expected two players a side/.test(p.why));
    t('the only parse refusals are non-doubles matches', unexpected.length === 0,
      JSON.stringify(unexpected.slice(0, 3)));
    const games = batch.reduce((n, e) => n + e.games.length, 0);
    t('refusals stay a small fraction of the batch', problems.length < games * 0.1,
      `${problems.length} refused vs ${games} read`);
  }
}


// ------------------------------------------------- "undefined" is not a court
// Scoreholio writes the literal string "undefined" into Crt when it has no
// court for a game. Kept, it becomes a court NAMED "undefined", and then every
// court-less game in a session looks like it shared a court with every other.
t('a real court is kept', readCourt('7') === '7');
t('a court is trimmed', readCourt(' 7 ') === '7');
t('the literal "undefined" is no court', readCourt('undefined') === null);
t('"null" is no court', readCourt('null') === null);
t('"NaN" is no court', readCourt('NaN') === null);
t('empty is no court', readCourt('') === null);
t('missing is no court', readCourt(undefined) === null);
t('a named court survives', readCourt('Court 3') === 'Court 3');


// ------------------------------------------------------- how long a game took
// Scoreholio's scoreboard times the game it is scoring. The measurement is real
// but not always trustworthy, and every filter below exists because of a row
// that is actually in the club's data.
const D = (raw, o) => readDuration(raw, o);
const live = { submitSource: 'Scoreboard', type: 'Live', points: 20 };

t('a normal game is read in seconds', D('00:06:20', live) === 380);
t('the hours field is read', D('01:00:00', { ...live, points: 20 }) === 3600);
t('2023 exports carry a dash and no clock', D('-', live) === null);
t('a missing value is no duration', D('', live) === null);
t('an absent column is no duration', D(undefined, live) === null);
t('a zero clock is no duration', D('00:00:00', live) === null);
t('nonsense is refused', D('about six minutes', live) === null);
t('a malformed clock is refused', D('6:20', live) === null);
t('an impossible minute field is refused', D('00:75:00', live) === null);

// A score typed in afterwards. The clock was running while someone keyed it.
t('a four-second 12-10 is refused', D('00:00:04', { ...live, points: 22 }) === null);
t('a 21-second 12-10 is refused', D('00:00:21', { ...live, points: 22 }) === null);
t('a 63-second 20-point game is refused', D('00:01:03', { ...live, points: 20 }) === null);

// A fast game is still a real game: an 11-0 in 165s is 15 seconds a point.
t('a genuinely quick blowout is kept', D('00:02:45', { ...live, points: 11 }) === 165);
t('the slowest real games are kept', D('00:18:19', { ...live, points: 19 }) === 1099);

// Only a clock that was running counts.
t('an admin-entered row has no meaningful clock',
  D('01:18:09', { submitSource: 'Admin', type: 'Live', points: 17 }) === null);
t('a test row is not a game', D('00:06:20', { submitSource: 'Scoreboard', type: 'Test', points: 20 }) === null);
t('player scoring is a running clock too',
  D('00:09:58', { submitSource: 'Player Scoring', type: 'Live', points: 20 }) === 598);
t('an unknown source is trusted on the arithmetic alone',
  D('00:06:20', { submitSource: '', type: '', points: 20 }) === 380);
t('with no score to check against, the clock is taken as read',
  D('00:06:20', { submitSource: 'Scoreboard', type: 'Live' }) === 380);

// The rule is per point, not per game, so it scales with the score.
t('the floor scales with a long game',
  D('00:02:00', { ...live, points: 30 }) === null, 'should refuse 4s/pt');
t('the same clock passes for a short game',
  D('00:02:00', { ...live, points: 12 }) === 120, 'should accept 10s/pt');


// -------------------------------------------------- the gap between games
// Scoreholio's own changeover figure. Unlike the play clock there is nothing
// to sanity-check it against - a wait bears no relation to the score - so the
// only gate is that the row was a real game with a running clock.
const W = (raw, o) => readWait(raw, o);
const src = { submitSource: 'Scoreboard', type: 'Live' };

t('a normal changeover is read', W('00:00:46', src) === 46);
t('a two-second turnover is believable and kept', W('00:00:02', src) === 2);
t('a long idle court is kept, not clipped', W('00:38:43', src) === 2323);
t('2023 exports carry a dash', W('-', src) === null);
t('missing is no wait', W('', src) === null);
t('nonsense is refused', W('a while', src) === null);
t('a malformed clock is refused', W('0:46', src) === null);
t('an admin row has no running clock', W('00:00:46', { submitSource: 'Admin', type: 'Live' }) === null);
t('a test row is not a game', W('00:00:46', { submitSource: 'Scoreboard', type: 'Test' }) === null);
// Zero is a real reading here - a court that turned over instantly - and must
// survive rather than being swallowed as falsy.
t('a zero wait is kept, not treated as missing', W('00:00:00', src) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
