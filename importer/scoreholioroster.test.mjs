import { buildFrom, displayToRealName } from './scoreholioroster.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};
const ok = (c, what) => { if (c) pass++; else { fail++; console.log(`FAIL ${what}`); } };

const T = (players, name = 'T', ts = 1700000000) => ({ n: name, ts, p: players });

// ------------------------------------------------------- the basic job
{
  const b = buildFrom({ t1: T([['Gregg D.', 'Gregg Dukofsky', 3.245, 'u1']]) });
  is(b.players.length, 1, 'one player read');
  is(b.players[0].names, ['Gregg Dukofsky'], 'real name kept');
  is(b.players[0].displays, ['Gregg D.'], 'display name kept');
  is(displayToRealName(b).get('gregg d.'), 'Gregg Dukofsky', 'display resolves to the real name');
}

// ------------------------------------------------------- THE TRAP
// Two different men in one roster whose display names both reduce to "Rob S.".
// They must stay two people. This is the case that motivated the whole file.
{
  const b = buildFrom({ t1: T([
    ['Rob S.', 'Rob Sarraga', -999, 'u1'],
    ['Robert S.', 'Robert Seidner', -999, 'u2'],
  ]) });
  is(b.players.length, 2, 'two user ids are two people');
  is(b.conflicts, [], 'different display names are not a conflict');
  is(displayToRealName(b).get('rob s.'), 'Rob Sarraga', 'each resolves to its own man');
  is(displayToRealName(b).get('robert s.'), 'Robert Seidner', 'and the other to his');
}

// The genuinely dangerous case: ONE display name, TWO people.
{
  const b = buildFrom({
    t1: T([['Mike B.', 'Mike Breitinger', 3.1, 'u1']]),
    t2: T([['Mike B.', 'Michael Bellini', 3.4, 'u2']]),
  });
  is(b.players.length, 2, 'still two people');
  is(b.conflicts.length, 1, 'the shared display name is reported');
  ok(!displayToRealName(b).has('mike b.'), 'and is NOT resolved to either of them');
}

// ------------------------------------------------------- identity is the id
{
  // Same person, changed their display name between seasons.
  const b = buildFrom({
    t1: T([['Chase Gold', 'Sal Farruggia', 4.6, 'u1']], 'old', 1600000000),
    t2: T([['Sal F.', 'Sal Farruggia', 4.65, 'u1']], 'new', 1700000000),
  });
  is(b.players.length, 1, 'one id is one person across seasons');
  is(b.players[0].displays.sort(), ['Chase Gold', 'Sal F.'], 'both display names kept');
  const m = displayToRealName(b);
  is(m.get('chase gold'), 'Sal Farruggia', 'the old handle resolves');
  is(m.get('sal f.'), 'Sal Farruggia', 'and so does the new one');
}
{
  // Same display AND same real name, but two ids - two people who happen to share a name.
  const b = buildFrom({ t1: T([
    ['Jeff F.', 'Jeff Fein', 3.5, 'u1'],
    ['Jeff F.', 'Jeff Fein', 3.5, 'u2'],
  ]) });
  is(b.players.length, 2, 'two ids stay two people even with identical names');
  is(b.conflicts, [], 'identical names are not a name conflict');
  is(displayToRealName(b).get('jeff f.'), 'Jeff Fein', 'the name still resolves - it is the same string either way');
}

// ------------------------------------------------------- ratings
{
  const b = buildFrom({ t1: T([
    ['A', 'Ann Alvarez', -999, 'u1'],
    ['B', 'Ben Brody', -1, 'u2'],
    ['C', 'Cass Chen', 0, 'u3'],
    ['D', 'Dana Doyle', 3.873, 'u4'],
    ['E', 'Eli Ellis', 9.9, 'u5'],
  ]) });
  const r = Object.fromEntries(b.players.map((p) => [p.names[0], p.rating]));
  is(r['Ann Alvarez'], null, '-999 is not a rating');
  is(r['Ben Brody'], null, '-1 is not a rating');
  is(r['Cass Chen'], null, 'zero is not a rating');
  is(r['Dana Doyle'], 3.873, 'a real rating is kept');
  is(r['Eli Ellis'], null, 'a rating outside DUPR range is refused');
}
{
  // Rosters are read oldest first, so the newest reading should win.
  const b = buildFrom({
    a: T([['X', 'Xander Quill', 3.0, 'u1']], 'older', 1600000000),
    b: T([['X', 'Xander Quill', 3.5, 'u1']], 'newer', 1700000000),
  });
  is(b.players[0].rating, 3.5, 'the most recent rating wins');
}

// ------------------------------------------------------- robustness
{
  const b = buildFrom({ t1: { n: 'broken' } });
  is(b.players.length, 0, 'a tournament with no player list yields no players');
  ok(b.problems.length === 1, 'and is reported');
}
{
  const b = buildFrom({});
  is(b.players.length, 0, 'empty input is not an error');
  is(b.conflicts, [], 'and has no conflicts');
}
{
  // No user id: fall back to the real name so the row is not silently dropped.
  const b = buildFrom({ t1: T([['Solo', 'Solo Person', 3.2, '']]) });
  is(b.players.length, 1, 'a row with no user id still counts');
  is(displayToRealName(b).get('solo'), 'Solo Person', 'and still resolves');
}
{
  const b = buildFrom({ t1: T([['  Spacey  ', '  Spacey Person  ', 3.2, 'u1']]) });
  is(b.players[0].names, ['Spacey Person'], 'names are trimmed');
  is(b.players[0].displays, ['Spacey'], 'displays are trimmed');
}
{
  const b = buildFrom({ t1: T([['Case', 'Case Person', 3.2, 'u1']]) });
  is(displayToRealName(b).get('case'), 'Case Person', 'lookup is case-insensitive');
  ok(!displayToRealName(b).has('Case'), 'the map is keyed lowercase');
}

// ------------------------------------------------------- tournament ordering
{
  const b = buildFrom({
    late: T([['A', 'A A', 3, 'u1']], 'late', 1700000000),
    early: T([['B', 'B B', 3, 'u2']], 'early', 1600000000),
  });
  is(b.tournaments.map((t) => t.name), ['early', 'late'], 'tournaments come back oldest first');
}


/* ============================ the session-roster merge ====================
 * Two TSVs of the same shape are merged, later file winning. The later one is
 * the tournament Admin screen's Players/Teams tab, which names players the
 * organizer-modal roster left blank - that is what finally resolved the last
 * stragglers. Two rules carry the weight and both are easy to break silently.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessionRosters as readSessions, nameInSession as inSession } from './scoreholioroster.mjs';

const dir = mkdtempSync(join(tmpdir(), 'mip-'));
const tsv = (name, rows) => { const p = join(dir, name); writeFileSync(p, rows.map((r) => r.join('\t')).join('\n')); return p; };

{
  // RULE 1: a "full name" that merely echoes the display name is a blank.
  // Scoreholio writes the handle into both columns when nobody filled the real
  // name in. Treating that as a name puts "Lauren G." on the site as a person.
  // ONE echo row only. With two differently-spelled echoes the lookup would
  // return null anyway - because two names for one handle is unresolvable - and
  // the test would pass whether or not the filter existed. One row makes the
  // filter the only thing standing between us and a player called "Lauren G".
  const f = tsv('echo.tsv', [
    ['T1', 'Lauren G.', 'Lauren G'],        // echo - not a name
    ['T1', 'Jim D.', 'Jim Duffy'],          // a real name
  ]);
  const s = readSessions([f]);
  is(inSession(s, 'T1', 'Jim D.'), 'Jim Duffy', 'a real name is kept');
  is(inSession(s, 'T1', 'Lauren G.'), null, 'a name that echoes the handle is treated as blank');

  // The same, with the punctuation and case differing - still an echo.
  const f2 = tsv('echo2.tsv', [['T1', 'Christie S.', 'christie s']]);
  is(inSession(readSessions([f2]), 'T1', 'Christie S.'), null,
    'an echo differing only in case or trailing period is still blank');
}

{
  // RULE 2: resolution is PER TOURNAMENT. The same handle is genuinely
  // different people on different nights, and a global answer would be wrong
  // on one set or the other.
  const f = tsv('pert.tsv', [
    ['T1', 'Michael S.', 'Michael Scancarello'],
    ['T2', 'Michael S.', 'Michael Spezio'],
  ]);
  const s = readSessions([f]);
  is(inSession(s, 'T1', 'Michael S.'), 'Michael Scancarello', 'night one resolves to its own man');
  is(inSession(s, 'T2', 'Michael S.'), 'Michael Spezio', 'night two resolves to the other');
  is(inSession(s, 'T3', 'Michael S.'), null, 'a night with no roster resolves to nobody');
}

{
  // Two names for one handle WITHIN one tournament is unresolvable, and must
  // stay that way - this is the 2025-12-04 case where both Michaels played.
  const f = tsv('both.tsv', [
    ['T1', 'Michael S.', 'Michael Scancarello'],
    ['T1', 'Michael S.', 'Michael Spezio'],
  ]);
  is(inSession(readSessions([f]), 'T1', 'Michael S.'), null,
    'both men on one roster under one handle resolves to nobody');
}

{
  // Merging: the later file supplies what the earlier one left blank, and the
  // earlier file's real names survive where the later one is silent.
  const a = tsv('a.tsv', [['T1', 'David A.', 'David A'], ['T1', 'Ken K.', 'Ken Kastenbaum']]);
  const b = tsv('b.tsv', [['T1', 'David A.', 'David Amatulli']]);
  const s = readSessions([a, b]);
  is(inSession(s, 'T1', 'David A.'), 'David Amatulli', 'the richer file fills a blank');
  is(inSession(s, 'T1', 'Ken K.'), 'Ken Kastenbaum', 'and does not erase what the first file knew');
}

{
  const f = tsv('junk.tsv', [['T1', 'Player 3 P.', 'Player 3 Player'], ['T1', 'Aaa B.', 'Aaa Bbb']]);
  const s = readSessions([f]);
  is(inSession(s, 'T1', 'Player 3 P.'), null, 'Scoreholio filler is not a person');
  is(inSession(s, 'T1', 'Aaa B.'), null, 'nor is a dummy roster row');
}

{
  // An account that never filled in its name fields comes back from Scoreholio
  // as the words "No First No Last". It shipped as a player with six games and
  // it was two different accounts' games pooled under one invented person, so
  // the words get refused however they are spaced or cased.
  const f = tsv('nofirst.tsv', [
    ['T1', 'Peter Grawehr', 'No First No Last'],
    ['T1', 'Mike B', 'no first no last'],
    ['T1', 'Rae C.', 'NoFirst NoLast'],
    ['T1', 'Sam D.', 'Sam Dougherty'],
  ]);
  const s = readSessions([f]);
  is(inSession(s, 'T1', 'Peter Grawehr'), null, 'an empty Scoreholio name is not a name');
  is(inSession(s, 'T1', 'Mike B'), null, 'and lowercase is the same empty name');
  is(inSession(s, 'T1', 'Rae C.'), null, 'and so is the unspaced form');
  is(inSession(s, 'T1', 'Sam D.'), 'Sam Dougherty', 'a real name beside them still reads');
}

{
  is(readSessions([join(dir, 'nope.tsv')]).size, 0, 'a missing file is not an error');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
