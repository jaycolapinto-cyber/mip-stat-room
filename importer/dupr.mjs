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
        const [name, rating] = l.split('\t');
        const r = Number(rating);
        if (!name || !Number.isFinite(r)) throw new Error(`${f}: cannot read row "${l}"`);
        if (r < 1 || r > 8) throw new Error(`${f}: rating ${r} for ${name} is outside any real DUPR range`);
        return { name: name.trim(), rating: r };
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
    out.set(p.id, { rating: d.rating, duprName: d.name, asOf: latest.date, history: [] });
    (how === 'exact name' ? exact : fuzzy).push(`${d.name} -> ${p.name}${how === 'exact name' ? '' : '  [' + how + ']'}`);
  }

  // Walk every reading, oldest first, using the DUPR name settled above.
  for (const s of snaps) {
    const byName = new Map(s.rows.map((r) => [norm(r.name), r.rating]));
    for (const v of out.values()) {
      const r = byName.get(norm(v.duprName));
      if (r !== undefined) v.history.push({ date: s.date, rating: r });
    }
  }

  return { ratings: out, exact, fuzzy, unmatched, collisions, snapshots: snaps.map((s) => s.date) };
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
