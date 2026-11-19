// node vps/webstandings.test.mjs - the web-page standings reader, offline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanName, cell, toSheetRows, toWorkbook, rowsOfWorkbook } from './webstandings.mjs';

const ok = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

ok('medals and SUB come off names', () => {
  assert.equal(cleanName('Jeff Hersh 🥇×2'), 'Jeff Hersh');
  assert.equal(cleanName('David Huber 🥇'), 'David Huber');
  assert.equal(cleanName('Paul Ilan SUB'), 'Paul Ilan');
  assert.equal(cleanName('Sal Farruggia Sr.'), 'Sal Farruggia Sr.');
});

ok('cells become numbers where they are numbers', () => {
  assert.equal(cell('52.1%'), 52.1);
  assert.equal(cell('+138'), 138);
  assert.equal(cell('-36'), -36);
  assert.equal(cell('–'), null);
  assert.equal(cell(''), null);
  assert.equal(cell('▲1'), '▲1');
});

// Saved from https://merrickinapickle.com/tuesday-nooners-standings on 2026-11-19.
const page = JSON.parse(readFileSync(new URL('./fixtures/web-tuesday-nooners-2026-11-19.json', import.meta.url)));
const rows = toSheetRows(page.lines, page.table);

ok('the sheet is title, week, header, players', () => {
  assert.deepEqual(rows[0], ['TUESDAY NOONERS']);
  assert.deepEqual(rows[1], ['Week 11']);
  assert.equal(rows[2][2], 'PLAYER');
  assert.equal(rows[2][14], 'GOLD');                     // "🥇 GOLD" loses its emoji
  assert.equal(rows.length, 3 + 32);
  const hersh = rows.find((r) => r[2] === 'Jeff Hersh');
  assert.equal(hersh[7], 56);                             // wins
  assert.equal(hersh[10], 65.1);                          // win %
  const romano = rows.find((r) => r[2] === 'Tony Romano');
  assert.equal(romano[18], undefined);                    // "Club Name Not Set" -> empty
});

ok('a saved workbook reads back equal (so unchanged days write nothing)', () => {
  assert.deepEqual(rowsOfWorkbook(toWorkbook(rows, 'Tuesday Nooners')), rows);
});

ok('a table without wins/losses is refused', () => {
  assert.throws(() => toSheetRows(['X'], [['A place', 'Pts'], ['1', '25']]), /rank/);
});

console.log('webstandings: all passed');
