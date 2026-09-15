// Splits the 2026 Scoreholio sweep into the two shapes the importer already reads.
//
// The sweep file interleaves, per tournament:
//
//   ##### TOURNAMENT <id> <TAB> <unix> <TAB> <name>
//   ##### ROSTER
//   display <TAB> fullName <TAB> duprDoubles <TAB> playerUser
//   ...
//   ##### MATCHLOG
//   <the Match Log CSV exactly as Scoreholio's own Export button writes it>
//
// Nothing here interprets a game or a name. It only separates the two streams,
// because the readers for both already exist and are already tested:
//   - the match logs go to live/exports/ where readAllExports() finds them
//   - the roster goes to a session TSV, the same shape as the 2024/2025 files,
//     so a handle still resolves PER TOURNAMENT rather than globally.
//
// playerEmail was never collected at the source and never appears here.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function splitSweep(text) {
  const tournaments = [];
  let cur = null, mode = null;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('##### TOURNAMENT')) {
      const [, rest] = raw.split('##### TOURNAMENT ');
      const [id, ts, name] = String(rest ?? '').split('\t');
      cur = { id: (id ?? '').trim(), ts: Number(ts) || null, name: (name ?? '').trim(), roster: [], csv: [] };
      tournaments.push(cur);
      mode = null;
      continue;
    }
    if (raw.startsWith('##### ROSTER')) { mode = 'r'; continue; }
    if (raw.startsWith('##### MATCHLOG')) { mode = 'c'; continue; }
    if (!cur || !mode) continue;
    if (mode === 'r') {
      if (!raw.trim()) continue;
      const [display, full, dupr, user] = raw.split('\t');
      cur.roster.push({ display: (display ?? '').trim(), full: (full ?? '').trim(),
        dupr: (dupr ?? '').trim(), user: (user ?? '').trim() });
    } else {
      cur.csv.push(raw);
    }
  }
  for (const t of tournaments) {
    // trim trailing blank lines so a CSV is either real rows or nothing at all
    while (t.csv.length && !t.csv[t.csv.length - 1].trim()) t.csv.pop();
  }
  return tournaments;
}

/** tid <TAB> display <TAB> full - the shape readSessionRosters() already reads. */
export function sessionTsv(tournaments) {
  const lines = [];
  for (const t of tournaments)
    for (const p of t.roster)
      if (p.display && p.full) lines.push([t.id, p.display, p.full].join('\t'));
  return lines.join('\n') + '\n';
}

/** The batch shape readBatch() already reads. */
export function batchExport(tournaments) {
  const out = [];
  for (const t of tournaments) {
    if (!t.csv.length) continue;
    out.push('##### TOURNAMENT ' + t.id);
    out.push(...t.csv);
  }
  return out.join('\n') + '\n';
}


/**
 * Every player's DUPR rating as SCOREHOLIO holds it, newest sighting first.
 *
 * -> Map(normalised full name -> { name, rating, seen: 'YYYY-MM-DD' })
 *
 * WHY THIS IS A SECOND-CLASS SOURCE, and must be labelled as one.
 *
 * DUPR's own club listing is the real reading: we fetch it on a date, so a
 * series of them is genuine history. This is not that. Scoreholio stores a
 * copy of the player's rating on its own roster and does not re-read it often:
 * across 4,546 roster rows spanning January to September, 238 of 241 players
 * show the SAME number every time. It is accurate - it agreed with DUPR's
 * current figure in 90 of 94 overlapping players, the rest within 0.044 - it
 * simply does not move, so a chart drawn from it would tell almost everyone
 * their rating had not changed all year.
 *
 * So it is used for ONE thing: a current rating for the ~180 players who play
 * here but have not joined the MIP club on DUPR, and therefore appear in no
 * club reading at all. Those players get a number and no chart, and the page
 * says where the number came from.
 *
 * AMBIGUITY IS DROPPED, NOT GUESSED. If one name carries two different ratings
 * anywhere in the sweeps, that is two people sharing a name - this project has
 * already put one man's rating on another once - so the name is thrown out
 * rather than resolved by picking the newer row.
 */
export function duprFromSweeps(files) {
  const seen = new Map();          // normalised name -> { name, rating, ts, ratings:Set }
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const t of splitSweep(readFileSync(file, 'utf8'))) {
      if (!t.ts) continue;
      for (const p of t.roster) {
        const rating = Number(p.dupr);
        // -1 and -999 are Scoreholio's "no rating" sentinels, not ratings.
        if (!(rating > 1 && rating < 8)) continue;
        const name = String(p.full ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase().replace(/[^a-z]/g, '');
        if (!key) continue;
        if (!seen.has(key)) seen.set(key, { name, rating, ts: t.ts, ratings: new Set() });
        const e = seen.get(key);
        e.ratings.add(rating.toFixed(3));
        if (t.ts > e.ts) { e.ts = t.ts; e.rating = rating; e.name = name; }
      }
    }
  }
  const out = new Map();
  for (const [key, e] of seen) {
    // One name, two ratings = two people. Refuse it.
    if (e.ratings.size > 1) continue;
    out.set(key, {
      name: e.name,
      rating: e.rating,
      seen: new Date(e.ts * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    });
  }
  return out;
}

const SWEEPS = [
  { src: 'mip-2026-sweep.txt', tsv: 'mip-2026-playersteams.tsv', batch: 'mip-2026-matchlogs.txt' },
  { src: 'mip-2023-sweep.txt', tsv: 'mip-2023-playersteams.tsv', batch: 'mip-2023-matchlogs.txt' },
];

if (process.argv[1]?.endsWith('sweep2026.mjs')) {
  for (const s of SWEEPS) {
    const src = new URL('./live/scoreholio-roster/' + s.src, import.meta.url);
    if (!existsSync(src)) { console.log(`${s.src}: not present, skipped`); continue; }
    const ts = splitSweep(readFileSync(src, 'utf8'));
    const withCsv = ts.filter((t) => t.csv.length);
    const withRoster = ts.filter((t) => t.roster.length);
    writeFileSync(new URL('./live/scoreholio-roster/' + s.tsv, import.meta.url), sessionTsv(ts));
    writeFileSync(new URL('./live/exports/' + s.batch, import.meta.url), batchExport(ts));
    const names = new Set();
    for (const t of ts) for (const p of t.roster) if (p.full) names.add(p.full.toLowerCase());
    console.log(`${s.src}`);
    console.log(`  tournaments    ${ts.length}  (log ${withCsv.length}, roster ${withRoster.length})`);
    console.log(`  csv rows       ${withCsv.reduce((a, t) => a + t.csv.length - 1, 0)}`);
    console.log(`  distinct names ${names.size}`);
  }
}
