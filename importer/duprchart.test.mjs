// Tests for the DUPR rating panel's arithmetic and its refusals.
//
// The refusals are the point. This panel puts a number and an arrow in front of
// a player about their own rating, and the temptation in every direction is to
// say slightly more than the data supports: call a two-week span "the last
// month", draw a trend line through a single point, carry a missing reading
// forward as if it were flat. Each of those is a small lie in a shape people
// trust, so each one has a test.

import { movement, readingAgo, duprPanel } from '../dist/duprchart.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };
const H = (...rows) => rows.map(([date, rating]) => ({ date, rating }));

/* ------------------------------------------------------------- no movement */
t('a single reading is not a trend', movement(H(['2026-09-12', 4.0])) === null);
t('no readings at all is null', movement([]) === null);
t('and null history does not throw', movement(undefined) === null);

/* --------------------------------------------------------------- the maths */
{
  const m = movement(H(['2026-08-01', 4.000], ['2026-09-12', 4.200]));
  t('delta is newest minus the compared reading', Math.abs(m.delta - 0.2) < 1e-9, String(m.delta));
  t('percent is of the rating, not of the delta', Math.abs(m.pct - 5) < 1e-9, String(m.pct));
  t('a span over 28 days is called the last month', m.label === 'in the last month', m.label);
}
{
  const d = movement(H(['2026-08-01', 4.300], ['2026-09-12', 4.100]));
  t('a fall is negative in both delta and percent', d.delta < 0 && d.pct < 0, JSON.stringify([d.delta, d.pct]));
}

/* ------------------------------------------- never claim a span we not have */
{
  const s = movement(H(['2026-09-05', 4.000], ['2026-09-12', 4.100]));
  t('a seven-day span is described in days, never as a month', /7 days/.test(s.label), s.label);
  t('readingAgo refuses when no reading is that old',
    readingAgo(H(['2026-09-10', 4], ['2026-09-12', 4.1]), 28) === null);
  // 2026-08-20 is only 23 days before 09-12, so it is NOT 28 days old; the
  // newest reading that IS old enough is 07-01.
  t('readingAgo takes the newest reading that is genuinely old enough',
    readingAgo(H(['2026-07-01', 4], ['2026-08-20', 4.05], ['2026-09-12', 4.1]), 28)?.date === '2026-07-01');

  // And that is exactly where "in the last month" goes wrong: the only earlier
  // reading is 73 days back, so this is a 73-day move, not a monthly one.
  const sparse = movement(H(['2026-07-01', 4.000], ['2026-08-20', 4.050], ['2026-09-12', 4.100]));
  t('a 73-day gap is NOT called "the last month"',
    sparse.label === 'over 73 days', `${sparse.label} (${sparse.spanDays}d)`);

  // A genuine month still gets the friendly phrasing.
  const monthly = movement(H(['2026-08-12', 4.000], ['2026-09-12', 4.100]));
  t('a real month is called the last month', monthly.label === 'in the last month', monthly.label);
}

/* ------------------------------------------------------------ messy inputs */
{
  const o = movement([{ date: '2026-09-12', rating: 4.2 }, { date: '2026-08-01', rating: 4.0 },
                      { date: '2026-08-15', rating: null }, { date: '2026-08-20' }]);
  t('unsorted readings are sorted and junk ones dropped', Math.abs(o.delta - 0.2) < 1e-9, JSON.stringify(o));
}

/* ------------------------------------------------------------- the rendering */
{
  const one = duprPanel({ rating: 4.449, duprName: 'Bobby Player', asOf: '2026-09-12',
    history: H(['2026-09-12', 4.449]) });
  t('a single reading renders the number', one.includes('4.449'));
  t('and draws NO chart', !one.includes('<svg'));
  t('and no arrow that would imply a direction', !/▲|▼/.test(one));
  // No explanatory prose on the page any more - Jay's call. The panel is the
  // number and, when there is history, the chart. So the test is that it stays
  // SILENT rather than that it explains itself.
  t('and adds no explanatory prose', !/One reading so far|chart starts/.test(one));
  t('and renders nothing but the number', one.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim() === 'DUPR rating doubles 4.449');

  const many = duprPanel({ rating: 4.653, duprName: 'Sal Farruggia', asOf: '2026-09-12',
    history: H(['2026-07-01', 4.402], ['2026-08-09', 4.551], ['2026-09-12', 4.653]) });
  t('two or more readings draw a chart', many.includes('<svg'));
  t('with an arrow', /▲/.test(many));
  t('and the exact numbers in a table, not colour alone', /<table/.test(many) && many.includes('4.402'));
  t('the chart is labelled for a screen reader', /aria-label="Rating from/.test(many));

  t('a player with no DUPR rating gets no panel at all', duprPanel(null) === '');
  t('and neither does one with a missing rating', duprPanel({ duprName: 'x' }) === '');
}

/* -------------------------------------------------- a flat run is drawn flat */
{
  const flat = duprPanel({ rating: 4.2, duprName: 'Flat', asOf: '2026-09-12',
    history: H(['2026-08-01', 4.2], ['2026-09-12', 4.2]) });
  t('an unchanged rating draws without dividing by zero', flat.includes('<svg'));
  t('and shows no arrow, because nothing moved', !/▲|▼/.test(flat));
}

/* --------------------------------------------------- the name is not trusted */
{
  const nasty = duprPanel({ rating: 4.2, duprName: '<script>alert(1)</script>', asOf: '2026-09-12',
    history: H(['2026-08-01', 4.1], ['2026-09-12', 4.2]) });
  // The name is no longer printed at all now the footnote is gone, so the
  // property is simply that nothing from the source reaches the page as markup.
  t('nothing from a DUPR display name reaches the page as markup',
    !nasty.includes('<script>') && !/alert\(1\)/.test(nasty));
}


/* ------------------------------------------ a rating Scoreholio merely stored */
//
// Most of the club never joined the MIP club on DUPR, so the only rating that
// exists for them anywhere we can reach is the copy Scoreholio keeps. It is
// accurate but it does not move, so it must never become a chart - and the page
// has to say where it came from, which is the whole difference between "your
// rating" and "the rating Scoreholio has on file for you".
{
  const sh = duprPanel({ rating: 3.642, duprName: 'Eddie Rizzi', asOf: '2026-09-07',
    source: 'scoreholio', history: H(['2026-09-07', 3.642]) });
  t('a Scoreholio rating still shows the number', sh.includes('3.642'));
  t('and draws no chart', !sh.includes('<svg'));
  t('and says nothing about where it came from', !/Scoreholio|club listing/.test(sh));

  // Even with several sightings it is one cached number, not a series.
  const shMany = duprPanel({ rating: 3.642, duprName: 'Eddie Rizzi', asOf: '2026-09-07',
    source: 'scoreholio', history: H(['2026-01-02', 3.642], ['2026-05-01', 3.642], ['2026-09-07', 3.642]) });
  t('and refuses a chart even with many identical sightings', !shMany.includes('<svg'));

  // A real club reading must look different, and keep its chart.
  const real = duprPanel({ rating: 4.653, duprName: 'Sal Farruggia', asOf: '2026-09-12',
    source: 'dupr', history: H(['2026-08-01', 4.5], ['2026-09-12', 4.653]) });
  t('a real club reading still charts', real.includes('<svg'));
  t('and is equally silent', !/club listing|Not calculated/.test(real));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
