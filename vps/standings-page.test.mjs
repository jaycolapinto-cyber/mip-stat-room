// The Stats & Standings watcher against the real page as it was on 2026-10-29,
// the day Dave's new copies were found.
import { readFileSync } from 'node:fs';
import { linksFromPage, compareLinks } from './standings-page.mjs';
import { ALL_WORKBOOKS } from '../importer/sources.mjs';

let pass = 0, fail = 0;
const t = (name, ok, got) => { ok ? pass++ : fail++; if (!ok) console.log(`  FAIL: ${name}`, got ?? ''); };

const html = readFileSync(new URL('./fixtures/stats-standings-2026-10-29.html', import.meta.url), 'utf8');
const links = linksFromPage(html);
t('reads all ten buttons on the page', links.length === 10, links.length);
t('reads a button label as shown', links.some((l) => l.label === 'SUNDAY AM LADIES 10/26/26 Week 1'), links.map((l) => l.label));

const wbs = ALL_WORKBOOKS();
const now = compareLinks(links, wbs);
const newbridgeHeld = wbs.find((w) => w.id === 'wed-newbridge').share !== 'IQBcyaYy8sfJSIS74pZuvJnUAW9QFjRfa1B3lbYIxUuyRJQ';
t('brackets are never reported', now.newLinks.every((l) => !/bracket/i.test(l.label)), now.newLinks);
t('every link in sources.mjs is matched, apart from any held back',
  now.newLinks.length === (newbridgeHeld ? 1 : 0), now.newLinks);

// Pretend sources.mjs still had the old links from before 2026-10-29.
const old = wbs.map((w) => ({ ...w, share: w.id === 'tue-pickle' ? w.share : `OLD-${w.id}` }));
const then = compareLinks(links, old);
t('every changed league is reported', then.newLinks.length === 7, then.newLinks.map((l) => l.label));
t('each new link is put against the right league', then.newLinks.every((l) => l.league),
  then.newLinks.filter((l) => !l.league));
t('the weekly table\'s "VIEW HERE" button is the weekly table',
  then.newLinks.find((l) => l.label === 'VIEW HERE')?.league === 'This week, all leagues');
t('Tuesday Pickle Club (unchanged) is not reported', !then.newLinks.some((l) => l.league === 'Tuesday Pickle Club'));
t('old links that left the page are listed', then.gone.length === 7, then.gone);

console.log(`\n${pass} passed, ${fail} failed   (Stats & Standings watcher)`);
process.exit(fail ? 1 : 0);
