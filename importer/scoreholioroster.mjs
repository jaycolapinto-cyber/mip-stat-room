// Reads the rosters harvested from Scoreholio's organizer view.
//
// This is the file that ends the nickname problem. Every other source in this
// project carries ONE of a player's two names: the match logs carry the
// self-chosen display name ("Gregg D."), the workbooks and DUPR carry the real
// one ("Gregg Dukofsky"). The roster carries both, side by side, because
// Scoreholio has to know who a player really is in order to submit their
// results to DUPR.
//
// Shape on disk (importer/live/scoreholio-roster/rosters.json):
//   { "<tournamentId>": { n: "<name>", ts: <unix secs>, p: [ [display, fullName, duprDoubles, userId], ... ] } }
//
// playerEmail is present in the source and is deliberately not collected.

import { readFileSync, existsSync } from 'node:fs';

const FILE = new URL('./live/scoreholio-roster/rosters.json', import.meta.url);

/** -1 and -999 are Scoreholio's "no rating" sentinels, not ratings. */
const rating = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 && n < 8 ? n : null;
};

export function readRosters(file = FILE) {
  if (!existsSync(file)) return { tournaments: [], players: [], byDisplay: new Map(), conflicts: [], problems: ['no rosters.json yet'] };
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return buildFrom(raw);
}

/**
 * IDENTITY IS THE USER ID, NOT THE NAME.
 *
 * A display name is a label a player types for themselves; two people can and
 * do pick the same one, and one person can change theirs between seasons.
 * Scoreholio's own user id is stable, so that is what a player IS here. The
 * display name is only ever an attribute of a player, never the key.
 *
 * This matters: a single ten-player roster held both "Rob S." (Rob Sarraga)
 * and "Robert S." (Robert Seidner). Keying on the label would have merged them.
 */
export function buildFrom(raw) {
  const players = new Map();          // userId -> { id, names:Set, displays:Set, rating, seen }
  const problems = [];
  const tournaments = [];

  for (const [tid, t] of Object.entries(raw ?? {})) {
    if (!t || !Array.isArray(t.p)) { problems.push(`${tid}: no player list`); continue; }
    tournaments.push({ id: tid, name: t.n ?? '', ts: Number(t.ts) || null, players: t.p.length });
    for (const row of t.p) {
      const [display, full, dupr, userId] = row;
      const key = userId || `name:${String(full ?? display ?? '').toLowerCase()}`;
      if (!key) { problems.push(`${tid}: a player row with no identity`); continue; }
      if (!players.has(key)) players.set(key, { id: key, names: new Set(), displays: new Set(), rating: null, seen: 0 });
      const p = players.get(key);
      p.seen++;
      if (full && String(full).trim() && !PLACEHOLDER(full)) p.names.add(String(full).trim());
      if (display && String(display).trim()) p.displays.add(String(display).trim());
      const r = rating(dupr);
      if (r !== null) p.rating = r;   // latest roster wins; they are read oldest-first
    }
  }

  // A display name claimed by two different user ids is the dangerous case.
  const byDisplay = new Map();
  for (const p of players.values()) {
    for (const d of p.displays) {
      const k = d.toLowerCase();
      if (!byDisplay.has(k)) byDisplay.set(k, []);
      byDisplay.get(k).push(p);
    }
  }
  const conflicts = [];
  for (const [k, ps] of byDisplay) {
    if (ps.length < 2) continue;
    const names = [...new Set(ps.flatMap((p) => [...p.names]))];
    if (names.length > 1) conflicts.push({ display: k, claimedBy: names });
  }

  return {
    tournaments: tournaments.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
    players: [...players.values()].map((p) => ({
      id: p.id, names: [...p.names], displays: [...p.displays], rating: p.rating, seen: p.seen,
    })),
    byDisplay,
    conflicts,
    problems,
  };
}

/**
 * display name -> real name, ONLY where it is unambiguous.
 *
 * A display name that two different people have used is left out entirely
 * rather than resolved to whichever one appeared more often. That is the same
 * rule resolve.mjs follows and for the same reason: a wrong name hands one
 * player another player's record and nothing downstream would catch it.
 */
export function displayToRealName(built) {
  const out = new Map();
  for (const [k, ps] of built.byDisplay) {
    const names = [...new Set(ps.flatMap((p) => [...p.names]))];
    if (names.length === 1 && names[0]) out.set(k, names[0]);
  }
  return out;
}

if (process.argv[1]?.endsWith('scoreholioroster.mjs')) {
  const b = readRosters();
  console.log(`tournaments ${b.tournaments.length}`);
  if (b.tournaments.length) {
    const f = b.tournaments[0], l = b.tournaments[b.tournaments.length - 1];
    const d = (t) => (t.ts ? new Date(t.ts * 1000).toISOString().slice(0, 10) : '?');
    console.log(`  ${d(f)} to ${d(l)}`);
  }
  console.log(`players     ${b.players.length}`);
  const map = displayToRealName(b);
  console.log(`display names resolved unambiguously: ${map.size}`);
  console.log(`with a DUPR rating: ${b.players.filter((p) => p.rating !== null).length}`);
  if (b.conflicts.length) {
    console.log(`\nDISPLAY NAMES USED BY MORE THAN ONE PERSON (not resolved):`);
    for (const c of b.conflicts.slice(0, 20)) console.log(`  "${c.display}" -> ${c.claimedBy.join(' | ')}`);
  }
  for (const p of b.problems.slice(0, 10)) console.log('PROBLEM:', p);
}

/* ------------------------------------------------------------------ per-session
 * A flat TSV of "<tournamentId>\t<displayName>\t<realName>", one row per player
 * per tournament, harvested from the organizer rosters.
 *
 * Per TOURNAMENT, not per handle, and that distinction is the whole point.
 * Scoreholio's own rosters show "Michael S." meaning Michael Spezio on one
 * night and Michael Scancarello on another - and on 2025-12-04, both men played
 * under it. A global handle->name map would have quietly given one man a share
 * of the other's record. The tournament is the unit that disambiguates.
 */
/* Several TSVs of the same shape, merged. The later file wins on a conflict,
 * so the richer source is listed last: the tournament ADMIN screen's
 * Players/Teams tab names players the organizer-modal roster left blank, which
 * is what finally resolved "David A.", "Michael S." and the rest of the
 * stragglers - per night, not per handle. */
const SESSION_FILES = [
  './live/scoreholio-roster/rosters-2025-sessions.tsv',
  './live/scoreholio-roster/mip-playersteams-335.tsv',
  // 2026, swept from the same Players/Teams screen. Written by sweep2026.mjs.
  './live/scoreholio-roster/mip-2026-playersteams.tsv',
  // 2023. Only 6 of the 22 nights gave up a roster - the oldest admin pages
  // drop the Players/Teams panel when the log panel is opened - so most 2023
  // handles resolve from the corpus the other years built, not from here.
  './live/scoreholio-roster/mip-2023-playersteams.tsv',
];

export function readSessionRosters(files = SESSION_FILES.map((f) => new URL(f, import.meta.url))) {
  const list = Array.isArray(files) ? files : [files];
  const out = new Map();
  for (const file of list) mergeSessionFile(out, file);
  return out;
}

function mergeSessionFile(out, file) {
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [tid, display, full] = t.split('\t');
    if (!tid || !display || !full) continue;
    // A "full name" that just echoes the display name is a blank, not a name.
    const d = display.trim(), f = full.trim();
    if (harvestKey(f) === harvestKey(d)) continue;
    if (PLACEHOLDER(f)) continue;
    if (!out.has(tid)) out.set(tid, new Map());
    const m = out.get(tid);
    const k = d.toLowerCase();
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(f);
  }
  return out;
}

/** The real name this handle had IN THIS TOURNAMENT, or null if 0 or 2+. */
export function nameInSession(sessions, tournamentId, handle) {
  const m = sessions.get(tournamentId);
  if (!m) return null;
  const s = m.get(String(handle ?? '').trim().toLowerCase());
  if (!s || s.size !== 1) return null;
  return [...s][0];
}

/* ---------------------------------------------------------- the 338 harvest
 * One file, two sections:
 *
 *   ##### GLOBAL            display <TAB> real name
 *   ##### PERTOURNAMENT     tournamentId <TAB> display <TAB> real name
 *
 * GLOBAL holds every handle whose real name is the same everywhere it appears
 * - the overwhelming majority. PERTOURNAMENT holds only the handles that are
 * NOT consistent, and for those the tournament decides.
 *
 * The split matters because of people like "Michael S.", who is Michael
 * Scancarello on eighty rosters and Michael Spezio on fifteen. A global answer
 * would be wrong on one set or the other. So a contested handle appears ONLY in
 * the per-tournament section, never in the global one, and a lookup that cannot
 * find its tournament there returns nothing rather than falling back to a
 * guess.
 */
/* Scoreholio fills unregistered seats with obvious dummies: "Player 7 Player",
 * "Aaa Bbb", "Kkk Lll", and bare numbers like "12 12". They are not people and
 * must never become roster rows - one game each is enough to put a fake name on
 * the site's player list. A token of one letter repeated ("aaa", "kkk") is the
 * giveaway; a real surname never looks like that. */
// Declared as functions, not const arrows, because buildFrom() above calls
// PLACEHOLDER and a const would still be in its temporal dead zone at that
// point. That threw on the very first real rosters.json - the file this module
// was written for never existed until now, so the path had never once run.
function repeated(w) { return w.length >= 2 && /^([a-z])\1+$/i.test(w); }
function PLACEHOLDER(name) {
  const n = String(name ?? '').trim();
  if (!n) return true;
  if (/^player\s*\d*/i.test(n)) return true;
  if (/^[\d\s.]+$/.test(n)) return true;                 // "12 12", "5 5"
  // Scoreholio renders an account that never filled in its name fields as the
  // literal words "No First No Last". It reads like a person and it is not one:
  // two different accounts here carry it, so left alone it does not just add a
  // fake player to the list, it pools two strangers' games under one name.
  if (/^no\s*first\s*no\s*last$/i.test(n)) return true;
  const words = n.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every(repeated);      // "Aaa Bbb", "Kkk Lll"
}

export function readHarvestNames(file = new URL('./live/scoreholio-roster/mip-names-338.txt', import.meta.url)) {
  const global = new Map();                 // displayLower -> real name
  const perT = new Map();                   // tid -> Map(displayLower -> real name)
  const contested = new Set();
  if (!existsSync(file)) return { global, perT, contested };

  let section = null;
  // "Jason Careri" and "Jason  Careri" are one man and a stray space, not two
  // people. A handle is only CONTESTED when the names genuinely differ once
  // whitespace and case are normalised - otherwise a typo would strand every
  // game that player appears in.
  const sameName = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim();
  const seenNames = new Map();            // handle -> Set(normalised real names)
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.replace(/\r$/, '');
    if (t.startsWith('##### ')) { section = t.slice(6).trim(); continue; }
    if (!t.trim()) continue;
    const bits = t.split('\t');
    if (section === 'GLOBAL' && bits.length >= 2) {
      const [d, real] = bits;
      if (PLACEHOLDER(real) || PLACEHOLDER(d)) continue;
      global.set(harvestKey(d), real.trim());
    } else if (section === 'PERTOURNAMENT' && bits.length >= 3) {
      const [tid, d, real] = bits;
      if (PLACEHOLDER(real)) continue;
      const k = harvestKey(d);
      if (!perT.has(tid)) perT.set(tid, new Map());
      perT.get(tid).set(k, real.trim());
      if (!seenNames.has(k)) seenNames.set(k, new Set());
      seenNames.get(k).add(sameName(real));
    }
  }
  // Only handles with genuinely different names are contested. For the rest,
  // collapse to the most common spelling and treat them as global.
  for (const [k, names] of seenNames) {
    if (names.size > 1) { contested.add(k); continue; }
    for (const [, m] of perT) { const v = m.get(k); if (v && !global.has(k)) global.set(k, v); }
  }
  // A contested handle must never be resolved globally.
  for (const k of contested) global.delete(k);
  return { global, perT, contested };
}

/* The harvest file's keys were normalised when it was written - lower case,
 * collapsed whitespace, trailing period dropped - so a lookup has to normalise
 * the same way. It did not, at first, and "Rudolf K." missed "rudolf k" 1,206
 * times in silence: the handle simply looked unresolvable. Keeping the two
 * spellings in one function is what stops that recurring. */
export const harvestKey = (s) => String(s ?? '').trim().toLowerCase()
  .replace(/\.$/, '').replace(/\s+/g, ' ');

/** Real name for this handle in this tournament, or null. Never guesses. */
export function harvestName(h, tournamentId, handle) {
  const k = harvestKey(handle);
  if (!k) return null;
  if (h.contested.has(k)) return h.perT.get(tournamentId)?.get(k) ?? null;
  return h.global.get(k) ?? null;
}

/* ------------------------------------------- human answers, per tournament
 * Where Scoreholio's roster left a handle unnamed for one night, Jay looked it
 * up in the club's records. Those answers live in aliases.json under
 * `tournamentHandles`, keyed by tournament, and they outrank everything else.
 *
 * Keyed by tournament and not by handle, for the reason this whole file
 * exists: "David A." is David Amatulli on twelve rosters and David Altman on
 * three, so "who is David A." has no single answer - only "who was David A.
 * on this night" does.
 */
export function readTournamentHandles(file = new URL('./aliases.json', import.meta.url)) {
  const out = new Map();
  if (!existsSync(file)) return out;
  const a = JSON.parse(readFileSync(file, 'utf8'));
  for (const [tid, m] of Object.entries(a.tournamentHandles ?? {})) {
    if (tid.startsWith('_') || typeof m !== 'object') continue;
    const inner = new Map();
    for (const [h, real] of Object.entries(m)) { if (h.startsWith('_')) continue; inner.set(harvestKey(h), real); }
    if (inner.size) out.set(tid, inner);
  }
  return out;
}

export function confirmedName(th, tournamentId, handle) {
  return th.get(tournamentId)?.get(harvestKey(handle)) ?? null;
}

/* ------------------------------------------------- named by a human, globally
 * Handles a person who knows the club has put a name to, where that name holds
 * everywhere the handle appears. The per-tournament map above still wins over
 * this one, because a handle that means two different people on two different
 * nights has no global answer and must never be given one.
 *
 * Sitting between the per-tournament answers and the inference, so a human
 * answer beats every guess but never overrides a more specific human answer.
 */
export function readNamedHandles(file = new URL('./aliases.json', import.meta.url)) {
  const out = new Map();
  if (!existsSync(file)) return out;
  const a = JSON.parse(readFileSync(file, 'utf8'));
  for (const [h, real] of Object.entries(a.namedByHand ?? {})) {
    if (h.startsWith('_') || typeof real !== 'string' || !real.trim()) continue;
    out.set(harvestKey(h), real.trim());
  }
  return out;
}

export function namedByHand(map, handle) {
  return map.get(harvestKey(handle)) ?? null;
}
