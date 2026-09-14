import { readFileSync } from 'node:fs';
import { readExport, EXPORT_DIR } from './scoreholio.mjs';

/**
 * Dated session logs.
 *
 * Dave's published workbooks record every game but no date - a game belongs to
 * a batch called "New Event 4" and nothing more. Scoreholio's live dashboard
 * records the same games with a real timestamp and court number.
 *
 * This module joins the two by SIGNATURE: the two teams and the two scores. A
 * workbook match is only dated when a session game has exactly the same four
 * players and exactly the same two scores. That is evidence, not inference -
 * no game is dated because it looked like it belonged to a session.
 *
 * A session game with no workbook counterpart is REPORTED, never appended. The
 * head-to-head grid is cumulative and the verifier checks that detailed games
 * never exceed it; quietly adding games would break that invariant and hide a
 * real disagreement between two sources.
 */

const MANIFEST = new URL('./live/sessions.json', import.meta.url);

const norm = (s) => String(s ?? '').trim();

/** Two teams and two scores, orientation-independent. */
export function signature(a, b, sa, sb) {
  const A = [...a].sort().join('+');
  const B = [...b].sort().join('+');
  return A < B ? `${A}|${B}|${sa}|${sb}` : `${B}|${A}|${sb}|${sa}`;
}

function parseTsv(text) {
  return text.trim().split('\n').filter(Boolean).map((line, i) => {
    const c = line.split('\t');
    if (c.length < 6) throw new Error(`session row ${i + 1}: expected 6 columns, got ${c.length}`);
    return {
      row: i + 1,
      ts: Number(c[0]),
      court: norm(c[1]),
      teamA: c[2].split('&').map(norm),
      sa: Number(c[3]),
      teamB: c[4].split('&').map(norm),
      sb: Number(c[5]),
    };
  });
}

/**
 * @param resolveHandle  (displayName) => playerId | null. Must NOT guess.
 * @returns { games, unresolved, sessions }
 */
export function readSessions(resolveHandle) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const games = [];
  const unresolved = new Map();
  const problems = [];

  for (const s of manifest.sessions) {
    // A Scoreholio export is preferred over a dashboard scrape: real court
    // numbers, exact timestamps, and a stable Match ID per game.
    let rows;
    if (s.export) {
      const e = readExport(new URL(s.export, EXPORT_DIR));
      if (s.tournamentId && e.tournamentId && e.tournamentId !== s.tournamentId) {
        throw new Error(`${s.export} is tournament ${e.tournamentId}, but the manifest says ${s.tournamentId}`);
      }
      problems.push(...e.problems.map((p) => ({ ...p, file: s.export })));
      rows = e.games.map((g) => ({
        row: g.num ?? 0, ts: g.ts, court: g.court,
        teamA: g.handlesA, teamB: g.handlesB, sa: g.sa, sb: g.sb, matchId: g.matchId,
      }));
    } else {
      rows = parseTsv(readFileSync(new URL(`./live/${s.file}`, import.meta.url), 'utf8'))
        .map((r) => ({ ...r, matchId: null }));
    }

    const where = s.export ?? s.file;
    for (const r of rows) {
      const ids = [];
      let ok = true;
      for (const h of [...r.teamA, ...r.teamB]) {
        const id = resolveHandle(h);
        if (!id) {
          ok = false;
          if (!unresolved.has(h)) unresolved.set(h, []);
          unresolved.get(h).push(`${where}:${r.row}`);
        }
        ids.push(id);
      }
      if (!ok) continue;

      const a = ids.slice(0, r.teamA.length);
      const b = ids.slice(r.teamA.length);
      if (new Set([...a, ...b]).size !== a.length + b.length) {
        throw new Error(`${where}:${r.row} resolves to a repeated player - two handles map to one id`);
      }
      if (r.sa === r.sb) throw new Error(`${where}:${r.row} is a tie (${r.sa}-${r.sb})`);

      const date = new Date(r.ts * 1000);
      games.push({
        session: where,
        matchId: r.matchId,
        league: s.league,
        label: s.label,
        // The session's own calendar day, not the reader's. A 9pm game in New
        // York is still that day's game to someone reading from London.
        date: date.toLocaleDateString('en-CA', { timeZone: s.tz }),
        time: date.toLocaleTimeString('en-US', { timeZone: s.tz, hour: 'numeric', minute: '2-digit' }),
        ts: r.ts,
        court: r.court,
        a, b, sa: r.sa, sb: r.sb,
        sig: signature(a, b, r.sa, r.sb),
      });
    }
  }

  games.sort((x, y) => x.ts - y.ts);
  return {
    games, problems,
    unresolved: [...unresolved].map(([h, w]) => ({ handle: h, where: w })),
    sessions: manifest.sessions,
  };
}

/**
 * Stamp date / time / court / event label onto workbook matches, in place.
 *
 * Duplicate signatures within one session (the same four players playing to the
 * same score twice) are paired one-to-one in chronological order rather than
 * both collapsing onto a single match.
 */
export function applySessions(matches, sessionGames) {
  const pool = new Map();
  for (const g of sessionGames) {
    if (!pool.has(g.sig)) pool.set(g.sig, []);
    pool.get(g.sig).push(g);
  }

  let stamped = 0;
  const eventLabel = new Map();
  for (const m of matches) {
    const q = pool.get(signature(m.a, m.b, m.sa, m.sb));
    if (!q || !q.length) continue;
    const g = q.shift();
    m.date = g.date;
    m.time = g.time;
    m.ts = g.ts;
    if (g.matchId) m.matchId = g.matchId;
    m.court = g.court;
    m.league = g.league;
    m.session = g.label;
    stamped++;
    // Remember which batch label this session turned out to be.
    const k = `${m.event}||${g.label}||${g.date}`;
    eventLabel.set(k, (eventLabel.get(k) ?? 0) + 1);
  }

  const unmatched = [...pool.values()].flat();
  return { stamped, unmatched, eventLabel };
}

/**
 * A batch label is renamed only when EVERY game in it was stamped by one
 * session. A partial overlap proves nothing and leaves the label alone.
 */
export function renameEvents(matches, eventLabel) {
  const total = new Map();
  for (const m of matches) total.set(m.event, (total.get(m.event) ?? 0) + 1);

  const renamed = [];
  for (const [k, n] of eventLabel) {
    const [event, label, date] = k.split('||');
    if (total.get(event) !== n) continue;
    for (const m of matches) if (m.event === event) m.event = `${label} - ${date}`;
    renamed.push({ from: event, to: `${label} - ${date}`, games: n });
  }
  return renamed;
}
