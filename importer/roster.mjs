import { allLeagues, readGames } from './extract.mjs';
import { createResolver } from './resolve.mjs';
import { readFileSync } from 'node:fs';

const ALIASES = JSON.parse(readFileSync(new URL('./aliases.json', import.meta.url), 'utf8'));
const slug = (n) => String(n).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const low = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Identity model, in priority order:
 *   1. The six league ranking files carry FULL REAL NAMES — canonical.
 *   2. If one league file lists the same name twice (Dave has one: two
 *      "Sal Farruggia" rows under different clubs), those are kept as SEPARATE
 *      people and disambiguated by club. Merging them would hand one player the
 *      other's record.
 *   3. The head-to-head grid carries Scoreholio DISPLAY NAMES, folded into a
 *      canonical player where unambiguous, otherwise standing alone.
 *   4. aliases.json holds human-confirmed merges. Nothing merges on a guess.
 */
export function buildRoster() {
  const leagues = allLeagues();

  // Which names collide inside a single league file?
  const perLeague = new Map();
  for (const l of leagues) for (const p of l.players) {
    const k = `${l.id}||${low(p.name)}`;
    perLeague.set(k, (perLeague.get(k) ?? 0) + 1);
  }
  const conflicted = new Set();
  for (const [k, n] of perLeague) if (n > 1) conflicted.add(k.split('||')[1]);

  const keyFor = (name, club) => (conflicted.has(low(name))
    ? `${low(name)}|${low(club) || 'unknown-club'}`
    : low(name));

  const byKey = new Map();
  const idFor = (name, club) => (conflicted.has(low(name))
    ? `${slug(name)}-${slug(club) || 'unknown-club'}`
    : slug(name));

  const add = (name, club, leagueId, source) => {
    const k = keyFor(name, club);
    if (!byKey.has(k)) {
      byKey.set(k, {
        id: idFor(name, club) || 'p' + byKey.size,     // emoji-only names still get an id
        name: String(name).trim(), club: club || null, leagues: [], aliases: [], source,
        ...(conflicted.has(low(name)) ? { nameConflict: true } : {}),
      });
    }
    const p = byKey.get(k);
    if (leagueId && !p.leagues.includes(leagueId)) p.leagues.push(leagueId);
    if (!p.club && club) p.club = club;
    return p;
  };

  for (const l of leagues) for (const p of l.players) add(p.name, p.club, l.id, 'league');

  // Exact lookup for league rows — never go through fuzzy matching for data we
  // already hold canonically (an emoji-only name has nothing to match on).
  const leagueRowId = (name, club) => byKey.get(keyFor(name, club))?.id ?? null;

  const canonical = [...byKey.values()];
  const resolver = createResolver(canonical);

  const displayToId = new Map();
  for (const raw of readGames().gridNames) {
    const name = String(raw).trim();
    if (!name || ALIASES.notAPlayer.includes(name)) continue;
    const confirmed = ALIASES.confirmed[name];
    if (confirmed) {
      const t = canonical.find((p) => p.id === confirmed);
      if (!t) throw new Error(`aliases.json maps "${name}" to unknown id "${confirmed}"`);
      if (!t.aliases.includes(name)) t.aliases.push(name);
      displayToId.set(name, t.id);
      continue;
    }
    const hit = resolver.resolve(name);
    if (hit.id) {
      const t = canonical.find((p) => p.id === hit.id);
      if (low(name) !== low(t.name) && !t.aliases.includes(name)) t.aliases.push(name);
      displayToId.set(name, t.id);
    } else {
      const p = add(name, null, null, 'display-name');
      p.displayOnly = true;
      if (hit.ambiguous) p.ambiguous = hit.candidates;
      displayToId.set(name, p.id);
    }
  }

  const players = [...byKey.values()];
  const seen = new Map();
  for (const p of players) {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    if (n > 1) p.id = `${p.id}-${n}`;
  }
  return { players, displayToId, leagueRowId, conflictedNames: [...conflicted] };
}
