// Follows Dave to a new standings link by itself when it is safe to.
//
// Dave often saves a league's workbook as a NEW copy each week and puts the
// new copy's link on the Stats & Standings page; the old link keeps serving
// last week's file. Until 2026-11-13 every such link emailed Jay and waited
// for a hand switch (six times in two weeks, every one the same league and
// season). Jay's call that day: switch by itself when the new file is
// provably the same league and season, email only when it isn't.
//
// For each new link on the page (vps/standings-page.mjs finds them):
//   1. its button label must point at exactly one league, and no other new
//      link may point at that league the same day;
//   2. the file must download as a real workbook;
//   3. checkWorkbook() below must pass - same season id, the expected table,
//      not a shrunken table, not an earlier week.
// Then the file is saved as that league's workbook and its `share` in
// importer/sources.mjs is rewritten to the new link. Nothing is pushed here:
// run.sh still builds and runs every check, and publishes nothing if one fails.
//
// Anything that fails a step is left alone and listed in `needsJay` with the
// reason, for run.sh to email.
//
//   node vps/switch-links.mjs        # last line = JSON summary for run.sh
//
// Exit 0 = page read (switches or not), 1 = the page could not be read.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { ALL_WORKBOOKS, WEEKLY, downloadUrl } from '../importer/sources.mjs';
import { readPage, compareLinks } from './standings-page.mjs';
import { ROOT } from './lib.mjs';

const DIR = `${ROOT}importer/live/standings`;
const SOURCES = `${ROOT}importer/sources.mjs`;

const key = (s) => String(s ?? '').trim().toLowerCase();
const rowsOf = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null });
const findHeader = (rows, must) => rows.findIndex((r) =>
  r && must.every((m) => r.some((c) => key(c) === m)));

/** The table in a workbook as the build will read it: { players, week, title }. */
function readTable(buf, weekly) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = rowsOf(wb, wb.SheetNames[0]);
  const nameCol = weekly ? 'player' : 'name';
  const h = findHeader(rows, ['rank', nameCol, 'wins', 'losses']);
  if (h < 0) return { sheets: wb.SheetNames, players: null };
  const ni = rows[h].map(key).indexOf(nameCol);
  const players = rows.slice(h + 1).filter((r) => typeof r?.[ni] === 'string' && r[ni].trim()).length;
  const above = rows.slice(0, h).flat().map((c) => String(c ?? ''));
  const wk = above.map((t) => t.match(/\bweek\s*(\d+)\b/i)).find(Boolean);
  const title = above.find((t) => /\b20\d\d\b/.test(t)) ?? null;
  return { sheets: wb.SheetNames, players, week: wk ? Number(wk[1]) : null, title };
}

/**
 * Is `buf` safe to adopt as this workbook's new copy?
 * @param wb      the sources.mjs entry
 * @param buf     the new file
 * @param oldBuf  the file we have now, or null
 * @returns {{ ok: true, summary: string } | { ok: false, reason: string }}
 */
export function checkWorkbook(wb, buf, oldBuf) {
  let now, was = null;
  try { now = readTable(buf, wb.id === WEEKLY.id); } catch (e) { return { ok: false, reason: `the file would not open (${e.message})` }; }
  try { if (oldBuf) was = readTable(oldBuf, wb.id === WEEKLY.id); } catch { /* old file unreadable: judge the new one alone */ }

  if (wb.id === WEEKLY.id) {
    // No season id to compare: the weekly table is a fresh file every week.
    // It must still be the weekly table (Rank/Player columns, a dated title).
    if (now.players == null) return { ok: false, reason: 'it doesn\'t have the weekly table\'s Rank / Player / Wins / Losses columns' };
    if (now.players < 10) return { ok: false, reason: `its table has only ${now.players} players` };
    if (!now.title) return { ok: false, reason: 'its title has no dates in it' };
    return { ok: true, summary: `"${now.title.replace(/\s+/g, ' ').trim()}", ${now.players} players` };
  }

  // A league workbook's sheet is named after the Scoreholio season id
  // (Excel cuts sheet names at 31 characters). A different id is a new
  // season or a different league: that needs a person.
  const season = wb.match.slice(0, 31);
  if (!now.sheets.includes(season)) {
    return { ok: false, reason: `its sheet is "${now.sheets[0]}", not "${season}", so it is a different season or league` };
  }
  if (now.players == null) return { ok: false, reason: 'it doesn\'t have the Rank / Name / Wins / Losses table' };
  if (now.players === 0) return { ok: false, reason: 'its table has no players in it' };
  if (was?.players && now.players < Math.ceil(was.players / 2)) {
    return { ok: false, reason: `its table has ${now.players} players where ours has ${was.players}` };
  }
  if (was?.week != null && now.week != null && now.week < was.week) {
    return { ok: false, reason: `it says Week ${now.week}, older than the Week ${was.week} we already have` };
  }
  return { ok: true, summary: `same season (${season})${now.week != null ? `, Week ${now.week}` : ''}, ${now.players} players` };
}

/**
 * Splits the page's new links into ones worth downloading and ones that need
 * a person without even looking at the file.
 * @returns {{ tryThese: [{link, wb}], needsJay: [{label, url, league, reason}] }}
 */
export function planSwitches(newLinks, workbooks) {
  const needsJay = [], candidates = [];
  for (const l of newLinks) {
    const fits = workbooks.filter((w) => w.page?.test(l.label));
    if (fits.length !== 1) {
      needsJay.push({ label: l.label, url: l.url, league: null,
        reason: fits.length ? `the button's name fits ${fits.length} leagues (${fits.map((w) => w.label).join(', ')})` : 'the button\'s name doesn\'t match any league' });
    } else candidates.push({ link: l, wb: fits[0] });
  }
  const tryThese = [];
  for (const c of candidates) {
    const same = candidates.filter((o) => o.wb.id === c.wb.id);
    if (same.length > 1) needsJay.push({ label: c.link.label, url: c.link.url, league: c.wb.label, reason: `${same.length} new links on the page all point at ${c.wb.label}` });
    else tryThese.push(c);
  }
  return { tryThese, needsJay };
}

/** sources.mjs with one workbook's share id swapped; throws unless it appears exactly once. */
export function swapShare(text, from, to) {
  const n = text.split(`'${from}'`).length - 1;
  if (n !== 1) throw new Error(`the old link id appears ${n} times in sources.mjs`);
  return text.replace(`'${from}'`, `'${to}'`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let links;
  try {
    links = await readPage();
  } catch (e) {
    console.log(`  could not read the Stats & Standings page: ${e.message}`);
    console.log(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
  const workbooks = ALL_WORKBOOKS();
  const { newLinks } = compareLinks(links, workbooks);
  const { tryThese, needsJay } = planSwitches(newLinks, workbooks);
  const switched = [];

  if (tryThese.length) {
    const { openDownloader } = await import('./onedrive.mjs');
    const dl = await openDownloader();
    try {
      for (const { link, wb } of tryThese) {
        const ask = (reason) => needsJay.push({ label: link.label, url: link.url, league: wb.label, reason });
        const buf = await dl.fetch(downloadUrl({ share: link.share }), wb.label);
        if (!buf) { ask('the new file would not download from OneDrive (tried twice)'); continue; }
        const dest = `${DIR}/${wb.match}.xlsx`;
        const check = checkWorkbook(wb, buf, existsSync(dest) ? readFileSync(dest) : null);
        if (!check.ok) { ask(check.reason); continue; }
        try {
          writeFileSync(SOURCES, swapShare(readFileSync(SOURCES, 'utf8'), wb.share, link.share));
        } catch (e) { ask(e.message); continue; }
        writeFileSync(dest, buf);
        switched.push({ league: wb.label, label: link.label, from: wb.share, to: link.share, summary: check.summary });
      }
    } finally {
      await dl.close();
    }
  }

  for (const s of switched) console.log(`  SWITCHED: ${s.league} -> "${s.label}" (${s.summary})`);
  for (const n of needsJay) console.log(`  LEFT FOR JAY: ${n.league ?? '(no league)'} - "${n.label}": ${n.reason}`);
  if (!switched.length && !needsJay.length) console.log('  no new standings links on the page');
  console.log(JSON.stringify({ switched, needsJay }));
}
