// Shared calculations. Every number shown in the UI comes from these functions
// reading the same match records, so all summaries agree.

/** One match seen from a player's side. Returns null if the player isn't in it. */
export function perspective(game, player) {
  const onA = game.a.includes(player);
  const onB = game.b.includes(player);
  if (!onA && !onB) return null;
  const me = onA ? game.a : game.b;
  const opp = onA ? game.b : game.a;
  const mine = onA ? game.sa : game.sb;
  const theirs = onA ? game.sb : game.sa;
  return {
    id: game.id,
    date: game.date ?? null,
    time: game.time ?? null,
    ts: game.ts ?? null,
    court: game.court ?? null,
    session: game.session ?? null,
    league: game.league ?? null,
    season: game.season ?? null,
    event: game.event ?? null,
    num: game.num ?? null,
    me,
    opp,
    partner: me.find((p) => p !== player) ?? null,
    mine,
    theirs,
    won: mine > theirs,
    margin: mine - theirs,
  };
}

/** Win/loss totals for a player across the supplied games. */
export function summarize(games, player) {
  let wins = 0, losses = 0, pf = 0, pa = 0;
  for (const g of games) {
    const v = perspective(g, player);
    if (!v) continue;
    if (v.won) wins++; else losses++;
    pf += v.mine; pa += v.theirs;
  }
  const played = wins + losses;
  return {
    wins, losses, games: played,
    winPct: played ? wins / played : 0,
    pointsFor: pf, pointsAgainst: pa, diff: pf - pa,
  };
}

/** Per-partner records, best win rate first; game count breaks ties. */
export function partners(games, player) {
  const acc = new Map();
  for (const g of games) {
    const v = perspective(g, player);
    if (!v || !v.partner) continue;
    const row = acc.get(v.partner) ?? { id: v.partner, wins: 0, losses: 0, games: 0, diff: 0 };
    if (v.won) row.wins++; else row.losses++;
    row.games++;
    row.diff += v.margin;
    acc.set(v.partner, row);
  }
  return [...acc.values()]
    .map((r) => ({ ...r, winPct: r.games ? r.wins / r.games : 0 }))
    .sort((x, y) => y.winPct - x.winPct || y.games - x.games || x.id.localeCompare(y.id));
}

/** Games the two players shared: same team (together=true) or opposite sides. */
export function pairGames(games, player, other, together) {
  return games.filter((g) => {
    const sameTeam = (g.a.includes(player) && g.a.includes(other)) || (g.b.includes(player) && g.b.includes(other));
    const opposed = (g.a.includes(player) && g.b.includes(other)) || (g.b.includes(player) && g.a.includes(other));
    return together ? sameTeam : opposed;
  });
}

/** Best and worst partnership at or above a minimum shared-game threshold. */
export function partnershipEdges(rows, minGames) {
  const eligible = rows.filter((r) => r.games >= minGames);
  if (eligible.length < 2) return { best: null, worst: null, eligible };
  return { best: eligible[0], worst: eligible[eligible.length - 1], eligible };
}

/** Standings across every player, from the same match records. */
export function standings(games, players) {
  return players
    .map((p) => ({ ...p, ...summarize(games, p.id) }))
    .filter((r) => r.games > 0)
    .sort((x, y) => y.winPct - x.winPct || y.games - x.games || x.name.localeCompare(y.name));
}

/**
 * A player's games, most recent first.
 *
 * The data is mixed on purpose: games joined to a Scoreholio session log carry
 * a real date, while games that only ever appeared in the head-to-head sheet
 * carry nothing but an event label and a game number. Sorting both on one key
 * would put "2026-09-11" before "New Event 1" alphabetically and bury the
 * newest games at the bottom of the log, so DATED games always rank above
 * undated ones. An undated game is of unknown age; treating it as older is the
 * only honest ordering, since every date we hold is from the current season.
 */
export function recent(games, player, n) {
  // Within a day, order by the session's own clock. The workbook game number
  // is a batch position, not a time, so it must not decide which of two games
  // on the same date came first.
  const ord = (v) => (v.date
    ? `1|${v.date}|${String(v.ts ?? 0).padStart(12, '0')}`
    : `0|${v.event ?? ''}#${String(v.num ?? 0).padStart(5, '0')}`);
  return games
    .map((g) => perspective(g, player))
    .filter(Boolean)
    .sort((a, b) => (ord(a) < ord(b) ? 1 : ord(a) > ord(b) ? -1 : 0))
    .slice(0, n ?? Infinity);
}
