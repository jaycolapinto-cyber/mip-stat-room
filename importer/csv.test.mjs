// Tests for the CSV importer. The point of these is not that a good file reads
// correctly - it is that a BAD file is refused loudly and specifically, since a
// misread column produces a complete, plausible, entirely wrong season.
import { parseCsv, detectColumns, readDate, readCsv } from './csv.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const dir = mkdtempSync(join(tmpdir(), 'csvtest-'));
const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };

/* parsing */
t('quoted field with a comma stays one field',
  parseCsv('a,b\n"one, two",3')[1][0] === 'one, two');
t('doubled quote becomes one quote',
  parseCsv('a\n"he said ""hi"""')[1][0] === 'he said "hi"');
t('blank lines are dropped', parseCsv('a,b\n\n1,2\n').length === 2);
t('a BOM does not corrupt the first header', parseCsv('﻿date,x\n1,2')[0][0] === 'date');
t('tabs work as a separator too', parseCsv('a\tb\n1\t2')[1].length === 2);

/* dates */
t('ISO date', readDate('2026-09-11') === '2026-09-11');
t('ISO datetime', readDate('2026-09-11T13:04:00Z') === '2026-09-11');
t('US slash date', readDate('9/11/2026') === '2026-09-11');
t('two-digit year', readDate('9/11/26') === '2026-09-11');
t('unix seconds', readDate('1789131484') === '2026-09-11');
t('nonsense date is null, not today', readDate('sometime last week') === null);
t('empty date is null', readDate('') === null);

/* detection */
const d1 = detectColumns(['Date', 'Team 1 Player 1', 'Team 1 Player 2', 'Team 2 Player 1', 'Team 2 Player 2', 'Team 1 Score', 'Team 2 Score']);
t('four-player layout detected', d1.shape === 'four-player-columns' && d1.scores === 'two-score-columns');
const d2 = detectColumns(['date', 'team a', 'team b', 'score']);
t('two-team layout detected', d2.shape === 'two-team-columns' && d2.scores === 'one-combined-score');
const d3 = detectColumns(['foo', 'bar']);
t('unreadable header is refused, not guessed', d3.shape === null && d3.problems.length >= 2);

// "Team 1 Score" must not be captured by the plain "score" role, or side A's
// score would be read as the combined score and side B's ignored.
const d4 = detectColumns(['Team 1', 'Team 2', 'Team 1 Score', 'Team 2 Score']);
t('a specific score column is not stolen by the generic one',
  d4.scores === 'two-score-columns' && d4.map.score === undefined);

// A missing date is a note, not a fatal error - undated games are allowed.
t('a missing date column is a note, not fatal',
  detectColumns(['team 1', 'team 2', 'score']).problems.every((p) => !p.startsWith('Cannot')));

/* reading */
const roster = { Ann: 'ann', Ben: 'ben', Cat: 'cat', Dan: 'dan' };
const resolve = (n) => roster[n] ?? null;

const good = write('good.csv', 'date,team 1,team 2,score\n2026-09-11,Ann & Ben,Cat & Dan,11-6\n');
const g = readCsv(good, resolve);
t('a clean row reads', g.games.length === 1 && g.skipped.length === 0);
t('teams land on the right side', g.games[0].a.join() === 'ann,ben' && g.games[0].b.join() === 'cat,dan');
t('scores land on the right side', g.games[0].sa === 11 && g.games[0].sb === 6);

const bad = write('bad.csv',
  'date,team 1,team 2,team 1 score,team 2 score\n'
  + '2026-09-11,Ann & Ben,Cat & Dan,11,11\n'          // tie
  + '2026-09-11,Ann,Cat & Dan,11,4\n'                 // one player
  + '2026-09-11,Ann & Zoe,Cat & Dan,11,4\n'           // unknown name
  + '2026-09-11,Ann & Ann,Cat & Dan,11,4\n'           // same player twice
  + '2099-01-01,Ann & Ben,Cat & Dan,11,4\n'           // future
  + '2026-09-11,Ann & Ben,Cat & Dan,99,4\n'           // impossible score
  + '2026-09-11,Ann & Ben,Cat & Dan,eleven,4\n');     // non-numeric
const b = readCsv(bad, resolve);
t('every bad row is skipped, none imported', b.games.length === 0 && b.skipped.length === 7);
t('a tie is named as a tie', /tied/.test(b.skipped[0].reason));
t('an unknown name is reported, not guessed at',
  b.unresolved.length === 1 && b.unresolved[0].name === 'Zoe');
t('every skip carries its line number', b.skipped.every((s) => Number.isInteger(s.line) && s.line >= 2));

// The headline safety property: one broken row never takes the good ones with it.
const mixed = write('mixed.csv',
  'date,team 1,team 2,score\n'
  + '2026-09-11,Ann & Ben,Cat & Dan,11-6\n'
  + '2026-09-11,Ann & Ben,Cat & Dan,11-11\n'
  + '2026-09-11,Cat & Dan,Ann & Ben,11-8\n');
const m = readCsv(mixed, resolve);
t('good rows survive a bad one', m.games.length === 2 && m.skipped.length === 1);

let threw = false;
try { readCsv(write('hopeless.csv', 'foo,bar\n1,2\n'), resolve); } catch { threw = true; }
t('an unreadable file throws rather than importing nothing silently', threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
