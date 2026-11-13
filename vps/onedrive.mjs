// Downloads a workbook from Dave's OneDrive the only way OneDrive allows from
// a server: a plain request gets 403, a headless browser gets the file,
// byte-for-byte what desktop Chrome gets (checked 2026-10-16). Shared by
// pull-standings.mjs and switch-links.mjs.

import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import XLSX from 'xlsx';

/** A real workbook, not an error page that happens to have downloaded. */
export function isWorkbook(buf) {
  if (!buf || buf.length < 1000 || buf[0] !== 0x50 || buf[1] !== 0x4b) return false; // "PK" zip
  try { return XLSX.read(buf, { type: 'buffer' }).SheetNames.length > 0; } catch { return false; }
}

/**
 * Opens one browser for a batch of downloads.
 * @returns {{ fetch(url, label, log?): Promise<Buffer|null>, close(): Promise<void> }}
 *   fetch tries twice and returns null when no real workbook came back.
 */
export async function openDownloader() {
  const tmp = mkdtempSync(`${tmpdir()}/mip-onedrive-`);
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  let n = 0;
  async function once(url, out) {
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
  return {
    async fetch(url, label, log = console.log) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const got = await once(url, `${tmp}/${++n}.xlsx`);
          if (isWorkbook(got)) return got;
          log(`  ${label}: download was not a workbook (attempt ${attempt})`);
        } catch (e) {
          log(`  ${label}: ${e.message.split('\n')[0]} (attempt ${attempt})`);
        }
      }
      return null;
    },
    async close() {
      await browser.close();
      rmSync(tmp, { recursive: true, force: true });
    },
  };
}
