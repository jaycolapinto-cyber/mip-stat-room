import { createResolver } from './resolve.mjs';

const ROSTER = [
  'Jonathan Gottesmann','Sal Farruggia','Brendan Stephenson','Rex Bunt','Jay Colapinto',
  'Vincent Cusumano','Frank Rossetti','Jason Vargas','David Huber','Karen Polito',
  'Jeff Hersh','Bill Lynch','Jeff Fein','Lauren Glodny','Jin Lei','Andrew Johnson',
  'Tony Romano','Eran Dekel','Daniel Calhoun','Stephen Rizzi','Jaime Frand',
  'Christie Simmons','Eddie Rizzi','Jonathan Mcmilleon','Danielle Farruggia',
].map((n) => ({ id: n.toLowerCase().replace(/[^a-z]+/g, '-'), name: n }));

const r = createResolver(ROSTER);
let pass = 0, fail = 0;
const ok = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`  FAIL ${label}\n    got  ${g}\n    want ${w}`); }
};
const id = (s) => { const x = r.resolve(s); return x.id ?? (x.ambiguous ? 'AMBIGUOUS' : 'UNKNOWN'); };

// --- the formats actually seen in Scoreholio exports ---
ok('full name', id('Vincent Cusumano'), 'vincent-cusumano');
ok('first + last initial w/ period', id('Karen P.'), 'karen-polito');
ok('first + last initial no period', id('Karen P'), 'karen-polito');
ok('first initial + last name', id('K Polito'), 'karen-polito');
ok('first initial + last, period', id('K. Polito'), 'karen-polito');
ok('extra whitespace', id('  Rex   Bunt '), 'rex-bunt');
ok('case insensitive', id('rEx bUnT'), 'rex-bunt');
ok('unique first name alone', id('Karen'), 'karen-polito');
ok('unique last name alone', id('Cusumano'), 'vincent-cusumano');

// --- the traps: this roster really does contain collisions ---
ok('two Jeffs -> ambiguous', id('Jeff'), 'AMBIGUOUS');
ok('Jeff H. disambiguates', id('Jeff H.'), 'jeff-hersh');
ok('Jeff F. disambiguates', id('Jeff F.'), 'jeff-fein');
ok('two Rizzis -> ambiguous', id('Rizzi'), 'AMBIGUOUS');
ok('S Rizzi resolves', id('S Rizzi'), 'stephen-rizzi');
ok('E Rizzi resolves', id('E Rizzi'), 'eddie-rizzi');
ok('two Farruggias -> ambiguous', id('Farruggia'), 'AMBIGUOUS');
ok('two Jonathans -> ambiguous', id('Jonathan'), 'AMBIGUOUS');
ok('Jonathan G. resolves', id('Jonathan G.'), 'jonathan-gottesmann');
ok('Jonathan M. resolves', id('Jonathan M.'), 'jonathan-mcmilleon');

// ambiguity must name the candidates, not silently pick
const amb = r.resolve('Jeff');
ok('ambiguous lists both', amb.candidates.sort(), ['Jeff Fein', 'Jeff Hersh']);

// --- genuinely unknown names must never be guessed into someone ---
ok('stranger is unknown', id('Bobby P'), 'UNKNOWN');
ok('empty is unknown', id(''), 'UNKNOWN');
ok('junk is unknown', id('---'), 'UNKNOWN');

// --- explicit aliases override everything, including ambiguity ---
const r2 = createResolver(ROSTER.map((p) =>
  p.name === 'Stephen Rizzi' ? { ...p, aliases: ['Steve R', 'Rizzi'] } : p));
ok('alias wins', r2.resolve('Steve R').id, 'stephen-rizzi');
ok('alias breaks a tie', r2.resolve('Rizzi').id, 'stephen-rizzi');

// --- team cell splitting, the shape seen in the real export ---
const t = r.resolveTeam('Vincent Cusumano & Karen P.');
ok('team splits on &', t.results.map((x) => x.id), ['vincent-cusumano', 'karen-polito']);
ok('team splits on +', r.resolveTeam('Rex Bunt + Jin Lei').results.map((x) => x.id), ['rex-bunt', 'jin-lei']);
ok('team splits on "and"', r.resolveTeam('Rex Bunt and Jin Lei').results.map((x) => x.id), ['rex-bunt', 'jin-lei']);
ok('unmatched partner reported', r.resolveTeam('Rex Bunt & Bobby P').results[1].unknown, 'Bobby P');

// duplicate aliases across players must be caught at build time, not at import
let threw = false;
try { createResolver([{ id: 'a', name: 'Ann A', aliases: ['x'] }, { id: 'b', name: 'Ben B', aliases: ['X'] }]); }
catch { threw = true; }
ok('conflicting alias throws', threw, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
