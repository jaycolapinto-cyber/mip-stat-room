// Reads the Stats & Standings page on merrickinapickle.com and says whether
// any standings link there differs from importer/sources.mjs.
//
// Dave doesn't always keep typing into the same workbook: on 2026-10-29 every
// league but one was a NEW copy with a new link, and the 6 AM run spent three
// weeks re-downloading the old files and reporting "unchanged". This catches
// that the day it happens. It only reports - switching a league to a new link
// stays a person's decision (Jay, 2026-10-29).
//
// READ ONLY: one plain GET of a public page, nothing else.
//
//   node vps/standings-page.mjs      # last line = JSON summary for run.sh
//
// Exit 0 = read (differences or not), 1 = the page could not be read.

import { fileURLToPath } from 'node:url';
import { ALL_WORKBOOKS } from '../importer/sources.mjs';

export const PAGE = 'https://www.merrickinapickle.com/stats-%26-standings';
// Bracket sheets are on the page too, but they are not standings (Jay: ignore).
const IGNORE = /bracket/i;

const text = (html) => html.replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** Every OneDrive button on the page: { label, share, url }. */
export function linksFromPage(html) {
  const out = [];
  const re = /<a\b[^>]*href="(https:\/\/1drv\.ms\/[^"]*\/([A-Za-z0-9_-]{20,})(?:\?[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) out.push({ label: text(m[3]), share: m[2], url: m[1].replace(/&amp;/g, '&') });
  return out;
}

/**
 * @returns { newLinks: [{label, share, url, league}], gone: [{id, label}] }
 *   newLinks - a standings button whose link is not in sources.mjs; `league` is
 *              the workbook its label points at, or null when none fits
 *   gone     - a workbook in sources.mjs whose link is no longer on the page
 */
export function compareLinks(links, workbooks) {
  const known = new Set(workbooks.map((w) => w.share));
  const onPage = new Set(links.map((l) => l.share));
  const newLinks = links
    .filter((l) => !IGNORE.test(l.label) && !known.has(l.share))
    .map((l) => ({ ...l, league: workbooks.find((w) => w.page?.test(l.label))?.label ?? null }));
  const gone = workbooks.filter((w) => !onPage.has(w.share)).map((w) => ({ id: w.id, label: w.label }));
  return { newLinks, gone };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let html;
  try {
    const r = await fetch(PAGE, { headers: { 'user-agent': 'Mozilla/5.0 (MIP Stat Room)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } catch (e) {
    console.log(`  could not read the Stats & Standings page: ${e.message}`);
    console.log(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
  const links = linksFromPage(html);
  // A page with no links at all is a redesign or an error page, not "all fine".
  if (!links.length) {
    console.log('  the Stats & Standings page has no OneDrive links on it any more');
    console.log(JSON.stringify({ error: 'no links on the page' }));
    process.exit(1);
  }
  const res = compareLinks(links, ALL_WORKBOOKS());
  for (const l of res.newLinks) console.log(`  NEW LINK: ${l.league ?? '(no league matches)'} - "${l.label}" ${l.url}`);
  for (const g of res.gone) console.log(`  NOT ON THE PAGE ANY MORE: ${g.label}`);
  if (!res.newLinks.length && !res.gone.length) console.log(`  all ${links.length} links match sources.mjs (brackets ignored)`);
  console.log(JSON.stringify(res));
}
