// DUPR match-list paste parser.
//
// DUPR's club match list has no export button, but the rendered list selects
// and copies as plain text, one match per eight lines:
//
//     September 11, 2026        <- date
//     Jonathan Gottesmann       <- team 1, player 1
//     Jeffrey Fein              <- team 1, player 2
//     11                        <- team 1 score
//     Danielle Farruggia        <- team 2, player 1
//     Jason Vargas              <- team 2, player 2
//     6                         <- team 2 score
//     Match ID: L5LLOQRG5       <- DUPR's own id
//
// This is worth far more than the Scoreholio export despite carrying no court
// and no clock: DUPR holds each player's REAL NAME. Scoreholio holds whatever
// nickname the player typed, so "Chase Gold" and "L. Glods" have to be worked
// out. Here they are simply Sal Farruggia and Lauren Glodny.
//
// The parser is deliberately rigid. It walks the lines looking for that exact
// eight-line shape and refuses anything else rather than resynchronising on a
// best guess - a parser that silently shifts by one line would pair the wrong
// players with the wrong scores and produce a file that looks perfectly fine.
//
// SINGLES. The club also plays the occasional singles match, which renders as
// a SIX-line block - one name and one score per side:
//
//     March 18, 2026
//     Albert Rocaberte
//     15
//     Vincent Vizcarra
//     10
//     Match ID: W6GR99XJQ
//
// These are parsed and kept, but in their own `singles` list, never in `games`.
// The site models a doubles league: every record it computes - win rate,
// partnership, rivalry - assumes four players. Folding a singles result into
// that would quietly change a player's doubles record with a game that was
// never doubles. So singles are counted and reported, never merged, and never
// silently dropped either.
//
// The two shapes cannot be confused. A doubles block has a NAME where singles
// has its first score, and a singles block has no Match ID line where doubles
// expects one, so each shape fails the other's test outright.

import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('./live/dupr-matches/', import.meta.url);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'];

/** "September 11, 2026" -> "2026-09-11", or null if it is not a date line. */
export function parseDate(line) {
  const m = String(line).trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

const isScore = (s) => /^\d{1,2}$/.test(String(s).trim());
const matchId = (s) => (String(s).trim().match(/^Match ID:\s*(\S+)$/)?.[1] ?? null);

/**
 * @returns { games, singles, problems, skippedLines }
 */
export function parsePaste(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const games = [], singles = [], problems = [];
  let i = 0, skipped = 0;

  while (i < lines.length) {
    if (!lines[i]) { i++; continue; }
    const date = parseDate(lines[i]);
    if (!date) {
      // Header junk from the page ("Sort", "SinglesDoubles", "Clear Filters").
      skipped++; i++; continue;
    }
    const block = lines.slice(i + 1, i + 7);
    const id = matchId(lines[i + 7]);

    const shapeOk = block.length === 6
      && block[0] && block[1] && block[3] && block[4]
      && isScore(block[2]) && isScore(block[5])
      && id;

    if (!shapeOk) {
      // A six-line singles block is the one other shape we understand.
      const s1 = lines[i + 1], sc1 = lines[i + 2], s2 = lines[i + 3], sc2 = lines[i + 4];
      const sid = matchId(lines[i + 5]);
      if (s1 && s2 && isScore(sc1) && isScore(sc2) && sid) {
        const x = Number(sc1), y = Number(sc2);
        if (x === y) problems.push({ line: i + 3, why: `${sid} (singles) is tied ${x}-${y}` });
        else if (s1.toLowerCase() === s2.toLowerCase()) {
          problems.push({ line: i + 2, why: `${sid} (singles) lists ${s1} on both sides` });
        } else singles.push({ matchId: sid, date, a: [s1], b: [s2], sa: x, sb: y });
        i += 6;
        continue;
      }
      problems.push({ line: i + 1, why: `expected eight lines starting "${lines[i]}", got: ${JSON.stringify(lines.slice(i, i + 8))}` });
      i++;
      continue;
    }

    const a = [block[0], block[1]];
    const b = [block[3], block[4]];
    const sa = Number(block[2]), sb = Number(block[5]);

    if (sa === sb) problems.push({ line: i + 4, why: `${id} is tied ${sa}-${sb}` });
    else if (new Set([...a, ...b].map((n) => n.toLowerCase())).size !== 4) {
      problems.push({ line: i + 2, why: `${id} lists the same player twice: ${[...a, ...b].join(', ')}` });
    } else {
      games.push({ matchId: id, date, a, b, sa, sb });
    }
    i += 8;
  }

  return { games, singles, problems, skippedLines: skipped };
}

/** Every paste file, deduplicated on DUPR's own Match ID. */
export function readDuprMatches() {
  let files;
  try { files = readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort(); }
  catch { return { games: [], problems: [], files: [], duplicates: 0 }; }

  const seen = new Map();
  const seenSingles = new Map();
  const problems = [];
  let duplicates = 0;

  for (const f of files) {
    const r = parsePaste(readFileSync(new URL(f, DIR), 'utf8'));
    problems.push(...r.problems.map((p) => ({ ...p, file: f })));
    for (const g of r.games) {
      if (seen.has(g.matchId)) { duplicates++; continue; }
      seen.set(g.matchId, { ...g, file: f });
    }
    for (const g of r.singles) {
      if (seenSingles.has(g.matchId)) { duplicates++; continue; }
      seenSingles.set(g.matchId, { ...g, file: f });
    }
  }

  const byDate = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  const games = [...seen.values()].sort(byDate);
  const singles = [...seenSingles.values()].sort(byDate);
  return { games, singles, problems, files, duplicates };
}

if (process.argv[1]?.endsWith('duprmatches.mjs')) {
  const r = readDuprMatches();
  const days = [...new Set(r.games.map((g) => g.date))].sort();
  const names = new Map();
  for (const g of r.games) for (const n of [...g.a, ...g.b]) names.set(n, (names.get(n) ?? 0) + 1);

  console.log(`files      : ${r.files.join(', ')}`);
  console.log(`games      : ${r.games.length}   (duplicate Match IDs dropped: ${r.duplicates})`);
  console.log(`dates      : ${days.length} days, ${days[0]} to ${days[days.length - 1]}`);
  for (const d of days) console.log(`   ${d}  ${r.games.filter((g) => g.date === d).length}`);
  console.log(`players    : ${names.size}`);
  if (r.singles.length) {
    const sd = [...new Set(r.singles.map((g) => g.date))].sort();
    const sn = new Set(r.singles.flatMap((g) => [...g.a, ...g.b]));
    console.log(`singles    : ${r.singles.length} kept aside (not doubles) - ${sn.size} players on ${sd.length} day(s): ${sd.join(', ')}`);
  }
  if (r.problems.length) {
    console.log(`\nPROBLEMS (${r.problems.length}):`);
    r.problems.slice(0, 20).forEach((p) => console.log(`  ${p.file}:${p.line} ${p.why}`));
  } else console.log('\nno problems');
}
