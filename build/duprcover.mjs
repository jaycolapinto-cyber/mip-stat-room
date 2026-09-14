import { readDuprMatches } from '../importer/duprmatches.mjs';
import { matchDupr } from '../importer/dupr.mjs';
import { buildRoster } from '../importer/roster.mjs';
import { readFileSync } from 'node:fs';
import { DATA } from '../dist/data.js';

const { players } = buildRoster();
const canon = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const byRosterName = new Map(players.map((p) => [canon(p.name), p.id]));
const CONF = JSON.parse(readFileSync(new URL('../importer/aliases.json', import.meta.url), 'utf8')).duprNames ?? {};
const confirmed = new Map(Object.entries(CONF).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [canon(k), v]));
const dp = matchDupr(players);
const fromClub = new Map();
for (const [id, v] of dp.ratings) fromClub.set(canon(v.duprName), id);

const idOf = (n) => confirmed.get(canon(n)) ?? fromClub.get(canon(n)) ?? byRosterName.get(canon(n)) ?? null;

const { games } = readDuprMatches();
const unknown = new Map();
let full = 0;
for (const g of games) {
  const ids = [...g.a, ...g.b].map(idOf);
  if (ids.every(Boolean)) full++;
  [...g.a, ...g.b].forEach((n, i) => { if (!ids[i]) unknown.set(n, (unknown.get(n) ?? 0) + 1); });
}

console.log(`DUPR games held            : ${games.length}`);
console.log(`fully resolvable to roster : ${full}  (${Math.round(100 * full / games.length)}%)`);
console.log(`games blocked by a name    : ${games.length - full}`);
console.log(`\nDUPR names with no roster match: ${unknown.size}`);
[...unknown].sort((a, b) => b[1] - a[1]).slice(0, 40)
  .forEach(([n, c]) => console.log(`  ${String(c).padStart(4)} games   ${n}`));

console.log(`\nFor comparison, the site currently shows ${DATA.matches.length} detailed games`);
console.log(`and the head-to-head grid implies about ${DATA.coverage.impliedTotalGames} on record.`);
