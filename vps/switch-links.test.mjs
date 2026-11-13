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
