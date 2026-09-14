// Third independent confirmation of the nickname map.
//
// Scoreholio's Friday AM export holds 48 games under NICKNAMES. DUPR holds the
// same session under REAL NAMES. Translate both sides to roster player IDs and
// the two lists should be the same 48 games. A wrong nickname mapping would
// produce a game DUPR simply does not have.
//
// Both sides need translating, not just one: DUPR's own spellings differ from
// the league files ("Jeffrey Fein" for Jeff Fein, "Rex W. Bunt" for Rex Bunt),
// so comparing raw strings measures spelling, not identity.
import { readExport, EXPORT_DIR } from '../importer/scoreholio.mjs';
import { readDuprMatches } from '../importer/duprmatches.mjs';
import { matchDupr } from '../importer/dupr.mjs';
import { buildRoster } from '../importer/roster.mjs';
import { readFileSync } from 'node:fs';

const CONFIRMED = JSON.parse(readFileSync(new URL('../importer/aliases.json', import.meta.url), 'utf8')).confirmed;
const { players } = buildRoster();
const nameById = new Map(players.map((p) => [p.id, p.name]));
const canon = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');

// DUPR name -> roster id, from the club-listing match we already trust.
const dp = matchDupr(players);
const duprNameToId = new Map();
for (const [id, v] of dp.ratings) duprNameToId.set(canon(v.duprName), id);
// A roster name that DUPR spells identically also resolves.
const byRosterName = new Map(players.map((p) => [canon(p.name), p.id]));
const duprId = (n) => duprNameToId.get(canon(n)) ?? byRosterName.get(canon(n)) ?? null;
const shId = (h) => CONFIRMED[h.trim()] ?? byRosterName.get(canon(h)) ?? null;

const sig = (a, b, sa, sb) => {
  const A = [...a].sort().join('+'), B = [...b].sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
};

const day = '2026-09-11';
const dupr = readDuprMatches().games.filter((g) => g.date === day);
const unknownDupr = new Set();
const pool = new Map();
for (const g of dupr) {
  const a = g.a.map(duprId), b = g.b.map(duprId);
  for (let i = 0; i < 2; i++) { if (!a[i]) unknownDupr.add(g.a[i]); if (!b[i]) unknownDupr.add(g.b[i]); }
  if ([...a, ...b].some((x) => !x)) continue;
  const k = sig(a, b, g.sa, g.sb);
  if (!pool.has(k)) pool.set(k, []);
  pool.get(k).push(g);
}

const sh = readExport(new URL('Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx', EXPORT_DIR));
let hit = 0; const misses = [];
for (const g of sh.games) {
  const a = g.handlesA.map(shId), b = g.handlesB.map(shId);
  if ([...a, ...b].some((x) => !x)) { misses.push({ why: 'a Scoreholio handle has no mapping', who: [...g.handlesA, ...g.handlesB].join(' / ') }); continue; }
  const q = pool.get(sig(a, b, g.sa, g.sb));
  if (q?.length) { q.shift(); hit++; }
  else misses.push({
    why: 'not in DUPR',
    who: [...g.handlesA, ...g.handlesB].join(' / '),
    as: `${a.map((x) => nameById.get(x)).join(' & ')} ${g.sa}-${g.sb} ${b.map((x) => nameById.get(x)).join(' & ')}`,
  });
}

console.log(`Scoreholio Friday AM games          : ${sh.games.length}`);
console.log(`DUPR games on ${day}          : ${dupr.length}`);
console.log(`DUPR names with no roster match     : ${unknownDupr.size}${unknownDupr.size ? ' -> ' + [...unknownDupr].join(', ') : ''}`);
console.log(`\nmatched player-for-player, score-for-score: ${hit} / ${sh.games.length}`);
if (misses.length) {
  console.log(`\nUNMATCHED (${misses.length}):`);
  misses.slice(0, 12).forEach((m) => console.log(`  [${m.why}] ${m.who}${m.as ? '\n        as ' + m.as : ''}`));
}
