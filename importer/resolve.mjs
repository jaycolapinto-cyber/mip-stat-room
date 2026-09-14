// Resolves the abbreviated names in a Scoreholio export ("Mike B.", "M Spezio",
// "Ronnie D") back to real roster players.
//
// Guiding rule: NEVER guess. If a name could be two people, it is reported as
// ambiguous and the import stops. A wrong match silently corrupts every stat
// downstream, and nobody would catch it.

const strip = (s) => String(s ?? '')
  .replace(/’/g, "'")
  .toLowerCase()
  .replace(/[.,]/g, ' ')
  .replace(/[^a-z' -]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** "Jonathan Gottesmann" -> { first:'jonathan', last:'gottesmann', fi:'j', li:'g' } */
function parts(name) {
  const bits = strip(name).split(' ').filter(Boolean);
  if (!bits.length) return null;
  const first = bits[0];
  const last = bits.length > 1 ? bits[bits.length - 1] : '';
  return { first, last, fi: first[0] ?? '', li: last[0] ?? '', full: bits.join(' ') };
}

/**
 * Build a resolver over a roster.
 * roster: [{ id, name, aliases?: string[] }]
 */
export function createResolver(roster) {
  // A roster name with no usable letters (emoji-only handles, stray numbers)
  // can't be matched on, so it is kept out of the matching strategies.
  const players = roster.map((p) => ({ ...p, p: parts(p.name) })).filter((p) => p.p);

  // Explicit aliases win outright — they are the human override.
  const explicit = new Map();
  for (const p of players) {
    for (const a of p.aliases ?? []) {
      const k = strip(a);
      if (explicit.has(k) && explicit.get(k) !== p.id) {
        throw new Error(`Alias "${a}" is claimed by two players: ${explicit.get(k)} and ${p.id}`);
      }
      explicit.set(k, p.id);
    }
  }

  // Each strategy returns the candidate players it considers possible.
  const strategies = [
    // exact full name
    { why: 'full name', match: (q) => players.filter((p) => p.p.full === q.full) },
    // "Mike B." / "Mike B"  -> first name + last initial
    { why: 'first name + last initial', match: (q) => (q.last.length === 1
        ? players.filter((p) => p.p.first === q.first && p.p.li === q.last) : []) },
    // "M Spezio" -> first initial + last name
    { why: 'first initial + last name', match: (q) => (q.first.length === 1
        ? players.filter((p) => p.p.fi === q.first && p.p.last === q.last) : []) },
    // "Ronnie D" handled by the two above; bare single token is last resort
    { why: 'first name only', match: (q) => (!q.last
        ? players.filter((p) => p.p.first === q.first) : []) },
    { why: 'last name only', match: (q) => (!q.last
        ? players.filter((p) => p.p.last === q.first) : []) },
  ];

  /** -> { id } | { unknown: raw } | { ambiguous: raw, candidates: [names] } */
  function resolve(raw) {
    const key = strip(raw);
    if (!key) return { unknown: String(raw ?? '') };
    if (explicit.has(key)) return { id: explicit.get(key), why: 'alias' };

    const q = parts(raw);
    for (const s of strategies) {
      const hits = s.match(q);
      if (hits.length === 1) return { id: hits[0].id, why: s.why };
      if (hits.length > 1) {
        return { ambiguous: String(raw), candidates: hits.map((h) => h.name), why: s.why };
      }
    }
    return { unknown: String(raw) };
  }

  /** Splits "Noah H. & Mike B." into resolved players. */
  function resolveTeam(cell) {
    const names = String(cell ?? '').split(/\s*(?:&|\+|\/|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
    return { names, results: names.map(resolve) };
  }

  return { resolve, resolveTeam, players };
}
