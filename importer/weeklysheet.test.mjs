// Tests for the weekly-sheet fingerprint match and the merge it produces.
//
// Dave's weekly master sheet lists some players by a handle - "Ronnie D",
// "J.Z.", a bare eagle emoji. His sheet and our DUPR match record cover the
// same week, so each player's wins/losses/games/points-for/points-against over
// that window is a five-number fingerprint, and matching fingerprints names the
// handle.
//
// The danger is obvious: a wrong match silently hands one player another's
// record. So the test that matters most here is not that the method finds
// answers - it is that it REFUSES when the evidence is thin, and that it
// identifies the right person when run against people we already know.
import { weekRecords, fingerprint, matchHandles } from './weeklysheet.mjs';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const M = (date, a, b, sa, sb) => ({ date, a, b, sa, sb });

/* ------------------------------------------------------------ week records */
{
  const matches = [
    M('2026-09-08', ['ann', 'bob'], ['cat', 'dan'], 11, 6),
    M('2026-09-10', ['ann', 'cat'], ['bob', 'dan'], 9, 11),
    M('2026-09-20', ['ann', 'bob'], ['cat', 'dan'], 11, 0),   // outside the window
  ];
  const rec = weekRecords(matches, '2026-09-06', '2026-09-12');
  t('only games inside the window count', rec.get('ann').games === 2, JSON.stringify(rec.get('ann')));
  t('wins and losses land on the right side', rec.get('ann').wins === 1 && rec.get('ann').losses === 1);
  t('points for follow the player, not the row', rec.get('ann').pf === 20, String(rec.get('ann').pf));
  t('points against follow the player', rec.get('ann').pa === 17, String(rec.get('ann').pa));
  t('a partner on the winning side also wins', rec.get('bob').wins === 2);
  t('the window is inclusive of its last day',
    weekRecords([M('2026-09-12', ['x','y'], ['z','w'], 11, 2)], '2026-09-06', '2026-09-12').has('x'));
}

/* -------------------------------------------------------------- the match */
const ROWS = [
  { id: 'ronnie-d', wins: 1, losses: 1, games: 2, pf: 20, pa: 17 },   // == ann
  { id: 'known',    wins: 2, losses: 0, games: 2, pf: 22, pa: 17 },   // == bob
];
const MATCHES = [
  M('2026-09-08', ['ann', 'bob'], ['cat', 'dan'], 11, 6),
  M('2026-09-10', ['ann', 'cat'], ['bob', 'dan'], 9, 11),
];

{
  const r = matchHandles(ROWS, MATCHES, '2026-09-06', '2026-09-12', new Set(['known']));
  const hit = r.matched.find((m) => m.rowId === 'ronnie-d');
  t('a handle with one fingerprint match is named', hit && hit.playerId === 'ann', JSON.stringify(hit));
  t('a row already known is left alone', !r.matched.some((m) => m.rowId === 'known'));
  t('nothing is reported ambiguous here', r.ambiguous.length === 0);
}

/* ------------------------------------------------- it refuses when unsure */
{
  // Two players with identical fingerprints. The handle could be either, so it
  // must name neither.
  const matches = [
    M('2026-09-08', ['ann', 'bob'], ['cat', 'dan'], 11, 6),
    M('2026-09-08', ['eve', 'fay'], ['gil', 'hal'], 11, 6),
  ];
  const rows = [{ id: 'mystery', wins: 1, losses: 0, games: 1, pf: 11, pa: 6 }];
  const r = matchHandles(rows, matches, '2026-09-06', '2026-09-12', new Set());
  t('a tied fingerprint names nobody', r.matched.length === 0, JSON.stringify(r.matched));
  t('a tied fingerprint is reported as ambiguous', r.ambiguous.length === 1);
  t('the ambiguous report lists every candidate', r.ambiguous[0].candidates.length === 4,
    JSON.stringify(r.ambiguous[0].candidates));
}
{
  const rows = [{ id: 'ghost', wins: 9, losses: 9, games: 18, pf: 1, pa: 1 }];
  const r = matchHandles(rows, MATCHES, '2026-09-06', '2026-09-12', new Set());
  t('a row matching nobody is not forced onto someone', r.matched.length === 0);
  t('a row matching nobody is reported unmatched', r.unmatched.length === 1 && r.unmatched[0].rowId === 'ghost');
}
{
  // One number off is not a match. The fingerprint is all five or nothing.
  const rows = [{ id: 'nearly', wins: 1, losses: 1, games: 2, pf: 20, pa: 18 }];
  const r = matchHandles(rows, MATCHES, '2026-09-06', '2026-09-12', new Set());
  t('a near miss on one number is not a match', r.matched.length === 0, JSON.stringify(r.matched));
}

/* ------------------------------------------------------------ fingerprint */
t('the fingerprint uses all five numbers',
  fingerprint({ wins: 1, losses: 2, games: 3, pf: 4, pa: 5 }) !== fingerprint({ wins: 1, losses: 2, games: 3, pf: 4, pa: 6 }));
t('the fingerprint reads a standings row and a computed record the same way',
  fingerprint({ wins: 1, losses: 1, games: 2, pf: 20, pa: 17 })
  === fingerprint({ wins: 1, losses: 1, games: 2, pf: 20, pa: 17 }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
