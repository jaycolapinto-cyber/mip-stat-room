// Turns the DUPR club Rankings list, as read off the page, into snapshot rows
// and decides whether the reading is whole enough to keep.
//
// Pure functions so they can be tested against a saved copy of the page
// without touching DUPR. The page side (pull-dupr.mjs) hands over, per player
// link, the texts of the row's smallest elements IN ORDER - kept separate
// because in plain text the reliability badge and the rating run together
// (an 80 badge beside 4.690 reads "804.690").

/**
 * Runs IN THE PAGE (page.evaluate): per player link, the row's smallest
 * elements' texts in order. The row is the largest ancestor that still holds
 * only that one player link. Self-contained on purpose - it is serialised
 * into the browser.
 */
export function extractItems() {
  const links = [...document.querySelectorAll('a[href*="/player/"]')];
  return links.map((a) => {
    let row = a;
    while (row.parentElement && row.parentElement.querySelectorAll('a[href*="/player/"]').length === 1) row = row.parentElement;
    const leaves = [...row.querySelectorAll('*')]
      .filter((el) => !el.children.length)
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    return { href: a.getAttribute('href'), name: a.textContent.trim(), leaves };
  });
}

/** Runs IN THE PAGE: the smallest element holding every player row (for fixtures). */
export function listHtml() {
  const links = [...document.querySelectorAll('a[href*="/player/"]')];
  let box = links[0];
  while (box && !links.every((a) => box.contains(a))) box = box.parentElement;
  return box ? box.outerHTML : '';
}

const RATING = /^(NR|\d\.\d{1,3})$/;
const INT = /^\d{1,4}$/;

/**
 * @param items [{ href, name, leaves: [string] }] one per player link
 * @returns { rows: [{rank, name, duprId, matches, rating}], problems: [string] }
 */
export function rowsFromLeaves(items) {
  const rows = [], problems = [], seen = new Map();
  for (const it of items) {
    const id = /\/player\/(\d+)/.exec(it.href || '')?.[1];
    const name = String(it.name || '').trim().replace(/\s+/g, ' ');
    if (!id || !name) continue;
    const leaves = (it.leaves || []).map((s) => String(s).trim()).filter(Boolean);
    const at = leaves.findIndex((s) => s.replace(/\s+/g, ' ') === name);
    const before = at < 0 ? [] : leaves.slice(0, at);
    const after = at < 0 ? leaves : leaves.slice(at + 1);
    const rank = [...before].reverse().find((s) => INT.test(s));
    const ratingText = after.find((s) => RATING.test(s));
    const badge = after.find((s) => INT.test(s));
    if (!ratingText) { problems.push(`${name}: no rating found in its row`); continue; }
    const rating = ratingText === 'NR' ? null : Number(ratingText);
    if (rating !== null && (rating < 1 || rating > 8)) { problems.push(`${name}: rating ${rating} is outside any real DUPR range`); continue; }
    if (seen.has(id)) {
      if (seen.get(id) !== name) problems.push(`player id ${id} appears as both "${seen.get(id)}" and "${name}"`);
      continue;
    }
    seen.set(id, name);
    rows.push({ rank: rank ? Number(rank) : rows.length + 1, name, duprId: id, matches: badge ? Number(badge) : '', rating });
  }
  return { rows, problems };
}

/**
 * The checks from the build plan. A short reading is worse than none: a
 * capture that stopped early drops the lower half of the club and the chart
 * would show those players vanishing.
 */
export function judge(rows, { min = 300 } = {}) {
  const fails = [];
  const rated = rows.filter((r) => r.rating !== null);
  if (rows.length < min) fails.push(`only ${rows.length} players read (expected 350-400)`);
  if (new Set(rows.map((r) => r.duprId)).size !== rows.length) fails.push('row count does not equal unique player ids');
  for (let i = 1; i < rated.length; i++) {
    if (rated[i].rating > rated[i - 1].rating) { fails.push(`ratings not in descending order at ${rated[i].name}`); break; }
  }
  const floor = rated.length ? Math.min(...rated.map((r) => r.rating)) : null;
  if (floor === null || floor >= 3.0) fails.push(`lowest rating is ${floor}, not under 3.0 - the list stopped short`);
  return { ok: fails.length === 0, fails, floor };
}
