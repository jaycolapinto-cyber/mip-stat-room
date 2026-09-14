// H2 came in two flavours and they are NOT the same claim:
//   H2a  the two "Sal Farruggia" roster rows are one human, merge them
//   H2b  they stay two people, and DUPR's "Sal Farruggia" is simply the
//        LI-Kick one - the club listing was matched to the wrong row because
//        both rows carry the identical name
// H2a merges two identities. H2b corrects one pointer. If H2b alone reaches
// 48/48 then there is no evidence for a merge and we must not make one.
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
const sig = (a, b, sa, sb) => {
  const A = [...a].sort().join('+'), B = [...b].sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
};
const day = '2026-09-11';
const duprDay = readDuprMatches().games.filter((g) => g.date === day);
const sh = readExport(new URL('Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx', EXPORT_DIR));

function run(salTarget) {
  const dId = (n) => {
    const c = canon(n);
    if (c === 'jamefrand') return byRosterName.get('jaimefrand');
    if (c === 'salfarruggia') return salTarget;
    return duprNameToId.get(c) ?? byRosterName.get(c) ?? null;
  };
  const sId = (h) => CONFIRMED[h.trim()] ?? byRosterName.get(canon(h)) ?? null;
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

console.log('With "jame frand" = Jaime Frand in both cases, and DUPR\'s Sal pointed at:');
console.log(`  sal-farruggia-merrick-in-a-pickle : ${run('sal-farruggia-merrick-in-a-pickle')} / 48`);
console.log(`  sal-farruggia-li-kick             : ${run('sal-farruggia-li-kick')} / 48`);
