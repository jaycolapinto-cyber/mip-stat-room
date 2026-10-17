// Power rankings, streaks, milestones and the "share my night" facts.
//
// Everything here is computed from the games at build time and written into
// data.js, so app.js only ever draws numbers - it never has to agree with a
// second copy of the arithmetic. Nothing is stored between builds: last week's
// ranking is a second replay of the same games that stops seven days earlier,
// so a corrected or late-arriving game moves both weeks together.

/* ------------------------------------------------------------ the rating
 * Elo for doubles. Everyone starts at 1500; a team is the average of its two
 * players; the winners gain what the losers lose, scaled up a little for a
 * blowout (an 11-1 game moves the numbers half again as much as an 11-9 one).
 */
export const ELO = { start: 1500, k: 24, scale: 400, marginCap: 1.5, marginPer: 11 };
const RANK_MIN_SEASON_GAMES = 20;     // games since the season started
const RANK_ACTIVE_DAYS = 30;          // and at least one game this recently
const WEEK_DAYS = 7;
const HOT_DAYS = 10;                  // "Hot right now" on the home page
const CLOSE_DAYS = 30;                // "Closing in" on the home page
const SHARE_DAYS = 14;                // "Share my night" button
const WINS_STEP = 100, GAMES_STEP = 250;
const WINS_NEAR = 25, GAMES_NEAR = 50;
const CENTURY = 1000;                 // matches records.js: the Century Club is 1,000 career games
const PARTNER_MIN = 3;

const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

export const POWER_EXPLAIN = 'One rating for every player across all six leagues, worked out from game results alone: '
  + 'beat a stronger team and you gain more than you would for beating a weaker one, and a lopsided score counts a little extra.';

/** Games in the order they were played: by date, then by the Scoreholio clock. */
export function playOrder(matches) {
  return matches.map((m, i) => ({ m, i }))
    .sort((x, y) => (x.m.date < y.m.date ? -1 : x.m.date > y.m.date ? 1 : 0)
      || (x.m.ts ?? 0) - (y.m.ts ?? 0) || x.i - y.i)
    .map((x) => x.m);
}

/** Replay games (already in play order) up to and including `through`. */
export function replayElo(ordered, through = null) {
  const r = new Map();
  const get = (id) => r.get(id) ?? ELO.start;
  for (const m of ordered) {
    if (through && m.date > through) break;
    const ta = m.a.reduce((s, id) => s + get(id), 0) / m.a.length;
    const tb = m.b.reduce((s, id) => s + get(id), 0) / m.b.length;
    const ea = 1 / (1 + 10 ** ((tb - ta) / ELO.scale));
    const aWon = m.sa > m.sb;
    const mult = Math.min(ELO.marginCap, 1 + Math.abs(m.sa - m.sb) / ELO.marginPer);
    const d = ELO.k * ((aWon ? 1 : 0) - ea) * mult;     // positive when A gains
    for (const id of m.a) r.set(id, get(id) + d);
    for (const id of m.b) r.set(id, get(id) - d);
  }
  return r;
}

/** Rank the players who qualify as of `asOf`. Returns Map id -> rank (1-based). */
function rankAsOf(ratings, ordered, asOf, seasonStart) {
  const seasonGames = new Map(), lastDate = new Map();
  for (const m of ordered) {
    if (m.date > asOf) break;
    for (const id of [...m.a, ...m.b]) {
      lastDate.set(id, m.date);
      if (m.date >= seasonStart) seasonGames.set(id, (seasonGames.get(id) ?? 0) + 1);
    }
  }
  const activeFrom = addDays(asOf, -(RANK_ACTIVE_DAYS - 1));
  const ranked = [...ratings.keys()]
    .filter((id) => (seasonGames.get(id) ?? 0) >= RANK_MIN_SEASON_GAMES && (lastDate.get(id) ?? '') >= activeFrom)
    .sort((x, y) => ratings.get(y) - ratings.get(x) || x.localeCompare(y));
  return new Map(ranked.map((id, i) => [id, i + 1]));
}

/** "Start Date: 9/7/26" from Dave's head-to-head grid -> "2026-09-07". */
export function parseSeasonStart(gridStart) {
  const m = String(gridStart ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * Which league a night belonged to, read from who played in it.
 *
 * The games carry a Scoreholio tournament id, not a league. Each player's
 * `leagues` list says which published standings they appear in, so the league
 * most of the night's players belong to is the night's league. A night where no
 * league covers half the players is labelled by its weekday instead - a label,
 * never a guess about who anyone is.
 */
function nightLeagues(ordered, players, leagues) {
  const label = new Map(leagues.map((l) => [l.id, l.label]));
  const memberOf = new Map(players.map((p) => [p.id, p.leagues ?? []]));
  const nights = new Map();
  for (const m of ordered) {
    const key = m.tournament ?? m.date;
    let n = nights.get(key);
    if (!n) nights.set(key, n = { date: m.date, ids: new Set() });
    for (const id of [...m.a, ...m.b]) n.ids.add(id);
  }
  const out = new Map();
  for (const [key, n] of nights) {
    const count = new Map();
    for (const id of n.ids) for (const l of memberOf.get(id) ?? []) count.set(l, (count.get(l) ?? 0) + 1);
    const best = [...count].sort((x, y) => y[1] - x[1])[0];
    const weekday = new Date(n.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    out.set(key, best && best[1] * 2 >= n.ids.size && label.has(best[0]) ? label.get(best[0]) : `${weekday} play`);
  }
  return out;
}

export function computePower({ matches, players, leagues, gridStart }) {
  const ordered = playOrder(matches);
  const newest = ordered.at(-1)?.date ?? null;
  if (!newest) return { players: new Map(), power: null, home: null };
  const seasonStart = parseSeasonStart(gridStart) ?? addDays(newest, -90);
  const lastWeekAsOf = addDays(newest, -WEEK_DAYS);
  const weekFrom = addDays(lastWeekAsOf, 1);

  const now = replayElo(ordered);
  const then = replayElo(ordered, lastWeekAsOf);
  const rankNow = rankAsOf(now, ordered, newest, seasonStart);
  const rankThen = rankAsOf(then, ordered, lastWeekAsOf, seasonStart);
  const leagueOf = nightLeagues(ordered, players, leagues);

  /* ---------------------------------------------------- one walk per player */
  const acc = new Map();
  const A = (id) => {
    let a = acc.get(id);
    if (!a) acc.set(id, a = { wins: 0, losses: 0, games: 0, nights: new Set(), first: null, last: null,
                              run: 0, bestWin: 0, weekW: 0, weekL: 0, seasonW: 0, seasonL: 0,
                              partners: new Map(), lastKey: null, nightW: 0, nightL: 0, crossings: [] });
    return a;
  };
  for (const m of ordered) {
    const key = m.tournament ?? m.date;
    for (const [side, won] of [[m.a, m.sa > m.sb], [m.b, m.sb > m.sa]]) {
      for (const id of side) {
        const a = A(id);
        const before = { wins: a.wins, games: a.games };
        a.games++; won ? a.wins++ : a.losses++;
        a.nights.add(m.date);
        a.first ??= m.date; a.last = m.date;
        a.run = won ? Math.max(a.run, 0) + 1 : Math.min(a.run, 0) - 1;
        if (a.run > a.bestWin) a.bestWin = a.run;
        if (m.date >= weekFrom) won ? a.weekW++ : a.weekL++;
        if (m.date >= seasonStart) {
          won ? a.seasonW++ : a.seasonL++;
          const partner = side.find((x) => x !== id);
          if (partner) {
            const p = a.partners.get(partner) ?? { w: 0, l: 0 };
            won ? p.w++ : p.l++;
            a.partners.set(partner, p);
          }
        }
        // The night = the most recent tournament (or, for a game with no
        // tournament, the day). A night in two brackets is the later one.
        if (a.lastKey !== key) { a.lastKey = key; a.nightW = 0; a.nightL = 0; a.nightDate = m.date; }
        won ? a.nightW++ : a.nightL++;
        if (Math.floor(a.wins / WINS_STEP) > Math.floor(before.wins / WINS_STEP)) a.crossings.push({ kind: 'wins', n: a.wins, date: m.date });
        if (Math.floor(a.games / GAMES_STEP) > Math.floor(before.games / GAMES_STEP)) a.crossings.push({ kind: 'games', n: a.games, date: m.date });
        if (a.games === CENTURY) a.centuryDate = m.date;
      }
    }
  }

  /* ------------------------------------------------------- milestone nearness
   * The next hundred wins or the next 250 games, whichever is nearer relative
   * to its own window (25 wins or 50 games): wins come at about half the rate
   * of games, so comparing the raw counts would always pick wins.
   */
  const nextMilestone = (a) => {
    const w = { kind: 'wins', target: (Math.floor(a.wins / WINS_STEP) + 1) * WINS_STEP, have: a.wins, near: WINS_NEAR, step: WINS_STEP };
    const g = { kind: 'games', target: (Math.floor(a.games / GAMES_STEP) + 1) * GAMES_STEP, have: a.games, near: GAMES_NEAR, step: GAMES_STEP };
    const opts = [w, g].map((o) => ({ ...o, toGo: o.target - o.have })).filter((o) => o.toGo <= o.near);
    opts.sort((x, y) => x.toGo / x.near - y.toGo / y.near);
    const o = opts[0];
    return o ? { kind: o.kind, target: o.target, toGo: o.toGo, from: o.target - o.step } : null;
  };

  const out = new Map();
  const shareFrom = addDays(newest, -(SHARE_DAYS - 1));
  for (const [id, a] of acc) {
    const rating = Math.round(now.get(id) ?? ELO.start);
    const best = [...a.partners].filter(([, p]) => p.w + p.l >= PARTNER_MIN)
      .sort((x, y) => y[1].w - x[1].w || (x[1].l - y[1].l) || x[0].localeCompare(y[0]))[0];
    out.set(id, {
      power: {
        rating,
        rank: rankNow.get(id) ?? null,
        lastWeekRank: rankThen.get(id) ?? null,
        weekRecord: a.weekW + a.weekL ? { w: a.weekW, l: a.weekL } : null,
      },
      form: {
        streak: a.run, bestWin: a.bestWin, wins: a.wins, losses: a.losses, games: a.games,
        nights: a.nights.size, first: a.first, last: a.last,
        next: nextMilestone(a),
        ...(a.centuryDate ? { centuryDate: a.centuryDate } : {}),
      },
      ...(a.last >= shareFrom ? { share: {
        date: a.nightDate, league: leagueOf.get(a.lastKey) ?? null, w: a.nightW, l: a.nightL,
        season: { w: a.seasonW, l: a.seasonL },
        partner: best ? { id: best[0], w: best[1].w, l: best[1].l } : null,
      } } : {}),
      _crossings: a.crossings,
    });
  }

  /* ------------------------------------------------------------ the summary */
  const ranked = [...rankNow].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  const movers = ranked.filter((id) => rankThen.has(id))
    .map((id) => ({ id, up: rankThen.get(id) - rankNow.get(id) }))
    .filter((x) => x.up > 0)
    .sort((x, y) => y.up - x.up || rankNow.get(x.id) - rankNow.get(y.id));

  const hotFrom = addDays(newest, -(HOT_DAYS - 1));
  const closeFrom = addDays(newest, -(CLOSE_DAYS - 1));
  const hot = [...acc].filter(([, a]) => a.last >= hotFrom && a.run > 0)
    .sort((x, y) => y[1].run - x[1].run || y[1].last.localeCompare(x[1].last) || x[0].localeCompare(y[0]))
    .slice(0, 5).map(([id, a]) => ({ id, streak: a.run, last: a.last }));
  const closing = [...out].filter(([id, p]) => acc.get(id).last >= closeFrom && p.form.next)
    .map(([id, p]) => ({ id, ...p.form.next }))
    .sort((x, y) => x.toGo / (x.kind === 'wins' ? WINS_NEAR : GAMES_NEAR) - y.toGo / (y.kind === 'wins' ? WINS_NEAR : GAMES_NEAR)
      || x.id.localeCompare(y.id))
    .slice(0, 5);
  const recentCross = [...out].flatMap(([id, p]) => p._crossings.filter((c) => c.date >= closeFrom).map((c) => ({ id, ...c })))
    .sort((x, y) => y.date.localeCompare(x.date) || y.n - x.n || x.id.localeCompare(y.id));
  for (const p of out.values()) delete p._crossings;

  return {
    players: out,
    power: {
      asOf: newest, lastWeekAsOf, weekFrom, seasonStart,
      rankedCount: ranked.length,
      mover: movers[0] ? movers[0].id : null,
      explain: POWER_EXPLAIN,
      rules: { start: ELO.start, k: ELO.k, minSeasonGames: RANK_MIN_SEASON_GAMES, activeDays: RANK_ACTIVE_DAYS },
    },
    home: { hot, closing, hotDays: HOT_DAYS, closeDays: CLOSE_DAYS },
    milestones: { recent: recentCross, since: closeFrom, winsStep: WINS_STEP, gamesStep: GAMES_STEP,
                  winsNear: WINS_NEAR, gamesNear: GAMES_NEAR, shareDays: SHARE_DAYS },
  };
}
