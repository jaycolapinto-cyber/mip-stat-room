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
