// Takes this week's DUPR club ratings reading into importer/live/dupr/<date>.tsv
// - the job the Wednesday Claude task did by hand.
//
// READ ONLY, inside Jay's own DUPR account. The only things this script does
// on DUPR: open the club page, click the club's Rankings/Ratings tab if the
// list isn't already showing, and turn the mouse wheel over the list. Any
// navigation away from the club page aborts the run. It never opens the
// avatar, profile, settings, Logout or Leave Club, never submits anything,
// and never calls api.dupr.com itself.
//
//   node vps/pull-dupr.mjs            # skips if the newest reading is < 5 days old
//   node vps/pull-dupr.mjs --force    # take a reading anyway (still checked)
//
// Exit 0 = saved or skipped, 1 = failed its checks, 3 = login expired.

import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { toTsv } from '../importer/duprpaste.mjs';
import { rowsFromLeaves, judge, extractItems } from './duprrows.mjs';
import { ROOT, PROFILES, LOGS, todayET, daysBetween, LOGIN_EXPIRED } from './lib.mjs';

const CLUB = 'https://dashboard.dupr.com/dashboard/browse/clubs/8246685522';
const DIR = `${ROOT}importer/live/dupr`;
const DENY = /logout|log out|sign out|leave|edit|settings|preferences|profile|delete|submit|add match|create/i;

const today = todayET();
const newest = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.tsv$/.test(f)).sort().pop()?.slice(0, 10);
if (!process.argv.includes('--force') && newest && daysBetween(newest, today) < 5) {
  console.log(`newest reading is ${newest}, under 5 days old - skipped`);
  console.log(JSON.stringify({ skipped: true, newest }));
  process.exit(0);
}

const ctx = await chromium.launchPersistentContext(`${PROFILES}/dupr`, {
  channel: 'chromium', headless: true, viewport: { width: 1400, height: 1000 },
});
const page = ctx.pages()[0] || await ctx.newPage();

let offPage = null;
page.on('framenavigated', (f) => {
  if (f !== page.mainFrame()) return;
  const u = f.url();
  if (!u.startsWith(CLUB) && !/dashboard\.dupr\.com\/login/.test(u) && u !== 'about:blank') offPage = u;
});

const done = async (code, summary) => {
  await ctx.close();
  console.log(JSON.stringify(summary));
  process.exit(code);
};

await page.goto(CLUB, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
if (/\/login/.test(page.url()) || await page.locator('input[type=password]').count()) {
  console.log('DUPR shows its login page - the saved sign-in has expired');
  await done(LOGIN_EXPIRED, { login: 'expired' });
}

// Keep a copy of the page for the parser's tests (stays in the server's logs
// folder, never in the repo).
const snapshot = async (tag) => {
  mkdirSync(LOGS, { recursive: true });
  writeFileSync(`${LOGS}/dupr-page-${today}-${tag}.html`, await page.content());
};

const playerLinks = () => page.locator('a[href*="/player/"]').count();
if (!(await playerLinks())) {
  const tab = page.getByText(/^(Rankings|Ratings)$/).first();
  if (await tab.count()) {
    const label = (await tab.innerText()).trim();
    if (DENY.test(label)) await done(1, { error: `refused to click "${label}"` });
    await tab.click();
    await page.waitForTimeout(4000);
  }
}
if (!(await playerLinks())) {
  await snapshot('no-list');
  console.log('could not find the Rankings list on the club page');
  await done(1, { error: 'no rankings list found' });
}

// The list loads 10 rows at a time and moves only for a real mouse wheel.
let last = 0, still = 0;
for (let step = 0; step < 120 && still < 4; step++) {
  if (offPage) await done(1, { error: `left the club page (${offPage}) - stopped` });
  const n = await playerLinks();
  const box = await page.locator('a[href*="/player/"]').nth(n - 1).boundingBox().catch(() => null);
  if (box) await page.mouse.move(box.x + box.width / 2, Math.max(5, Math.min(990, box.y)));
  for (let t = 0; t < 10; t++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(1200);
  const now = await playerLinks();
  const end = await page.getByText('No more results.').count();
  still = now === last ? still + 1 : 0;
  last = now;
  if (end && still >= 1) break;
}
if (offPage) await done(1, { error: `left the club page (${offPage}) - stopped` });

const items = await page.evaluate(extractItems);
await snapshot('list');

const { rows, problems } = rowsFromLeaves(items);
const rated = rows.filter((r) => r.rating !== null);
const verdict = judge(rows);
for (const p of problems) console.log('  PROBLEM:', p);
console.log(`read ${rows.length} players (${rated.length} rated), lowest ${verdict.floor}`);
if (!verdict.ok) {
  for (const f of verdict.fails) console.log('  CHECK FAILED:', f);
  await done(1, { error: verdict.fails.join('; '), read: rows.length });
}

// The site's reader wants a number in column two, so a member DUPR hasn't
// rated yet (NR) is left out of the file, as in every reading so far.
const body = toTsv(rated);
// Nothing moved since the last reading: save nothing, so nothing is published.
if (newest && newest !== today && readFileSync(`${DIR}/${newest}.tsv`, 'utf8') === body) {
  console.log(`identical to the ${newest} reading - nothing saved`);
  await done(0, { unchanged: true, newest });
}
writeFileSync(`${DIR}/${today}.tsv`, body);
console.log(`saved importer/live/dupr/${today}.tsv`);
await done(0, { saved: today, players: rated.length, floor: verdict.floor });
