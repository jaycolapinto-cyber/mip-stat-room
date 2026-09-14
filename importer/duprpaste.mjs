// Turns a DUPR club "Ratings" page, copied and pasted, into a dated snapshot.
//
// Why this exists. Our snapshots (importer/live/dupr/YYYY-MM-DD.tsv) came from
// reading the club list by hand and held 68 players and a name and a rating.
// The Ratings page carries far more and carries the one thing that settles
// identity for good: DUPR's own player id.
//
//   1 [Laura Zitzloff](https://dashboard.dupr.com/dashboard/player/6191566621) 80 4.690
//   ^ rank  ^ name                                          ^ player id       ^ matches ^ doubles rating
//
// That id is why this is worth a parser rather than a hand copy. "Sal
// Farruggia" and "Sal farruggia" are two DUPR accounts with two ids and two
// very different ratings; a name-only snapshot cannot tell them apart and this
// project has already put one man's rating on the other man once.
//
// The parser is deliberately strict about the shape of a row and deliberately
// relaxed about whitespace: a paste may arrive one row per line or as one long
// line, depending on where it was pasted from.

const ROW = new RegExp(
  '(\\d{1,4})\\s*'                                              // rank
  + '\\[([^\\]]+)\\]'                                           // [Name]
  + '\\(https?://[^)]*?/player/(\\d+)[^)]*\\)\\s*'              // (...player/<id>)
  + '([\\d,]+)\\s+'                                             // match count
  + '(NR|\\d\\.\\d{1,3})',                                      // doubles rating, or NR
  'g');

/**
 * @returns { rows: [{rank, name, duprId, matches, rating}], problems: [string] }
 *
 * A row with no numeric rating ("NR" - not rated yet) is kept with rating null.
 * Dropping it would lose the id and the name, which are the parts that resolve
 * a handle; the rating chart simply skips a null the way it skips an absence.
 */
export function parsePaste(text) {
  const raw = String(text ?? '');
  const rows = [], problems = [], seenId = new Map(), seenRank = new Map();

  for (const m of raw.matchAll(ROW)) {
    const [, rank, name0, duprId, matches0, rating0] = m;
    const name = name0.trim().replace(/\s+/g, ' ');
    const matches = Number(matches0.replace(/,/g, ''));
    const rating = rating0 === 'NR' ? null : Number(rating0);

    if (!name) { problems.push(`rank ${rank}: empty name`); continue; }
    if (rating !== null && (rating < 1 || rating > 8)) {
      problems.push(`${name}: rating ${rating} is outside any real DUPR range`); continue;
    }
    if (seenId.has(duprId)) {
      // The same id twice is a paste that overlapped itself, not two people.
      if (seenId.get(duprId) !== name) problems.push(`player id ${duprId} appears as both "${seenId.get(duprId)}" and "${name}"`);
      continue;
    }
    if (seenRank.has(Number(rank))) problems.push(`rank ${rank} appears twice ("${seenRank.get(Number(rank))}" and "${name}")`);
    seenId.set(duprId, name);
    seenRank.set(Number(rank), name);
    rows.push({ rank: Number(rank), name, duprId, matches, rating });
  }

  rows.sort((a, b) => a.rank - b.rank);
  return { rows, problems };
}

/**
 * Snapshot file body. Columns: name, rating, dupr id, match count.
 *
 * The first two columns are exactly the old two-column format, so every file
 * already on disk stays readable and a reader that only wants a rating does not
 * have to change.
 */
export function toTsv(rows) {
  return rows.map((r) => [r.name, r.rating === null ? '' : r.rating.toFixed(3), r.duprId, r.matches].join('\t')).join('\n') + '\n';
}

if (process.argv[1]?.endsWith('duprpaste.mjs')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const [, , src, out] = process.argv;
  if (!src) {
    console.error('usage: node importer/duprpaste.mjs <pasted-file.txt> [importer/live/dupr/YYYY-MM-DD.tsv]');
    process.exit(2);
  }
  const { rows, problems } = parsePaste(readFileSync(src, 'utf8'));
  console.log(`read ${rows.length} players`);
  const rated = rows.filter((r) => r.rating !== null);
  console.log(`  rated ${rated.length}, unrated ${rows.length - rated.length}`);
  if (rated.length) console.log(`  range ${Math.min(...rated.map((r) => r.rating)).toFixed(3)} - ${Math.max(...rated.map((r) => r.rating)).toFixed(3)}`);
  for (const p of problems) console.log('  PROBLEM:', p);
  if (out) { writeFileSync(out, toTsv(rows)); console.log('wrote', out); }
  else console.log('\n(no output path given - nothing written)');
}
