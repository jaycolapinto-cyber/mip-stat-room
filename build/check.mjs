import { DATA } from '../dist/data.js';
import { perspective, summarize, partners, pairGames, partnershipEdges, standings, recent } from '../dist/stats.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log('  FAIL:', name, extra); }
};

// The real data file has no `seasons` and no per-player rating history - those
// belonged to the generated demo. Structural checks that depend on them are
// skipped rather than silently passing on `undefined`.
const { matches, players } = DATA;
const ratings = DATA.ratings ?? null;
const seasons = DATA.seasons ?? null;
const ids = players.map((p) => p.id);

// --- structural integrity -------------------------------------------------
t('every match has 4 distinct players',
  matches.every((m) => new Set([...m.a, ...m.b]).size === 4));
t('every match has 2v2', matches.every((m) => m.a.length === 2 && m.b.length === 2));
t('every player id is known', matches.every((m) => [...m.a, ...m.b].every((p) => ids.includes(p))));
t('no ties', matches.every((m) => m.sa !== m.sb));
// Not every real game ends 11-and-win-by-2: Scoreholio rounds run to a hard cap
// and to a clock, so 15-14 and 11-10 both occur in Dave's own sheets. The check
// is that a score is plausible, not that it followed the textbook rule.
t('winner outscores loser, scores are plausible', matches.every((m) => {
  const hi = Math.max(m.sa, m.sb), lo = Math.min(m.sa, m.sb);
  return hi > lo && lo >= 0 && hi <= 30;
}));
t('at least nine in ten games end 11+ and win-by-2', (() => {
  const ok = matches.filter((m) => {
    const hi = Math.max(m.sa, m.sb), lo = Math.min(m.sa, m.sb);
    return hi >= 11 && hi - lo >= 2;
  }).length;
  return ok / matches.length >= 0.9;
})());
if (seasons) t('every match belongs to a known season',
  matches.every((m) => seasons.some((s) => s.id === m.season)));
t('unique match ids', new Set(matches.map((m) => m.id)).size === matches.length);
if (ratings) {
  t('every player has rating history', ids.every((id) => (ratings[id] || []).length >= 6));
  t('ratings are in a plausible range',
    Object.values(ratings).flat().every((r) => r.value >= 2 && r.value <= 6));
}

// --- dated games ----------------------------------------------------------
const dated = matches.filter((m) => m.date);
t('every dated game has a real ISO date',
  dated.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date)));
// DUPR gives the date but never a court or a clock. Only the games a
// Scoreholio export also covers carry those, so the check is that when a time
// is present a court is too, not that every game has both.
// A court always implies a time - both come from the same export row. The
// reverse does NOT hold: Scoreholio occasionally logs a match with a timestamp
// and no court, and dropping a real game over a missing court number would be
// worse than carrying it without one.
t('a court always comes with a time', matches.every((m) => (m.court ? !!m.time : true)));
t('some games carry a court and time', matches.some((m) => m.court && m.time));
t('no dated game is in the future',
  dated.every((m) => m.date <= new Date().toISOString().slice(0, 10)));
// Two games CAN legitimately share date, court and players - the same four
// people playing twice on the same court. What must never repeat is the id,
// which is DUPR's own Match ID.
t('every match id is unique', new Set(matches.map((m) => m.id)).size === matches.length);
t('every match carries a DUPR match id', matches.every((m) => typeof m.id === 'string' && m.id.length > 3));
// Scoped to the tournament on purpose. The club runs two brackets at once and
// each numbers its courts from 1, so the same court number at the same minute
// in two DIFFERENT tournaments is two different physical courts and is fine.
// The same court twice inside ONE tournament is a genuine double-booking.
t('no two games share a court at the same minute within a tournament', (() => {
  const timed = matches.filter((m) => m.time && m.court && m.tournament);
  const keys = timed.map((m) => [m.tournament, m.date, m.time, m.court].join('|'));
  return new Set(keys).size === keys.length;
})());

// --- known-outcome checks on a hand-built fixture --------------------------
const F = [
  { id: 'x1', date: '2026-01-01', season: 's', a: ['ann', 'ben'], b: ['cat', 'dan'], sa: 11, sb: 5 },
  { id: 'x2', date: '2026-01-02', season: 's', a: ['cat', 'dan'], b: ['ann', 'ben'], sa: 11, sb: 9 }, // reversed sides
  { id: 'x3', date: '2026-01-03', season: 's', a: ['ann', 'cat'], b: ['ben', 'dan'], sa: 11, sb: 3 },
];
t('perspective: not in game -> null', perspective(F[0], 'zoe') === null);
t('perspective: team A win', (() => { const v = perspective(F[0], 'ann'); return v.won && v.partner === 'ben' && v.mine === 11 && v.theirs === 5; })());
t('perspective: reversed positions still correct', (() => {
  const v = perspective(F[1], 'ann');
  return v.won === false && v.partner === 'ben' && v.mine === 9 && v.theirs === 11;
})());
t('summarize: known record', (() => {
  const s = summarize(F, 'ann');
  return s.wins === 2 && s.losses === 1 && s.games === 3 && Math.abs(s.winPct - 2 / 3) < 1e-9;
})());
t('summarize: points for/against and diff agree', (() => {
  const s = summarize(F, 'ann');
  return s.pointsFor === 11 + 9 + 11 && s.pointsAgainst === 5 + 11 + 3 && s.diff === s.pointsFor - s.pointsAgainst;
})());
t('summarize: empty record is zeroed, no divide-by-zero', (() => {
  const s = summarize([], 'ann');
  return s.games === 0 && s.winPct === 0 && s.wins === 0;
})());
t('summarize: unknown player over real games is empty', summarize(F, 'zoe').games === 0);
t('partners: ordering is win% then games', (() => {
  const rows = partners(F, 'ann');
  return rows[0].id === 'cat' && rows[0].games === 1 && rows[1].id === 'ben' && rows[1].games === 2;
})());
t('partners: empty input', partners([], 'ann').length === 0);
t('pairGames: together', pairGames(F, 'ann', 'ben', true).map((g) => g.id).join() === 'x1,x2');
t('pairGames: opposed', pairGames(F, 'ann', 'ben', false).map((g) => g.id).join() === 'x3');
t('pairGames: symmetric', (() => {
  const A = pairGames(F, 'ann', 'cat', false).map((g) => g.id).join();
  const B = pairGames(F, 'cat', 'ann', false).map((g) => g.id).join();
  return A === B && A === 'x1,x2';
})());
t('partnershipEdges: too few eligible -> nulls', (() => {
  const e = partnershipEdges(partners(F, 'ann'), 5);
  return e.best === null && e.worst === null;
})());

// --- cross-view consistency on the real demo data -------------------------
for (const p of players) {
  const s = summarize(matches, p.id);
  const rows = partners(matches, p.id);
  const pw = rows.reduce((a, r) => a + r.wins, 0);
  const pl = rows.reduce((a, r) => a + r.losses, 0);
  t(`${p.id}: partner totals equal overall record`, pw === s.wins && pl === s.losses, `${pw}-${pl} vs ${s.wins}-${s.losses}`);
  t(`${p.id}: games = wins + losses`, s.games === s.wins + s.losses);
  t(`${p.id}: recent() returns every game`, recent(matches, p.id).length === s.games);
  // Dated games come first, newest to oldest; undated games follow, in their
  // original event order. An undated game must never appear above a dated one.
  t(`${p.id}: recent() is newest-first`, (() => {
    const r = recent(matches, p.id);
    const firstUndated = r.findIndex((g) => !g.date);
    if (firstUndated !== -1 && r.slice(firstUndated).some((g) => g.date)) return false;
    const d = r.filter((g) => g.date);
    return d.every((g, i) => i === 0 || d[i - 1].date >= g.date);
  })());
}

// season filtering must partition the record exactly
if (seasons) for (const p of players.slice(0, 6)) {
  const whole = summarize(matches, p.id);
  const parts = seasons.map((s) => summarize(matches.filter((m) => m.season === s.id), p.id));
  t(`${p.id}: season splits sum to the total`,
    parts.reduce((a, x) => a + x.games, 0) === whole.games &&
    parts.reduce((a, x) => a + x.wins, 0) === whole.wins);
}

// Event batches must partition the record exactly - the real-data equivalent of
// the season split, since every match belongs to exactly one batch.
const events = [...new Set(matches.map((m) => m.event))];
for (const p of players.slice(0, 12)) {
  const whole = summarize(matches, p.id);
  const parts = events.map((e) => summarize(matches.filter((m) => m.event === e), p.id));
  t(`${p.id}: event splits sum to the total`,
    parts.reduce((a, x) => a + x.games, 0) === whole.games &&
    parts.reduce((a, x) => a + x.wins, 0) === whole.wins);
}

// head-to-head must be symmetric and complete
const [A, B] = [players[0].id, players[4].id];
const h = pairGames(matches, A, B, false);
t('head-to-head symmetric on real data',
  h.length === pairGames(matches, B, A, false).length);
t('head-to-head wins split exactly', (() => {
  const aw = h.filter((g) => perspective(g, A).won).length;
  const bw = h.filter((g) => perspective(g, B).won).length;
  return aw + bw === h.length;
})());

// league-wide: total wins must equal total losses must equal total matches
const st = standings(matches, players);
t('league wins equal league losses',
  st.reduce((a, r) => a + r.wins, 0) === st.reduce((a, r) => a + r.losses, 0));
t('league wins equal 2x matches (two winners per game)',
  st.reduce((a, r) => a + r.wins, 0) === matches.length * 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
