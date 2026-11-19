// Reads a league's standings table straight off Dave's website.
//
// On 2026-11-19 Dave stopped posting most standings as OneDrive workbooks and
// gave each league its own page on merrickinapickle.com instead (Standings
// menu: /sunday-ladies-standings, /monday-og-standings, ...). The table sits in
// an HTML block the site renders inside an <iframe srcdoc>, so it only exists
// after the page's own script runs - a plain GET gets the menu and nothing
// else. A headless browser loads the page and reads the table's cells.
//
// The table is saved as an ordinary workbook (importer/live/standings/
// <match>.xlsx), laid out the way extract.mjs already reads Dave's sheets: a
// title row, a "Week N" row, then the Rank / Player / Wins / Losses table. So
// the rest of the build does not know or care where the numbers came from.
//
// READ ONLY: loads a public page, clicks nothing.

import XLSX from 'xlsx';

export const SITE = 'https://merrickinapickle.com/';

/**
 * "Jeff Hersh 🥇×2" -> "Jeff Hersh", "Paul Ilan SUB" -> "Paul Ilan".
 * The medal count and the SUB tag are Dave's decoration on the page; the
 * player's name is what the rest of the build matches on.
 */
export const cleanName = (s) => String(s ?? '')
  .replace(/[\u{1F947}-\u{1F949}\u{1F3C6}](\s*[×x]\s*\d+)?/gu, '')
  .replace(/\s+SUB$/i, '')
  .replace(/\s+/g, ' ').trim();

/** "52.1%" -> 52.1, "+6" -> 6, "-36" -> -36, "1,165" -> 1165; "–", "" -> null; words stay words. */
export function cell(s) {
  const t = String(s ?? '').trim();
  if (t === '' || /^[–—-]$/.test(t)) return null;
  const n = t.replace(/[,%]/g, '').replace(/^\+/, '');
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : t;
}

/**
 * The page's text and table -> the rows of a sheet extract.mjs can read.
 *
 * @param lines  the block's visible text lines, top first ("TUESDAY NOONERS",
 *               "Season Standings • Through Week 11 (11/17/26) • Updated ...")
 * @param table  the standings table's cells, header row first
 * @throws when the table is not a standings table (no rank/player/wins/losses)
 *   or has no players - a redesign must stop the run, not ship an empty league.
 */
export function toSheetRows(lines, table) {
  const head = (table[0] ?? []).map((h) => String(h).replace(/[^\p{L}\p{N}%+\s]/gu, '').replace(/\s+/g, ' ').trim());
  const col = (n) => head.findIndex((h) => h.toLowerCase() === n);
  for (const need of ['rank', 'player', 'wins', 'losses']) {
    if (col(need) < 0) throw new Error(`no "${need}" column in the table (header: ${head.join(' | ')})`);
  }
  const pi = col('player'), ci = col('club');
  const rows = table.slice(1)
    .filter((r) => cleanName(r[pi]) && cell(r[col('wins')]) != null)
    .map((r) => r.map((v, i) => {
      if (i === pi) return cleanName(v);
      if (i === ci) return /not set/i.test(v) ? null : String(v).trim() || null;
      return cell(v);
    }));
  if (!rows.length) throw new Error('the standings table has no players');
  const title = String(lines[0] ?? '').trim();
  // Only the week goes in the banner: the league's name is already on its card.
  const sub = lines.find((l) => /\bweek\s+\d+/i.test(l)) ?? '';
  const week = sub.match(/\bweek\s+(\d+)/i);
  return tidy([[title], [week ? `Week ${week[1]}` : null], head, ...rows]);
}

/** The sheet rows as a workbook buffer. */
export function toWorkbook(rows, sheetName) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Rows without trailing empty cells or empty rows, so two reads compare equal. */
export const tidy = (rows) => rows
  .map((r) => { const a = [...r]; while (a.length && a.at(-1) == null) a.pop(); return a; })
  .filter((r) => r.length);

/** A saved workbook's first sheet as tidy rows, to compare with a fresh read. */
export const rowsOfWorkbook = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return tidy(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: null }));
};

/**
 * Loads one league page in an open browser and reads its standings block.
 * @returns {{ lines: string[], table: string[][] }}
 * @throws when no block on the page holds a table with a PLAYER column.
 */
export async function readPage(browser, slug) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(SITE + slug, { waitUntil: 'load', timeout: 60000 });
    for (let waited = 0; waited <= 20000; waited += 1000) {
      for (const f of page.frames()) {
        if (f.url() !== 'about:srcdoc') continue;
        const got = await f.evaluate(() => {
          const t = [...document.querySelectorAll('table')]
            .find((x) => x.rows.length > 1 && /\bplayer\b/i.test(x.rows[0].innerText));
          if (!t) return null;
          return {
            lines: document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6),
            table: [...t.rows].map((r) => [...r.cells].map((c) => c.innerText.trim())),
          };
        }).catch(() => null);
        if (got) return got;
      }
      await page.waitForTimeout(1000);
    }
    throw new Error(`no standings table on ${SITE}${slug}`);
  } finally {
    await ctx.close();
  }
}
