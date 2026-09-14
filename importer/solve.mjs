// Identify the nicknames by constraint solving, not by guessing.
//
// Facts we can rely on:
//   * The workbook covers weeks 1-2. The live log IS week 2, complete.
//   * A workbook player with Wks=2 played both weeks, so they MUST be in today's 18.
//   * A workbook player with Wks=1 played exactly one week - either week 1 (so they
//     are absent today) or week 2 (so their workbook totals equal today's exactly).
//   * The mapping is one-to-one: two nicknames cannot be the same person.
//
// We enumerate every assignment satisfying all of that. A nickname is only
// "identified" if EVERY valid solution gives it the same person.
import { readFileSync } from 'node:fs';
import { allLeagues } from './extract.mjs';

const rows = readFileSync(new URL('./live/friday-2026-09-11.tsv', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => l.split('\t'));

const today = new Map();
for (const [, , t1, s1, t2, s2] of rows) {
  const A = t1.split(' & ').map((s) => s.trim()), B = t2.split(' & ').map((s) => s.trim());
  const aWon = Number(s1) > Number(s2);
  for (const p of A) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'w' : 'l']++; today.set(p, r); }
  for (const p of B) { const r = today.get(p) ?? { w: 0, l: 0 }; r[aWon ? 'l' : 'w']++; today.set(p, r); }
}
const handles = [...today.entries()].map(([h, r]) => ({ h, w: r.w, l: r.l, g: r.w + r.l }));
const book = allLeagues().find((l) => l.id === 'fri-am').players
  .map((p) => ({ name: p.name, W: p.wins, L: p.losses, G: p.games, wks: p.weeks }));

const WEEK_MIN = 8, WEEK_MAX = 14;   // a Friday session is ~10-12 games

function allowed(hd, p) {
  if (hd.h === p.name) return true;                       // plays under their real name
  if (book.some((b) => b.name === hd.h) && hd.h !== p.name) return false;
  if (p.W < hd.w || p.L < hd.l || (p.G ?? 0) < hd.g) return false;
  const rg = (p.G ?? 0) - hd.g, rw = p.W - hd.w, rl = p.L - hd.l;
  if (rw + rl !== rg) return false;
  if (p.wks === 1) return rg === 0;
  return rg >= WEEK_MIN && rg <= WEEK_MAX;
}

const cand = handles.map((hd) => ({ hd, options: book.filter((p) => allowed(hd, p)) }));
cand.sort((a, b) => a.options.length - b.options.length);

const twoWeek = book.filter((p) => p.wks === 2).map((p) => p.name);
const solutions = [];
const used = new Set();
const assign = new Map();

(function search(i) {
  if (solutions.length > 200) return;
  if (i === cand.length) {
    // every two-week player must have been claimed by somebody
    if (twoWeek.every((n) => used.has(n))) solutions.push(new Map(assign));
    return;
  }
  for (const p of cand[i].options) {
    if (used.has(p.name)) continue;
    used.add(p.name); assign.set(cand[i].hd.h, p.name);
    search(i + 1);
    used.delete(p.name); assign.delete(cand[i].hd.h);
  }
})(0);

console.log(`handles today: ${handles.length} | workbook players: ${book.length}`);
console.log(`two-week players who must be present: ${twoWeek.length}`);
console.log(`valid solutions found: ${solutions.length}${solutions.length > 200 ? '+' : ''}\n`);

if (!solutions.length) { console.log('No assignment satisfies the constraints — an assumption is wrong.'); process.exit(0); }

const fixed = [], varies = [];
for (const { hd } of cand) {
  const vals = new Set(solutions.map((s) => s.get(hd.h)));
  (vals.size === 1 ? fixed : varies).push({ h: hd.h, rec: `${hd.w}-${hd.l}`, g: hd.g, vals: [...vals] });
}
fixed.sort((a, b) => a.h.localeCompare(b.h));
console.log(`IDENTIFIED — same answer in every valid solution (${fixed.length}):`);
for (const f of fixed) console.log(`  ${f.h.padEnd(24)} ${f.rec.padStart(6)} ${String(f.g).padStart(2)}g  ->  ${f.vals[0]}`);
console.log(`\nSTILL AMBIGUOUS (${varies.length}):`);
for (const v of varies) console.log(`  ${v.h.padEnd(24)} ${v.rec.padStart(6)} ${String(v.g).padStart(2)}g  ->  ${v.vals.sort().join(' | ')}`);
