// Builds dist/data.js.
//
// THE MATCH LIST NOW COMES FROM DUPR, not from Dave's workbook.
//
// The workbook's "Added Games" sheet carried 169 games with no dates and
// Scoreholio nicknames. DUPR carries thousands, each with a real date, four
// real names and a stable Match ID. It is better on every axis that matters, so
// it is the spine and the workbook is now a cross-check rather than the source.
//
// What each source still contributes:
//   DUPR match list  -> every game: date, players, score, Match ID
//   DUPR club list   -> current doubles ratings, one dated reading at a time
//   Scoreholio export-> time and court, joined onto the games it overlaps
//   League workbooks -> published standings, and the canonical spelling of a
//                       name for the ~170 people who appear in them
//   Head-to-head grid-> no longer used to build anything; verify.mjs compares
//                       our computed pair records against it as an independent
//                       check on a slice of the season

import { writeFileSync, readFileSync } from 'node:fs';
import { run } from './build.mjs';
import { readGames, standingsStaleness } from './extract.mjs';
import { matchDupr } from './dupr.mjs';
import { readDuprMatches } from './duprmatches.mjs';
import { widenRoster } from './duprroster.mjs';
import { readAllExports } from './scoreholio.mjs';
import { createResolver } from './resolve.mjs';
import { readSessionRosters, nameInSession, readHarvestNames, harvestName,
         readTournamentHandles, confirmedName, readNamedHandles, namedByHand } from './scoreholioroster.mjs';
import { readdirSync } from 'node:fs';

const { roster, displayToId, leagueRowId, conflictedNames, leagues, master } = run({ quiet: true });
const { startDate } = readGames();

// ---------------------------------------------------------------- roster
const wide = widenRoster(roster);
const byId = new Map(wide.players.map((p) => [p.id, p]));
const fix = wide.resolve;                       // apply any confirmed merges
// fix() matters here as much as anywhere else. Without it this was the ONE
// resolver that ignored a confirmed merge, so a DUPR game kept the merged-away
// id while the Scoreholio copy of the same game carried the surviving one. The
// two then no longer looked like the same game, cross-source de-duplication
// stopped matching them, and both copies were kept - 122 real games counted
// twice the first time the three Brett rows were merged. Every other resolver
// in this file already ended in fix(); this one simply never did.
const idOfDuprName = (n) => { const id = wide.nameToId.get(n); return id ? fix(id) : null; };

// Scoreholio speaks in nicknames ("Jay C", "Chase Gold"), the grid in display
// names, DUPR in real names. One resolver that knows all three, and still
// refuses anything it has not been told.
const ALIASES = JSON.parse(readFileSync(new URL('./aliases.json', import.meta.url), 'utf8'));
// What a player is CALLED, where the source of their name got only half of it.
// Display only: the id, the games and every record stay exactly as they were,
// and nothing here merges anything. A DUPR account name is typed by the player,
// and one of the club's most prolific players typed "Mike" and stopped.
const DISPLAY_NAMES = Object.fromEntries(
  Object.entries(ALIASES.displayNames ?? {}).filter(([k]) => !k.startsWith('_')));
const CONFIRMED = ALIASES.confirmed ?? {};
// Scoreholio handles whose person exists only once the roster has been widened
// with DUPR. These cannot live in `confirmed`, which is checked against the
// workbook roster before any DUPR-only player exists.
const SH_HANDLES = Object.fromEntries(
  Object.entries(ALIASES.scoreholioHandles ?? {}).filter(([k]) => !k.startsWith('_')));
const byLooseName = new Map();
for (const p of wide.players) {
  const k = p.name.toLowerCase();
  if (!byLooseName.has(k)) byLooseName.set(k, p.id);
}
const anyNameToId = (raw) => {
  const n = String(raw ?? '').trim();
  if (!n) return null;
  const hit = wide.nameToId.get(n) ?? CONFIRMED[n] ?? SH_HANDLES[n] ?? displayToId.get(n) ?? byLooseName.get(n.toLowerCase()) ?? null;
  return hit ? fix(hit) : null;
};

// Scoreholio abbreviates: "Lauren G.", "thomas P.", "Laura, P". Those are not
// names any exact map holds, and until now the build simply gave up on them -
// 46 handles and 543 games' worth. resolve.mjs is the tool for exactly this and
// it was never wired in here. It refuses on ambiguity: "Michael S." stays
// unresolved while the roster holds both a Scancarello and a Spezio.
//
// Scoped to Scoreholio on purpose. A DUPR name or a standings row is a full
// real name and should match a full real name; loosening THOSE would be a way
// to hand one player another's record. Here the blast radius is bounded: this
// id is only used to look up a game that must already agree on all four
// players AND the score, so a wrong reading fails to match and the game simply
// stays un-enriched.
const abbrev = createResolver(wide.players.map((p) => ({ id: p.id, name: p.name })));
const shAmbiguous = new Map();
const shNameToId = (raw) => {
  const exact = anyNameToId(raw);
  if (exact) return exact;
  const r = abbrev.resolve(raw);
  if (r.id) return fix(r.id);
  if (r.ambiguous) shAmbiguous.set(r.ambiguous, r.candidates);
  return null;
};

/* ---------------------------------------------- Scoreholio's own name records
 * Scoreholio stores the real name beside the nickname, because it has to know
 * who a player is to submit their results to DUPR. Every export we ever pulled
 * was the Match Log, which carries only the nickname - so for months this
 * project inferred names it could simply have read.
 *
 * Resolution is PER TOURNAMENT. "Michael S." is Michael Spezio on 2025-11-21
 * and Michael Scancarello on 2025-11-27; on 2025-12-04 both men played under
 * it and it resolves to nobody. A single global answer would have been wrong.
 */
const SESSIONS = readSessionRosters();
const HARVEST = readHarvestNames();
const CONFIRMED_T = readTournamentHandles();
const NAMED = readNamedHandles();
const canonName = (s0) => String(s0).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const rosterByName = new Map();
const nameDupes = new Set();
for (const p of wide.players) {
  const k = canonName(p.name);
  if (rosterByName.has(k)) nameDupes.add(k);
  else rosterByName.set(k, p.id);
}
const addedFromScoreholio = [];
const idForRealName = (real) => {
  const k = canonName(real);
  if (!k) return null;
  if (nameDupes.has(k)) return null;               // two people share this name - refuse
  if (rosterByName.has(k)) return fix(rosterByName.get(k));
  // A real person, named by the system of record, who is simply not in our
  // roster yet. Add them rather than drop their games.
  let id = k.replace(/ /g, '-');
  const taken = new Set(wide.players.map((p) => p.id));
  if (taken.has(id)) { let n = 2; while (taken.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
  const p = { id, name: real, club: null, leagues: [], aliases: [], source: 'scoreholio' };
  wide.players.push(p);
  rosterByName.set(k, id);
  addedFromScoreholio.push({ id, name: real });
  return id;
};

const shUnresolved = new Map();
/**
 * Everything known about a handle nobody can name, so a person can name it.
 *
 * A bare list of nicknames is unanswerable - "who is Scanc?" has no answer
 * without something to go on. What makes it answerable is the company they
 * keep: the nights they played, and the people they played with and against
 * whose names we DO have. Dave reads "played Mondays with Bill Rotunda and
 * Tori" and knows who that is.
 */
const shContext = new Map();
const noteContext = (handle, tournamentId, date, others) => {
  let c = shContext.get(handle);
  if (!c) shContext.set(handle, c = { games: 0, tournaments: new Set(), dates: new Set(), with: new Map() });
  c.games++;
  c.tournaments.add(tournamentId);
  c.dates.add(date);
  for (const o of others) if (o !== handle) c.with.set(o, (c.with.get(o) ?? 0) + 1);
};
const shIdFor = (tournamentId, handle) => {
  // A human answer for this night beats every inference.
  const real = confirmedName(CONFIRMED_T, tournamentId, handle)
            ?? namedByHand(NAMED, handle)
            ?? nameInSession(SESSIONS, tournamentId, handle)
            ?? harvestName(HARVEST, tournamentId, handle);
  if (real) { const id = idForRealName(real); if (id) return id; }
  const fallback = shNameToId(handle);
  if (fallback) return fallback;
  shUnresolved.set(handle, (shUnresolved.get(handle) ?? 0) + 1);
  return null;
};

// ---------------------------------------------------------------- matches
const { games: duprGames, files: duprFiles } = readDuprMatches();
const matches = [];
const heldBack = [];
for (const g of duprGames) {
  const a = g.a.map(idOfDuprName), b = g.b.map(idOfDuprName);
  if ([...a, ...b].some((x) => !x)) { heldBack.push({ id: g.matchId, why: 'a name is not a player', who: [...g.a, ...g.b] }); continue; }
  if (new Set([...a, ...b]).size !== 4) { heldBack.push({ id: g.matchId, why: 'the same player twice', who: [...g.a, ...g.b] }); continue; }
  matches.push({ id: g.matchId, date: g.date, a, b, sa: g.sa, sb: g.sb });
}

// Time and court, where a Scoreholio export covers the same game. Matched on
// players and score within the day - Scoreholio and DUPR share no id.
const sig = (a, b, sa, sb) => {
  const A = [...a].sort().join('+'), B = [...b].sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
};
const shPool = new Map();
// readAllExports covers single-tournament files AND harvest batches (many
// tournaments in one .txt). Listing only .xlsx/.csv here meant a night's
// harvest was parsed by the tests and then silently ignored by the build.
for (const e of readAllExports()) {
  for (const g of e.games) {
    const a = g.handlesA.map((h) => shIdFor(e.tournamentId, h));
    const b = g.handlesB.map((h) => shIdFor(e.tournamentId, h));
    if ([...a, ...b].some((x) => !x)) continue;
    const k = g.iso.slice(0, 10) + '|' + sig(a, b, g.sa, g.sb);
    if (!shPool.has(k)) shPool.set(k, []);
    shPool.get(k).push(g);
  }
}
let enriched = 0;
for (const m of matches) {
  const q = shPool.get(m.date + '|' + sig(m.a, m.b, m.sa, m.sb));
  if (!q?.length) continue;
  const g = q.shift();
  m.court = g.court; m.ts = g.ts;
  // How long the game took. Only Scoreholio knows this - DUPR carries no clock
  // - so a DUPR game only gets a duration when a Scoreholio row covers it.
  if (g.dur != null) m.dur = g.dur;
  if (g.wait != null) m.wait = g.wait;
  m.time = new Date(g.ts * 1000).toLocaleTimeString('en-US',
    { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  enriched++;
}

/* ------------------------------------------- games that exist ONLY in Scoreholio
 * DUPR's record of this club starts cold on 2026-01-30, because that is when
 * the club was created there - not when the league started. Everything before
 * that was played, scored and stored in Scoreholio and nowhere else.
 *
 * Until now the importer could only DECORATE a DUPR game with a court and a
 * clock; it had no way to admit a game DUPR had never seen. This is that path,
 * and it is deliberately narrow:
 *
 *   - every one of the four players must resolve, by that tournament's own
 *     roster, to exactly one person;
 *   - the game must not already be in the match list under its DUPR identity
 *     (checked on the same signature the enrichment join uses);
 *   - a Scoreholio Match ID is carried through, so re-importing the same
 *     export twice cannot double a game.
 *
 * Anything that fails those is reported, never quietly dropped.
 */
const haveSig = new Set(matches.map((m) => m.date + '|' + sig(m.a, m.b, m.sa, m.sb)));
const seenShId = new Set();
const addedGames = [], refusedGames = [];
for (const e of readAllExports()) {
  for (const g of e.games) {
    if (seenShId.has(g.matchId)) continue;
    seenShId.add(g.matchId);
    const a = g.handlesA.map((h) => shIdFor(e.tournamentId, h));
    const b = g.handlesB.map((h) => shIdFor(e.tournamentId, h));
    const who = [...g.handlesA, ...g.handlesB];
    if ([...a, ...b].some((x) => !x)) {
      refusedGames.push({ id: g.matchId, why: 'a handle does not resolve', who });
      const ids = [...a, ...b];
      const date = g.iso.slice(0, 10);
      who.forEach((h, i) => { if (!ids[i]) noteContext(h, e.tournamentId, date, who); });
      continue;
    }
    if (new Set([...a, ...b]).size !== 4) { refusedGames.push({ id: g.matchId, why: 'the same player twice', who }); continue; }
    const date = g.iso.slice(0, 10);
    const k = date + '|' + sig(a, b, g.sa, g.sb);
    if (haveSig.has(k)) continue;                 // DUPR already has this game
    haveSig.add(k);
    matches.push({
      id: 'sh:' + g.matchId, date, a, b, sa: g.sa, sb: g.sb,
      court: g.court, ts: g.ts,
      ...(g.dur != null ? { dur: g.dur } : {}),
      ...(g.wait != null ? { wait: g.wait } : {}),
      time: new Date(g.ts * 1000).toLocaleTimeString('en-US',
        { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
      // The tournament this game belongs to. Carried because a court number is
      // only unique WITHIN a tournament: the club runs an A and a B bracket at
      // once and each numbers its courts from 1, so "court 1" legitimately
      // exists twice at the same minute. Without this field the only way to
      // check for a double-booked court is to assume courts are globally
      // unique, which they are not.
      tournament: e.tournamentId,
      source: 'scoreholio',
    });
    addedGames.push(date);
  }
}

matches.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.ts ?? 0) - (y.ts ?? 0)));

// ------------------------------------------------------------ head to head
// Computed from the games themselves, so a pair record can never disagree with
// the match log it is drawn from.
//
// It is NOT shipped. 11,000 pair records cost 587 KB - 39% of the whole file -
// to say something the 6,469 matches already say. The page rebuilds it on load
// in a few milliseconds. Shipping both would also reintroduce exactly the class
// of bug this project keeps hitting: two copies of the same fact, free to drift
// apart. Here it is computed only so the emitter can report the pair count.
const pair = new Map();
for (const m of matches) {
  const winners = m.sa > m.sb ? m.a : m.b;
  const losers  = m.sa > m.sb ? m.b : m.a;
  for (const w of winners) for (const l of losers) {
    const kw = w + '|' + l, kl = l + '|' + w;
    if (!pair.has(kw)) pair.set(kw, { a: w, b: l, w: 0, l: 0 });
    if (!pair.has(kl)) pair.set(kl, { a: l, b: w, w: 0, l: 0 });
    pair.get(kw).w++; pair.get(kl).l++;
  }
}
const h2h = [...pair.values()].filter((x) => x.w + x.l > 0);

// ------------------------------------------------------------------ output
const masterOut = {
  title: master.title,
  rows: master.players.map((p) => {
    const id = anyNameToId(p.name);
    return id && { id, rank: p.rank, games: p.games, events: p.events, wins: p.wins,
                   losses: p.losses, pf: p.pf, pa: p.pa, diff: p.diff };
  }).filter(Boolean),
};

// A player stays in the roster if ANYTHING still points at them: a game, a
// league standings row, or a master standings row. Leaving one out here is how
// the page ends up with a row referring to somebody who is not in the data -
// the exact dangling reference the verifier exists to catch.
const usedIds = new Set([
  ...matches.flatMap((m) => [...m.a, ...m.b]),
  ...masterOut.rows.map((r) => r.id),
  ...leagues.flatMap((l) => l.players.map((p) => { const id = leagueRowId(p.name, p.club); return id && fix(id); }).filter(Boolean)),
]);

const dp = matchDupr(roster);
const dupr = {};
for (const [id0, v] of dp.ratings) { const id = fix(id0); dupr[id] = { rating: v.rating, duprName: v.duprName, asOf: v.asOf, history: v.history }; }

const players = wide.players
  .filter((p) => usedIds.has(p.id))
  .map((p) => ({ id: p.id, name: DISPLAY_NAMES[p.id] ?? p.name, club: p.club, leagues: p.leagues,
                 ...(p.duprNames?.length ? { duprNames: p.duprNames } : {}),
                 ...(p.aliases?.length ? { aliases: p.aliases } : {}),
                 // Only a CONFIDENT duplicate suspicion ships. A shared first
                 // name produced 82 low-confidence guesses, and shipping them
                 // put an unresolved data question on 87 player profiles. The
                 // weak ones stay in the build output, where someone can act
                 // on them, rather than in the payload where they can leak
                 // back onto the page.
                 ...(p.maybe?.confident ? { maybe: p.maybe } : {}),
                 ...(p.nameConflict ? { nameConflict: true } : {}),
                 ...(p.source === 'dupr' ? { fromDupr: true } : {}),
                 ...(p.displayOnly ? { displayOnly: true } : {}) }));

const leagueOut = leagues.map((l) => ({
  id: l.id, label: l.label, note: l.note,
  standings: l.players.map((p) => {
    const raw = leagueRowId(p.name, p.club);
    const id = raw && fix(raw);
    return id && { id, rank: p.rank, wins: p.wins, losses: p.losses, games: p.games,
                   pf: p.pf, pa: p.pa, diff: p.diff, winPct: p.winPct, points: p.points, weeks: p.weeks };
  }).filter(Boolean),
}));


const days = [...new Set(matches.map((m) => m.date))].sort();
const out = {
  generated: new Date().toISOString(),
  source: {
    note: 'Match history from the Merrick In A Pickle DUPR club listing (club 8246685522), read from the club match list. Standings from the workbooks published on merrickinapickle.com.',
    matchesAre: 'every game DUPR holds for the club over the dates covered, with real names and DUPR Match IDs',
    h2hAre: 'computed from those games, not from the published grid',
    ratingsAre: 'doubles ratings read from the DUPR club listing on the dates in coverage.duprSnapshots',
    gridStart: startDate,
  },
  coverage: {
    games: matches.length,
    days: days.length,
    firstDate: days[0] ?? null,
    lastDate: days[days.length - 1] ?? null,
    playersWithGames: new Set(matches.flatMap((m) => [...m.a, ...m.b])).size,
    gamesWithTimeAndCourt: enriched,
    // Games that exist only in Scoreholio's match logs and never reached DUPR.
    // The page says where its games come from, so it needs the real split.
    gamesFromScoreholioOnly: addedGames.length,
    gamesHeldBack: heldBack.length,
    duprSourceFiles: duprFiles,
    playersAddedFromDupr: wide.added.length,
    possibleDuplicates: wide.suggestions.filter((s) => s.confident).length,
    conflictedNames,
    duprMatched: Object.keys(dupr).length,
    duprSnapshots: dp.snapshots,
    h2hPairs: h2h.length,
  },
  players, leagues: leagueOut, master: masterOut, matches, dupr,
};

writeFileSync(new URL('../dist/data.js', import.meta.url),
`// GENERATED - do not edit. Built by importer/emit.mjs.
//
// Matches come from the DUPR club match list: real names, real dates, DUPR
// Match IDs. Standings come from the workbooks published on merrickinapickle.com.
// Head-to-head is computed from the matches, so it cannot disagree with them.
//
// IF THE SITE EVER RENDERS ITS NAV BAR AND NOTHING ELSE, look at this file's
// Content-Type first. Cloudflare Workers stores each static asset by CONTENT
// HASH and fixes its Content-Type at the upload that first created it. On
// 2026-09-14 an upload declared this file application/octet-stream; a browser
// refuses to execute an ES module with that type, so app.js could not import it
// and the page came up empty. Re-uploading the identical file does NOT fix it -
// same hash, same asset - and neither does rolling the deployment back, because
// every version points at the same asset. Changing the bytes is what forces a
// new one. Any real rebuild does that on its own, since the timestamp below
// moves; a redeploy of an unchanged file does not.

export const DATA = ${JSON.stringify(out)};
export const { players, leagues, master, matches, dupr, coverage, source } = DATA;
`);

/* --------------------------------------------- the handles nobody can name
 * Written every build so the question stays current: a name confirmed today
 * drops off the list tomorrow without anyone editing it. Ordered by games,
 * because that is the order in which answering is worth the most.
 */
writeFileSync(new URL('./live/unknown-handles.json', import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  handles: [...shContext].sort((x, y) => y[1].games - x[1].games).map(([handle, c]) => ({
    handle,
    games: c.games,
    nights: c.dates.size,
    firstSeen: [...c.dates].sort()[0],
    lastSeen: [...c.dates].sort().at(-1),
    tournaments: [...c.tournaments],
    playedWith: [...c.with].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([h, n]) => ({ handle: h, games: n })),
    // Where the abbreviation matched more than one person, the candidates.
    // Refusing is right, but the reader deserves to see the shortlist.
    candidates: shAmbiguous.get(handle) ?? null,
  })),
}, null, 1));

console.log('players        ', players.length, `(${wide.added.length} new from DUPR)`);
console.log('matches        ', matches.length, `over ${days.length} days, ${days[0]} to ${days[days.length-1]}`);
console.log('  with time/court', enriched);
console.log('  with a play clock', matches.filter((m) => m.dur != null).length);
console.log('  with a wait clock', matches.filter((m) => m.wait != null).length);
if (shAmbiguous.size) {
  console.log('\nScoreholio handles that could be two people (refused, NOT guessed):');
  for (const [n, c] of shAmbiguous) console.log(`  ${n} -> ${c.join(' or ')}`);
}
console.log('  held back      ', heldBack.length, heldBack.length ? `(${[...new Set(heldBack.map(h=>h.why))].join('; ')})` : '');
if (addedGames.length) {
  const byDay = {};
  for (const d of addedGames) byDay[d] = (byDay[d] ?? 0) + 1;
  const days = Object.keys(byDay).sort();
  console.log(`  from Scoreholio  ${addedGames.length} game(s) DUPR never had, ${days[0]} to ${days[days.length - 1]}`);
}
if (addedFromScoreholio.length) console.log('  new players    ', addedFromScoreholio.length, 'named by Scoreholio');
if (shUnresolved.size) {
  const top=[...shUnresolved].sort((a,b)=>b[1]-a[1]).slice(0,25);
  console.log('\n  handles that did not resolve (top 25 of ' + shUnresolved.size + '):');
  for (const [h,c] of top) console.log('    ' + String(c).padStart(5) + '  ' + JSON.stringify(h));
}
if (refusedGames.length) {
  const why = {};
  for (const r of refusedGames) why[r.why] = (why[r.why] ?? 0) + 1;
  console.log('  refused        ', refusedGames.length, JSON.stringify(why));
}
console.log('h2h pairs      ', h2h.length);
console.log('leagues        ', leagueOut.length, '->', leagueOut.map((l) => `${l.id}:${l.standings.length}`).join(' '));
console.log('master rows    ', masterOut.rows.length, '/', master.players.length);
console.log('dupr ratings   ', Object.keys(dupr).length, '|', dp.snapshots.length, 'snapshot(s)');

/* ------------------------------------------------ are the standings current?
 * Games refresh themselves from Scoreholio. Standings do not - they are eight
 * workbooks somebody downloads by hand, and forgetting that step produces a
 * site where this week's games sit beside last month's table with no error
 * anywhere. So the build says, every time, which file each league came from
 * and how far behind the newest game it is.
 */
{
  const newest = out.coverage.lastDate;
  const rows = standingsStaleness(newest);
  const STALE_DAYS = 7;
  const stale = rows.filter((r) => r.daysBehind > STALE_DAYS);
  const age = (r) => (r.daysBehind === 0 ? '  current' : `${String(r.daysBehind).padStart(4)}d old`);
  console.log(`\nstandings workbooks (newest game is ${newest}):`);
  for (const r of rows) {
    const flag = r.daysBehind > STALE_DAYS ? '  <-- STALE' : '';
    console.log(`  ${age(r)}  ${r.downloaded}  ${r.what.padEnd(26)} ${r.file}${flag}`);
  }
  if (stale.length) {
    console.log(`\n  ${stale.length} workbook(s) are more than ${STALE_DAYS} days older than the newest game.`);
    console.log('  The standings tab will be showing figures older than the games beside it.');
    console.log('  Re-download them from the Stats & Standings page on merrickinapickle.com.');
  }
  const dupes = rows.filter((r) => r.alternatives > 0);
  if (dupes.length) {
    console.log(`\n  ${dupes.length} source(s) had more than one matching file; the newest was used.`);
    for (const r of dupes) console.log(`    ${r.what}: ${r.alternatives} older cop${r.alternatives === 1 ? 'y' : 'ies'} ignored`);
  }
}
if (wide.suggestions.filter((s) => s.confident).length) {
  console.log('\npossible duplicate people (NOT merged - for Dave to confirm):');
  for (const s of wide.suggestions.filter((s) => s.confident)) console.log(`  ${s.duprName} <-> ${s.maybe}`);
}
