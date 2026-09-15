// Matches the DUPR club roster to our players. Exact name first, then the same
// surname-evidence matcher used for nicknames. Never a first-name-only guess.
import { readFileSync, readdirSync } from 'node:fs';
import { suggestFor } from './suggest.mjs';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const DIR = new URL('./live/dupr/', import.meta.url);

/**
 * Every club reading we hold, oldest first.
 *
 * DUPR publishes a member's CURRENT rating and nothing else - there is no
 * history endpoint and no archive. So a rating we did not write down is gone
 * the moment it changes. Each file here is one dated reading, and the history
 * on the site is simply the readings we took, never an interpolation between
 * them.
 */
export function loadSnapshots(dir = DIR) {
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.tsv$/.test(f))
    .sort();
  if (!files.length) throw new Error(`no DUPR snapshots in ${dir}`);
  return files.map((f) => ({
    date: f.slice(0, 10),
    rows: readFileSync(new URL(f, dir), 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => {
        // Columns three and four (DUPR's own player id, and matches played) are
        // newer than the first files here, so they are optional. The id is the
        // one worth having: two accounts can carry the same name, and only the
        // id tells them apart.
        const [name, rating, duprId, played] = l.split('\t');
        const r = Number(rating);
        if (!name || !Number.isFinite(r)) throw new Error(`${f}: cannot read row "${l}"`);
        if (r < 1 || r > 8) throw new Error(`${f}: rating ${r} for ${name} is outside any real DUPR range`);
        const row = { name: name.trim(), rating: r };
        if (duprId && String(duprId).trim()) row.duprId = String(duprId).trim();
        if (played != null && String(played).trim() !== '' && Number.isFinite(Number(played))) {
          row.played = Number(played);
        }
        return row;
      }),
  }));
}

/** The most recent reading, for callers that only want today's number. */
export function loadDupr() {
  const s = loadSnapshots();
  return s[s.length - 1].rows;
}

/**
 * -> Map(playerId -> { rating, duprName, asOf, history: [{date, rating}] })
 *
 * Name matching runs once against the newest snapshot and the resulting DUPR
 * name is then used to read every older snapshot. Re-matching per snapshot
 * would let a player's identity drift between dates.
 */
export function matchDupr(players, dir = DIR) {
  const pool = players.filter((p) => !p.displayOnly);
  const byNorm = new Map(pool.map((p) => [norm(p.name), p]));

  // Human-confirmed DUPR spellings win outright. Two names in Dave's league
  // files are identical ("Sal Farruggia" appears twice under different clubs),
  // so an exact-name match would silently pick whichever row came first and
  // hand one man the other's rating.
  const confirmed = new Map();
  try {
    const raw = JSON.parse(readFileSync(new URL('./aliases.json', import.meta.url), 'utf8')).duprNames ?? {};
    for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) confirmed.set(norm(k), v);
  } catch { /* no alias file - fall through to name matching */ }
  const snaps = loadSnapshots(dir);
  const latest = snaps[snaps.length - 1];

  const out = new Map();
  const chosen = new Map();                    // playerId -> the latest-reading row it matched
  const exact = [], fuzzy = [], unmatched = [], collisions = [];

  for (const d of latest.rows) {
    let p = confirmed.has(norm(d.name)) ? pool.find((x) => x.id === confirmed.get(norm(d.name))) : null;
    let how = p ? 'confirmed in aliases.json' : 'exact name';
    if (!p) p = byNorm.get(norm(d.name));
    if (!p) {
      const top = suggestFor(d.name, pool)[0];
      if (top?.confident) { p = pool.find((x) => x.id === top.id); how = top.why; }
    }
    if (!p) { unmatched.push(d.name); continue; }
    if (out.has(p.id)) { collisions.push(`${d.name} and ${out.get(p.id).duprName} both map to ${p.name}`); continue; }
    out.set(p.id, { rating: d.rating, duprName: d.name, duprId: d.duprId ?? null,
                    asOf: latest.date, history: [] });
    chosen.set(p.id, d);                       // the exact row this player won
    (how === 'exact name' ? exact : fuzzy).push(`${d.name} -> ${p.name}${how === 'exact name' ? '' : '  [' + how + ']'}`);
  }

  // Walk every reading, oldest first, using the identity settled above.
  //
  // A NAME IS NOT AN IDENTITY INSIDE A READING EITHER. "Sal Farruggia" and "Sal
  // farruggia" are two DUPR accounts, 4.653 and 3.354, and they both appear in
  // the 2026-09-15 reading. Keying this walk by name put the second man's 3.354
  // on the first man's chart as a 1.3-point collapse, and nothing about the
  // output looked wrong - it was a real number on a real date.
  //
  // So: match by DUPR's own player id wherever both sides have one, and where
  // they do not, refuse any name that the reading itself carries more than
  // once. A skipped reading leaves a gap in a chart; a wrong one tells a player
  // their rating fell off a cliff.
  const ambiguousReadings = [];
  for (const s of snaps) {
    const byId = new Map();
    const byName = new Map(), dupName = new Set();
    for (const r of s.rows) {
      if (r.duprId) byId.set(r.duprId, r);
      const k = norm(r.name);
      if (byName.has(k)) dupName.add(k); else byName.set(k, r);
    }
    for (const k of dupName) {
      byName.delete(k);
      ambiguousReadings.push(`${s.date}: "${k}" names ${s.rows.filter((r) => norm(r.name) === k).length} accounts`);
    }
    for (const [id, v] of out) {
      // The newest reading is not looked up again. The matching loop above
      // already decided which of its rows is this player - by a confirmed
      // alias, a name, or surname evidence - and re-deriving it here could
      // disagree with itself, which would leave the player's current rating
      // missing from the end of their own history.
      const hit = s === latest
        ? chosen.get(id)
        : (v.duprId && byId.get(v.duprId)) || byName.get(norm(v.duprName)) || null;
      if (hit) v.history.push({ date: s.date, rating: hit.rating });
    }
  }

  return { ratings: out, exact, fuzzy, unmatched, collisions,
           ambiguousReadings: [...new Set(ambiguousReadings)],
           snapshots: snaps.map((s) => s.date) };
}

if (process.argv[1]?.endsWith('dupr.mjs')) {
  const { buildRoster } = await import('./roster.mjs');
  const { players } = buildRoster();
  const r = matchDupr(players);
  console.log(`snapshots: ${r.snapshots.join(', ')}`);
  console.log(`DUPR members in newest reading: ${loadDupr().length}`);
  console.log(`matched: ${r.ratings.size}  (exact ${r.exact.length}, by surname evidence ${r.fuzzy.length})`);
  console.log(`\nMATCHED BY EVIDENCE (${r.fuzzy.length}):`);
  r.fuzzy.forEach((x) => console.log('  ' + x));
  console.log(`\nCOLLISIONS (${r.collisions.length}):`);
  r.collisions.forEach((x) => console.log('  ' + x));
  console.log(`\nDUPR members with no player in our data (${r.unmatched.length}) - mostly other leagues/clubs`);
}
