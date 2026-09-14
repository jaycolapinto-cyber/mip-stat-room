// Take the file Scoreholio's Export button just dropped in Downloads and put it
// where the importer looks, under the name the importer expects.
//
// WHY THIS IS NOT `mv Matchlog-*.csv`.
//
// The export does not arrive called Matchlog-anything. Driven from the browser
// pane it lands as a GUID with a .tmp extension - `ad9608d6-bd84-4b5f-a7f6-
// 27dee95c1abe.tmp` - because that browser names downloads by handle rather
// than by the server's filename. Chrome named them `Matchlog-<id>.csv`, which
// is why every file already in live/exports/ looks tidy and why a weekly job
// written against those names would find nothing at all.
//
// So the file is identified by its CONTENTS, not its name, and the tournament
// id comes from the admin URL it was exported from. Those two facts together
// are what let an unattended run be sure it grabbed the right file: a stray
// download sitting in the same folder fails the header check instead of being
// imported as a pickleball night.

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EXPORTS = fileURLToPath(new URL('./live/exports', import.meta.url));

/** Every column Scoreholio's match-log export carries, in order. */
const REQUIRED = ['Date/Time', 'Crt', 'Team 1', 'Team 2', 'Score', 'Wait Duration', 'Play Duration', 'Match ID'];

/** The first line, with the BOM and quoting stripped. */
export function headerOf(text) {
  const first = String(text).replace(/^﻿/, '').split(/\r?\n/)[0] ?? '';
  return (first.match(/("[^"]*"|[^,]+)/g) ?? []).map((s) => s.replace(/^"|"$/g, '').trim());
}

/**
 * Is this actually a Scoreholio match log?
 *
 * Checked before anything is moved or renamed, because the alternative is a
 * weekly job that quietly adopts whatever happened to be downloaded last -
 * a bank statement, a fantasy football PDF, the previous week's file - and
 * reports success.
 */
export function isMatchLog(text) {
  const head = headerOf(text);
  const missing = REQUIRED.filter((c) => !head.includes(c));
  return { ok: missing.length === 0, missing, columns: head.length };
}

/**
 * The newest plausible download in `dir`, whatever it is called.
 *
 * Only files touched in the last `withinMs` are considered. A job that exports
 * and then adopts should be looking at something seconds old; reaching further
 * back is how you re-import last week by accident.
 */
export function newestDownload(dir, { withinMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  const hits = readdirSync(dir)
    .filter((f) => !f.startsWith('~$'))
    .map((f) => {
      try {
        const s = statSync(`${dir}/${f}`);
        // Downloads folders contain FOLDERS. "MIP Stats" is a directory sitting
        // right in Jay's, and a newly touched one would otherwise be picked as
        // the newest download and then blow up on read.
        return s.isFile() ? { file: f, mtime: s.mtimeMs } : null;
      } catch { return null; }
    })
    .filter((h) => h && now - h.mtime <= withinMs)
    .sort((a, b) => b.mtime - a.mtime);
  return hits[0] ?? null;
}

/**
 * Adopt the freshly exported file as this tournament's match log.
 *
 * @returns { ok, file, matches, reason }
 */
export function adopt(tournamentId, dir, opts = {}) {
  if (!/^[A-Za-z0-9]{12,}$/.test(String(tournamentId ?? ''))) {
    return { ok: false, reason: `"${tournamentId}" is not a Scoreholio tournament id` };
  }
  const hit = newestDownload(dir, opts);
  if (!hit) return { ok: false, reason: `nothing downloaded into ${dir} in the last few minutes` };

  const text = readFileSync(`${dir}/${hit.file}`, 'utf8');
  const check = isMatchLog(text);
  if (!check.ok) {
    return { ok: false, reason:
      `${hit.file} is not a match log - missing ${check.missing.join(', ')}. `
      + `The export probably did not finish, or another download landed first.` };
  }

  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).length - 1;
  if (rows < 1) return { ok: false, reason: `${hit.file} has a header and no games` };

  const out = `${opts.into ?? EXPORTS}/Matchlog-${tournamentId}.csv`;
  if (!existsSync(opts.into ?? EXPORTS)) mkdirSync(opts.into ?? EXPORTS, { recursive: true });
  writeFileSync(out, text);
  return { ok: true, file: out, from: hit.file, matches: rows };
}
