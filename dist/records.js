/**
 * Club records, computed in the browser from the match list.
 *
 * Nothing here is stored in data.js. Every figure is derived from the same
 * games the rest of the page uses, so a record can never quietly disagree with
 * the profile it points at.
 *
 * Four rules run through all of it:
 *
 *   - A rate needs a floor. "100% win rate" off three games is not a record,
 *     it is a small sample, so every rate-based record carries a minimum and
 *     says what it is.
 *
 *   - A record names a holder only when one exists. Ties are reported as ties
 *     rather than silently resolved by whoever sorts first.
 *
 *   - A podium ranks the three best VALUES, not the three best people. If two
 *     players tie for the top mark they share gold, and silver is then the next
 *     distinct mark below them - not the third name in the list. The
 *     alternative would let a tie quietly swallow a place and leave a real
 *     achievement off the wall.
 *
 *   - The number on the card is the number the ranking used. Ranking on a raw
 *     fraction and printing a rounded one splits two players who both read
 *     "76%" across second and third place, spending a place on a difference
 *     nobody can see.
 *
 * Detail is gathered in later passes, over only the handful of players and
 * pairs that actually reached a podium. Keeping a game list for every pair in
 * the club would cost megabytes to answer questions about eleven of them.
 */

/* ------------------------------------------------------------- thresholds */
const MIN_GAMES_FOR_RATE   = 50;    // best win rate
const MIN_GAMES_TOGETHER   = 15;    // best partnership
const MIN_MEETINGS         = 15;    // fiercest rivalry
const MIN_NEMESIS          = 20;    // the nemesis - a lopsided head-to-head
const MIN_CHEMISTRY        = 30;    // dream team / chemistry check
const MIN_ONE_POINTERS     = 25;    // ice in the veins
const MIN_IMPROVE_GAMES    = 400;   // most improved
const IMPROVE_WINDOW       = 150;   // ... comparing this many games each end
const PERFECT_NIGHT        = 10;    // a full night unbeaten, not a short visit
const GIANT_POOL           = 500;   // games needed before we call someone a giant
const GIANT_COUNT          = 10;    // how many giants
const MIN_VS_GIANTS        = 100;   // games against them before the rate counts
const CENTURY              = 1000;  // career games for the Century Club

const PLACES = 3;                   // gold, silver, bronze
const MAX_DETAIL_GAMES = 10;        // games listed inside one expanded card

const pct = (w, g) => (g ? w / g : 0);
const pairKey = (a, b) => [a, b].sort().join('|');
const shownPct = (r) => Math.round(100 * r.winPct);

export function clubRecords(matches, players) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;

  // Most Improved walks a player's career in order, so it needs the games in
  // the order they were played. data.js is already sorted, but a record that
  // silently depends on someone else's sort order is a record waiting to be
  // wrong; sorting a copy costs one pass and removes the assumption.
  const inOrder = [...matches].sort((x, y) =>
    (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.ts ?? 0) - (y.ts ?? 0)));

  /* ---------------------------------------------------- one pass, everything */
  const per = new Map();            // player -> tallies
  const pairs = new Map();          // "a|b" as partners
  const rivals = new Map();         // "a|b" as opponents, with the split
  const byDay = new Map();          // date -> game count
  const playerDay = new Map();      // "player|date" -> { games, wins }
  const career = new Map();         // player -> [1,0,1,...] in match order
  let points = 0, closest = [];

  const touch = (id) => {
    let p = per.get(id);
    if (!p) per.set(id, p = { id, games: 0, wins: 0, losses: 0, pf: 0, pa: 0,
                              partners: new Set(), best: 0, run: 0,
                              onePt: 0, oneWon: 0, oneLost: 0 });
    return p;
  };

  for (const m of inOrder) {
    const aWon = m.sa > m.sb;
    const margin = Math.abs(m.sa - m.sb);
    const onePt = margin === 1;
    points += m.sa + m.sb;
    byDay.set(m.date, (byDay.get(m.date) ?? 0) + 1);

    if (onePt) closest.push(m);

    for (const [side, other, mine, theirs, won] of [
      [m.a, m.b, m.sa, m.sb, aWon],
      [m.b, m.a, m.sb, m.sa, !aWon],
    ]) {
      for (const id of side) {
        const p = touch(id);
        p.games++; p.pf += mine; p.pa += theirs;
        if (won) { p.wins++; p.run++; if (p.run > p.best) p.best = p.run; }
        else { p.losses++; p.run = 0; }
        if (onePt) { p.onePt++; won ? p.oneWon++ : p.oneLost++; }
        for (const o of side) if (o !== id) p.partners.add(o);

        // a night's work, per person - the basis of the Perfect Night
        const dk = id + '|' + m.date;
        let d = playerDay.get(dk);
        if (!d) playerDay.set(dk, d = { id, date: m.date, games: 0, wins: 0 });
        d.games++; if (won) d.wins++;

        // the career in order, for Most Improved
        let c = career.get(id);
        if (!c) career.set(id, c = []);
        c.push(won ? 1 : 0);
      }
      // partnership
      const [x, y] = [...side].sort();
      const pk = x + '|' + y;
      let pr = pairs.get(pk);
      if (!pr) pairs.set(pk, pr = { a: x, b: y, games: 0, wins: 0 });
      pr.games++; if (won) pr.wins++;
      // rivalry. Counted once per meeting, from the lower id's point of view,
      // so `aWins` always means "the player named first won".
      for (const u of side) for (const v of other) {
        if (u >= v) continue;
        const rk = u + '|' + v;
        let rv = rivals.get(rk);
        if (!rv) rivals.set(rk, rv = { a: u, b: v, meetings: 0, aWins: 0 });
        rv.meetings++; if (won) rv.aWins++;
      }
    }
  }

  const all = [...per.values()].map((p) => ({ ...p, winPct: pct(p.wins, p.games),
                                              diff: p.pf - p.pa, partnerCount: p.partners.size,
                                              onePtPct: pct(p.oneWon, p.onePt) }));
  const byIdRow = new Map(all.map((r) => [r.id, r]));

  /* ------------------------------------------------------------- the podium */
  /**
   * The three best distinct values, each carrying every holder of that value.
   * Returns [] when nothing clears the filter, so a record with no qualifiers
   * simply does not appear rather than appearing empty.
   */
  const podium = (rows, key, filter = () => true) => {
    const pool = rows.filter(filter);
    if (!pool.length) return [];
    const values = [...new Set(pool.map(key))].sort((a, b) => b - a).slice(0, PLACES);
    return values.map((v, i) => ({
      place: i + 1,
      value: v,
      holders: pool.filter((r) => key(r) === v),
    }));
  };

  const rate    = podium(all, shownPct, (r) => r.games >= MIN_GAMES_FOR_RATE);
  const iron    = podium(all, (r) => r.games);
  const wins    = podium(all, (r) => r.wins);
  const streak  = podium(all, (r) => r.best);
  const social  = podium(all, (r) => r.partnerCount);
  const scorer  = podium(all, (r) => r.pf);
  const diff    = podium(all, (r) => r.diff);

  /* ---------------------------------------------------- nerve: one-point games */
  // A game decided by a single point is the closest thing this data has to a
  // pressure moment. Two records come out of it, and they are deliberately
  // opposite: who wins them, and who keeps losing them.
  const clutch     = podium(all, (r) => Math.round(100 * r.onePtPct),
                            (r) => r.onePt >= MIN_ONE_POINTERS);
  const heartbreak = podium(all, (r) => r.oneLost, (r) => r.oneLost > 0);

  /* ------------------------------------------------------- the perfect night */
  // Won every game, on a night long enough to mean something. A typical MIP
  // night is 10-12 games, so the floor is a full night rather than a cameo.
  const perfectNights = new Map();  // player -> [dates]
  for (const d of playerDay.values()) {
    if (d.games < PERFECT_NIGHT || d.wins !== d.games) continue;
    if (!perfectNights.has(d.id)) perfectNights.set(d.id, []);
    perfectNights.get(d.id).push({ date: d.date, games: d.games });
  }
  const perfectRows = [...perfectNights.entries()].map(([id, nights]) => ({
    id, nights: nights.length, dates: nights.sort((x, y) => (x.date < y.date ? -1 : 1)),
  }));
  const perfect = podium(perfectRows, (r) => r.nights);

  /* ------------------------------------------------------------ most improved */
  // A player's first IMPROVE_WINDOW games against their most recent
  // IMPROVE_WINDOW. Comparing career halves would let one long flat stretch
  // drown the change; comparing the two ends asks the question people actually
  // mean, which is "are they better now than when they started".
  const improveRows = [];
  for (const [id, c] of career) {
    if (c.length < MIN_IMPROVE_GAMES) continue;
    const early = c.slice(0, IMPROVE_WINDOW).reduce((a, b) => a + b, 0) / IMPROVE_WINDOW;
    const late  = c.slice(-IMPROVE_WINDOW).reduce((a, b) => a + b, 0) / IMPROVE_WINDOW;
    improveRows.push({ id, games: c.length, early, late,
                       gain: Math.round(100 * late) - Math.round(100 * early) });
  }
  const improved = podium(improveRows, (r) => r.gain, (r) => r.gain > 0);

  /* -------------------------------------------------------------- giant killer */
  // "Giant" is defined from this club's own games rather than an outside
  // rating, because only 68 of 546 players carry a DUPR figure and a record
  // that quietly ignores seven players in eight is not a club record.
  const giants = all.filter((r) => r.games >= GIANT_POOL)
    .sort((x, y) => y.winPct - x.winPct).slice(0, GIANT_COUNT).map((r) => r.id);
  const giantSet = new Set(giants);
  const vsGiant = new Map();
  for (const m of inOrder) {
    const aWon = m.sa > m.sb;
    for (const [side, other, won] of [[m.a, m.b, aWon], [m.b, m.a, !aWon]]) {
      if (!other.some((o) => giantSet.has(o))) continue;
      for (const id of side) {
        if (giantSet.has(id)) continue;   // a giant beating a giant is not giant-killing
        let v = vsGiant.get(id);
        if (!v) vsGiant.set(id, v = { id, games: 0, wins: 0 });
        v.games++; if (won) v.wins++;
      }
    }
  }
  const giantRows = [...vsGiant.values()].map((v) => ({ ...v, winPct: pct(v.wins, v.games) }));
  const giantKill = podium(giantRows, shownPct, (r) => r.games >= MIN_VS_GIANTS);

  /* ------------------------------------------------------------- partnerships */
  const soloPct = (id) => byIdRow.get(id)?.winPct ?? 0;
  const pairRows = [...pairs.values()].map((p) => {
    const apart = (soloPct(p.a) + soloPct(p.b)) / 2;
    const together = pct(p.wins, p.games);
    return { ...p, winPct: together, apart,
             lift: Math.round(100 * together) - Math.round(100 * apart) };
  });
  const duo      = podium(pairRows, shownPct, (r) => r.games >= MIN_GAMES_TOGETHER);
  const duoMost  = podium(pairRows, (r) => r.games);
  // Chemistry: not who wins most, but who wins more TOGETHER than they manage
  // apart. It is the only partnership record a pair of average players can win,
  // and the only one that says anything about the pairing rather than the pair.
  const dream    = podium(pairRows, (r) => r.lift, (r) => r.games >= MIN_CHEMISTRY && r.lift > 0);
  const slump    = podium(pairRows, (r) => -r.lift, (r) => r.games >= MIN_CHEMISTRY && r.lift < 0);

  /* ----------------------------------------------------------------- rivalries */
  const rivalRows = [...rivals.values()].map((r) => {
    const bWins = r.meetings - r.aWins;
    const top = Math.max(r.aWins, bWins);
    return { ...r, bWins, top, bottom: r.meetings - top,
             leader: r.aWins >= bWins ? r.a : r.b,
             trailer: r.aWins >= bWins ? r.b : r.a,
             share: pct(top, r.meetings) };
  });
  const rivalry = podium(rivalRows, (r) => r.meetings, (r) => r.meetings >= MIN_MEETINGS);
  // The most one-sided head-to-head in the club. Ranked on the share rather
  // than the raw gap so a 32-0 beats a 40-12.
  const nemesis = podium(rivalRows, (r) => Math.round(100 * r.share),
                         (r) => r.meetings >= MIN_NEMESIS);

  /* --------------------------------------------------------------- busiest day */
  const days  = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
  const dates = [...byDay.keys()].sort();
  const dayPodium = [...new Set(days.map(([, n]) => n))].slice(0, PLACES).map((n, i) => ({
    place: i + 1, value: n, holders: days.filter(([, c]) => c === n).map(([d, c]) => ({ date: d, games: c })),
  }));

  /* ------------------------------------------------- pass two: the details */
  // Only the subjects that reached a podium. Everyone else is never asked about.
  const wantPair = new Set();
  const wantRival = new Set();
  const wantStreak = new Set();

  for (const pl of [...duo, ...duoMost, ...dream, ...slump])
    for (const h of pl.holders) wantPair.add(pairKey(h.a, h.b));
  for (const pl of [...rivalry, ...nemesis])
    for (const h of pl.holders) wantRival.add(pairKey(h.a, h.b));
  for (const pl of streak) for (const h of pl.holders) wantStreak.add(h.id);

  const pairGames  = new Map();
  const rivalGames = new Map();
  const runs = new Map();

  for (const id of wantStreak) runs.set(id, { best: 0, run: 0, from: null, to: null, endedBy: null, cur: null });

  for (const m of inOrder) {
    for (const [side, other, mine, theirs, won] of [
      [m.a, m.b, m.sa, m.sb, m.sa > m.sb],
      [m.b, m.a, m.sb, m.sa, m.sb > m.sa],
    ]) {
      if (side.length === 2) {
        const pk = pairKey(side[0], side[1]);
        if (wantPair.has(pk)) {
          if (!pairGames.has(pk)) pairGames.set(pk, []);
          pairGames.get(pk).push({ date: m.date, won, mine, theirs, against: [...other] });
        }
      }
      for (const u of side) {
        // streaks, walked in match order so the run boundaries are real dates
        const r = runs.get(u);
        if (r) {
          if (won) {
            if (!r.run) r.cur = { from: m.date, to: m.date };
            r.run++; r.cur.to = m.date;
            if (r.run > r.best) { r.best = r.run; r.from = r.cur.from; r.to = r.cur.to; r.endedBy = null; r.pending = true; }
          } else {
            if (r.pending) { r.endedBy = { date: m.date, by: [...other], mine, theirs }; r.pending = false; }
            r.run = 0; r.cur = null;
          }
        }
        for (const v of other) {
          const rk = pairKey(u, v);
          if (wantRival.has(rk) && u < v) {
            if (!rivalGames.has(rk)) rivalGames.set(rk, []);
            rivalGames.get(rk).push({ date: m.date, aWon: won, a: u, b: v, mine, theirs });
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------ assembling */
  const person = (h) => ({ id: h.id, name: nameOf(h.id) });
  const duoName = (h) => `${nameOf(h.a)} & ${nameOf(h.b)}`;

  // A partnership's detail is the games they LOST. For a pair who won 23 of 24
  // that is the whole story, and it is the first thing anybody asks.
  const pairDetail = (h) => {
    const games = pairGames.get(pairKey(h.a, h.b)) ?? [];
    const losses = games.filter((g) => !g.won);
    return {
      kind: 'games',
      lead: losses.length
        ? `${losses.length === 1 ? 'The one game' : `The ${losses.length} games`} they lost together`
        : 'They never lost a game together',
      rows: losses.slice(0, MAX_DETAIL_GAMES).map((g) => ({
        date: g.date, score: `${g.mine}–${g.theirs}`,
        text: `lost to ${g.against.map(nameOf).join(' & ')}`,
      })),
      more: Math.max(0, losses.length - MAX_DETAIL_GAMES),
      facts: [
        ['Played together', `${games.length} games`],
        ['Won', `${games.length - losses.length}`],
        ['Lost', `${losses.length}`],
      ],
    };
  };

  // Chemistry records are about the gap, so their detail shows both sides of it
  // rather than the game list. "78% together" means nothing without "55% apart".
  const chemistryDetail = (h) => {
    const games = pairGames.get(pairKey(h.a, h.b)) ?? [];
    const lost = games.filter((g) => !g.won).length;
    return {
      kind: 'facts',
      lead: h.lift > 0
        ? `${duoName(h)} win ${h.lift} points more often together than they do apart`
        : `${duoName(h)} win ${Math.abs(h.lift)} points less often together than they do apart`,
      rows: [],
      facts: [
        ['Together', `${h.games - lost}–${lost} (${Math.round(100 * pct(h.wins, h.games))}%)`],
        [nameOf(h.a), `${Math.round(100 * soloPct(h.a))}% on their own`],
        [nameOf(h.b), `${Math.round(100 * soloPct(h.b))}% on their own`],
      ],
    };
  };

  const rivalDetail = (h) => {
    const games = rivalGames.get(pairKey(h.a, h.b)) ?? [];
    let aw = 0;
    for (const g of games) if (g.aWon) aw++;
    const bw = games.length - aw;
    const last = games.at(-1);
    // Name whoever is actually ahead, and put the bigger number first. Reading
    // the score from A's side regardless printed "Vincent leads 27-53".
    const lead = aw === bw
      ? `Dead level at ${aw}–${bw}`
      : `${nameOf(aw > bw ? h.a : h.b)} leads ${Math.max(aw, bw)}–${Math.min(aw, bw)}`;
    return {
      kind: 'facts',
      lead,
      rows: [],
      facts: [
        [nameOf(h.a), `${aw} ${aw === 1 ? 'win' : 'wins'}`],
        [nameOf(h.b), `${bw} ${bw === 1 ? 'win' : 'wins'}`],
        ['Last met', last ? last.date : '—'],
      ],
    };
  };

  const streakDetail = (h) => {
    const r = runs.get(h.id);
    if (!r) return null;
    return {
      kind: 'facts',
      lead: r.endedBy
        ? `The run ended against ${r.endedBy.by.map(nameOf).join(' & ')}`
        : 'The run was still alive at the end of the record',
      rows: r.endedBy
        ? [{ date: r.endedBy.date, score: `${r.endedBy.mine}–${r.endedBy.theirs}`,
             text: `lost to ${r.endedBy.by.map(nameOf).join(' & ')}` }]
        : [],
      facts: [
        ['Run started', r.from ?? '—'],
        ['Run ended', r.to ?? '—'],
        ['Games played in all', String(per.get(h.id)?.games ?? 0)],
      ],
    };
  };

  const playerDetail = (h) => {
    const p = per.get(h.id);
    if (!p) return null;
    return {
      kind: 'facts', lead: '', rows: [],
      facts: [
        ['Record', `${p.wins}–${p.losses}`],
        ['Win rate', `${Math.round(100 * pct(p.wins, p.games))}%`],
        ['Points for / against', `${p.pf} / ${p.pa}`],
        ['Different partners', String(p.partners.size)],
      ],
    };
  };

  // Named, not "they". Every holder of this record has the same shape of story,
  // so an unnamed lead reads identically in all four blocks and the panel looks
  // like it is repeating gold - which is exactly the bug the story panel was
  // split up to fix in the first place.
  const perfectDetail = (h) => ({
    kind: 'games',
    lead: h.nights === 1
      ? `The night ${nameOf(h.id)} did not drop a game`
      : `The ${h.nights} nights ${nameOf(h.id)} did not drop a game`,
    rows: h.dates.slice(0, MAX_DETAIL_GAMES).map((d) => ({
      date: d.date, score: `${d.games}–0`, text: 'won every game',
    })),
    more: Math.max(0, h.dates.length - MAX_DETAIL_GAMES),
    facts: [['Games played in all', String(per.get(h.id)?.games ?? 0)]],
  });

  const clutchDetail = (h) => {
    const p = per.get(h.id);
    if (!p) return null;
    return {
      kind: 'facts',
      lead: `${p.oneWon} of ${nameOf(h.id)}'s ${p.onePt} one-point games went their way`,
      rows: [],
      facts: [
        ['One-point record', `${p.oneWon}–${p.oneLost}`],
        ['Overall record', `${p.wins}–${p.losses}`],
        ['Win rate overall', `${Math.round(100 * pct(p.wins, p.games))}%`],
      ],
    };
  };

  const improveDetail = (h) => ({
    kind: 'facts',
    lead: `${nameOf(h.id)}: the first ${IMPROVE_WINDOW} games against the most recent ${IMPROVE_WINDOW}`,
    rows: [],
    facts: [
      [`First ${IMPROVE_WINDOW}`, `${Math.round(100 * h.early)}%`],
      [`Latest ${IMPROVE_WINDOW}`, `${Math.round(100 * h.late)}%`],
      ['Games played in all', String(h.games)],
    ],
  });

  const giantDetail = (h) => {
    const p = per.get(h.id);
    return {
      kind: 'facts',
      lead: `Against the ten strongest players in the club: ${h.wins}–${h.games - h.wins}`,
      rows: [],
      facts: [
        ['Versus the ten', `${h.wins}–${h.games - h.wins} (${Math.round(100 * h.winPct)}%)`],
        ['Everyone else', p ? `${p.wins - h.wins}–${p.losses - (h.games - h.wins)}` : '—'],
        ['Games played in all', String(p?.games ?? 0)],
      ],
    };
  };

  /** Shape one podium into what the page renders. */
  const build = (pod, opts) => {
    if (!pod.length) return null;
    const { label, unit, value = (v) => v, holder, detail, minimum, note, tone } = opts;
    return {
      label, unit, minimum, note, tone,
      places: pod.map((pl) => ({
        place: pl.place,
        value: value(pl.value),
        tied: pl.holders.length > 1,
        holders: pl.holders.map((h) => ({ ...holder(h, pl), detail: detail ? detail(h) : null })),
      })),
    };
  };

  /* --------------------------------------------------------- the play clock */
  // Scoreholio's scoreboard times the game it is scoring, which makes this the
  // only thing on the site measured in seconds rather than counted. It covers
  // roughly half the games - DUPR carries no clock, and Scoreholio did not
  // record one until 2026 - so every figure here says what it is computed from
  // rather than implying it speaks for all 24,000 games.
  const timed = matches.filter((m) => Number.isFinite(m.dur) && m.dur > 0);
  const clock = (() => {
    if (!timed.length) return null;
    const sorted = [...timed].sort((x, y) => x.dur - y.dur);
    const total = sorted.reduce((a, m) => a + m.dur, 0);
    const game = (m) => ({
      date: m.date, seconds: m.dur, score: `${Math.max(m.sa, m.sb)}–${Math.min(m.sa, m.sb)}`,
      winners: (m.sa > m.sb ? m.a : m.b).map(nameOf),
      losers: (m.sa > m.sb ? m.b : m.a).map(nameOf),
    });
    // The changeover, from Scoreholio's own Wait Duration. Reported as a MEDIAN
    // where the play clock is reported as a mean, and the difference is not
    // cosmetic: a court left empty for half an hour is a real reading, not a
    // bad one, so the tail belongs in the data but not in the headline. The
    // mean wait is 74 seconds and the median is 46, and the median is the one
    // that describes an ordinary changeover.
    const waits = matches.filter((m) => Number.isFinite(m.wait)).map((m) => m.wait)
      .sort((x, y) => x - y);
    const medianWait = waits.length ? waits[Math.floor(waits.length / 2)] : null;
    const medianPlay = sorted[Math.floor(sorted.length / 2)].dur;
    return {
      counted: timed.length,
      share: timed.length / matches.length,
      meanSeconds: Math.round(total / sorted.length),
      medianSeconds: medianPlay,
      shortest: game(sorted[0]),
      longest: game(sorted[sorted.length - 1]),
      firstDate: timed.reduce((a, m) => (m.date < a ? m.date : a), timed[0].date),
      wait: waits.length ? {
        counted: waits.length,
        medianSeconds: medianWait,
        quickSeconds: waits[Math.floor(waits.length * 0.25)],
        slowSeconds: waits[Math.floor(waits.length * 0.75)],
        // What a court actually does with an hour: one game plus one changeover
        // is a full cycle, and the share of it spent playing is the figure
        // people find surprising.
        cycleSeconds: medianPlay + medianWait,
        playShare: medianPlay / (medianPlay + medianWait),
      } : null,
    };
  })();

  /* -------------------------------------------------------------- the rolls */
  // Not every honour is a podium. The Century Club is a list, and the point of
  // it is that it is long: thirty-odd people have played a thousand games for
  // this club, and a wall that only ever names three of them hides that.
  const century = all.filter((r) => r.games >= CENTURY)
    .sort((x, y) => y.games - x.games)
    .map((r) => ({ id: r.id, name: nameOf(r.id), games: r.games,
                   context: `${r.wins}–${r.losses}` }));

  return {
    totals: {
      games: matches.length,
      points,
      players: all.length,
      days: byDay.size,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
      closeGames: closest.length,
      averagePerDay: byDay.size ? Math.round(matches.length / byDay.size) : 0,
    },
    minimums: {
      rate: MIN_GAMES_FOR_RATE, together: MIN_GAMES_TOGETHER, meetings: MIN_MEETINGS,
      nemesis: MIN_NEMESIS, chemistry: MIN_CHEMISTRY, onePointers: MIN_ONE_POINTERS,
      improveGames: MIN_IMPROVE_GAMES, improveWindow: IMPROVE_WINDOW,
      perfectNight: PERFECT_NIGHT, vsGiants: MIN_VS_GIANTS, century: CENTURY,
    },
    giants: giants.map((id) => ({ id, name: nameOf(id) })),
    clock,
    rolls: {
      century: {
        label: 'The Century Club',
        note: `Every player past ${CENTURY.toLocaleString()} career games`,
        members: century,
      },
    },
    records: {
      /* --- the big ones --- */
      ironMan: build(iron, {
        label: 'Most games played', unit: 'games',
        holder: (h) => ({ ...person(h), value: h.games,
          context: `${h.wins}–${h.losses}, ${Math.round(100 * h.winPct)}% win rate` }),
        detail: playerDetail,
      }),
      mostWins: build(wins, {
        label: 'Most wins', unit: 'wins',
        holder: (h) => ({ ...person(h), value: h.wins,
          context: `from ${h.games} games, ${Math.round(100 * h.winPct)}% win rate` }),
        detail: playerDetail,
      }),
      winRate: build(rate, {
        label: 'Best win rate', unit: '%', minimum: `${MIN_GAMES_FOR_RATE}+ games`,
        holder: (h) => ({ ...person(h), value: Math.round(100 * h.winPct),
          context: `${h.wins}–${h.losses} in ${h.games} games` }),
        detail: playerDetail,
      }),
      streak: build(streak, {
        label: 'Longest winning streak', unit: 'in a row',
        holder: (h) => ({ ...person(h), value: h.best, context: `out of ${h.games} games played` }),
        detail: streakDetail,
      }),

      /* --- nerve --- */
      perfectNight: build(perfect, {
        label: 'The Perfect Night', unit: 'nights',
        minimum: `${PERFECT_NIGHT}+ games that night`,
        note: 'Turned up, played a full night, lost nothing',
        holder: (h) => ({ ...person(h), value: h.nights,
          context: h.nights === 1 ? `on ${h.dates[0].date}` : `${h.dates.length} unbeaten nights` }),
        detail: perfectDetail,
      }),
      clutch: build(clutch, {
        label: 'Ice in the veins', unit: '%',
        minimum: `${MIN_ONE_POINTERS}+ one-point games`,
        note: 'Win rate in games decided by a single point',
        holder: (h) => ({ ...person(h), value: Math.round(100 * h.onePtPct),
          context: `${h.oneWon}–${h.oneLost} in games decided by one` }),
        detail: clutchDetail,
      }),
      heartbreak: build(heartbreak, {
        label: 'Most heartbreak', unit: 'lost by one', tone: 'playful',
        note: 'Games lost by a single point. Nobody’s fault.',
        holder: (h) => ({ ...person(h), value: h.oneLost,
          context: `${h.oneWon} of their ${h.onePt} one-pointers went the other way` }),
        detail: clutchDetail,
      }),
      busiestDay: build(dayPodium, {
        label: 'Busiest day', unit: 'games',
        holder: (h) => ({ id: null, name: null, date: h.date, value: h.games,
          context: 'games played in a single day' }),
      }),

      /* --- chemistry --- */
      partnership: build(duo, {
        label: 'Best partnership', unit: '%', minimum: `${MIN_GAMES_TOGETHER}+ games together`,
        holder: (h) => ({ id: h.a, id2: h.b, name: duoName(h), value: Math.round(100 * h.winPct),
          context: `${h.wins}–${h.games - h.wins} in ${h.games} together` }),
        detail: pairDetail,
      }),
      mostPlayedPair: build(duoMost, {
        label: 'Most-played partnership', unit: 'games',
        holder: (h) => ({ id: h.a, id2: h.b, name: duoName(h), value: h.games,
          context: `${h.wins} wins, ${Math.round(100 * pct(h.wins, h.games))}% together` }),
        detail: pairDetail,
      }),
      dreamTeam: build(dream, {
        label: 'The Dream Team', unit: 'pts better', minimum: `${MIN_CHEMISTRY}+ games together`,
        note: 'Win rate together, against what the two of them manage apart',
        holder: (h) => ({ id: h.a, id2: h.b, name: duoName(h), value: h.lift,
          context: `${Math.round(100 * h.winPct)}% together · ${Math.round(100 * h.apart)}% apart` }),
        detail: chemistryDetail,
      }),
      chemistryCheck: build(slump, {
        label: 'Chemistry check', unit: 'pts worse', tone: 'playful',
        minimum: `${MIN_CHEMISTRY}+ games together`,
        note: 'Two good players who somehow do not add up',
        holder: (h) => ({ id: h.a, id2: h.b, name: duoName(h), value: -h.lift,
          context: `${Math.round(100 * h.winPct)}% together · ${Math.round(100 * h.apart)}% apart` }),
        detail: chemistryDetail,
      }),
      social: build(social, {
        label: 'Played with the most people', unit: 'partners',
        holder: (h) => ({ ...person(h), value: h.partnerCount, context: `across ${h.games} games` }),
        detail: playerDetail,
      }),

      /* --- rivalry --- */
      rivalry: build(rivalry, {
        label: 'Fiercest rivalry', unit: 'meetings', minimum: `${MIN_MEETINGS}+ meetings`,
        holder: (h) => ({ id: h.a, id2: h.b, name: `${nameOf(h.a)} vs ${nameOf(h.b)}`,
          value: h.meetings, context: 'games on opposite sides of the net' }),
        detail: rivalDetail,
      }),
      nemesis: build(nemesis, {
        label: 'The Nemesis', unit: '%', minimum: `${MIN_NEMESIS}+ meetings`, tone: 'playful',
        note: 'The most one-sided head-to-head in the club',
        holder: (h) => ({ id: h.leader, id2: h.trailer,
          name: `${nameOf(h.leader)} over ${nameOf(h.trailer)}`,
          value: Math.round(100 * h.share),
          context: `${h.top}–${h.bottom} in ${h.meetings} meetings` }),
        detail: rivalDetail,
      }),

      /* --- the climb --- */
      improved: build(improved, {
        label: 'Most improved', unit: 'pts', minimum: `${MIN_IMPROVE_GAMES}+ games`,
        note: `First ${IMPROVE_WINDOW} games against the most recent ${IMPROVE_WINDOW}`,
        holder: (h) => ({ ...person(h), value: h.gain,
          context: `${Math.round(100 * h.early)}% then, ${Math.round(100 * h.late)}% now` }),
        detail: improveDetail,
      }),
      giantKiller: build(giantKill, {
        label: 'Giant killer', unit: '%', minimum: `${MIN_VS_GIANTS}+ games against them`,
        note: 'Win rate against the ten strongest players in the club',
        holder: (h) => ({ ...person(h), value: Math.round(100 * h.winPct),
          context: `${h.wins}–${h.games - h.wins} against the ten` }),
        detail: giantDetail,
      }),

      /* --- points --- */
      scorer: build(scorer, {
        label: 'Most points scored', unit: 'points',
        holder: (h) => ({ ...person(h), value: h.pf, context: `in ${h.games} games` }),
        detail: playerDetail,
      }),
      pointDiff: build(diff, {
        label: 'Best points difference', unit: 'points',
        holder: (h) => ({ ...person(h), value: h.diff, context: `${h.pf} scored, ${h.pa} conceded` }),
        detail: playerDetail,
      }),
    },
  };
}
