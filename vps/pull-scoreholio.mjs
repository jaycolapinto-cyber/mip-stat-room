// Pulls finished league nights from Scoreholio into importer/live/exports/
// (the match log) and importer/live/scoreholio-roster/ (who each nickname was
// that night) - the job the Mon/Tue/Fri Claude task did by hand.
//
// THIS RUNS INSIDE DAVE'S ORGANIZER ACCOUNT - the live control panel of a
// league being played. So it is written as a short list of things it may do,
// and everything else stops the run:
//
//   organizer page:  click Past (only after reading that Upcoming is showing),
//                    open a row that the Past list says is a finished night,
//                    click Admin in that night's menu (after checking the
//                    menu's title is that night)
//   admin tab:       click Stats & Logs, Match Log and Player Roster;
//                    press Export to CSV inside the Match Log table
//
// Never Upcoming, Edit, Clone, Make Template, Announce, Advance Game, Pause,
// Settings, Options, Import, Start Tournament, Ban, or any other control.
// Never reloads an admin tab (a reload lands on the Round Robin controls);
// closes it and reopens from Past instead. Reads Player Roster for display
// name -> first + last name only; playerEmail is never read or kept.
// (Plan said Players/Teams; Player Roster in Stats & Logs carries the same
// names, read-only, and Players/Teams drew only 16 of 18 rows - checked on
// 2026-10-16 against Carpenters Pub Week 4.)
//
//   node vps/pull-scoreholio.mjs                 # every new finished night
//   MIP_SH_TEST=<gameid>[,<gameid>] node vps/pull-scoreholio.mjs
//        # practice: pull that one night (even if the site has it) into
//        # /home/mipstats/logs/sh-test/ and compare - never into the repo
//
// Exit 0 = done (maybe nothing new), 1 = something failed, 3 = login expired.
// The last line of output is a JSON summary for run.sh.

import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { ROOT, PROFILES, LOGS, todayET, daysBetween, LOGIN_EXPIRED } from './lib.mjs';
import { checkMatchLog } from './matchlog.mjs';

const ORGANIZER = 'https://app.scoreholio.com/v2/pickleball/organizer';
const EXPORTS = `${ROOT}importer/live/exports`;
const ROSTER = `${ROOT}importer/live/scoreholio-roster/mip-vps-playersteams.tsv`;
const MAX_AGE_DAYS = 14;          // older gaps are a person's job, not a nightly retry
const TEST_IDS = (process.env.MIP_SH_TEST || "").split(",").filter(Boolean);
const TEST_ID = TEST_IDS.join(",");
const OUT = TEST_ID ? `${LOGS}/sh-test` : EXPORTS;

// Exact labels the script may click. Anything else is refused.
const ALLOW = new Set(['Past', 'Admin', 'Stats & Logs', 'Match Log', 'Player Roster', 'Export to CSV']);
// Checked against the real text of every element before it is clicked,
// including the allowed ones, so a relabelled button can't slip through.
const DENY = /upcoming|edit|clone|template|announce|advance|pause|setting|option|import|start|ban\b|move all|randomi[sz]e|disband|remove|delete|submit|add\b|create|finish|reset|undo|kiosk|remote/i;

class Stop extends Error {}
const stop = (why) => { throw new Stop(why); };

/** Click one element whose text must be exactly `label`, after both checks. */
async function guardedClick(loc, label) {
  if (!ALLOW.has(label)) stop(`refused: "${label}" is not on the allow-list`);
  const n = await loc.count();
  if (n !== 1) stop(`expected exactly one "${label}" to click, found ${n}`);
  // textContent, not innerText: styling shows "Past" as PAST.
  const text = (await loc.evaluate((e) => e.textContent)).trim();
  if (text !== label) stop(`refused: element reads "${text}", expected "${label}"`);
  if (DENY.test(text) && label !== 'Export to CSV') stop(`refused: "${text}" matches the deny-list`);
  await loc.click();
}

// ------------------------------------------------------------ what we have
function haveIds() {
  const have = new Set();
  for (const f of readdirSync(EXPORTS)) {
    const m = /^Matchlog-(.+)\.csv$/.exec(f);
    if (m) { have.add(m[1]); continue; }
    if (f.endsWith('.txt')) {
      for (const line of readFileSync(`${EXPORTS}/${f}`, 'utf8').split('\n')) {
        if (line.startsWith('##### TOURNAMENT')) have.add(line.slice(17).split(/\s/)[0]);
      }
    }
  }
  return have;
}

const dateET = (unix) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Number(unix) * 1000));

// ------------------------------------------------------------ the browser
const ctx = await chromium.launchPersistentContext(`${PROFILES}/scoreholio`, {
  channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, acceptDownloads: false,
});
const page = ctx.pages()[0] || await ctx.newPage();
page.on('crash', () => console.log('  (browser page crashed)'));
page.on('close', () => console.log('  (browser page closed)'));
const summary = { nights: [], failed: [], games: 0 };
let tabsExpected = 0;             // Admin opens exactly one tab; any other tab stops the run
let offRoute = null;

ctx.on('page', (p) => {
  if (tabsExpected > 0) { tabsExpected--; return; }
  offRoute = offRoute || `unexpected new tab ${p.url()}`;
});
page.on('framenavigated', (f) => {
  if (f === page.mainFrame() && !f.url().startsWith(ORGANIZER) && f.url() !== 'about:blank') offRoute = offRoute || `organizer page went to ${f.url()}`;
});

const finish = async (code, extra = {}) => {
  await ctx.close().catch(() => {});
  console.log(JSON.stringify({ ...summary, ...extra }));
  process.exit(code);
};

try {
  await page.goto(ORGANIZER, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  if (await page.locator('input[type=password]').count() || await page.getByText(/^\s*LOGIN\s*$/i).count()) {
    console.log('Scoreholio shows its login page - the saved sign-in has expired');
    await finish(LOGIN_EXPIRED, { login: 'expired' });
  }

  const pastSelected = () => page.locator('button.QuickToggleButton .quickToggleSelector')
    .evaluate((e) => e.classList.contains('quickToggleSelected'));
  const ensurePast = async () => {
    if (await pastSelected()) return;
    // The toggle is ONE button that flips; click only while Upcoming shows.
    await guardedClick(page.locator('button.QuickToggleButton span', { hasText: /^Past$/ }), 'Past');
    await page.waitForTimeout(4000);
    if (!(await pastSelected())) stop('could not switch the list to Past');
  };
  await ensurePast();

  // Every Past row's data straight from the list's own grid - no row opened.
  const list = await page.evaluate(() => {
    const root = document.querySelector('.ag-root-wrapper');
    const key = root && Object.keys(root).find((k) => k.startsWith('__reactFiber'));
    let api = null; const seen = new Set();
    const look = (o, d) => { if (!o || typeof o !== 'object' || seen.has(o) || d > 4 || api) return; seen.add(o);
      if (typeof o.forEachNode === 'function' && typeof o.getDataAsCsv === 'function') { api = o; return; }
      // Stored values only: never call a getter, which could run page code.
      for (const k of Object.keys(o)) {
        const desc = Object.getOwnPropertyDescriptor(o, k);
        if (desc && 'value' in desc) look(desc.value, d + 1);
      } };
    for (let f = key && root[key]; f && !api; f = f.return) { look(f.memoizedProps, 0); look(f.stateNode, 0); }
    if (!api) return null;
    const rows = []; api.forEachNode((n) => rows.push({ id: n.data.gameid, t: n.data.gametime, name: n.data.name, rowId: n.id }));
    return rows;
  });
  if (!list?.length) stop('could not read the Past list');

  const today = todayET();
  const have = haveIds();
  let todo = list
    .map((r) => ({ ...r, date: dateET(r.t) }))
    .filter((r) => r.id && r.date < today && daysBetween(r.date, today) <= MAX_AGE_DAYS && !have.has(r.id));
  if (TEST_IDS.length) {
    todo = TEST_IDS.map((id) => {
      const r = list.find((x) => x.id === id);
      if (!r) stop(`practice night ${id} is not in the Past list`);
      return { ...r, date: dateET(r.t) };
    });
    mkdirSync(OUT, { recursive: true });
  }
  console.log(`Past list: ${list.length} nights; new and finished: ${todo.length}`);

  for (const night of todo) {
    let done = false;
    for (let attempt = 1; attempt <= 2 && !done; attempt++) {
      let tab = null;
      try {
        if (offRoute) stop(offRoute);
        // Start each night from a fresh list (reloading the LIST is harmless;
        // it is admin tabs that are never reloaded).
        await page.goto(ORGANIZER, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        await ensurePast();
        const name = night.name.trim();
        // The exact row by the grid's id for this night (read once, with the
        // list), and its text must carry the night's name.
        const fresh = night.rowId;
        const row = page.locator(`.ag-row[row-id="${fresh}"]`, { hasText: name });
        if (await row.count() !== 1) stop(`could not find exactly one row for "${name}"`);
        const before = await page.getByText(name, { exact: true }).count();
        await row.click();
        await page.waitForTimeout(3000);
        // The night's menu opened with this night's title: one more copy of the name on screen.
        if (await page.getByText(name, { exact: true }).count() !== before + 1) stop(`the menu that opened is not "${name}"`);
        tabsExpected = 1;
        const [newTab] = await Promise.all([
          ctx.waitForEvent('page', { timeout: 20000 }),
          guardedClick(page.getByText('Admin', { exact: true }), 'Admin'),
        ]);
        tab = newTab;
        await tab.setViewportSize({ width: 1600, height: 1000 });
        await tab.waitForLoadState('domcontentloaded');
        const want = `game=${night.id}`;
        if (!/app\.scoreholio\.com\/pickleball\/admin\?/.test(tab.url()) || !tab.url().includes(want)) stop(`admin tab opened ${tab.url()}, not ${want}`);
        tab.on('framenavigated', (f) => { if (f === tab.mainFrame() && !f.url().includes(want)) offRoute = offRoute || `admin tab went to ${f.url()}`; });
        await tab.waitForTimeout(6000);

        await guardedClick(tab.locator('button', { hasText: /^Stats & Logs$/ }), 'Stats & Logs');
        await tab.waitForTimeout(4000);
        for (let i = 0; i < 30 && !(await tab.locator('#gridMatchLog .ag-center-cols-container .ag-row').count()); i++) await tab.waitForTimeout(1000);
        if (!(await tab.locator('#gridMatchLog .ag-center-cols-container .ag-row').count())) stop('the Match Log table never filled');
        if (offRoute) stop(offRoute);

        // Export to CSV sits in a folded side panel with no size on screen,
        // so it is pressed from page code - only the one inside #gridMatchLog.
        const label = await tab.evaluate(() => [...document.querySelectorAll('#gridMatchLog button')]
          .filter((b) => b.textContent.trim() === 'Export to CSV').length);
        if (label !== 1) stop(`found ${label} Export to CSV buttons in the Match Log table`);
        // Chromium on this server crashes (signal 11) saving downloads, so the
        // file is caught in the page instead: Scoreholio builds it as a Blob and
        // clicks a hidden download link; we keep the Blob and cancel the save.
        await tab.evaluate(() => {
          window.__mip = { blob: null, name: null };
          const orig = URL.createObjectURL;
          URL.createObjectURL = function (b) { if (b instanceof Blob) window.__mip.blob = b; return orig.call(this, b); };
          document.addEventListener('click', (e) => {
            const a = e.target instanceof Element && e.target.closest('a[download]');
            if (a) { window.__mip.name = a.getAttribute('download'); e.preventDefault(); }
          }, true);
        });
        await tab.evaluate(() => [...document.querySelectorAll('#gridMatchLog button')].find((b) => b.textContent.trim() === 'Export to CSV').click());
        let got = null;
        for (let i = 0; i < 20 && !got; i++) {
          await tab.waitForTimeout(500);
          got = await tab.evaluate(async () => (window.__mip.blob && window.__mip.name ? { name: window.__mip.name, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(await window.__mip.blob.arrayBuffer()) } : null));
        }
        if (!got) stop('Export to CSV produced no file');
        if (got.name !== `Matchlog-${night.id}.csv`) stop(`export was named ${got.name}`);
        const raw = got.text;
        const check = checkMatchLog(raw);
        if (!check.ok) stop(`match log for "${night.name}": ${check.why}`);

        // Who each nickname was that night.
        await guardedClick(tab.locator('a', { hasText: /^Player Roster$/ }), 'Player Roster');
        await tab.waitForTimeout(4000);
        const roster = new Map();
        for (let i = 0; i < 12; i++) {
          const rows = await tab.evaluate(() => [...document.querySelectorAll('#gridStatsPlayerRoster .ag-center-cols-container .ag-row')].map((r) => {
            const t = (id) => r.querySelector(`.ag-cell[col-id="${id}"]`)?.textContent.trim() ?? '';
            return [r.getAttribute('row-index'), t('playerName'), `${t('playerFirst')} ${t('playerLast')}`.trim()];
          }));
          for (const [idx, d, f] of rows) if (d) roster.set(idx, [d, f]);
          await tab.mouse.move(800, 700);
          await tab.mouse.wheel(0, 600);
          await tab.waitForTimeout(500);
        }
        if (offRoute) stop(offRoute);

        // Keep: LF line endings, like every export already in the repo.
        writeFileSync(`${OUT}/Matchlog-${night.id}.csv`, raw.replace(/\r\n/g, '\n').replace(/\n$/, ''));
        const lines = [...roster.values()].filter(([d, f]) => d && f).map(([d, f]) => `${night.id}\t${d}\t${f}`);
        if (TEST_ID) writeFileSync(`${OUT}/roster-${night.id}.tsv`, lines.join('\n') + '\n');
        else if (lines.length) appendFileSync(ROSTER, (existsSync(ROSTER) ? '' : '# tournamentId\tdisplay\tfull name - written by vps/pull-scoreholio.mjs from Stats & Logs > Player Roster\n') + lines.join('\n') + '\n');

        // Every nickname in the games should be on the roster; say so if not.
        const handles = new Set();
        for (const l of raw.replace(/\r\n/g, '\n').split('\n').slice(1)) {
          const cols = l.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1)) ?? [];
          for (const team of [cols[6], cols[7]]) for (const h of String(team ?? '').split(' & ')) if (h.trim()) handles.add(h.trim());
        }
        const named = new Set([...roster.values()].map(([d]) => d));
        const unnamed = [...handles].filter((h) => !named.has(h));

        console.log(`  ${night.date} ${night.name}: ${check.games} games, ${roster.size} on roster${unnamed.length ? `, not on roster: ${unnamed.join(', ')}` : ''}`);
        summary.nights.push({ id: night.id, date: night.date, name: night.name, games: check.games, roster: roster.size, unnamed });
        summary.games += check.games;
        done = true;
      } catch (e) {
        // A safety stop (refused click, wrong page, stray tab) ends the whole run.
        if (e instanceof Stop && /refused|unexpected|went to|opened .* not|not on the allow|menu that opened/.test(e.message)) throw e;
        const at = (e.stack || '').split('\n').find((l) => l.includes('pull-scoreholio.mjs'))?.match(/:(\d+):\d+\)?$/)?.[1];
        console.log(`  ${night.name}: attempt ${attempt} failed${at ? ` (line ${at})` : ''} - ${e.message.split('\n')[0]}`);
      } finally {
        tabsExpected = 0;
        // Never reload an admin tab: close it, and the next try reopens from Past.
        if (tab) await tab.close().catch(() => {});
      }
    }
    if (!done) summary.failed.push(`${night.date} ${night.name}`);
  }
} catch (e) {
  const why = e instanceof Stop ? e.message : e.message.split('\n')[0];
  console.log(`STOPPED: ${why}`);
  await finish(1, { stopped: why });
}

await finish(summary.failed.length ? 1 : 0);
