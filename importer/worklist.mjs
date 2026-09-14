// Lists every player that exists only as a Scoreholio display name, with a
// proposed match where the evidence is strong. Dave confirms; nothing merges
// on a guess. Confirmed rows go into aliases.json under "confirmed".
import { writeFileSync } from 'node:fs';
import { run } from './build.mjs';
import { suggestFor } from './suggest.mjs';
import { DATA } from '../dist/data.js';

const { roster, matches } = run({ quiet: true });
const h2h = DATA.h2h;   // cumulative grid, as shipped

const gamesById = new Map();
for (const m of matches) for (const id of [...m.a, ...m.b]) gamesById.set(id, (gamesById.get(id) ?? 0) + 1);
const h2hById = new Map();
for (const x of h2h) for (const [id, n] of [[x.a, x.w + x.l], [x.b, x.w + x.l]]) {
  h2hById.set(id, (h2hById.get(id) ?? 0) + n);
}

const canonical = roster.filter((p) => !p.displayOnly);
const items = roster.filter((p) => p.displayOnly).map((p) => ({
  handle: p.name,
  id: p.id,
  games: gamesById.get(p.id) ?? 0,
  meetings: h2hById.get(p.id) ?? 0,
  ambiguous: p.ambiguous ?? null,
  suggestions: suggestFor(p.name, canonical).slice(0, 3),
})).sort((a, b) => (b.games + b.meetings) - (a.games + a.meetings));

const confident = items.filter((i) => i.suggestions[0]?.confident);
const unsure = items.filter((i) => !i.suggestions[0]?.confident);

writeFileSync(new URL('./worklist.json', import.meta.url),
  JSON.stringify({ generated: new Date().toISOString(), total: items.length, items }, null, 2));

console.log(`players existing only as a Scoreholio handle: ${items.length}`);
console.log(`  with a confident proposal : ${confident.length}`);
console.log(`  need Dave to decide       : ${unsure.length}\n`);
const show = (list, title) => {
  console.log(title);
  for (const it of list) {
    console.log(`  "${it.handle}"  ${it.games} games, ${it.meetings} meetings${it.ambiguous ? '  [name is ambiguous]' : ''}`);
    if (!it.suggestions.length) console.log('       no candidate — probably a person not in any league file');
    for (const s of it.suggestions) console.log(`       ${s.confident ? '>>' : '  '} ${s.name.padEnd(24)} ${s.why}`);
  }
  console.log('');
};
show(confident, 'CONFIDENT PROPOSALS (surname evidence, no contradiction):');
show(unsure.slice(0, 14), 'NEEDS A HUMAN:');
