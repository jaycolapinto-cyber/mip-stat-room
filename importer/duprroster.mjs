// The roster, widened to everyone DUPR has seen play.
//
// Dave's six league workbooks name about 170 people. DUPR's match history names
// far more, because the club runs sessions that never got a ranking workbook.
// Those extra people are not mysteries - DUPR carries their real names. So they
// become players.
//
// The one thing this module will not do is decide that two names are the same
// person. A DUPR name string is treated as one identity, full stop:
//
//   - "Sal Farruggia" and "Sal farruggia" stay separate. Both accounts were in
//     use over the same months and share four specific playing days, and Dave's
//     own files list two different Sal Farruggias.
//   - "Gennaro Izzo" and "Gennaro izzo" stay separate too. Same overlapping
//     period, though they never share a day.
//
// Where a new name looks like it might be someone we already hold, that is
// recorded as a SUGGESTION for a human to confirm - never applied. A wrong
// merge silently hands one player another's record and nothing downstream
// would catch it.

import { readFileSync } from 'node:fs';
import { matchDupr } from './dupr.mjs';
import { suggestFor } from './suggest.mjs';
import { readDuprMatches } from './duprmatches.mjs';

const canon = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const slug = (n) => String(n).toLowerCase().normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Strings DUPR shows that are not a person. */
export const NOT_A_PLAYER = new Set(['deleted account']);

/**
 * @param roster  the canonical roster from buildRoster()
 * @returns { players, nameToId, added, unresolvedSuggestions, notAPlayer, gamesDropped }
 */
export function widenRoster(roster) {
  const aliases = JSON.parse(readFileSync(new URL('./aliases.json', import.meta.url), 'utf8'));
  const confirmed = new Map(Object.entries(aliases.duprNames ?? {})
    .filter(([k]) => !k.startsWith('_')).map(([k, v]) => [canon(k), v]));

  // Roster rows a human has confirmed are the same person. This is the ONLY
  // route by which two identities ever merge - never a similarity score.
  const merged = new Map(Object.entries(aliases.mergedPlayers ?? {}).filter(([k]) => !k.startsWith('_')));
  const resolve = (id) => { let n = 0; while (merged.has(id) && n++ < 8) id = merged.get(id); return id; };
  if (merged.size) {
    const keep = new Map();
    for (const p of roster) {
      const target = resolve(p.id);
      if (target === p.id) { keep.set(p.id, p); continue; }
      const into = roster.find((x) => x.id === target);
      if (!into) throw new Error(`mergedPlayers points "${p.id}" at unknown id "${target}"`);
      into.leagues = [...new Set([...(into.leagues ?? []), ...(p.leagues ?? [])])];
      into.aliases = [...new Set([...(into.aliases ?? []), ...(p.aliases ?? []), p.name])]
        .filter((a) => a !== into.name);
      into.nameConflict = false;             // the conflict is what the merge resolved
    }
    roster = roster.filter((p) => resolve(p.id) === p.id);
  }

  // Names the league files list more than once (two Sal Farruggias). An exact
  // name match to one of these is ambiguous, so it must never auto-resolve.
  const conflicted = new Set(roster.filter((p) => p.nameConflict).map((p) => canon(p.name)));

  const byExact = new Map();
  for (const p of roster) {
    const k = canon(p.name);
    if (conflicted.has(k)) continue;
    if (!byExact.has(k)) byExact.set(k, p.id);
  }

  // The club listing already pinned some DUPR spellings to roster players.
  const fromClub = new Map();
  for (const [id, v] of matchDupr(roster).ratings) fromClub.set(canon(v.duprName), resolve(id));

  const { games } = readDuprMatches();
  const seen = new Map();                       // exact DUPR string -> count
  for (const g of games) for (const n of [...g.a, ...g.b]) seen.set(n, (seen.get(n) ?? 0) + 1);

  const players = roster.map((p) => ({ ...p }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameToId = new Map();                   // exact DUPR string -> player id
  const added = [], notAPlayer = [], suggestions = [];
  const canonicalPool = roster.filter((p) => !p.displayOnly);

  for (const [name, count] of [...seen].sort((a, b) => b[1] - a[1])) {
    if (NOT_A_PLAYER.has(name.toLowerCase())) { notAPlayer.push({ name, count }); continue; }

    const c = canon(name);
    const hit = confirmed.get(c) ?? fromClub.get(c) ?? byExact.get(c) ?? null;
    if (hit && byId.has(hit)) {
      nameToId.set(name, hit);
      const p = byId.get(hit);
      if (p.name !== name && !(p.duprNames ?? []).includes(name)) (p.duprNames ??= []).push(name);
      continue;
    }

    // New person. Give them an id that cannot collide with an existing one.
    let id = slug(name) || 'dupr-' + slug(String(added.length));
    if (byId.has(id)) { let n = 2; while (byId.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    const p = { id, name, club: null, leagues: [], aliases: [], duprNames: [name], source: 'dupr' };

    // Might this be somebody we already hold? Record it; never act on it.
    const top = suggestFor(name, canonicalPool)[0];
    if (top) {
      const s = { duprName: name, games: count, maybe: top.name, maybeId: top.id,
                  confident: !!top.confident, why: top.why };
      suggestions.push(s);
      p.maybe = { id: top.id, name: top.name, why: top.why, confident: !!top.confident };
    }

    players.push(p); byId.set(id, p); nameToId.set(name, id); added.push({ id, name, games: count });
  }

  const gamesDropped = games.filter((g) =>
    [...g.a, ...g.b].some((n) => NOT_A_PLAYER.has(n.toLowerCase()))).length;

  /* ------------------------------------------------ handles on Dave's sheets
   * Dave's weekly master sheet lists some players by a handle - "Ronnie D",
   * "J.Z.", a bare eagle emoji - so the sheet produced a roster row of its own
   * standing alongside the real person, who is also here under their DUPR name.
   * Folding the handle row into the real person is what puts one player's
   * standings and their match history on a single profile.
   *
   * This runs HERE, at the end, and not with mergedPlayers at the top, for a
   * blunt reason: the target does not exist yet up there. mergedPlayers joins
   * two workbook rows, and every DUPR-only person is created in the loop above.
   * Merging into one of them before that loop throws "unknown id" - which is
   * how this was caught rather than silently half-applied.
   *
   * Same doctrine as mergedPlayers: a human confirmed each of these. The
   * fingerprint that proposed them is recorded in aliases.json, control test
   * included, but nothing here merges on a score.
   */
  const sheet = Object.entries(aliases.sheetHandles ?? {}).filter(([k]) => !k.startsWith('_'));
  const sheetMerges = [];
  const sheetUnresolved = [];
  if (sheet.length) {
    const byName = new Map();
    for (const p of players) if (!byName.has(p.name)) byName.set(p.name, p.id);
    for (const [handle, targetId] of sheet) {
      const fromId = byName.get(handle);
      if (!fromId) continue;                       // that handle is not in this build
      if (fromId === targetId) continue;           // already one row
      // A sheetHandles target can be an id that has since been merged away.
      // "Tim L" points at "tim-lynch", and tim-lynch was later merged into
      // timothy-lynch, so the target is correct history and a dead id at once.
      // Before the full DUPR reading landed Tim was not in the build at all and
      // this line was skipped; the moment he appeared, the build threw.
      //
      // The direct target is tried FIRST and the merge only followed when it is
      // missing. Following it unconditionally broke the eagle handle, whose
      // target "brett-ritholt" does exist here even though mergedPlayers also
      // redirects that id onward - the onward id is created later, downstream,
      // and does not exist at this point in the build. Preferring what is in
      // front of us keeps both cases right.
      let realTarget = targetId;
      if (!byId.has(realTarget)) {
        let guard = 0;
        while (merged.has(realTarget) && guard++ < 10 && !byId.has(realTarget)) {
          realTarget = merged.get(realTarget);
        }
      }
      const into = byId.get(realTarget);
      if (!into) {
        // NOT fatal, and this used to be. A sheetHandles target can legitimately
        // be created LATER in the build than this loop runs: "Eddie Rizzi" points
        // at edward-rizzi, and Edward Rizzi enters the roster further down, named
        // by Scoreholio. Throwing here blocked a build over data that was fine.
        //
        // Skipping is not the same as half-applying it - the handle row simply
        // stays separate, which is exactly where it was before the mapping
        // existed. A genuine typo in aliases.json still shows up, as a line in
        // every build's output instead of a wall, so it cannot rot unnoticed.
        sheetUnresolved.push({ handle, targetId, followedTo: realTarget !== targetId ? realTarget : null });
        continue;
      }
      const from = byId.get(fromId);
      if (!from) continue;
      into.leagues = [...new Set([...(into.leagues ?? []), ...(from.leagues ?? [])])];
      into.aliases = [...new Set([...(into.aliases ?? []), ...(from.aliases ?? []), from.name])]
        .filter((x) => x !== into.name);
      merged.set(fromId, realTarget);               // so resolve() redirects it everywhere
      sheetMerges.push({ handle, fromId, targetId: realTarget, name: into.name });
    }
    for (const m of sheetMerges) { byId.delete(m.fromId); }
    // A suggestion whose two sides are now the SAME person has been answered,
    // and leaving it on the page would ask Dave a question we already settled.
    for (let i = suggestions.length - 1; i >= 0; i--) {
      const s = suggestions[i];
      const mine = nameToId.get(s.duprName);
      if (mine && s.maybeId && resolve(mine) === resolve(s.maybeId)) suggestions.splice(i, 1);
    }
    // The same answered question also hangs off the player record itself, and
    // that copy is what the page and the verifier read. Clear it there too, or
    // a merged-away id keeps being offered as somebody's possible duplicate.
    for (const p of players) {
      if (!p.maybe) continue;
      if (resolve(p.maybe.id) === resolve(p.id)) { delete p.maybe; continue; }
      const t = resolve(p.maybe.id);
      if (t !== p.maybe.id) {
        const into = byId.get(t);
        p.maybe = { ...p.maybe, id: t, name: into?.name ?? p.maybe.name };
      }
    }
    const gone = new Set(sheetMerges.map((m) => m.fromId));
    for (let i = players.length - 1; i >= 0; i--) if (gone.has(players[i].id)) players.splice(i, 1);
    // Anything that pointed at a handle id now points at the real person.
    for (const [n, id] of nameToId) if (gone.has(id)) nameToId.set(n, resolve(id));
  }

  /* Record an id equivalence discovered AFTER this module has run.
   *
   * Some ids only come into existence downstream - Scoreholio names players
   * this roster never saw - so a merge involving one of them cannot be decided
   * here. What must not happen is the downstream stage quietly keeping its own
   * private notion of "these two ids are one man", because resolve() is the
   * single place the rest of the build asks that question. Anything that
   * answers it elsewhere is a fact the rest of the build cannot see.
   */
  const mergeLate = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return false;
    if (merged.has(fromId)) return merged.get(fromId) === toId;
    merged.set(fromId, toId);
    return true;
  };

  return { players, nameToId, added, suggestions, notAPlayer, gamesDropped,
           merged: [...merged], sheetMerges, sheetUnresolved, mergeLate, resolve };
}

if (process.argv[1]?.endsWith('duprroster.mjs')) {
  const { buildRoster } = await import('./roster.mjs');
  const { players: roster } = buildRoster();
  const r = widenRoster(roster);
  console.log(`roster before        : ${roster.length}`);
  console.log(`players added by DUPR: ${r.added.length}`);
  console.log(`roster after         : ${r.players.length}`);
  console.log(`DUPR names mapped    : ${r.nameToId.size}`);
  console.log(`not a player         : ${r.notAPlayer.map((x) => `${x.name} (${x.count})`).join(', ') || 'none'}`);
  console.log(`games dropped for it : ${r.gamesDropped}`);

  const conf = r.suggestions.filter((s) => s.confident);
  console.log(`\nNEW PLAYERS THE MATCHER THINKS MIGHT ALREADY BE IN THE ROSTER (${conf.length} confident):`);
  for (const s of conf) console.log(`  ${s.duprName.padEnd(24)} ${String(s.games).padStart(4)} games   might be ${s.maybe}   [${s.why}]`);

  console.log(`\nTOP 25 NEW PLAYERS BY VOLUME:`);
  for (const a of r.added.slice(0, 25)) console.log(`  ${String(a.games).padStart(4)}  ${a.name}`);
}
