// The DUPR reader against a real copy of the club Rankings list (taken on the
// first supervised run, 2026-10-16), in a real browser - the same extractor
// pull-dupr.mjs runs on the live page. If DUPR changes its layout, save a new
// copy from /home/mipstats/logs/dupr-page-*-list.html and update this test.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { executablePath } from '../build/chrome.mjs';
import { extractItems, rowsFromLeaves, judge } from './duprrows.mjs';

let pass = 0, fail = 0;
const is = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++; console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`);
};

const b = await chromium.launch({ executablePath });
const page = await b.newPage();
await page.route('**/*', (r) => r.abort());
await page.setContent(readFileSync(new URL('./fixtures/dupr-club-list-2026-10-16.html', import.meta.url), 'utf8'));
const { rows, problems } = rowsFromLeaves(await page.evaluate(extractItems));
await b.close();

const v = judge(rows);
is(problems, [], 'no problem rows');
is(rows.length, 370, 'all 370 members read');
is(v.ok, true, 'the reading passes every check');
is(v.floor, 2.798, 'lowest rating');
is(rows[0], { rank: 1, name: 'Laura Zitzloff', duprId: '6191566621', matches: 80, rating: 4.69 }, 'badge 80 and rating 4.690 read apart');
is(rows[1].name + ' ' + rows[1].rating, 'Sal Farruggia 4.67', 'second row');

console.log(`\n${pass} passed, ${fail} failed   (DUPR page reader)`);
if (fail) process.exit(1);
