import XLSX from 'xlsx';
import { DIR, LEAGUES, MASTER, HEAD2HEAD, newestMatching } from './sources.mjs';

// Which file each source actually resolved to, and when it was downloaded.
// Collected as the build reads them so the run can report it: "the standings
// came from THIS file, dated THIS" is the difference between noticing a stale
// workbook and shipping one.
export const resolved = [];

const sheet = (prefix, name, what) => {
  const hit = newestMatching(prefix, what ?? prefix);
  if (!resolved.some((r) => r.file === hit.file)) {
    resolved.push({
      what: what ?? prefix, file: hit.file, mtime: hit.mtime,
      dated: hit.dated ?? hit.mtime, datedFrom: hit.datedFrom ?? 'file',
      alternatives: hit.alternatives,
    });
  }
  const wb = XLSX.readFile(`${DIR}/${hit.file}`);
  const s = name ? wb.Sheets[name] : wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(s, { header: 1, blankrows: false, defval: null });
};

/** Header row may not be row 0; find the row that contains the expected labels. */
const findHeader = (rows, must) => rows.findIndex((r) =>
  r && must.every((m) => r.some((c) => String(c ?? '').trim().toLowerCase() === m)));

const key = (s) => String(s ?? '').trim().toLowerCase();

/**
 * What Dave wrote above the table, if anything - "WEEK 6", "5 Weeks".
 *
 * Two of the six workbooks carry a banner row above the header; the other four
 * start straight at "Rank". When there is one, the week cell is the only part
 * worth printing - the league's name is already on the card and "MERRICK IN A
 * PICKLE" is the site. So the first cell that mentions a week is taken, its
 * shouting is lowered to title case, and the rest is left where it is.
 */
const weekBanner = (rows, h) => {
  for (const r of rows.slice(0, h)) {
    for (const c of r ?? []) {
      const t = String(c ?? '').replace(/\s+/g, ' ').trim();
      if (/\bweeks?\b/i.test(t)) return t.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }
  return null;
};

/**
 * The calendar day (Eastern) a workbook's contents last changed.
 *
 * This is the "last updated" a reader sees beside each table. It comes from
 * git, so it is the day the file was committed - which, with the weekly job,
 * is the day it was fetched from Dave's OneDrive, not the day Dave typed the
 * numbers in. Those can differ by a few days and there is nothing in the
 * file to say by how much; the date printed is honest about what it is.
 */
const updatedOn = (what) => {
  const r = resolved.find((x) => x.what === what);
  return r ? new Date(r.dated).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
};

/** A league's published per-player standings (real totals from Dave's site). */
export function readLeague(l) {
  const rows = sheet(l.match, null, l.label);
  const h = findHeader(rows, ['rank', 'name', 'wins', 'losses']);
  if (h < 0) throw new Error(`${l.label}: no header row with rank/name/wins/losses in ${l.match}`);
  const cols = rows[h].map(key);
  const at = (r, ...names) => {
    for (const n of names) { const i = cols.indexOf(n); if (i >= 0 && r[i] != null) return r[i]; }
    return null;
  };
  const players = [];
  for (const r of rows.slice(h + 1)) {
    const name = at(r, 'name');
    if (!name || typeof name !== 'string') continue;
    let winPct = at(r, 'win %');
    if (winPct != null && winPct > 1.5) winPct /= 100;        // some files store 77.3, others 0.773
    players.push({
      rank: at(r, 'rank'), name: name.trim(), club: at(r, 'club'),
      points: at(r, 'points'), wins: at(r, 'wins'), losses: at(r, 'losses'),
      games: at(r, 'gms', 'games'),
      pf: at(r, 'pts for', 'pts. for', 'total points for'),
      pa: at(r, 'pts aga', 'total points against'),
      diff: at(r, 'diff', 'total points diff'),
      winPct, weeks: at(r, 'wks'),
    });
  }
  return { ...l, players, banner: weekBanner(rows, h), updated: updatedOn(l.label) };
}

/** The master cross-league standings (abbreviated names). */
export function readMaster() {
  const rows = sheet(MASTER, null, 'master standings');
  const h = findHeader(rows, ['rank', 'player', 'wins', 'losses']);
  const cols = rows[h].map(key);
  const at = (r, n) => { const i = cols.indexOf(n); return i >= 0 ? r[i] : null; };
  const title = String(rows[0]?.[0] ?? '');
  // Dave's own record of which handles he folded into one table row ("Name
  // Entered" -> "Combined Under"). A human decision, so it is used as given.
  // Absent from older copies of the workbook, which is fine.
  let combined = [];
  try {
    const nm = sheet(MASTER, 'Name Matches', 'master standings');
    const nh = findHeader(nm, ['name entered', 'combined under']);
    if (nh >= 0) {
      const c = nm[nh].map(key);
      const ie = c.indexOf('name entered'), iu = c.indexOf('combined under');
      combined = nm.slice(nh + 1)
        .filter((r) => r?.[ie] && r?.[iu])
        .map((r) => ({ entered: String(r[ie]).trim(), under: String(r[iu]).trim() }));
    }
  } catch { /* no such sheet */ }
  return {
    title: title.replace(/\s{2,}/g, ' — ').trim(),
    updated: updatedOn('master standings'),
    combined,
    players: rows.slice(h + 1).filter((r) => typeof at(r, 'player') === 'string').map((r) => ({
      rank: at(r, 'rank'), name: String(at(r, 'player')).trim(),
      games: at(r, 'games'), events: at(r, 'events'),
      wins: at(r, 'wins'), losses: at(r, 'losses'),
      // The old master spelled these out; the weekly file Dave replaced it
      // with abbreviates them. Either is read.
      pf: at(r, 'points for') ?? at(r, 'pf'), pa: at(r, 'points against') ?? at(r, 'pa'),
      diff: at(r, 'point diff') ?? at(r, 'diff'),
    })),
  };
}

/** Game-by-game results, and the published head-to-head matrix to check them against. */
export function readGames() {
  const rows = sheet(HEAD2HEAD, 'Added Games', 'head-to-head workbook');
  const h = findHeader(rows, ['event', 'game', 'team 1', 'team 2']);
  const cols = rows[h].map(key);
  const at = (r, n) => { const i = cols.indexOf(n); return i >= 0 ? r[i] : null; };
  const games = rows.slice(h + 1)
    .filter((r) => at(r, 'team 1') && at(r, 'team 2'))
    .map((r, i) => ({
      row: h + 2 + i,
      event: String(at(r, 'event') ?? '').trim(),
      num: at(r, 'game'),
      team1: String(at(r, 'team 1')).trim(),
      team2: String(at(r, 'team 2')).trim(),
      s1: Number(at(r, 'score 1')), s2: Number(at(r, 'score 2')),
      winner: String(at(r, 'winner') ?? '').trim(),
    }));

  const grid = sheet(HEAD2HEAD, 'Head-to-Head Grid', 'head-to-head workbook');
  const gh = grid.findIndex((r) => key(r?.[0]) === 'player');
  const names = (grid[gh] || []).slice(1).filter((x) => typeof x === 'string').map((s) => s.trim());
  const cells = [];
  for (const r of grid.slice(gh + 1)) {
    const rowName = typeof r[0] === 'string' ? r[0].trim() : null;
    if (!rowName) continue;
    r.slice(1).forEach((v, i) => {
      if (typeof v === 'string' && /^\d+\s*-\s*\d+$/.test(v)) {
        const [w, l] = v.split('-').map((n) => Number(n.trim()));
        cells.push({ a: rowName, b: names[i], w, l });
      }
    });
  }
  return { games, gridNames: names, gridCells: cells, startDate: String(grid[0]?.[0] ?? '') };
}

export function allLeagues() { return LEAGUES.map(readLeague); }

/**
 * Whether the standings we just read are older than the games we just read.
 *
 * The one failure this whole pipeline can produce silently. Games come from
 * Scoreholio and refresh on their own; standings come from eight workbooks a
 * person has to download by hand. Skip that step and the site shows this
 * week's games beside last month's table, and every number in both is
 * individually correct.
 *
 * Counted in whole calendar days, not in hours. A workbook downloaded at 9pm
 * on the same evening as that night's last game is not "-1 days behind" and it
 * is not behind at all - it was downloaded after the games it covers. Comparing
 * the two timestamps said otherwise, because a game's date carries no clock and
 * so lands at midnight, eight hours before the download. Both sides are reduced
 * to a date here and anything that comes out negative is clamped to 0: a file
 * newer than the newest game is simply current, and there is no such thing as
 * standings from the future.
 *
 * @param newestGame ISO date of the most recent game in the build
 */
export function standingsStaleness(newestGame) {
  const day = (iso) => new Date(iso + 'T00:00:00Z').getTime();
  const cutoff = day(newestGame);
  // Eastern, to match the game dates, which sessions.mjs stamps in the league's
  // own timezone. A workbook downloaded on a Thursday evening in Merrick is a
  // Friday file in UTC, and would read as a day fresher than it is.
  const et = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return resolved.map((r) => {
    const downloaded = et(r.dated ?? r.mtime);
    return {
      ...r,
      downloaded,
      daysBehind: Math.max(0, Math.round((cutoff - day(downloaded)) / 86400000)),
    };
  }).sort((a, b) => b.daysBehind - a.daysBehind || a.what.localeCompare(b.what));
}
