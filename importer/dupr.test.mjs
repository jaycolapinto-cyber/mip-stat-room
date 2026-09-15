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

/* ---------------------------------------- two accounts, one name, one reading
 *
 * This is the failure this project has already shipped once. DUPR lets two
 * accounts carry the same name - "Sal Farruggia" at 4.653 and "Sal farruggia"
 * at 3.354 are two different men, both members of this club, both present in
 * the same reading. Reading the history by name put the second man's rating on
 * the first man's chart, and it looked like a real 1.3-point collapse: a real
 * number, on a real date, with nothing out of place to notice.
 *
 * DUPR's own player id is the thing that tells them apart, so where both sides
 * have one, that is what is matched on.
 */
{
  const TWINS = new URL('./fixtures/dupr-twins/', import.meta.url);
  const r = matchDupr([{ id: 'sam', name: 'Sam Twinname' }, { id: 'other', name: 'Other Player' }], TWINS);
  const sam = r.ratings.get('sam');

  t('the player keeps their OWN account rating, not the namesake\'s', sam.rating === 4.653, String(sam.rating));
  t('and the namesake never lands in their history',
    !sam.history.some((h) => h.rating === 3.354), JSON.stringify(sam.history));
  t('history reads 4.650 then 4.653, a small rise and not a collapse',
    sam.history.map((h) => h.rating).join() === '4.65,4.653', JSON.stringify(sam.history));
  t('the second account is reported as a collision, never silently merged',
    r.collisions.length === 1 && /Sam twinname/.test(r.collisions[0]), JSON.stringify(r.collisions));
  t('and the reading is recorded as carrying an ambiguous name',
    r.ambiguousReadings.some((x) => x.startsWith('2026-09-01')), JSON.stringify(r.ambiguousReadings));
  t('an unaffected player in the same reading is untouched', r.ratings.get('other').rating === 3.01);

  // The id column is optional - the older two-column files still parse.
  const snaps = loadSnapshots(TWINS);
  t('a two-column reading still loads with no id', snaps[0].rows[0].duprId === undefined);
  t('and a four-column one carries the id and the match count',
    snaps[1].rows[0].duprId === '111111' && snaps[1].rows[0].played === 100);
}

/* ------------------------------- and when there is no id to tell them apart */
//
// A gap in a chart is the honest outcome. Guessing which of two same-named
// accounts a reading meant is how the wrong rating got published in the first
// place, so an older reading that cannot be resolved is simply skipped.
{
  const r = matchDupr([{ id: 'sam', name: 'Sam Twinname' }, { id: 'other', name: 'Other Player' }],
                      new URL('./fixtures/dupr-twins-noid/', import.meta.url));
  const sam = r.ratings.get('sam');
  t('an ambiguous reading with no ids is SKIPPED, not guessed',
    !sam.history.some((h) => h.date === '2026-10-01' && h.rating === 3.41), JSON.stringify(sam.history));
  // The newest reading is never re-derived, so the current rating is always the
  // last point on the chart however ambiguous that reading's names are.
  t('the current rating is still the end of the history',
    sam.history.at(-1).rating === sam.rating, `${sam.rating} vs ${JSON.stringify(sam.history.at(-1))}`);
  t('and that rating is this player\'s own', sam.rating === 4.72, String(sam.rating));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
