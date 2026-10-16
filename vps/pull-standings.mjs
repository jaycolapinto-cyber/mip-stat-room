// Fetches Dave's seven standings workbooks from OneDrive into
// importer/live/standings/<match>.xlsx - the job the Wednesday Claude task did.
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

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import XLSX from 'xlsx';
import { ALL_WORKBOOKS, downloadUrl } from '../importer/sources.mjs';
import { ROOT, todayET, daysBetween } from './lib.mjs';

const DIR = `${ROOT}importer/live/standings`;
const STALE_DAYS = 21;

/** A real workbook, not an error page that happens to have downloaded. */
function isWorkbook(buf) {
  if (buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) return false; // "PK" zip
  try { return XLSX.read(buf, { type: 'buffer' }).SheetNames.length > 0; } catch { return false; }
}

/** When git last saw this file change, as YYYY-MM-DD, or null. */
function gitDate(file) {
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return iso ? iso.slice(0, 10) : null;
  } catch { return null; }
}

const tmp = mkdtempSync(`${tmpdir()}/mip-standings-`);
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const result = { changed: [], unchanged: [], failed: [], stale: [] };

async function fetchOnce(url, out) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      // goto itself rejects with "Download is starting" - that is the success path.
      page.goto(url).catch(() => {}),
    ]);
    await dl.saveAs(out);
    return readFileSync(out);
  } finally {
    await ctx.close();
  }
}

for (const wb of ALL_WORKBOOKS()) {
  const dest = `${DIR}/${wb.match}.xlsx`;
  let buf = null;
  for (let attempt = 1; attempt <= 2 && !buf; attempt++) {
    try {
      const got = await fetchOnce(downloadUrl(wb), `${tmp}/${wb.id}.xlsx`);
      if (isWorkbook(got)) buf = got;
      else console.log(`  ${wb.label}: download was not a workbook (attempt ${attempt})`);
    } catch (e) {
      console.log(`  ${wb.label}: ${e.message.split('\n')[0]} (attempt ${attempt})`);
    }
  }
  if (!buf) { result.failed.push(wb.label); continue; }

  const same = existsSync(dest) && Buffer.compare(readFileSync(dest), buf) === 0;
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

await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify(result));
process.exit(result.failed.length ? 1 : 0);
