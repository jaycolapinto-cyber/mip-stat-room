// Two DUPR names that differ only in capitalisation might be one person who
// retyped their name, or two different people. Folding them blindly would be
// exactly the silent merge we have refused to make all along. The one hard
// discriminator: if both appear in the SAME game, they are certainly two people.
import { readDuprMatches } from '../importer/duprmatches.mjs';

const { games } = readDuprMatches();
const byLower = new Map();
for (const g of games) for (const n of [...g.a, ...g.b]) {
  const k = n.toLowerCase();
  if (!byLower.has(k)) byLower.set(k, new Map());
  const m = byLower.get(k);
  m.set(n, (m.get(n) ?? 0) + 1);
}

const variants = [...byLower].filter(([, m]) => m.size > 1);
console.log(`names with more than one capitalisation: ${variants.length}\n`);

for (const [k, m] of variants) {
  const forms = [...m].sort((a, b) => b[1] - a[1]);
  // Do any two forms ever appear in the same game?
  let together = 0, days = new Map();
  for (const g of games) {
    const all = [...g.a, ...g.b];
    const present = forms.map(([f]) => f).filter(f => all.includes(f));
    if (present.length > 1) together++;
    for (const f of present) {
      if (!days.has(f)) days.set(f, new Set());
      days.get(f).add(g.date);
    }
  }
  const overlapDays = [...days.values()].reduce((acc, s, i, arr) =>
    i === 0 ? new Set(s) : new Set([...acc].filter(d => s.has(d))), null);
  console.log(`${forms.map(([f, c]) => `"${f}" x${c}`).join('   |   ')}`);
  console.log(`   same game together : ${together}   ${together ? '<-- DEFINITELY TWO PEOPLE' : '(never)'}`);
  console.log(`   shared dates       : ${overlapDays ? overlapDays.size : 0}`);
  console.log();
}
