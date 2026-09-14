// Find one person recorded under two identities, without being told to look.
//
// This exists because the first four of these were found by MIP players opening
// the live site and seeing their own name twice in the dropdown. That is a bad
// way to find out. Every one of them had the same fingerprint in the data, and
// it is a fingerprint a machine can look for.
//
// THE TEST. Two games are TWINS when they are the same date, the same score,
// and three of the four players are identical - so the only difference is who
// is sitting in the fourth seat. One pickleball game cannot be played twice
// that way. Either the two occupants of that seat are the same person written
// down twice, or something is wrong with the data. Names are never compared:
// "Vinz Viz" and "Vincent Vizcarra" look nothing alike, and "Peter DeLucia"
// and "Peter DeLucia Jr" look like a father and a son. The games decided both.
//
// WHY THIS IS NOT A SIMILARITY SCORE. Nothing here merges anything. It prints
// a shortlist for a human who knows the club, and the merge only ever happens
// by hand in aliases.mergedPlayers. A score that merged on its own would
// eventually hand one player another player's record.
import { matches, players } from '../dist/data.js';

const MIN_TWINS = 3;                  // below this, coincidence is plausible
const name = (id) => players.find((p) => p.id === id)?.name ?? id;

// For each game, for each seat, a key describing "this game minus that seat".
const slots = new Map();
for (const m of matches) {
  const four = [...m.a, ...m.b];
  if (four.length !== 4) continue;
  const score = [m.sa, m.sb].sort((x, y) => x - y).join('-');
  for (const who of four) {
    const others = four.filter((x) => x !== who).sort().join(',');
    const k = `${m.date}|${score}|${others}`;
    if (!slots.has(k)) slots.set(k, new Set());
    slots.get(k).add(who);
  }
}

const pairs = new Map();
for (const occupants of slots.values()) {
  if (occupants.size < 2) continue;
  const list = [...occupants].sort();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const k = list[i] + '|' + list[j];
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
}

// A pair who ever share a court is definitively two people, whatever else the
// arithmetic says. This is the same contradiction test that caught the bad
// answers in the nicknames workbook.
const together = new Set();
for (const m of matches) {
  const four = [...m.a, ...m.b];
  for (let i = 0; i < four.length; i++)
    for (let j = i + 1; j < four.length; j++)
      together.add([four[i], four[j]].sort().join('|'));
}

const suspects = [...pairs]
  .filter(([k, n]) => n >= MIN_TWINS && !together.has(k))
  .sort((a, b) => b[1] - a[1]);

const contradicted = [...pairs].filter(([k, n]) => n >= MIN_TWINS && together.has(k));

if (suspects.length) {
  console.log(`\nPOSSIBLE DUPLICATE PEOPLE - ${suspects.length} pair(s), NOT merged.`);
  console.log('Each pair has games that are the same game with one seat renamed,');
  console.log('and they never once share a court. Confirm with someone who knows the');
  console.log('club, then add to mergedPlayers in importer/aliases.json.\n');
  for (const [k, n] of suspects) {
    const [a, b] = k.split('|');
    console.log(`  ${String(n).padStart(4)} twin games   ${name(a)}  <->  ${name(b)}`);
    console.log(`       ${a}  ->  ${b}`);
  }
} else {
  console.log('\nNo unmerged duplicate identities found.');
}

if (contradicted.length) {
  console.log(`\nNOTE: ${contradicted.length} pair(s) have twin games BUT also share a court,`);
  console.log('so they are two people and the twin games need a different explanation:');
  for (const [k, n] of contradicted.slice(0, 5)) {
    const [a, b] = k.split('|');
    console.log(`  ${n} twins  ${name(a)} <-> ${name(b)}`);
  }
}

console.log(`\nscanned ${matches.length} games, ${players.length} players`);
// Reporting only. A duplicate nobody has confirmed yet must not fail the build.
process.exit(0);
