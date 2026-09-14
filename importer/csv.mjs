// CSV match importer.
//
// Nobody knows yet what a DUPR or Scoreholio export will call its columns, and
// guessing wrong is worse than failing: a file read with "team 1 score" and
// "team 2 score" swapped produces a complete, plausible, entirely wrong season.
//
// So this module does three things and refuses to do a fourth:
//   1. It DETECTS the columns and prints what it decided, with the evidence.
//   2. It resolves every player name through the same never-guess resolver the
//      rest of the importer uses.
//   3. It reports every row it could not read, with the row number.
// It does NOT repair a file it cannot understand. An unreadable column layout
// stops the import and asks a human, because a silent misread is undetectable
// once it is in the data.

import { readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ parsing */

/** RFC4180-ish: quoted fields, doubled quotes, commas and newlines inside them. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => String(f).trim() !== ''));
}

/* ---------------------------------------------------------------- detection */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Each role lists header spellings we have actually seen or would expect, most
// specific first. A header only claims a role if it matches one of these - an
// unrecognised header is reported, never assumed.
const ROLES = {
  date:    ['date', 'match date', 'played', 'played on', 'game date', 'day', 'timestamp', 'time stamp', 'datetime'],
  time:    ['time', 'start time', 'match time', 'clock'],
  court:   ['court', 'court number', 'court no', 'table'],
  event:   ['event', 'session', 'league', 'tournament', 'bracket', 'round', 'week'],
  a1:      ['team 1 player 1', 'team1 player1', 'player 1', 'player1', 'a1', 'home player 1', 'winner 1'],
  a2:      ['team 1 player 2', 'team1 player2', 'player 2', 'player2', 'a2', 'home player 2', 'winner 2'],
  b1:      ['team 2 player 1', 'team2 player1', 'player 3', 'player3', 'b1', 'away player 1', 'loser 1'],
  b2:      ['team 2 player 2', 'team2 player2', 'player 4', 'player4', 'b2', 'away player 2', 'loser 2'],
  teamA:   ['team 1', 'team1', 'team a', 'teama', 'home', 'home team', 'winners', 'winning team'],
  teamB:   ['team 2', 'team2', 'team b', 'teamb', 'away', 'away team', 'losers', 'losing team'],
  scoreA:  ['team 1 score', 'team1 score', 'score 1', 'score1', 'a score', 'home score', 'winner score', 'winning score', 'points 1'],
  scoreB:  ['team 2 score', 'team2 score', 'score 2', 'score2', 'b score', 'away score', 'loser score', 'losing score', 'points 2'],
  score:   ['score', 'result', 'final', 'final score'],
};

/**
 * Decide which column plays which role.
 * @returns { map, unclaimed, shape, problems }
 */
export function detectColumns(header) {
  const cols = header.map((h, i) => ({ i, raw: h, n: norm(h) }));
  const map = {}; const why = {}; const taken = new Set();

  for (const [role, spellings] of Object.entries(ROLES)) {
    for (const want of spellings) {
      const hit = cols.find((c) => !taken.has(c.i) && c.n === want);
      if (hit) { map[role] = hit.i; why[role] = `header "${hit.raw}" is an exact match for "${want}"`; taken.add(hit.i); break; }
    }
  }
  // Second pass: containment, only for roles still unfilled. Narrower than
  // equality, so it runs last and never steals a column from an exact match.
  for (const [role, spellings] of Object.entries(ROLES)) {
    if (map[role] !== undefined) continue;
    for (const want of spellings) {
      const hit = cols.find((c) => !taken.has(c.i) && c.n.includes(want));
      if (hit) { map[role] = hit.i; why[role] = `header "${hit.raw}" contains "${want}"`; taken.add(hit.i); break; }
    }
  }

  const problems = [];
  const has = (k) => map[k] !== undefined;

  // Which of the three supported layouts is this?
  let shape = null;
  if (has('a1') && has('a2') && has('b1') && has('b2')) shape = 'four-player-columns';
  else if (has('teamA') && has('teamB')) shape = 'two-team-columns';
  if (!shape) problems.push('Cannot find the players. Need either four player columns (Team 1 Player 1 ... Team 2 Player 2) or two team columns (Team 1, Team 2).');

  let scores = null;
  if (has('scoreA') && has('scoreB')) scores = 'two-score-columns';
  else if (has('score')) scores = 'one-combined-score';
  if (!scores) problems.push('Cannot find the scores. Need either two score columns or one combined "11-6" column.');

  if (!has('date')) problems.push('No date column. Games will import undated, which is allowed but loses the match log ordering.');

  const unclaimed = cols.filter((c) => !taken.has(c.i)).map((c) => c.raw);
  return { map, why, shape, scores, unclaimed, problems };
}

const splitTeam = (s) => String(s ?? '').split(/\s*(?:&|\+|\/|,| and | with )\s*/i).map((x) => x.trim()).filter(Boolean);

/** "11-6", "11 - 6", "11:6" -> [11, 6] */
function splitScore(s) {
  const m = String(s ?? '').match(/(-?\d+)\s*[-–:to]+\s*(-?\d+)/i);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Anything ISO-ish, US-ish, or a unix timestamp -> "YYYY-MM-DD" or null. */
export function readDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/](\d{1,2})[/](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString().slice(0, 10);
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ reading */

/**
 * @param file          path to the CSV
 * @param resolveName   (name) => playerId | null. Must NOT guess.
 * @returns { games, skipped, detection, unresolved }
 */
export function readCsv(file, resolveName) {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  if (rows.length < 2) throw new Error(`${file}: needs a header row and at least one game`);

  const detection = detectColumns(rows[0]);
  const fatal = detection.problems.filter((p) => p.startsWith('Cannot'));
  if (fatal.length) {
    const e = new Error(`${file}: ${fatal.join(' ')}\nHeaders seen: ${rows[0].join(' | ')}`);
    e.detection = detection;
    throw e;
  }

  const { map, shape, scores } = detection;
  const at = (r, role) => (map[role] === undefined ? null : r[map[role]]);
  const games = [], skipped = [], unresolved = new Map();

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const stop = (reason) => skipped.push({ line, reason, row: r.join(' | ').slice(0, 120) });

    const namesA = shape === 'four-player-columns' ? [at(r, 'a1'), at(r, 'a2')] : splitTeam(at(r, 'teamA'));
    const namesB = shape === 'four-player-columns' ? [at(r, 'b1'), at(r, 'b2')] : splitTeam(at(r, 'teamB'));
    if (namesA.length !== 2 || namesB.length !== 2 || [...namesA, ...namesB].some((n) => !String(n ?? '').trim())) {
      return stop(`expected two players per side, read ${namesA.length} and ${namesB.length}`);
    }

    let sa, sb;
    if (scores === 'two-score-columns') { sa = Number(at(r, 'scoreA')); sb = Number(at(r, 'scoreB')); }
    else { const p = splitScore(at(r, 'score')); if (!p) return stop(`cannot read a score from "${at(r, 'score')}"`); [sa, sb] = p; }
    if (!Number.isInteger(sa) || !Number.isInteger(sb)) return stop(`scores are not whole numbers (${sa}, ${sb})`);
    if (sa === sb) return stop(`tied ${sa}-${sb}; pickleball games do not end level`);
    if (sa < 0 || sb < 0 || sa > 40 || sb > 40) return stop(`score ${sa}-${sb} is outside any plausible range`);

    const ids = [...namesA, ...namesB].map((n) => {
      const id = resolveName(String(n).trim());
      if (!id) {
        const k = String(n).trim();
        if (!unresolved.has(k)) unresolved.set(k, []);
        unresolved.get(k).push(line);
      }
      return id;
    });
    if (ids.some((x) => !x)) return stop('a player name could not be matched to the roster');
    if (new Set(ids).size !== 4) return stop('the same player appears twice in one game');

    const date = map.date !== undefined ? readDate(at(r, 'date')) : null;
    if (map.date !== undefined && !date) return stop(`cannot read a date from "${at(r, 'date')}"`);
    if (date && date > new Date().toISOString().slice(0, 10)) return stop(`date ${date} is in the future`);

    games.push({
      line,
      date,
      time: at(r, 'time') ? String(at(r, 'time')).trim() : null,
      court: at(r, 'court') ? String(at(r, 'court')).trim() : null,
      event: at(r, 'event') ? String(at(r, 'event')).trim() : null,
      a: ids.slice(0, 2), b: ids.slice(2), sa, sb,
    });
  });

  return {
    games, skipped, detection,
    unresolved: [...unresolved].map(([name, lines]) => ({ name, lines, count: lines.length })),
  };
}

/* ---------------------------------------------------------------------- CLI */

if (process.argv[1]?.endsWith('csv.mjs')) {
  const file = process.argv[2];
  if (!file) { console.log('usage: node importer/csv.mjs <file.csv>'); process.exit(1); }

  const { buildRoster } = await import('./roster.mjs');
  const { createResolver } = await import('./resolve.mjs');
  const { players, displayToId } = buildRoster();
  const r = createResolver(players);
  const CONFIRMED = JSON.parse(readFileSync(new URL('./aliases.json', import.meta.url), 'utf8')).confirmed;
  const resolveName = (n) => displayToId.get(n) ?? CONFIRMED[n] ?? r.resolve(n).id ?? null;

  let out;
  try { out = readCsv(file, resolveName); }
  catch (e) { console.error('\nSTOPPED: ' + e.message); process.exit(1); }

  const d = out.detection;
  console.log(`\nfile   : ${file}`);
  console.log(`layout : ${d.shape}, ${d.scores}`);
  console.log('\nCOLUMNS I DECIDED ON');
  for (const [role, i] of Object.entries(d.map)) console.log(`  ${role.padEnd(8)} col ${String(i).padStart(2)}  ${d.why[role]}`);
  if (d.unclaimed.length) console.log(`\nCOLUMNS I IGNORED: ${d.unclaimed.join(', ')}`);
  for (const p of d.problems) console.log(`\nNOTE: ${p}`);

  console.log(`\nread   : ${out.games.length} games`);
  console.log(`skipped: ${out.skipped.length}`);
  for (const s of out.skipped.slice(0, 25)) console.log(`  line ${s.line}: ${s.reason}\n            ${s.row}`);
  if (out.skipped.length > 25) console.log(`  ... and ${out.skipped.length - 25} more`);

  if (out.unresolved.length) {
    console.log(`\nNAMES I WILL NOT GUESS AT (${out.unresolved.length}) - add each to importer/aliases.json once a human confirms it:`);
    for (const u of out.unresolved) console.log(`  "${u.name}"  ${u.count} game(s), first at line ${u.lines[0]}`);
  }

  const dated = out.games.filter((g) => g.date);
  if (dated.length) {
    const ds = dated.map((g) => g.date).sort();
    console.log(`\ndated  : ${dated.length} of ${out.games.length}, ${ds[0]} to ${ds[ds.length - 1]}`);
  }
  console.log('\nNothing has been written. This is a dry run by design - review the above, then wire the file into importer/emit.mjs.');
}
