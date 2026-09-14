// Arithmetic can't DERIVE who a nickname is - too many assignments fit.
// But it can CHECK one. Here we take the obvious reading of each nickname
// (plus Jay's "Chase Gold = Sal Farruggia") and test it against the workbook:
// week 2 comes from the live log, so week 1 = workbook total minus week 2 and
// must be a plausible session.
import { readFileSync } from 'node:fs';
import { allLeagues } from './extract.mjs';

const MAP = {
  'Jonathan Gottesmann': 'Jonathan Gottesmann',
  'Chase Gold': 'Sal Farruggia',           // from Dave's roster, via Jay
  'Chasette Gold': 'Danielle Farruggia',
  'Brendan S.': 'Brendan Stephenson',
  'Rex B.': 'Rex Bunt',
  'Jay C': 'Jay Colapinto',
  'Vincent C.': 'Vincent Cusumano',
  'Frank R.': 'Frank Rossetti',
  'Jason V.': 'Jason Vargas',
  'D-Hub27🍺': 'David Huber',
  'Karen P.': 'Karen Polito',
  'Jeff F.': 'Jeff Fein',
  'L. Glods ❤️': 'Lauren Glodny',
  'Jin L.': 'Jin Lei',
  'Andrew J.': 'Andrew Johnson',
  'Stephen R.': 'Stephen Rizzi',
  'Jaime F.': 'Jaime Frand',
  'Christie S.🍷': 'Christie Simmons',
};

const rows = readFileSync(new URL('./live/friday-2026-09-11.tsv', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => l.split('\t'));
const today = new Map();
for (const [, , t1, s1, t2, s2] of rows) {
  const A = t1.split(' & ').map((s) => s.trim()), B = t2.split(' & ').map((s) => s.trim());
  const aWon = Number(s1) > Number(s2);
  for (const p of A) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'w' : 'l']++; today.set(p, r); }
  for (const p of B) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'l' : 'w']++; today.set(p, r); }
}
const book = new Map(allLeagues().find((l) => l.id === 'fri-am').players.map((p) => [p.name, p]));

let ok = 0, bad = 0;
const seen = new Map();
console.log('nickname                 week 2 (live)   workbook total   => week 1 implied');
console.log('-'.repeat(88));
for (const [h, r] of [...today.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const real = MAP[h];
  const p = book.get(real);
  if (!p) { console.log(`  ${h} -> ${real}: NOT IN WORKBOOK`); bad++; continue; }
  if (seen.has(real)) { console.log(`  ${h}: "${real}" already claimed by ${seen.get(real)}`); bad++; }
  seen.set(real, h);
  const g = r.w + r.l, rg = p.games - g, rw = p.wins - r.w, rl = p.losses - r.l;
  const consistent = rw >= 0 && rl >= 0 && rw + rl === rg
    && ((p.weeks === 1 && rg === 0) || (p.weeks === 2 && rg >= 8 && rg <= 14));
  if (consistent) ok++; else bad++;
  console.log(`${consistent ? ' OK ' : 'FAIL'} ${h.padEnd(22)} ${(r.w + '-' + r.l).padStart(6)} ${String(g).padStart(2)}g  ${real.padEnd(20)} ${(p.wins + '-' + p.losses).padStart(6)} ${String(p.games).padStart(2)}g  wk${p.weeks}  ${p.weeks === 1 ? 'did not play wk1' : `${rw}-${rl} in ${rg}g`}`);
}
// every 2-week player must appear today
const missing = [...book.values()].filter((p) => p.weeks === 2 && !seen.has(p.name)).map((p) => p.name);
console.log('-'.repeat(88));
console.log(`consistent: ${ok} | problems: ${bad}`);
console.log(`one-to-one: ${seen.size === today.size ? 'yes' : 'NO'} (${seen.size} people for ${today.size} nicknames)`);
console.log(`two-week players missing from today: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`workbook players who sat out week 2: ${[...book.values()].filter((p) => !seen.has(p.name)).map((p) => `${p.name} (wk${p.weeks})`).join(', ')}`);
