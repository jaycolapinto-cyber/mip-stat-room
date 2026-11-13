// The Stats & Standings watcher against the real page as it was on 2026-11-13
// (Newbridge week 11 on a new link; Carpenters and the weekly table's
// "VIEW HERE" button were briefly off the page that day).
//
// The links sources.mjs held that day are frozen below, so this test does not
// depend on today's sources.mjs: since 2026-11-13 the updater switches links
// by itself (vps/switch-links.mjs), and a test tied to the live list would
// fail - and block publishing - the first time it did. The fixture no longer
// needs refreshing on every switch.
import { readFileSync } from 'node:fs';
import { linksFromPage, compareLinks } from './standings-page.mjs';
import { ALL_WORKBOOKS } from '../importer/sources.mjs';

let pass = 0, fail = 0;
const t = (name, ok, got) => { ok ? pass++ : fail++; if (!ok) console.log(`  FAIL: ${name}`, got ?? ''); };

const html = readFileSync(new URL('./fixtures/stats-standings-2026-11-13.html', import.meta.url), 'utf8');
const links = linksFromPage(html);
t('reads all eight buttons on the page', links.length === 8, links.length);
t('reads a button label as shown', links.some((l) => l.label === 'SUNDAY AM LADIES 11/10/26 Week 3'), links.map((l) => l.label));

const SHARES_2026_11_13 = {
  'og-s9': 'IQD32p_8VmUDT4_FsnGs5X6vAW-V5r-e52Bt21tpT3RFWMM',
  'tue-am': 'IQAzARPMGzkpT6AODmXZxwgHAenSfm_x1TL8PTbNv8Pafu8',
  'tue-pickle': 'IQDbLXIAd5bdSbPcwWLcOMiqAToZXiQa57xEVZts5lkQxkE',
  'wed-newbridge': 'IQDtANzufydxRbO5vlm5mHgXARTVmUKtkPjhCxv_uZBpo2I',
  'thu-carpenters': 'IQALtHo0FIMuRJtc1xV9ghYqAWyhPcPTuXHpwBX5bR0ZVNo',
  'fri-am': 'IQBqXBZ8IK0KRaCQVXJKRJKBAYGDBkmWQ-XiIOWaorcN6Yg',
  'sun-ladies': 'IQDlvW9ZkpVqQL1QW02EmQcDASmuHK8EQzmbcirc5aTAd4A',
  weekly: 'IQBxfU1ItvxlRredkQKSeN0cAdffrX0jGcBIVVJSfJrubHw',
};
const wbs = ALL_WORKBOOKS().map((w) => ({ ...w, share: SHARES_2026_11_13[w.id] }));
t('every workbook has a frozen link', wbs.every((w) => w.share), wbs.filter((w) => !w.share).map((w) => w.id));
const now = compareLinks(links, wbs);
t('brackets are never reported', now.newLinks.every((l) => !/bracket/i.test(l.label)), now.newLinks);
t('every link on the page was in sources.mjs', now.newLinks.length === 0, now.newLinks);
t('only Carpenters and the weekly table are off the page',
  now.gone.map((g) => g.id).sort().join() === 'thu-carpenters,weekly', now.gone);

// Pretend sources.mjs still had the old links from before 2026-10-29.
const old = wbs.map((w) => ({ ...w, share: w.id === 'tue-pickle' ? w.share : `OLD-${w.id}` }));
const then = compareLinks(links, old);
t('every changed league is reported', then.newLinks.length === 5, then.newLinks.map((l) => l.label));
t('each new link is put against the right league', then.newLinks.every((l) => l.league),
  then.newLinks.filter((l) => !l.league));
t('the Newbridge button is Newbridge',
  then.newLinks.find((l) => /newbridge/i.test(l.label))?.league === 'Wednesday Newbridge Inn');
t('Tuesday Pickle Club (unchanged) is not reported', !then.newLinks.some((l) => l.league === 'Tuesday Pickle Club'));
t('old links that left the page are listed', then.gone.length === 7, then.gone);

console.log(`\n${pass} passed, ${fail} failed   (Stats & Standings watcher)`);
process.exit(fail ? 1 : 0);
