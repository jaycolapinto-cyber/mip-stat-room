// Tests for the DUPR snapshot history, against a fixture directory so the real
// club readings in importer/live/dupr/ are never touched by a test run.
import { loadSnapshots, matchDupr } from './dupr.mjs';

const DIR = new URL('./fixtures/dupr-history/', import.meta.url);
let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const snaps = loadSnapshots(DIR);
t('snapshots load oldest first', snaps.map((s) => s.date).join() === '2026-08-01,2026-09-01');
t('each snapshot keeps its own rows', snaps[0].rows.length === 3 && snaps[1].rows.length === 3);

const roster = [
  { id: 'p1', name: 'Test Playerone' },
  { id: 'p2', name: 'Test Playertwo' },
  { id: 'p3', name: 'New Inseptember' },
  { id: 'p4', name: 'Gone Byaugust' },
];
const { ratings } = matchDupr(roster, DIR);

t('current rating comes from the NEWEST snapshot', ratings.get('p1').rating === 3.75);
t('asOf is the newest snapshot date', ratings.get('p1').asOf === '2026-09-01');
t('history is every reading, oldest first',
  JSON.stringify(ratings.get('p1').history) ===
  JSON.stringify([{ date: '2026-08-01', rating: 3.5 }, { date: '2026-09-01', rating: 3.75 }]));
t('a rating that fell is recorded as it fell, not smoothed',
  ratings.get('p2').history.map((h) => h.rating).join() === '4,3.88');

// A player who left the club is absent from the newest reading. They are not
// carried forward with a stale rating - they simply have no current rating.
t('a player missing from the newest reading has no entry at all', !ratings.has('p4'));

// A player who joined between readings has history only from the date they
// appeared. Nothing is back-filled to make the line start earlier.
t('a player who joined late has only the readings they appear in',
  ratings.get('p3').history.length === 1 && ratings.get('p3').history[0].date === '2026-09-01');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
