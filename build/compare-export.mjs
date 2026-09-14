// Known-answer test: Scoreholio's own export of the Friday AM 9/11 event,
// against the 48 games we already hold and verified two other ways.
import xlsx from 'xlsx';
import { readFileSync } from 'node:fs';

const wb = xlsx.readFile('/root/.claude/uploads/c0bba36f-3c21-549e-ab0a-ef27e1e9114c/9d1bc916-Matchlog-lMFLQ14a6PQdtFLojKWt.xlsx');
const rows = xlsx.utils.sheet_to_json(wb.Sheets['Match Log'], { defval: '', raw: false });

const key = (t1, t2, s1, s2) => {
  const A = t1.split('&').map((s) => s.trim()).sort().join('+');
  const B = t2.split('&').map((s) => s.trim()).sort().join('+');
  return A < B ? `${A}|${B}|${s1}|${s2}` : `${B}|${A}|${s2}|${s1}`;
};

const exp = rows.map((r) => ({
  n: r['#'], iso: r['Date/Time'], court: String(r['Crt']),
  t1: r['Team 1'], t2: r['Team 2'], s1: r['Score'], s2: r['Score 2'],
  id: r['Match ID'],
  k: key(r['Team 1'], r['Team 2'], r['Score'], r['Score 2']),
  ts: Math.floor(new Date(r['Date/Time']).getTime() / 1000),
}));

const tsv = readFileSync('importer/live/friday-2026-09-11.tsv', 'utf8').trim().split('\n').map((l) => {
  const c = l.split('\t');
  return { ts: +c[0], court: c[1], t1: c[2], t2: c[4], s1: c[3], s2: c[5], k: key(c[2], c[4], c[3], c[5]) };
});

console.log(`export rows: ${exp.length}   dashboard rows we already had: ${tsv.length}`);

const eByK = new Map(); for (const e of exp) { if (!eByK.has(e.k)) eByK.set(e.k, []); eByK.get(e.k).push(e); }
let matched = 0, tsMismatch = 0, courtMismatch = 0;
const courtPairs = new Set(); const missing = [];
for (const t of tsv) {
  const q = eByK.get(t.k);
  if (!q || !q.length) { missing.push(t); continue; }
  const e = q.shift(); matched++;
  if (e.ts !== t.ts) { tsMismatch++; if (tsMismatch <= 3) console.log(`  ts differs: export ${e.ts} vs ours ${t.ts} (${e.t1} vs ${e.t2})`); }
  if (e.court !== t.court) { courtMismatch++; courtPairs.add(`ours ${t.court} -> export ${e.court}`); }
}
console.log(`\nmatched on players+scores : ${matched} / ${tsv.length}`);
console.log(`timestamps identical      : ${matched - tsMismatch} / ${matched}`);
console.log(`court numbers identical   : ${matched - courtMismatch} / ${matched}`);
if (courtPairs.size) console.log('court mapping seen        :', [...courtPairs].join(', '));
if (missing.length) console.log('games we have that the export does not:', missing.length);
const leftover = [...eByK.values()].flat();
console.log('games the export has that we do not:', leftover.length);

console.log(`\nunique Match IDs in export: ${new Set(exp.map((e) => e.id)).size} / ${exp.length}`);
const names = new Set(exp.flatMap((e) => [...e.t1.split('&'), ...e.t2.split('&')].map((s) => s.trim())));
console.log(`distinct player strings   : ${names.size}`);
console.log('are they real names or nicknames?');
console.log('  ' + [...names].sort().join('\n  '));
