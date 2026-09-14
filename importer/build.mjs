import { writeFileSync } from 'node:fs';
import { allLeagues, readMaster, readGames } from './extract.mjs';
import { buildRoster } from './roster.mjs';
import { createResolver } from './resolve.mjs';

export function run({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const { players: roster, displayToId, leagueRowId, conflictedNames } = buildRoster();
  const r = createResolver(roster);
  const leagues = allLeagues();
  const master = readMaster();
  const { games: raw, gridCells, startDate } = readGames();

  // ---- games -------------------------------------------------------------
  // Game cells use the same display names as the grid, so the registry is exact.
  const split = (cell) => String(cell ?? '').split(/\s*(?:&|\+|\/|\band\b)\s*/i)
    .map((s) => s.trim()).filter(Boolean);
  const idFor = (name) => displayToId.get(name) ?? r.resolve(name).id ?? null;

  const matches = [];
  const rejected = [];
  for (const g of raw) {
    const n1 = split(g.team1), n2 = split(g.team2);
    const ids1 = n1.map(idFor), ids2 = n2.map(idFor);
    const all = [...ids1, ...ids2];
    const why = [];
    if (all.some((x) => !x)) why.push('unmapped player');
    else if (new Set(all).size !== 4) why.push('same player twice');
    if (ids1.length !== 2 || ids2.length !== 2) why.push('team is not a pair');
    if (!Number.isFinite(g.s1) || !Number.isFinite(g.s2)) why.push('non-numeric score');
    else if (g.s1 === g.s2) why.push('tie');
    if (why.length) { rejected.push({ ...g, why }); continue; }
    matches.push({
      id: `${g.event}-${g.num}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      event: g.event, num: g.num,
      a: ids1, b: ids2, sa: g.s1, sb: g.s2,
    });
  }

  // ---- verification: our head-to-head vs Dave's published grid ------------
  const mine = new Map();
  for (const m of matches) {
    for (const x of m.a) for (const y of m.b) {
      const aWon = m.sa > m.sb;
      const k = x + '|' + y, k2 = y + '|' + x;
      const e = mine.get(k) ?? { w: 0, l: 0 }; e[aWon ? 'w' : 'l']++; mine.set(k, e);
      const e2 = mine.get(k2) ?? { w: 0, l: 0 }; e2[aWon ? 'l' : 'w']++; mine.set(k2, e2);
    }
  }
  const idOf = (display) => displayToId.get(display) ?? r.resolve(display).id ?? null;
  let checked = 0, agree = 0; const disagree = [];
  for (const c of gridCells) {
    const a = idOf(c.a), b = idOf(c.b);
    if (!a || !b) continue;                      // grid entry we can't map — not a mismatch
    const got = mine.get(a + '|' + b) ?? { w: 0, l: 0 };
    checked++;
    if (got.w === c.w && got.l === c.l) agree++;
    else disagree.push({ a: c.a, b: c.b, published: `${c.w}-${c.l}`, computed: `${got.w}-${got.l}` });
  }

  log(`roster           ${roster.length} players`);
  log(`games in file    ${raw.length}`);
  log(`imported         ${matches.length}`);
  log(`held back        ${rejected.length}  (${[...new Set(rejected.flatMap((x) => x.why))].join(', ') || '-'})`);
  log(`\nhead-to-head cross-check against Dave's published grid:`);
  log(`  pairs checked  ${checked}`);
  log(`  agree          ${agree} (${checked ? (agree / checked * 100).toFixed(1) : 0}%)`);
  log(`  disagree       ${disagree.length}`);
  disagree.slice(0, 10).forEach((d) => log(`    ${d.a} vs ${d.b}: published ${d.published}, computed ${d.computed}`));

  return { roster, displayToId, leagueRowId, conflictedNames, leagues, master, matches, rejected, startDate,
           verify: { checked, agree, disagree } };
}

if (process.argv[1]?.endsWith('build.mjs')) run();
