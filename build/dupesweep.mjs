// A full sweep for one person recorded under two identities.
//
// build/dupecheck.mjs runs on every build and reports only the certainties -
// pairs whose GAMES prove the case. This is the wider net: it also raises pairs
// on name shape and on the shape of their careers, gathers the evidence for
// each, and hands the judgement to a human. It merges nothing.
//
// THREE WAYS A DUPLICATE SHOWS UP IN THIS DATA
//
// 1. TWIN GAMES - the same date, the same score, three of the four players
//    identical, and only the fourth seat differing. One game cannot be played
//    twice like that, so the two occupants of that seat are one person written
//    down twice. This is proof, and it needs no help from the names: it caught
//    "Vinz Viz" = Vincent Vizcarra, and it saw through "Peter DeLucia" vs
//    "Peter DeLucia Jr", which reads exactly like a father and a son.
//
// 2. CONSECUTIVE CAREERS - no shared game, no shared date, no overlap at all,
//    one record stopping and the other starting. That is what a renamed account
//    leaves behind. It is NOT proof: two different people who played in
//    different years leave the same trace. Jeff Fein is this shape.
//
// 3. NAME SHAPE - Tim/Timothy, Chris/Christopher, a bare first name against a
//    full one. Weakest of the three on its own and never sufficient, but it is
//    how a human notices, so it earns a pair its place on the list.
//
// THE DISQUALIFIER, which outranks all three: if two identities have ever been
// on court together, they are two people. Nothing else matters after that.
import { matches, players } from '../dist/data.js';
import { writeFileSync } from 'node:fs';

const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;
const games = new Map();
for (const m of matches) for (const id of [...m.a, ...m.b]) games.set(id, (games.get(id) ?? 0) + 1);
const active = [...games.keys()];

/* ------------------------------------------------------- the disqualifier */
const shareCourt = new Set();
for (const m of matches) {
  const four = [...m.a, ...m.b];
  for (let i = 0; i < four.length; i++)
    for (let j = i + 1; j < four.length; j++)
      shareCourt.add([four[i], four[j]].sort().join('|'));
}

/* --------------------------------------------------------- 1. twin games */
const slots = new Map();
for (const m of matches) {
  const four = [...m.a, ...m.b];
  if (four.length !== 4) continue;
  const score = [m.sa, m.sb].sort((x, y) => x - y).join('-');
  for (const who of four) {
    const k = `${m.date}|${score}|${four.filter((x) => x !== who).sort().join(',')}`;
    if (!slots.has(k)) slots.set(k, new Set());
    slots.get(k).add(who);
  }
}
const twins = new Map();
for (const occ of slots.values()) {
  if (occ.size < 2) continue;
  const l = [...occ].sort();
  for (let i = 0; i < l.length; i++)
    for (let j = i + 1; j < l.length; j++) {
      const k = l[i] + '|' + l[j];
      twins.set(k, (twins.get(k) ?? 0) + 1);
    }
}

/* -------------------------------------------------------- 2. name shape */
// Deliberately generous. A candidate costs a row in a spreadsheet; a duplicate
// nobody raised costs a player seeing their own name twice on a live site.
const NICK = {
  tim: 'timothy', tom: 'thomas', tommy: 'thomas', chris: 'christopher', mike: 'michael',
  mikey: 'michael', bill: 'william', billy: 'william', bob: 'robert', bobby: 'robert',
  rob: 'robert', dan: 'daniel', danny: 'daniel', dave: 'david', davey: 'david',
  jim: 'james', jimmy: 'james', joe: 'joseph', joey: 'joseph', jeff: 'jeffrey',
  ken: 'kenneth', kenny: 'kenneth', matt: 'matthew', nick: 'nicholas', pete: 'peter',
  rick: 'richard', rich: 'richard', dick: 'richard', ron: 'ronald', ronnie: 'ronald',
  steve: 'steven', stevie: 'steven', ted: 'edward', ed: 'edward', eddie: 'edward',
  tony: 'anthony', vin: 'vincent', vinny: 'vincent', vince: 'vincent', al: 'albert',
  alex: 'alexander', andy: 'andrew', ben: 'benjamin', charlie: 'charles',
  greg: 'gregory', jon: 'jonathan', johnny: 'john', larry: 'lawrence', pat: 'patrick',
  sam: 'samuel', sal: 'salvatore', gabe: 'gabriel', nate: 'nathan', zach: 'zachary',
  liz: 'elizabeth', beth: 'elizabeth', kate: 'katherine', katie: 'katherine',
  maggie: 'margaret', peggy: 'margaret', sue: 'susan', suzy: 'susan', jen: 'jennifer',
  jenny: 'jennifer', becky: 'rebecca', cathy: 'catherine', kathy: 'katherine',
  debbie: 'deborah', ali: 'alison', abby: 'abigail', rudy: 'rudolf', rudolph: 'rudolf',
};
const root = (w) => NICK[w] ?? w;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter(Boolean);

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Why the names look related, or '' when they do not. */
function nameSignal(a, b) {
  const A = toks(a), B = toks(b);
  if (!A.length || !B.length) return '';
  const an = norm(a), bn = norm(b);
  if (an === bn) return 'identical names';

  const aLast = A[A.length - 1], bLast = B[B.length - 1];
  const aFirst = root(A[0]), bFirst = root(B[0]);

  // Same surname, and first names that are the same name or a short form of it.
  if (A.length > 1 && B.length > 1 && aLast === bLast) {
    if (aFirst === bFirst) return 'same surname, same first name';
    if (A[0].startsWith(B[0]) || B[0].startsWith(A[0])) return 'same surname, first name shortened';
    if (editDistance(aFirst, bFirst) <= 2) return 'same surname, first names nearly match';
    return 'same surname, different first name';
  }
  // Same first name and one of them carries no surname at all.
  if ((A.length === 1) !== (B.length === 1) && aFirst === bFirst) return 'first name only vs full name';
  // One name is contained in the other ("Mark Lazo" / "Mark Anthony Lazo").
  if (an.includes(bn) || bn.includes(an)) return 'one name contains the other';
  // Same surname where one side has extra middle names.
  if (A.includes(bLast) || B.includes(aLast)) {
    if (aFirst === bFirst) return 'same first and last, extra middle name';
  }
  // Whole-string near miss ("Dieu Cai-Hsiu" / "Dieu Cal Hsiu").
  const d = editDistance(an, bn);
  if (d <= 2 && Math.max(an.length, bn.length) >= 8) return `spelling differs by ${d}`;
  // Initials against a full name ("J. Fein").
  if (A.length > 1 && B.length > 1 && aLast === bLast
      && (A[0].length === 1 || B[0].length === 1) && A[0][0] === B[0][0]) return 'initial vs first name';
  return '';
}

/* --------------------------------------------- per-player facts, computed once */
const facts = new Map();
for (const id of active) {
  const mine = matches.filter((m) => m.a.includes(id) || m.b.includes(id));
  const dates = [...new Set(mine.map((m) => m.date))].sort();
  const met = new Set();
  for (const m of mine) for (const o of [...m.a, ...m.b]) if (o !== id) met.add(o);
  facts.set(id, {
    id, games: mine.length, dates: new Set(dates), first: dates[0], last: dates[dates.length - 1],
    tours: new Set(mine.map((m) => m.tournament).filter(Boolean)), met,
  });
}

// How much two circles overlap, AND how much of that is just arithmetic.
//
// The raw share is worthless on its own and the first version of this sweep
// was fooled by it. Edward Rizzi has played 400-odd of the club's 537 people,
// so ANY twenty-contact player will show ~75% of their circle inside his,
// purely by chance. That produced gems like "Skyler Shulman might be Mikel
// Strauch". What matters is the share against what chance alone would give:
// expected is simply how much of the club the bigger player has already met.
// `lift` of 1.0 is exactly what you would predict from nothing at all.
const overlapPct = (a, b) => {
  const A = facts.get(a).met, B = facts.get(b).met;
  const small = A.size <= B.size ? A : B;
  const big = A.size <= B.size ? B : A;
  if (!small.size) return 0;
  return [...small].filter((x) => big.has(x)).length / small.size;
};
const overlapLift = (a, b) => {
  const A = facts.get(a).met, B = facts.get(b).met;
  const big = A.size <= B.size ? B : A;
  const expected = big.size / Math.max(1, active.length - 1);
  if (!expected) return 0;
  return overlapPct(a, b) / expected;
};

/* ------------------------------------------------------ candidate pairs */
const candidates = new Map();
const add = (a, b, why) => {
  const k = [a, b].sort().join('|');
  if (!candidates.has(k)) candidates.set(k, new Set());
  candidates.get(k).add(why);
};

for (const [k, n] of twins) if (n >= 1) add(...k.split('|'), 'twin games');

for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if (nameSignal(nameOf(a), nameOf(b))) add(a, b, 'name shape');
  }
}

// The consecutive-careers shape, for a renamed account whose new name gives
// nothing away - the case neither the games nor the spelling would catch.
//
// The net here is deliberately tight. A first attempt asked only for
// non-overlapping dates and an 85% shared circle, and raised 1,424 pairs:
// in a club where most people have met most people, "played in different
// years" describes half the roster, and a player with six contacts hits 100%
// overlap by accident. A list nobody can read is the same as no list. So both
// circles must be big enough for the figure to mean something, and the overlap
// must be near total.
const MIN_CIRCLE = 15;          // contacts, before an overlap figure means much
const MIN_GAMES  = 20;
const NEAR_TOTAL = 0.92;
for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    const A = facts.get(a), B = facts.get(b);
    if (A.games < MIN_GAMES || B.games < MIN_GAMES) continue;
    if (Math.min(A.met.size, B.met.size) < MIN_CIRCLE) continue;
    let overlap = false;
    for (const d of (A.dates.size < B.dates.size ? A.dates : B.dates)) {
      if ((A.dates.size < B.dates.size ? B.dates : A.dates).has(d)) { overlap = true; break; }
    }
    if (overlap) continue;
    if (overlapPct(a, b) >= NEAR_TOTAL && overlapLift(a, b) >= 1.25) add(a, b, 'consecutive careers');
  }
}

/* ------------------------------------------------ baseline for the overlap */
// The median overlap for a player of each size, so a 95% can be read as either
// remarkable or ordinary.
const sizeBucket = (n) => (n < 30 ? 0 : n < 100 ? 1 : n < 300 ? 2 : 3);
const baseline = [0, 1, 2, 3].map((bucket) => {
  const pool = active.filter((id) => sizeBucket(facts.get(id).games) === bucket);
  const sample = pool.slice(0, 60);
  const vals = [];
  for (let i = 0; i < sample.length; i++)
    for (let j = i + 1; j < sample.length; j++) vals.push(overlapPct(sample[i], sample[j]));
  vals.sort((x, y) => x - y);
  return vals.length ? vals[Math.floor(vals.length / 2)] : 0;
});

/* ------------------------------------------------------------- the report */
const rows = [];
for (const [k, whys] of candidates) {
  const [a0, b0] = k.split('|');
  // Which name survives. Normally the bigger record, so the merge points the
  // small one at the large. But when one name is simply contained in the other
  // - "Liam" inside "Liam Hanley", "Billy Sc" inside "Billy Scaduto" - the
  // fuller name wins whatever the game counts say, because the short one is a
  // truncation rather than a competing spelling. Column B of the workbook is
  // editable either way; this only sets the sensible default.
  const [g0, g1] = [facts.get(a0).games, facts.get(b0).games];
  const n0 = norm(nameOf(a0)), n1 = norm(nameOf(b0));
  let a, b;
  if (n0 !== n1 && n1.includes(n0)) [a, b] = [b0, a0];        // b0 is the fuller name
  else if (n0 !== n1 && n0.includes(n1)) [a, b] = [a0, b0];
  else [a, b] = g0 >= g1 ? [a0, b0] : [b0, a0];
  const A = facts.get(a), B = facts.get(b);
  const together = shareCourt.has(k);
  const twin = twins.get(k) ?? 0;
  const sharedDates = [...B.dates].filter((d) => A.dates.has(d)).length;
  const sharedTours = [...B.tours].filter((t) => A.tours.has(t)).length;
  const ov = overlapPct(a, b);
  const lift = overlapLift(a, b);
  const base = baseline[sizeBucket(Math.min(A.games, B.games))];
  const consecutive = sharedDates === 0;

  let verdict, confidence, why;
  if (together) {
    verdict = 'Different people';
    confidence = 'Certain';
    why = 'They have played in the same game, so they cannot be one person.';
  } else if (twin >= 5) {
    verdict = 'Same person';
    confidence = 'Certain';
    why = `${twin} of their games are the same game with one seat renamed - one game cannot be played twice.`;
  } else if (twin >= 2) {
    verdict = 'Same person';
    confidence = 'Strong';
    why = `${twin} games are the same game with one seat renamed, and they never share a court.`;
  } else if (twin === 1 && nameSignal(nameOf(a), nameOf(b))) {
    // One twin alone proves nothing. In a rotating round robin, two games on
    // one night can share a date, a score and three players by chance. It only
    // counts for something when the names agree as well.
    verdict = 'Worth a look';
    confidence = 'Possible';
    why = 'One game looks like a twin, which happens by chance in a rotation, but the names also look related.';
  } else if (consecutive && ov >= 0.85 && lift >= 1.25 && nameSignal(nameOf(a), nameOf(b))
             && Math.min(A.met.size, B.met.size) >= 10) {
    verdict = 'Probably the same';
    confidence = 'Likely';
    why = `No shared game or date - one record stops and the other starts - and ${Math.round(100 * ov)}% of the smaller circle is shared (typical is ${Math.round(100 * base)}%).`;
  // DELIBERATELY NOT RAISED: careers that do not overlap, where the names give
  // nothing away. An earlier pass did raise these and it was worthless - 136
  // pairs, not one of them real, headed by "Skyler Shulman might be Mikel
  // Strauch". Two people who played in different seasons of the same league
  // leave exactly the trace a renamed account leaves, and no amount of
  // arithmetic separates them. It is worth being plain about the gap this
  // leaves: a player who changed to an unrelated name BETWEEN two eras, with
  // no overlapping night, cannot be found in this data at all. A rename DURING
  // an era always leaves twin games, which is why Vinz Viz was catchable.
  } else if (nameSignal(nameOf(a), nameOf(b))) {
    verdict = 'Worth a look';
    confidence = 'Weak';
    why = `The names look related, but the games say nothing either way - they overlap in time and share no twin games.`;
  } else {
    continue;
  }

  rows.push({
    keep: a, keepName: nameOf(a), keepGames: A.games, keepFirst: A.first, keepLast: A.last,
    fold: b, foldName: nameOf(b), foldGames: B.games, foldFirst: B.first, foldLast: B.last,
    twin, together, sharedDates, sharedTours,
    overlap: Math.round(100 * ov), baseline: Math.round(100 * base),
    lift: Number(lift.toFixed(2)),
    nameSignal: nameSignal(nameOf(a), nameOf(b)) || '(names unrelated)',
    raisedBy: [...whys].join(' + '),
    verdict, confidence, why,
    // A plain reading for someone scanning the sheet. Two people sharing a
    // surname and NOT a first name are, far more often than not, a family -
    // this club has four Wangs, three Storks and three Millers. Saying so up
    // front stops the list reading as 90 accusations.
    hint: nameSignal(nameOf(a), nameOf(b)) === 'same surname, different first name'
      ? 'Likely family - same surname, different first names'
      : twin >= 5 ? 'Same person - proven by the games'
      : 'Could be one person under two spellings',
  });
}

const ORDER = { Certain: 0, Strong: 1, Likely: 2, Possible: 3, Weak: 4 };
// Within the name-only rows, some shapes are far more suspicious than others.
// "Mike" against "Michael Crews" is a handle waiting to be resolved; two
// Wangs with different first names are, on the face of it, a family.
const SIGNAL_RANK = [
  'identical names', 'one name contains the other', 'same first and last, extra middle name',
  'same surname, same first name', 'same surname, first name shortened',
  'same surname, first names nearly match', 'spelling differs by',
  'first name only vs full name', 'initial vs first name',
  'same surname, different first name',
];
const sigRank = (s) => { const i = SIGNAL_RANK.findIndex((x) => s.startsWith(x)); return i < 0 ? 99 : i; };
const same = rows.filter((r) => !r.together)
  .sort((x, y) => ORDER[x.confidence] - ORDER[y.confidence] || y.twin - x.twin
    || sigRank(x.nameSignal) - sigRank(y.nameSignal) || y.foldGames - x.foldGames);
// Every pair that shares a court is two people, and most of those pairs are
// two people nobody would ever confuse. Only the ones whose NAMES invite the
// question are worth writing down - so that the answer is on record and the
// question is not asked twice.
const ruledOut = rows.filter((r) => r.together && r.nameSignal !== '(names unrelated)')
  .sort((x, y) => y.twin - x.twin || y.foldGames - x.foldGames);

writeFileSync(new URL('./dupesweep.json', import.meta.url),
  JSON.stringify({ generated: new Date().toISOString(), totals: { games: matches.length, players: active.length },
                   candidates: same, ruledOut }, null, 1));

console.log(`\ncandidates for review : ${same.length}`);
for (const c of ['Certain', 'Strong', 'Likely', 'Possible', 'Weak'])
  console.log(`  ${c.padEnd(9)} ${same.filter((r) => r.confidence === c).length}`);
console.log(`ruled out (share a court): ${ruledOut.length}`);
console.log('\ntop of the list:');
for (const r of same.slice(0, 12))
  console.log(`  [${r.confidence.padEnd(8)}] ${r.foldName} -> ${r.keepName}   twins ${r.twin}, overlap ${r.overlap}% (${r.lift}x chance)`);
console.log('\nwrote build/dupesweep.json');
