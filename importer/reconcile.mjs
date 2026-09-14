// Identify Scoreholio nicknames by arithmetic rather than by guessing names.
//
// The Friday AM workbook covers weeks 1-2. The live dashboard gives us week 2
// exactly. So for any player who only appeared in week 2, their workbook totals
// must EQUAL their week-2 totals - which pins the nickname to a real person with
// no name matching at all. For two-week players we can only bound them.
import { readFileSync } from 'node:fs';
import { allLeagues } from './extract.mjs';

const rows = readFileSync(new URL('./live/friday-2026-09-11.tsv', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => l.split('\t'));

const today = new Map();
for (const [, , t1, s1, t2, s2] of rows) {
  const A = t1.split(' & ').map((s) => s.trim());
  const B = t2.split(' & ').map((s) => s.trim());
  const aWon = Number(s1) > Number(s2);
  for (const p of A) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'w' : 'l']++; today.set(p, r); }
  for (const p of B) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'l' : 'w']++; today.set(p, r); }
}

const fri = allLeagues().find((l) => l.id === 'fri-am').players;

const results = [];
for (const [handle, t] of today) {
  const g = t.w + t.l;
  const cands = fri.map((p) => {
    const exact = p.wins === t.w && p.losses === t.l && p.games === g;
    const possible = p.wins >= t.w && p.losses >= t.l && (p.games ?? 0) >= g;
    return { name: p.name, wins: p.wins, losses: p.losses, games: p.games, weeks: p.weeks, exact, possible };
  }).filter((c) => c.possible);
  const exacts = cands.filter((c) => c.exact);
  results.push({ handle, t, g, exacts, cands });
}

const confirmed = [], narrowed = [], open = [];
for (const r of results) {
  if (r.exacts.length === 1) confirmed.push(r);
  else if (r.exacts.length > 1) narrowed.push(r);
  else open.push(r);
}

const rec = (t) => `${t.w}-${t.l}`;
console.log(`today: ${rows.length} games, ${today.size} players | Friday AM workbook: ${fri.length} players\n`);

console.log(`PINNED BY EXACT RECORD MATCH (${confirmed.length}) — these played week 2 only, so totals must be identical:`);
for (const r of confirmed) {
  const c = r.exacts[0];
  console.log(`  ${r.handle.padEnd(24)} ${rec(r.t).padStart(6)} ${String(r.g).padStart(2)}g  =  ${c.name.padEnd(22)} ${c.wins}-${c.losses} ${c.games}g  (wks ${c.weeks})`);
}

console.log(`\nAMBIGUOUS — more than one player has that exact record (${narrowed.length}):`);
for (const r of narrowed) console.log(`  ${r.handle.padEnd(24)} ${rec(r.t)} -> ${r.exacts.map((c) => c.name).join(' | ')}`);

console.log(`\nTWO-WEEK PLAYERS — week 1 implied by subtraction (${open.length}):`);
for (const r of open) {
  const top = r.cands
    .map((c) => ({ ...c, w1w: c.wins - r.t.w, w1l: c.losses - r.t.l, w1g: (c.games ?? 0) - r.g }))
    .filter((c) => c.w1g >= 8 && c.w1g <= 14)          // a week is ~10-12 games
    .sort((a, b) => Math.abs(a.w1g - 11) - Math.abs(b.w1g - 11))
    .slice(0, 3);
  console.log(`  ${r.handle.padEnd(24)} ${rec(r.t).padStart(6)} ${r.g}g`);
  for (const c of top) console.log(`        ${c.name.padEnd(22)} total ${c.wins}-${c.losses} ${c.games}g -> week 1 would be ${c.w1w}-${c.w1l} in ${c.w1g}g`);
}
