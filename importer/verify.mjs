// The safety net.
//
// Re-reads the sources independently of emit.mjs and checks what actually
// shipped in dist/data.js. It has earned its keep repeatedly: it caught two
// players silently merged into one, standings rows pointing at players that had
// been filtered away, and detailed games exceeding the published grid.
//
// The invariants changed when DUPR became the match source. The old central
// check - "our detailed games must never exceed the published head-to-head
// grid" - is now meaningless, because DUPR holds thousands of games the grid
// never covered. In its place the grid becomes an INDEPENDENT WITNESS: for the
// window the grid does cover, our computed pair records are compared against
// Dave's published numbers, and disagreements are reported as source notes.

import { DATA } from '../dist/data.js';
import { allLeagues, readGames } from './extract.mjs';
import { readDuprMatches } from './duprmatches.mjs';
import { readAllExports } from './scoreholio.mjs';
import { readSessionRosters, nameInSession } from './scoreholioroster.mjs';

const errors = [], warnings = [], notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => notes.push(m);

const { players, matches, leagues, master, dupr, coverage } = DATA;
const byId = new Map(players.map((p) => [p.id, p]));
const today = new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------- matches vs the source */
const { games: src } = readDuprMatches();
const srcById = new Map(src.map((g) => [g.matchId, g]));

/* Matches that DUPR never had come from Scoreholio and ship with an "sh:"
 * id. They are verified the same way as everything else - re-read from the
 * export, independently of the importer - rather than being waved through.
 * The players are re-resolved from that tournament's own roster here too, so
 * a mistake in the importer's resolution shows up as a disagreement instead of
 * being reproduced by the check. */
const SESSIONS = readSessionRosters();
const shSrc = new Map();            // "sh:<matchId>" -> { game, tournamentId }
for (const e of readAllExports()) {
  for (const g of e.games) if (!shSrc.has('sh:' + g.matchId)) shSrc.set('sh:' + g.matchId, { g, tid: e.tournamentId });
}
const canonName = (x) => String(x).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const idByName = new Map();
for (const p of players) { const k = canonName(p.name); if (!idByName.has(k)) idByName.set(k, p.id); }

if (new Set(matches.map((m) => m.id)).size !== matches.length) err('duplicate match ids in the shipped data');

let checked = 0, shChecked = 0, movedNoClock = 0;
for (const m of matches) {
  const g = srcById.get(m.id);
  let srcDate = g?.date, srcSa = g?.sa, srcSb = g?.sb;
  if (!g) {
    const hit = shSrc.get(m.id);
    if (!hit) { err(`match ${m.id} is in dist/data.js but in no source file at all`); continue; }
    shChecked++;
    srcDate = hit.g.iso.slice(0, 10); srcSa = hit.g.sa; srcSb = hit.g.sb;
    // Re-resolve the four players from the roster, independently of the importer.
    const want = [...hit.g.handlesA, ...hit.g.handlesB].map((h) => {
      const real = nameInSession(SESSIONS, hit.tid, h);
      return real ? (idByName.get(canonName(real)) ?? null) : null;
    });
    const got = [...m.a, ...m.b];
    if (want.every((x) => x)) {
      const w = [...want].sort().join('+'), o = [...got].sort().join('+');
      if (w !== o) err(`match ${m.id}: players ${o} but this tournament's roster says ${w}`);
    }
    if (hit.g.court && m.court && String(hit.g.court) !== String(m.court)) err(`match ${m.id}: court ${m.court} but the export says ${hit.g.court}`);
  } else {
    checked++;
  }
  /* The date check, re-derived rather than trusted.
   *
   * Both sources stamp a game in UTC, so an 8pm Eastern game is filed by its
   * source under the NEXT day. emit.mjs corrects that at the end of the build;
   * this is the independent proof that it corrected it right, so it computes
   * the answer from the timestamp itself rather than repeating emit's logic.
   *
   * Where there is a clock, the answer is exact and nothing else is accepted.
   * Where there is not, the only thing that can be asserted is the bound: a
   * corrected date is the source's date or the day before it, never any other
   * day and never later. A game silently landing two days off, or moving
   * forward, fails here.
   */
  if (m.ts != null) {
    const real = new Date(m.ts * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (m.date !== real) err(`match ${m.id}: dated ${m.date} but its clock says it was played ${real} Eastern`);
  } else if (srcDate !== m.date) {
    const dayBefore = new Date(Date.parse(srcDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    if (m.date !== dayBefore) err(`match ${m.id}: date ${m.date} but the source says ${srcDate}`);
    else movedNoClock++;
  }
  if (srcSa !== m.sa || srcSb !== m.sb) err(`match ${m.id}: score ${m.sa}-${m.sb} but the source says ${srcSa}-${srcSb}`);
  if (m.a.length !== 2 || m.b.length !== 2) err(`match ${m.id}: not two players a side`);
  if (new Set([...m.a, ...m.b]).size !== 4) err(`match ${m.id}: the same player appears twice`);
  for (const id of [...m.a, ...m.b]) if (!byId.has(id)) err(`match ${m.id} references unknown player "${id}"`);
  if (m.sa === m.sb) err(`match ${m.id} is a tie ${m.sa}-${m.sb}`);
  if (m.date > today) err(`match ${m.id} is dated ${m.date}, in the future`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) err(`match ${m.id} has a malformed date "${m.date}"`);
  // A court implies a time; the reverse does not. Scoreholio sometimes logs a
  // match with a clock and no court number, and that is a real game.
  if (m.court && !m.time) warn(`match ${m.id} has a court but no time`);
}

// Everything the source holds should either ship or be accounted for.
const shipped = new Set(matches.map((m) => m.id));
const missing = src.filter((g) => !shipped.has(g.matchId));
note(`Scoreholio-only matches independently re-checked: ${shChecked}`);
note(`game dates re-derived from their own clock: ${matches.filter((m) => m.ts != null).length}` +
     ` | moved a day back without a clock, within bounds: ${movedNoClock}` +
     ` | no clock and left on the source's date: ${matches.filter((m) => m.ts == null).length - movedNoClock}`);
if (missing.length !== coverage.gamesHeldBack) {
  warn(`${missing.length} source games did not ship but coverage says ${coverage.gamesHeldBack} were held back`);
}

/* -------------------------------------------------------- head to head */
// Head-to-head is no longer shipped - the page derives it from the matches on
// load. So what is verified here is that the derivation is sound and that the
// matches can actually support it, not that two stored copies agree.
const pairKey = (a, b) => a + '|' + b;
if ('h2h' in DATA) err('h2h is being shipped again - it should be derived in the page, not stored');

// Recompute from the shipped matches, exactly as the page will.
const recomputed = new Map();
for (const m of matches) {
  const won = m.sa > m.sb ? m.a : m.b;
  const lost = m.sa > m.sb ? m.b : m.a;
  for (const w of won) for (const l of lost) {
    const k = pairKey(w, l), k2 = pairKey(l, w);
    if (!recomputed.has(k)) recomputed.set(k, { w: 0, l: 0 });
    if (!recomputed.has(k2)) recomputed.set(k2, { w: 0, l: 0 });
    recomputed.get(k).w++; recomputed.get(k2).l++;
  }
}
if (recomputed.size !== coverage.h2hPairs) {
  err(`coverage says ${coverage.h2hPairs} head-to-head pairs but the matches imply ${recomputed.size}`);
}
for (const [k, v] of recomputed) {
  const [a, b] = k.split('|');
  if (a === b) err(`a head-to-head pair has a player facing themselves: ${a}`);
  if (!byId.has(a) || !byId.has(b)) err(`a head-to-head pair references an unknown player: ${a} / ${b}`);
  const back = recomputed.get(pairKey(b, a));
  if (!back) err(`head-to-head ${k} has no mirror`);
  else if (back.w !== v.l || back.l !== v.w) err(`head-to-head ${k} is not symmetric with its mirror`);
}
// Every win must be somebody's loss. Across the whole set the two totals are
// the same number counted twice.
const tw = [...recomputed.values()].reduce((a, x) => a + x.w, 0);
const tl = [...recomputed.values()].reduce((a, x) => a + x.l, 0);
if (tw !== tl) err(`head-to-head wins (${tw}) do not equal losses (${tl})`);
if (tw !== matches.length * 4) err(`head-to-head implies ${tw} pair-wins but ${matches.length} games should give ${matches.length * 4}`);

/* ------------------------------- the published grid as an outside witness */
// The grid is cumulative from its start date and uses Scoreholio display names,
// so it can only be compared where we can map both names AND the window lines
// up. Disagreements are reported, not treated as our error.
const { gridCells } = readGames();
const nameToId = new Map();
for (const p of players) {
  nameToId.set(p.name.toLowerCase(), p.id);
  for (const a of p.aliases ?? []) nameToId.set(String(a).toLowerCase(), p.id);
  for (const d of p.duprNames ?? []) nameToId.set(String(d).toLowerCase(), p.id);
}
// Direction matters far more than agreement. Our window is much wider than the
// grid's, so our totals should be GREATER or equal almost everywhere. A pair
// where we hold FEWER games than Dave published is a real signal that we are
// missing games, and that is worth shouting about.
let comparable = 0, agree = 0, above = 0, below = 0;
const shortfalls = [];
for (const c of gridCells) {
  const a = nameToId.get(String(c.a).toLowerCase()), b = nameToId.get(String(c.b).toLowerCase());
  if (!a || !b || a === b) continue;
  const ours = recomputed.get(pairKey(a, b));
  if (!ours) continue;
  comparable++;
  const oursTotal = ours.w + ours.l, gridTotal = c.w + c.l;
  if (ours.w === c.w && ours.l === c.l) agree++;
  else if (oursTotal >= gridTotal) above++;
  else { below++; shortfalls.push(`${byId.get(a)?.name} vs ${byId.get(b)?.name}: we have ${oursTotal}, the grid published ${gridTotal}`); }
}
note(`grid cross-check: ${comparable} pairs comparable | ${agree} identical | ${above} we hold more (expected - our window is wider) | ${below} we hold FEWER`);
if (below) {
  warn(`${below} pairs where we hold fewer games than Dave's published grid - that suggests missing games, not a wider window`);
  shortfalls.slice(0, 10).forEach((x) => warn('   ' + x));
}

/* ---------------------------------------------------------- standings */
const leagueSrc = allLeagues();
for (const l of leagues) {
  for (const r of l.standings) {
    if (!byId.has(r.id)) err(`league ${l.id} standings row points at unknown player "${r.id}"`);
    if (r.wins + r.losses !== r.games) err(`league ${l.id}, ${r.id}: ${r.wins}+${r.losses} != ${r.games} games`);
    if (r.pf - r.pa !== r.diff) note(`source: league ${l.id}, ${r.id}: pf-pa is ${r.pf - r.pa} but the sheet says diff ${r.diff}`);
  }
  const srcLeague = leagueSrc.find((x) => x.id === l.id);
  if (srcLeague && srcLeague.players.length !== l.standings.length) {
    warn(`league ${l.id}: ${srcLeague.players.length} rows in the workbook but ${l.standings.length} shipped`);
  }
}
for (const r of master.rows) if (!byId.has(r.id)) err(`master standings row points at unknown player "${r.id}"`);

/* -------------------------------------------------------------- ratings */
for (const [id, v] of Object.entries(dupr)) {
  if (!byId.has(id)) err(`a DUPR rating is attached to unknown player "${id}"`);
  if (!(v.rating > 1 && v.rating < 8)) err(`DUPR rating ${v.rating} for ${id} is outside any real range`);
  if (!v.history?.length) err(`DUPR rating for ${id} has no history entries`);
  if (v.history.at(-1).rating !== v.rating) err(`DUPR current rating for ${id} does not match the last reading`);
}

/* ------------------------------------------------------ possible duplicates */
const maybes = players.filter((p) => p.maybe?.confident);
if (maybes.length) {
  note(`${maybes.length} players might duplicate someone already in the roster, held apart pending confirmation: ` +
       maybes.map((p) => `${p.name} <-> ${p.maybe.name}`).join('; '));
}

/* ------------------------------- the weekly-sheet fingerprint, re-proved */
// Dave's handles ("Ronnie D", "J.Z.", an eagle) were named by matching each
// player's wins/losses/games/points-for/points-against over the week his sheet
// covers. That method is only worth trusting while it still identifies people
// we ALREADY know, so the control runs here on live data every build rather
// than sitting in a commit message as a claim about one afternoon.
//
// The day two players share a week fingerprint, this drops from silent to
// loud - before a future handle gets matched on a coin toss.
//
// That day has arrived, and the honest answer is that the method has been
// retired rather than that the data is broken. With 537 players a single
// week's wins/losses/points no longer separates everyone: three pairs now
// share a fingerprint. Nothing resolves names this way any more - Scoreholio's
// own Players/Teams screen carries the real name beside the nickname, so
// handles are read rather than deduced, and no file in the resolution path
// imports weeklysheet.mjs. The control therefore reports a tie as a loud
// warning: it means "do not revive this method", not "today's build is wrong".
// The aliases the method produced back when it WAS unique are still checked,
// because they are still in aliases.json and still in use.
{
  const { weekRecords, fingerprint } = await import('./weeklysheet.mjs');
  const sheetWeek = master.week ?? null;
  const days = [...new Set(matches.map((m) => m.date))].sort();
  // The sheet covers the last week of play we hold.
  const to = days.at(-1);
  const from = new Date(new Date(to + 'T12:00:00').getTime() - 6 * 864e5).toISOString().slice(0, 10);
  const rec = weekRecords(matches, from, to);

  const prints = new Map();
  for (const [id, r] of rec) {
    const k = fingerprint(r);
    if (!prints.has(k)) prints.set(k, []);
    prints.get(k).push(id);
  }
  const shared = [...prints.values()].filter((ids) => ids.length > 1);
  if (shared.length) {
    warn(`${shared.length} week fingerprint(s) are shared by more than one player, so a handle could now be ` +
         `matched to the wrong person: ` + shared.slice(0, 3).map((ids) =>
           ids.map((i) => byId.get(i)?.name ?? i).join(' = ')).join('; '));
  }

  // Control: every player who is BOTH in the sheet and in the match record
  // must be picked out by their own fingerprint, uniquely.
  const rows = new Map(master.rows.map((r) => [r.id, r]));
  let right = 0, tied = 0, disagreed = 0;
  for (const [id, r] of rec) {
    const row = rows.get(id);
    if (!row) continue;
    if (fingerprint(row) !== fingerprint(r)) { disagreed++; continue; }
    const hits = prints.get(fingerprint(r)) ?? [];
    if (hits.length === 1 && hits[0] === id) right++; else tied++;
  }
  if (tied) {
    warn(`the week fingerprint no longer identifies ${tied} known player(s) uniquely, so it must not be used to ` +
         `name a handle again - nothing does, names now come from Scoreholio's roster`);
  }
  if (disagreed) {
    warn(`${disagreed} player(s) have a weekly standings row that disagrees with our own record of that week`);
  }
  note(`week fingerprint control (${from} to ${to}): ${right} known player(s) identified uniquely, ` +
       `${tied} tied, ${disagreed} where the sheet and our record disagree`);
}

/* ---------------------------------------------------------------- report */
console.log(`matches checked      : ${checked} / ${matches.length}`);
console.log(`head-to-head pairs   : ${recomputed.size} (derived in the page, not shipped)`);
console.log(`players              : ${players.length}`);
console.log(`league rows          : ${leagues.reduce((a, l) => a + l.standings.length, 0)}`);
console.log(`days covered         : ${coverage.days}  (${coverage.firstDate} to ${coverage.lastDate})`);
console.log();
console.log(`ERRORS (our pipeline) : ${errors.length}`);
errors.slice(0, 25).forEach((e) => console.log('  ' + e));
if (errors.length > 25) console.log(`  ... and ${errors.length - 25} more`);
console.log(`WARNINGS              : ${warnings.length}`);
warnings.slice(0, 15).forEach((w) => console.log('  ' + w));
console.log(`NOTES                 : ${notes.length}`);
notes.forEach((n) => console.log('  ' + n));
process.exit(errors.length ? 1 : 0);
