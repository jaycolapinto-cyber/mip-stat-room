// Scoreholio "Match Log" exports.
//
// This is the best source we have for game detail, and it is strictly better
// than reading the public dashboard:
//
//   - it carries the REAL court number. The dashboard's leftmost column looks
//     like a court but is a display index: the same games that the dashboard
//     showed on courts 1, 2 and 3 are on courts 6, 11 and 12 here. We shipped
//     the wrong numbers until this export proved it.
//   - it carries a stable Match ID, so the same game imported twice is
//     recognised as the same game rather than counted twice.
//   - it carries a full ISO timestamp rather than a rendered clock string.
//
// Scoreholio has two export buttons and they do not produce the same file. The
// .xlsx writes each side's score as a plain number in its own column; the .csv
// writes BOTH scores into each column as a range - "9 - 11" in Score and the
// mirror "11 - 9" in Score 2. Read the wrong one as a single number and every
// game in the file lands with a nonsense score, so the shape is detected per
// row and the mirror is checked rather than assumed.
//
// What neither carries is real names. Team columns hold whatever display name
// each player typed into Scoreholio, emoji and all, so every name still has to
// go through the resolver before it means anything.

import xlsx from 'xlsx';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHEET = 'Match Log';

/**
 * Read the two scores from a row, whichever way this export writes them.
 * Returns [a, b] or null. Never guesses: a row it cannot read is reported.
 */
export function readScores(scoreCell, score2Cell) {
  const one = String(scoreCell ?? '').trim();
  const two = String(score2Cell ?? '').trim();

  // .xlsx shape - a plain number in each column.
  if (/^\d{1,2}$/.test(one) && /^\d{1,2}$/.test(two)) return [Number(one), Number(two)];

  // .csv shape - "9 - 11" in Score, and Score 2 must be its exact mirror.
  const range = (s) => { const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/); return m ? [Number(m[1]), Number(m[2])] : null; };
  const a = range(one);
  if (!a) return null;
  const b = range(two);
  if (b && (b[0] !== a[1] || b[1] !== a[0])) return null;   // the two columns disagree
  return a;
}
/**
 * The court a game was played on, or null when Scoreholio does not know.
 *
 * Scoreholio sometimes writes the literal text "undefined" into the Crt column
 * - 111 rows of one February 2026 session do exactly that. Kept as-is it
 * becomes a court NAMED "undefined", and then every game missing a court looks
 * like it was played on the same court at the same minute as every other one.
 * A missing value is a missing value.
 */
export function readCourt(v) {
  const s = String(v ?? '').trim();
  if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return null;
  return s;
}

/**
 * How long a game actually took, in seconds, or null when the clock cannot be
 * believed.
 *
 * Scoreholio's scoreboard runs a timer while a game is scored on it, and writes
 * the result into "Play Duration" as hh:mm:ss. That is a real measurement and
 * the only one of its kind in this project - nothing else here knows how long
 * anything took. It is also, straightforwardly, wrong a fraction of the time,
 * so three filters stand in front of it.
 *
 * ONE: the clock only runs when the scoreboard is the thing keeping score. A
 * row submitted by an Admin is a score typed in afterwards, and its duration is
 * however long that screen happened to be open - one of them reads 78 minutes.
 * Test rows are not games at all.
 *
 * TWO: 2023's exports carry "-" in this column. Older Scoreholio did not
 * record it, and an absent measurement must stay absent rather than become a
 * zero that drags an average down.
 *
 * THREE, and the interesting one: the duration has to be consistent with the
 * SCORE. 77 rows claim a full game in under a minute, including a 12-10 in four
 * seconds, which is a score keyed in while the clock ticked. Comparing seconds
 * against points caught these without a magic number: across 12,174 live games
 * the median game spends 20.4 seconds per point and the 1st percentile is 14.3,
 * while every bad row sits under 3. The floor is set at 8 - comfortably below
 * anything real, comfortably above the junk - because a rally with a serve in
 * it does not happen in eight seconds. A fast game stays fast under this rule:
 * an 11-0 in 165 seconds is 15 seconds a point and passes untouched.
 */
const MIN_SECONDS_PER_POINT = 8;

/**
 * How long the court sat idle before this game started, in seconds.
 *
 * Scoreholio's own figure, and it is the changeover: measured against the
 * previous game on that court, it agrees within five seconds on 96% of 11,303
 * turnovers. So it is read rather than derived.
 *
 * No score-based sanity check here, because there is nothing to check against -
 * a wait has no relationship to the points that follow it. A two-second
 * turnover is believable and so is a twenty-minute one when a court is sitting
 * empty waiting for people. The only filter is the same one the play clock
 * uses: the row has to be a real game whose clock was actually running.
 *
 * Because the long tail is real rather than erroneous, the site reports the
 * MEDIAN wait and not the mean - 46 seconds against 74 - and says which it is.
 */
export function readWait(raw, { submitSource, type } = {}) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s);
  if (!m) return null;
  const src = String(submitSource ?? '').trim();
  if (src && src !== 'Scoreboard' && src !== 'Player Scoring') return null;
  if (String(type ?? '').trim() === 'Test') return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function readDuration(raw, { submitSource, type, points } = {}) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return null;                     // not recorded
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s);
  if (!m) return null;
  const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  if (!secs) return null;

  // Only a clock that was actually running counts.
  const src = String(submitSource ?? '').trim();
  if (src && src !== 'Scoreboard' && src !== 'Player Scoring') return null;
  if (String(type ?? '').trim() === 'Test') return null;

  if (Number.isFinite(points) && points > 0 && secs / points < MIN_SECONDS_PER_POINT) return null;
  return secs;
}

export const EXPORT_DIR = new URL('./live/exports/', import.meta.url);

/** Scoreholio names its files Matchlog-<tournamentId>.xlsx */
export const tournamentIdFromFilename = (f) => (f.match(/Matchlog-([A-Za-z0-9]+)\.(?:xlsx|csv)$/i)?.[1] ?? null);

const splitTeam = (s) => String(s ?? '').split('&').map((x) => x.trim()).filter(Boolean);

/**
 * Read one export file.
 * @returns { file, tournamentId, games, problems }
 */
/**
 * Turn match-log rows into games.
 *
 * Shared by the single-file reader and the batch reader, because a batch's
 * per-tournament CSV is byte for byte what the Export button writes - the same
 * rows deserve the same refusals, not a second, looser parser.
 */
export function rowsToGames(rows, label) {
  if (!rows.length || !('Match ID' in rows[0])) {
    throw new Error(`${label}: this does not look like a Scoreholio match log - no "Match ID" column. Columns: ${Object.keys(rows[0] ?? {}).join(', ')}`);
  }
  const games = [], problems = [];

  rows.forEach((r, i) => {
    const line = i + 2;
    const stop = (why) => problems.push({ line, why });

    const a = splitTeam(r['Team 1']);
    const b = splitTeam(r['Team 2']);
    if (a.length !== 2 || b.length !== 2) return stop(`expected two players a side, read ${a.length} and ${b.length}`);

    const pair = readScores(r['Score'], r['Score 2']);
    if (!pair) return stop(`cannot read the scores ("${r['Score']}", "${r['Score 2']}") - the two columns may disagree`);
    const [sa, sb] = pair;
    if (sa === sb) return stop(`tied ${sa}-${sb}`);

    const when = new Date(r['Date/Time']);
    if (Number.isNaN(when.getTime())) return stop(`cannot read the date "${r['Date/Time']}"`);

    const id = String(r['Match ID'] ?? '').trim();
    if (!id) return stop('no Match ID');

    games.push({
      matchId: id,
      num: Number(r['#']) || null,
      iso: when.toISOString(),
      ts: Math.floor(when.getTime() / 1000),
      court: readCourt(r['Crt']),
      dur: readDuration(r['Play Duration'], {
        submitSource: r['Submit Source'], type: r['Type'], points: sa + sb,
      }),
      wait: readWait(r['Wait Duration'], {
        submitSource: r['Submit Source'], type: r['Type'],
      }),
      handlesA: a, handlesB: b, sa, sb,
    });
  });

  const ids = new Set(games.map((g) => g.matchId));
  if (ids.size !== games.length) problems.push({ line: 0, why: `${games.length - ids.size} duplicate Match IDs inside one file` });

  games.sort((x, y) => x.ts - y.ts);
  return { games, problems };
}

export function readExport(path) {
  const file = typeof path === 'string' ? path : fileURLToPath(path);
  const wb = xlsx.readFile(file, { raw: false });
  // A .csv has one unnamed sheet; a .xlsx names it "Match Log".
  const sheet = wb.SheetNames.includes(SHEET) ? SHEET
    : wb.SheetNames.length === 1 ? wb.SheetNames[0]
    : null;
  if (!sheet) throw new Error(`${file}: cannot tell which sheet holds the match log. Sheets present: ${wb.SheetNames.join(', ')}`);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', raw: false });
  return { file, tournamentId: tournamentIdFromFilename(file), ...rowsToGames(rows, file) };
}

/**
 * A harvest batch: many tournaments in one text file.
 *
 * Pulling a session's log out of Scoreholio's admin grid gives exactly the same
 * CSV the Export button writes, so a batch is just those CSVs concatenated with
 * a header line naming each tournament:
 *
 *     ##### TOURNAMENT E0wVQRCP35ysBKrgIhHS
 *     "#","","Date/Time",...
 *
 * One file per batch rather than one per tournament, because a night's harvest
 * is hundreds of sessions and moving hundreds of 9KB files between machines is
 * all cost and no benefit.
 */
const BATCH_HEAD = /^##### TOURNAMENT (\S+)[ \t]*$/gm;

export function readBatch(path) {
  const file = typeof path === 'string' ? path : fileURLToPath(path);
  const raw = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const out = [];
  const marks = [...raw.matchAll(BATCH_HEAD)];
  if (!marks.length) throw new Error(`${file}: no "##### TOURNAMENT <id>" headers - is this a harvest batch?`);
  marks.forEach((m, i) => {
    const body = raw.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    if (!body) return;
    // Reuse the ordinary export reader by handing it this one tournament's CSV.
    const wb = xlsx.read(body, { type: 'string', raw: false });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    out.push({ ...rowsToGames(rows, `${file}#${m[1]}`), file, tournamentId: m[1] });
  });
  return out;
}

/** Every export present: single-tournament files and harvest batches alike. */
export function readAllExports() {
  let files;
  try { files = readdirSync(EXPORT_DIR); }
  catch { return []; }
  const out = [];
  for (const f of files.sort()) {
    if (/\.(xlsx|csv)$/i.test(f)) out.push(readExport(new URL(f, EXPORT_DIR)));
    else if (/\.txt$/i.test(f)) out.push(...readBatch(new URL(f, EXPORT_DIR)));
  }
  return out;
}

if (process.argv[1]?.endsWith('scoreholio.mjs')) {
  for (const e of readAllExports()) {
    const days = [...new Set(e.games.map((g) => g.iso.slice(0, 10)))].sort();
    const courts = [...new Set(e.games.map((g) => g.court))].sort();
    const names = [...new Set(e.games.flatMap((g) => [...g.handlesA, ...g.handlesB]))].sort();
    console.log(`\n${e.file.split('/').pop()}`);
    console.log(`  tournament : ${e.tournamentId}`);
    console.log(`  games      : ${e.games.length}`);
    console.log(`  dates      : ${days.join(', ')}`);
    console.log(`  courts     : ${courts.join(', ')}`);
    console.log(`  players    : ${names.length} -> ${names.join(', ')}`);
    if (e.problems.length) { console.log(`  PROBLEMS   : ${e.problems.length}`); e.problems.forEach((p) => console.log(`    line ${p.line}: ${p.why}`)); }
  }
}
