// Deterministic generator for the Merrick in a Pickle stats DEMO.
// Real player names (from the Friday AM 9/11/26 workbook) + entirely fictional
// match results and rating history. Nothing here is official.

import { writeFileSync } from 'node:fs';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260911);
const rateRnd = mulberry32(77123);          // separate stream: ratings are NOT derived from results
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);

const MIP = 'Merrick in a Pickle';
// Names and clubs transcribed from the workbook "FRIDAY AM 18 Wk 2 9/11/26".
const ROSTER = [
  ['Jonathan Gottesmann', MIP], ['Sal Farruggia', 'LI-Kick'], ['Brendan Stephenson', MIP],
  ['Rex Bunt', MIP], ['Jay Colapinto', MIP], ['Vincent Cusumano', MIP],
  ['Frank Rossetti', MIP], ['Jason Vargas', MIP], ['David Huber', MIP],
  ['Karen Polito', MIP], ['Jeff Hersh', 'Pickle United'], ['Bill Lynch', MIP],
  ['Jeff Fein', MIP], ['Lauren Glodny', MIP], ['Jin Lei', null],
  ['Andrew Johnson', MIP], ['Tony Romano', null], ['Eran Dekel', MIP],
  ['Daniel Calhoun', MIP], ['Stephen Rizzi', MIP], ['Jaime Frand', MIP],
  ['Christie Simmons', MIP], ['Eddie Rizzi', MIP], ['Jonathan Mcmilleon', MIP],
  ['Danielle Farruggia', MIP],
];

const slug = (n) => n.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

const players = ROSTER.map(([name, club], i) => ({
  id: slug(name),
  name,
  club,
  // hidden simulation inputs (not exported)
  _skill: between(rnd, 0.22, 0.82) * 0.55 + (1 - i / ROSTER.length) * 0.45,
  _show: between(rnd, 0.55, 0.92),
  _base: Math.round(between(rateRnd, 2.85, 4.45) * 100) / 100,
  _drift: between(rateRnd, -0.035, 0.055),
}));

const SEASONS = [
  { id: 'winter-2026', label: 'Winter 2026', start: '2026-01-09', weeks: 12 },
  { id: 'spring-2026', label: 'Spring 2026', start: '2026-04-03', weeks: 12 },
  { id: 'summer-2026', label: 'Summer 2026', start: '2026-06-26', weeks: 12 },
];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

function scoreFor(pWin, r) {
  // Pickleball to 11, win by 2. Closer games when teams are evenly matched.
  const edge = Math.abs(pWin - 0.5) * 2;          // 0 = coin flip, 1 = mismatch
  const roll = r();
  if (roll < 0.10 - edge * 0.07) {                 // deuce
    const extra = Math.floor(r() * 4);
    return [13 + extra, 11 + extra];
  }
  const lo = Math.round(between(r, 2, 9) * (1 - edge * 0.55) + edge * 2);
  return [11, Math.max(0, Math.min(9, lo))];
}

const matches = [];
let gid = 0;

for (const season of SEASONS) {
  let day = new Date(season.start + 'T00:00:00Z');
  for (let w = 0; w < season.weeks; w++) {
    const date = iso(day);
    day = addDays(day, 7);

    // Who showed up this Friday morning
    let here = players.filter((p) => rnd() < p._show);
    while (here.length % 4 !== 0) here.splice(Math.floor(rnd() * here.length), 1);
    if (here.length < 8) continue;

    // Seed courts by ability with weekly jitter, so partnerships and rivalries recur
    here.sort((a, b) => (b._skill + rnd() * 0.22) - (a._skill + rnd() * 0.22));

    for (let c = 0; c < here.length; c += 4) {
      const court = here.slice(c, c + 4);
      if (court.length < 4) break;
      const combos = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];
      for (const [i, j, k, l] of combos) {
        const A = [court[i], court[j]];
        const B = [court[k], court[l]];
        const sA = (A[0]._skill + A[1]._skill) / 2;
        const sB = (B[0]._skill + B[1]._skill) / 2;
        const pWin = 1 / (1 + Math.exp(-(sA - sB) * 5.2));
        const aWins = rnd() < pWin;
        const [hi, lo] = scoreFor(aWins ? pWin : 1 - pWin, rnd);
        matches.push({
          id: 'g' + (++gid),
          date,
          season: season.id,
          a: [A[0].id, A[1].id],
          b: [B[0].id, B[1].id],
          sa: aWins ? hi : lo,
          sb: aWins ? lo : hi,
        });
      }
    }
  }
}

// Fictional rating history: an independent random walk per player.
// Deliberately NOT computed from wins and losses.
const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const ratings = {};
for (const p of players) {
  let v = p._base;
  ratings[p.id] = MONTHS.map((m, i) => {
    if (i > 0) v += p._drift * between(rateRnd, 0.3, 1.6) + between(rateRnd, -0.07, 0.07);
    v = Math.max(2.2, Math.min(5.4, v));
    return { month: m, value: Math.round(v * 100) / 100 };
  });
}

const out = {
  generated: new Date('2026-09-11T12:00:00Z').toISOString(),
  disclaimer: 'Real roster names from the Friday AM session. All match results and ratings are fictional demo data.',
  seasons: SEASONS.map((s) => ({ id: s.id, label: s.label })),
  players: players.map((p) => ({ id: p.id, name: p.name, club: p.club })),
  matches,
  ratings,
};

const js = `// GENERATED FILE - do not edit by hand. Source: build/gen.mjs
//
// Player NAMES are real, taken from the "FRIDAY AM 18 Wk 2 9/11/26" workbook.
// Every match result and every rating value below is FICTIONAL demo data,
// generated deterministically for this prototype. Ratings are produced by an
// independent random walk and are NOT derived from wins and losses, and are
// NOT official DUPR ratings.
//
// To go live, replace this file with real records in the same shape.
// Match shape: { id, date, season, a:[playerId,playerId], b:[playerId,playerId], sa, sb }

export const DATA = ${JSON.stringify(out, null, 1)};
export const { seasons, players, matches, ratings } = DATA;
`;

writeFileSync(new URL('../dist/data.js', import.meta.url), js);
console.log('players:', players.length, '| matches:', matches.length, '| seasons:', SEASONS.length);
