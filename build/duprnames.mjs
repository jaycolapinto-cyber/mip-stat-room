// Which of the DUPR names we cannot place might be players our roster already
// holds only as a Scoreholio display name? Run them through the SAME matcher
// used for nicknames, which requires surname evidence and refuses a first-name
// match. Nothing here is applied - it is a proposal list for a human.
import { readDuprMatches } from '../importer/duprmatches.mjs';
import { matchDupr } from '../importer/dupr.mjs';
import { buildRoster } from '../importer/roster.mjs';
import { suggestFor } from '../importer/suggest.mjs';
import { readFileSync } from 'node:fs';

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
for (const g of games) for (const n of [...g.a, ...g.b]) if (!idOf(n)) unknown.set(n, (unknown.get(n) ?? 0) + 1);

// A DUPR name is a REAL name. Our unplaced roster entries are display names.
// So match the real name against the display-only pool.
const pool = players.filter((p) => p.displayOnly);
console.log(`roster entries that are display-name-only: ${pool.length}`);
console.log(`  ${pool.map((p) => p.name).join(', ')}\n`);

for (const [name, count] of [...unknown].sort((a, b) => b[1] - a[1])) {
  const top = suggestFor(name, pool).slice(0, 2);
  const best = top[0];
  const verdict = best?.confident ? 'CONFIDENT' : best ? 'weak' : 'nothing';
  console.log(`${String(count).padStart(4)} games  ${name.padEnd(24)} ${verdict.padEnd(10)} ${best ? `${best.name}  [${best.why}]` : ''}`);
}
