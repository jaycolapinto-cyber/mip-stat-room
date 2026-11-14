// When the updater may follow Dave to a new standings link by itself, and
// when it must leave it for Jay. Uses the real workbooks in the repo plus
// small made-up ones for the cases Dave hasn't produced yet.
import { readFileSync } from 'node:fs';
import XLSX from 'xlsx';
import { LEAGUES, WEEKLY } from '../importer/sources.mjs';
import { checkWorkbook, planSwitches, swapShare } from './switch-links.mjs';

let pass = 0, fail = 0;
const t = (name, ok, got) => { ok ? pass++ : fail++; if (!ok) console.log(`  FAIL: ${name}`, got ?? ''); };

const file = (wb) => readFileSync(new URL(`../importer/live/standings/${wb.match}.xlsx`, import.meta.url));
const lg = (id) => LEAGUES.find((l) => l.id === id);
const nb = lg('wed-newbridge'), carp = lg('thu-carpenters');

/** A made-up league workbook: sheet named `sheet`, a banner, `n` players. */
function fake(sheet, banner, n) {
  const rows = [[banner], ['Rank', 'Name', 'Club', 'Points', 'Wins', 'Losses']];
  for (let i = 1; i <= n; i++) rows.push([i, `Player ${i}`, 'MIP', 100 - i, 10, 5]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const season = nb.match.slice(0, 31);

// --- checkWorkbook: the real files
const same = checkWorkbook(nb, file(nb), file(nb));
t('Newbridge\'s own file is accepted as Newbridge', same.ok, same);
t('the summary names the week and the player count', same.ok && /Week 11/.test(same.summary) && /\d+ players/.test(same.summary), same.summary);
const other = checkWorkbook(nb, file(carp), file(nb));
t('Carpenters\' file is refused for Newbridge (different season id)', !other.ok && /different season or league/.test(other.reason), other);
t('every league\'s own file passes for that league',
  LEAGUES.every((l) => checkWorkbook(l, file(l), file(l)).ok), LEAGUES.map((l) => [l.id, checkWorkbook(l, file(l), file(l))]));
const wk = checkWorkbook(WEEKLY, file(WEEKLY), file(WEEKLY));
t('the weekly table\'s own file passes as the weekly table', wk.ok, wk);
t('a league file is refused as the weekly table', !checkWorkbook(WEEKLY, file(nb), file(WEEKLY)).ok);
t('the weekly table is refused as a league', !checkWorkbook(nb, file(WEEKLY), file(nb)).ok);

// --- checkWorkbook: made-up files
t('a later week of the same season is accepted', checkWorkbook(nb, fake(season, 'WEEK 12', 60), file(nb)).ok);
const older = checkWorkbook(nb, fake(season, 'WEEK 3', 60), file(nb));
t('an earlier week is refused', !older.ok && /Week 3/.test(older.reason), older);
const small = checkWorkbook(nb, fake(season, 'WEEK 12', 5), file(nb));
t('a table half the size or less is refused', !small.ok && /5 players/.test(small.reason), small);
t('an empty table is refused', !checkWorkbook(nb, fake(season, 'WEEK 12', 0), null).ok);
t('no banner at all is fine (four leagues have none)', checkWorkbook(nb, fake(season, 'MIP', 60), file(nb)).ok);
t('a new season id is refused', !checkWorkbook(nb, fake('Player-Rankings-ZZZZZZZZZZZZZZZ', 'WEEK 1', 60), file(nb)).ok);
t('with nothing to compare to, a sound file is accepted', checkWorkbook(nb, fake(season, 'WEEK 1', 3), null).ok);
t('junk is refused, not thrown', !checkWorkbook(nb, Buffer.from('not a workbook at all'), file(nb)).ok);

// --- a renamed sheet (Dave rebuilt Carpenters on 2026-11-14 as "Season 6
// Running Total", same season, new columns and a colour key under the table)
const carpOld = readFileSync(new URL('./fixtures/carpenters-week7-old-layout.xlsx', import.meta.url));
const re = checkWorkbook(carp, file(carp), carpOld);
t('Dave\'s rebuilt Carpenters file is accepted: same players, totals carried on', re.ok && /carried on/.test(re.summary), re);
t('the colour key under the new table is not counted as a player', re.ok && /, 49 players/.test(re.summary), re.summary);
/** A made-up "Player"-layout file: the given [name, wins, losses] rows. */
function fakeNew(sheet, rows) {
  const aoa = [['🍻 SOME LEAGUE'], ['Rank', 'Player', 'Club', '🥒 Points', 'Wins', 'Losses'],
    ...rows.map(([n, w, l], i) => [`🥇 ${i + 1}`, n, 'MIP', w, w, l]), ['🎨 KEY', '1st', '2nd']];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const oldRows = XLSX.utils.sheet_to_json(XLSX.read(carpOld).Sheets[XLSX.read(carpOld).SheetNames[0]], { header: 1, defval: null })
  .filter((r) => typeof r[0] === 'number').map((r) => [r[1], r[5], r[6]]);
const reset = checkWorkbook(carp, fakeNew('Season 7 Running Total', oldRows.map(([n]) => [n, 1, 1])), carpOld);
t('same players but everyone back near zero (a new season) is refused', !reset.ok && /fewer games/.test(reset.reason), reset);
const strangers = checkWorkbook(carp, fakeNew('Season 6 Running Total', oldRows.map(([n, w, l], i) => [`Stranger ${i}`, w, l])), carpOld);
t('a renamed sheet with different players is refused', !strangers.ok && /only 0 of our/.test(strangers.reason), strangers);
t('a renamed sheet with nothing to compare to is refused', !checkWorkbook(carp, file(carp), null).ok);
t('the weekly table is still refused as a league (no Club column)', !checkWorkbook(carp, file(WEEKLY), carpOld).ok);

// --- planSwitches
const L = (label, share = label) => ({ label, share, url: `https://1drv.ms/x/c/x/${share}` });
const p1 = planSwitches([L('NEWBRIDGE INN Wednesday season 8 Week 12')], [...LEAGUES, WEEKLY]);
t('one new link for one league is tried', p1.tryThese.length === 1 && p1.tryThese[0].wb.id === 'wed-newbridge', p1);
const p2 = planSwitches([L('SOMETHING NEW Saturday')], [...LEAGUES, WEEKLY]);
t('a button that names no league is left for Jay', !p2.tryThese.length && /doesn't match any league/.test(p2.needsJay[0]?.reason), p2);
const p3 = planSwitches([L('Newbridge week 12', 'a'), L('NEWBRIDGE wk 12 copy', 'b')], [...LEAGUES, WEEKLY]);
t('two new links for the same league are both left for Jay', !p3.tryThese.length && p3.needsJay.length === 2, p3);
const p4 = planSwitches([L('Newbridge and Carpenters combined')], [...LEAGUES, WEEKLY]);
t('a button that fits two leagues is left for Jay', !p4.tryThese.length && /fits 2 leagues/.test(p4.needsJay[0]?.reason), p4);
t('the weekly table\'s "VIEW HERE" button is tried as the weekly table',
  planSwitches([L('VIEW HERE')], [...LEAGUES, WEEKLY]).tryThese[0]?.wb.id === 'weekly');

// --- swapShare
const src = readFileSync(new URL('../importer/sources.mjs', import.meta.url), 'utf8');
const swapped = swapShare(src, nb.share, 'NEWSHAREID');
t('the share id is swapped in exactly one place', swapped.includes("'NEWSHAREID'") && !swapped.includes(`'${nb.share}'`) && swapped.length === src.length - nb.share.length + 10);
let threw = false; try { swapShare(src, 'NOT-THERE', 'x'); } catch { threw = true; }
t('an id that isn\'t in sources.mjs is refused', threw);

console.log(`\n${pass} passed, ${fail} failed   (standings link switcher)`);
process.exit(fail ? 1 : 0);
