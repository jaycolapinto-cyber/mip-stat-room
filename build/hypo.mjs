// Two hypotheses, tested the only honest way: apply one, see whether games that
// did not exist in DUPR suddenly do. A WRONG mapping cannot do that - it would
// invent a game DUPR has never seen. Only a right one closes the gap.
//
//   H1: DUPR's "jame frand" is our Jaime Frand (a typo in her DUPR account).
//   H2: the two "Sal Farruggia" rows in the league files are one person, so
//       Friday AM's Sal and DUPR's Sal are the same man.
import { readExport, EXPORT_DIR } from '../importer/scoreholio.mjs';
import { readDuprMatches } from '../importer/duprmatches.mjs';
import { matchDupr } from '../importer/dupr.mjs';
import { buildRoster } from '../importer/roster.mjs';
import { readFileSync } from 'node:fs';

const CONFIRMED = JSON.parse(readFileSync(new URL('../importer/aliases.json', import.meta.url), 'utf8')).confirmed;
const { players } = buildRoster();
const canon = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const byRosterName = new Map(players.map((p) => [canon(p.name), p.id]));
const dp = matchDupr(players);
const duprNameToId = new Map();
for (const [id, v] of dp.ratings) duprNameToId.set(canon(v.duprName), id);

const SALS = players.filter((p) => /sal farruggia/i.test(p.name)).map((p) => p.id);
console.log('Sal Farruggia rows in our roster:', SALS.join(' | '));
console.log('DUPR "Sal Farruggia" currently maps to:', duprNameToId.get('salfarruggia'));

const sig = (a, b, sa, sb) => {
  const A = [...a].sort().join('+'), B = [...b].sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
};

const day = '2026-09-11';
const duprDay = readDuprMatches().games.filter((g) => g.date === day);
const sh = readExport(new URL('Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx', EXPORT_DIR));

function run({ h1, h2 }) {
  const fold = (id) => (h2 && SALS.includes(id) ? 'SAL' : id);
  const dId = (n) => {
    if (h1 && canon(n) === 'jamefrand') return fold(byRosterName.get('jaimefrand'));
    const id = duprNameToId.get(canon(n)) ?? byRosterName.get(canon(n));
    return id ? fold(id) : null;
  };
  const sId = (h) => {
    const id = CONFIRMED[h.trim()] ?? byRosterName.get(canon(h));
    return id ? fold(id) : null;
  };

  const pool = new Map();
  for (const g of duprDay) {
    const a = g.a.map(dId), b = g.b.map(dId);
    if ([...a, ...b].some((x) => !x)) continue;
    const k = sig(a, b, g.sa, g.sb);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(g);
  }
  let hit = 0;
  for (const g of sh.games) {
    const a = g.handlesA.map(sId), b = g.handlesB.map(sId);
    if ([...a, ...b].some((x) => !x)) continue;
    const q = pool.get(sig(a, b, g.sa, g.sb));
    if (q?.length) { q.shift(); hit++; }
  }
  return hit;
}

console.log('\nGames of the 48 that DUPR confirms, under each hypothesis:');
console.log(`  neither          : ${run({ h1: false, h2: false })} / 48`);
console.log(`  H1 only (jame)   : ${run({ h1: true,  h2: false })} / 48`);
console.log(`  H2 only (one Sal): ${run({ h1: false, h2: true  })} / 48`);
console.log(`  both             : ${run({ h1: true,  h2: true  })} / 48`);
