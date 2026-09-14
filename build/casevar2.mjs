// If one spelling stops on the day the other starts, that is one person who
// renamed their DUPR account. If the two spellings interleave across the same
// period, they are two different accounts being used side by side.
import { readDuprMatches } from '../importer/duprmatches.mjs';
const { games } = readDuprMatches();

for (const pair of [['Sal Farruggia', 'Sal farruggia'], ['Gennaro Izzo', 'Gennaro izzo']]) {
  console.log(`\n=== ${pair[0]}  vs  ${pair[1]} ===`);
  const spans = pair.map((form) => {
    const ds = [...new Set(games.filter(g => [...g.a, ...g.b].includes(form)).map(g => g.date))].sort();
    return { form, first: ds[0], last: ds[ds.length - 1], days: ds.length, ds };
  });
  for (const s of spans) console.log(`  "${s.form}"  ${s.days} days,  ${s.first} .. ${s.last}`);
  const [A, B] = spans;
  const overlap = A.ds.filter(d => B.ds.includes(d));
  const interleaved = A.first <= B.last && B.first <= A.last;
  console.log(`  ranges overlap : ${interleaved ? 'YES - both in use at the same time' : 'NO - one stops where the other starts'}`);
  console.log(`  shared days    : ${overlap.length}${overlap.length ? ' -> ' + overlap.join(', ') : ''}`);
}
