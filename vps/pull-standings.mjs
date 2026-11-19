// Fetches Dave's standings into importer/live/standings/<match>.xlsx - the job
// the Wednesday Claude task did. Leagues with a `web` page in sources.mjs are
// read off merrickinapickle.com (since 2026-11-19, vps/webstandings.mjs) and
// saved as a workbook; the rest are still OneDrive workbooks.
//
// OneDrive refuses a plain download from a server (403), but serves the file
// to a headless browser, byte-for-byte the same file a desktop Chrome gets
// (checked 2026-10-16). Excel Online's File > Export is never used: the share
// link with download=1 hands over the original workbook.
//
// Writes only when a workbook actually changed, so git's date on each file
// stays "when Dave last entered results". Prints one summary line as JSON on
// the last line of output for run.sh.
//
//   node vps/pull-standings.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ALL_WORKBOOKS, downloadUrl } from '../importer/sources.mjs';
import { ROOT, todayET, daysBetween } from './lib.mjs';
import { openDownloader } from './onedrive.mjs';
import { chromium } from 'playwright';
import { readPage, toSheetRows, toWorkbook, rowsOfWorkbook } from './webstandings.mjs';

const DIR = `${ROOT}importer/live/standings`;
const STALE_DAYS = 21;

/** When git last saw this file change, as YYYY-MM-DD, or null. */
function gitDate(file) {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return iso ? iso.slice(0, 10) : null;
  } catch { return null; }
}

const dl = await openDownloader();
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const result = { changed: [], unchanged: [], failed: [], stale: [] };

/** A web league's table as a workbook, or null (logged) when the page failed. */
async function fromWeb(wb) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { lines, table } = await readPage(browser, wb.web);
      return { rows: toSheetRows(lines, table) };
    } catch (e) {
      console.log(`  ${wb.label}: ${e.message.split('\n')[0]} (attempt ${attempt})`);
    }
  }
  return null;
}

for (const wb of ALL_WORKBOOKS()) {
  const dest = `${DIR}/${wb.match}.xlsx`;
  let buf, same;
  if (wb.web) {
    const got = await fromWeb(wb);
    if (!got) { result.failed.push(wb.label); continue; }
    // Compared by contents, not bytes: a freshly written workbook carries its
    // own timestamp, so the bytes differ every day even when no number did.
    same = existsSync(dest)
      && JSON.stringify(rowsOfWorkbook(readFileSync(dest))) === JSON.stringify(got.rows);
    buf = same ? null : toWorkbook(got.rows, wb.match);   // sheet named like Dave's own exports
  } else {
    buf = await dl.fetch(downloadUrl(wb), wb.label);
    if (!buf) { result.failed.push(wb.label); continue; }
    same = existsSync(dest) && Buffer.compare(readFileSync(dest), buf) === 0;
  }
  if (same) {
    result.unchanged.push(wb.label);
    const since = gitDate(`importer/live/standings/${wb.match}.xlsx`);
    const age = since ? daysBetween(since, todayET()) : null;
    console.log(`  ${wb.label}: unchanged${since ? ` since ${since} (${age}d)` : ''}`);
    // Unchanged for weeks while the league plays on = Dave started a new
    // season in a new workbook. A league marked `final` is over and is meant
    // to stand still.
    if (!wb.final && age !== null && age >= STALE_DAYS) result.stale.push(`${wb.label} (unchanged since ${since})`);
  } else {
    writeFileSync(dest, buf);
    result.changed.push(wb.label);
    console.log(`  ${wb.label}: UPDATED`);
  }
}

await dl.close();
await browser.close();
console.log(JSON.stringify(result));
process.exit(result.failed.length ? 1 : 0);
