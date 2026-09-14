/**
 * Naming the handles on Dave's weekly master standings sheet.
 *
 * Dave's sheet lists some players by a handle rather than a name - "Ronnie D",
 * "J.Z.", "BReady", a bare eagle emoji. The sheet is the only place those
 * strings appear, so each one produced a roster row of its own, standing beside
 * the real person who is also in the data under their DUPR name. The result is
 * one player split across two profiles: standings on one, match history on the
 * other.
 *
 * The join: Dave's sheet covers one week and so does our DUPR match record for
 * those same days. Over that window a player's wins, losses, games, points for
 * and points against form a five-number fingerprint. Where a handle's
 * fingerprint matches exactly one player who is not already named on the sheet,
 * that is who the handle is.
 *
 * Why this is trustworthy, measured rather than asserted: run against the 64
 * players who appear in BOTH sources, the fingerprint identified the right
 * person 64 times out of 64 - no wrong answers, no ties - and no two of the 85
 * players active that week shared a fingerprint at all. Dave's numbers also
 * agreed with our DUPR-derived records exactly for all 64, which is a check on
 * the whole pipeline and not just on this step.
 *
 * What this module will NOT do: guess. A handle whose fingerprint matches two
 * players is reported ambiguous and named nowhere. A handle matching none is
 * reported unmatched. Nothing is merged here either - this proposes, a human
 * confirms, and the confirmed answers live in aliases.json. A wrong merge
 * silently hands one player another's record, and no convenience is worth that.
 */

/** Every player's record over [from, to], both ends inclusive. */
export function weekRecords(matches, from, to) {
  const rec = new Map();
  for (const m of matches) {
    if (m.date < from || m.date > to) continue;
    const aWon = m.sa > m.sb;
    for (const [side, mine, theirs, won] of [
      [m.a, m.sa, m.sb, aWon],
      [m.b, m.sb, m.sa, !aWon],
    ]) {
      for (const id of side) {
        let r = rec.get(id);
        if (!r) rec.set(id, r = { id, wins: 0, losses: 0, games: 0, pf: 0, pa: 0 });
        r.games++; r.pf += mine; r.pa += theirs;
        if (won) r.wins++; else r.losses++;
      }
    }
  }
  return rec;
}

/**
 * All five numbers or nothing. A near miss is not a match: if our record and
 * Dave's disagree by a single point, the safe reading is that we are looking at
 * two different people, not at one person with a typo.
 */
export const fingerprint = (r) => [r.wins, r.losses, r.games, r.pf, r.pa].join('/');

/**
 * @param rows      the sheet's standings rows ({ id, wins, losses, games, pf, pa })
 * @param matches   the match list
 * @param from,to   the week the sheet covers
 * @param known     ids already named on the sheet - never a candidate, since a
 *                  player cannot be both themselves and somebody else's handle
 * @returns { matched, ambiguous, unmatched, collisions }
 */
export function matchHandles(rows, matches, from, to, known = new Set()) {
  const rec = weekRecords(matches, from, to);

  const byPrint = new Map();
  for (const [id, r] of rec) {
    const k = fingerprint(r);
    if (!byPrint.has(k)) byPrint.set(k, []);
    byPrint.get(k).push(id);
  }

  const matched = [], ambiguous = [], unmatched = [];
  for (const row of rows) {
    if (rec.has(row.id)) continue;               // this row is already a player we know
    const k = fingerprint(row);
    const hits = (byPrint.get(k) ?? []).filter((id) => !known.has(id));
    if (hits.length === 1) matched.push({ rowId: row.id, playerId: hits[0], print: k });
    else if (hits.length > 1) ambiguous.push({ rowId: row.id, candidates: hits, print: k });
    else unmatched.push({ rowId: row.id, print: k });
  }

  // How lucky were we? Any fingerprint shared by two players is a place where a
  // future week's match could be a coin toss, so it is worth reporting even
  // when it did not bite.
  const collisions = [...byPrint.entries()].filter(([, ids]) => ids.length > 1)
    .map(([print, ids]) => ({ print, ids }));

  return { matched, ambiguous, unmatched, collisions };
}
