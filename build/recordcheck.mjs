// Independent recomputation of every club record.
//
// records.js computes them all in one clever pass. This file does each one the
// slow obvious way and demands the same answer. A record with somebody's name
// on it is the most public thing on the site - if it is wrong, it is wrong in
// front of the whole club.
import { matches, players } from '../dist/data.js';
import { clubRecords } from '../dist/records.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };
const R = clubRecords(matches, players);
const name = (id) => players.find((p) => p.id === id)?.name ?? id;

// A record is now a podium: places[0] is gold, [1] silver, [2] bronze. These
// two read the top place, which is what every "the record is X" check means.
const gold = (rec) => rec.places[0];
const won = (rec) => rec.places[0].holders;
const top = (rec) => rec.places[0].value;

/* ----------------------------------------------------------------- totals */
t('total games', R.totals.games === matches.length);
t('total points', R.totals.points === matches.reduce((a, m) => a + m.sa + m.sb, 0));
t('playing days', R.totals.days === new Set(matches.map((m) => m.date)).size);
t('first date', R.totals.firstDate === matches.map((m) => m.date).sort()[0]);
t('players with games', R.totals.players === new Set(matches.flatMap((m) => [...m.a, ...m.b])).size);

/* --------------------------------------------------------- per-player, slowly */
const slow = new Map();
for (const m of matches) {
  for (const id of [...m.a, ...m.b]) {
    if (!slow.has(id)) slow.set(id, { games: 0, wins: 0, pf: 0, pa: 0, partners: new Set() });
    const s = slow.get(id);
    const mine = m.a.includes(id) ? m.sa : m.sb;
    const theirs = m.a.includes(id) ? m.sb : m.sa;
    s.games++; s.pf += mine; s.pa += theirs;
    if (mine > theirs) s.wins++;
    const side = m.a.includes(id) ? m.a : m.b;
    for (const o of side) if (o !== id) s.partners.add(o);
  }
}
const rows = [...slow].map(([id, s]) => ({ id, ...s, winPct: s.wins / s.games, diff: s.pf - s.pa }));

const maxBy = (f, filter = () => true) => {
  const pool = rows.filter(filter);
  const best = Math.max(...pool.map(f));
  return { best, ids: pool.filter((r) => f(r) === best).map((r) => r.id) };
};

const iron = maxBy((r) => r.games);
t('iron man value', top(R.records.ironMan) === iron.best, `${top(R.records.ironMan)} vs ${iron.best}`);
t('iron man holder', won(R.records.ironMan).map((h) => h.id).sort().join() === iron.ids.sort().join());

const rate = maxBy((r) => r.winPct, (r) => r.games >= R.minimums.rate);
t('best win rate holder', won(R.records.winRate).map((h) => h.id).sort().join() === rate.ids.sort().join(),
  `${won(R.records.winRate).map((h) => h.name)} vs ${rate.ids.map(name)}`);
t('best win rate value', top(R.records.winRate) === Math.round(100 * rate.best),
  `${top(R.records.winRate)} vs ${Math.round(100 * rate.best)}`);
t('win-rate floor is respected',
  won(R.records.winRate).every((h) => slow.get(h.id).games >= R.minimums.rate));

const soc = maxBy((r) => r.partners.size);
t('most partners', top(R.records.social) === soc.best && won(R.records.social).map((h) => h.id).sort().join() === soc.ids.sort().join());

const sc = maxBy((r) => r.pf);
t('most points scored', top(R.records.scorer) === sc.best && won(R.records.scorer)[0].id === sc.ids[0]);

const df = maxBy((r) => r.diff);
t('best point difference', top(R.records.pointDiff) === df.best);

/* ------------------------------------------------------------------ streaks */
// Walk each player's games in order and count runs the long way.
const byPlayer = new Map();
for (const m of matches) for (const id of [...m.a, ...m.b]) {
  if (!byPlayer.has(id)) byPlayer.set(id, []);
  const mine = m.a.includes(id) ? m.sa : m.sb, theirs = m.a.includes(id) ? m.sb : m.sa;
  byPlayer.get(id).push(mine > theirs);
}
let bestStreak = 0, streakIds = [];
for (const [id, seq] of byPlayer) {
  let run = 0, best = 0;
  for (const won of seq) { run = won ? run + 1 : 0; if (run > best) best = run; }
  if (best > bestStreak) { bestStreak = best; streakIds = [id]; }
  else if (best === bestStreak) streakIds.push(id);
}
t('longest streak value', top(R.records.streak) === bestStreak, `${top(R.records.streak)} vs ${bestStreak}`);
t('longest streak holder', won(R.records.streak).map((h) => h.id).sort().join() === streakIds.sort().join());

/* -------------------------------------------------------------- partnerships */
const duo = new Map();
for (const m of matches) for (const side of [m.a, m.b]) {
  const k = [...side].sort().join('|');
  if (!duo.has(k)) duo.set(k, { games: 0, wins: 0 });
  const d = duo.get(k); d.games++;
  const won = side === m.a ? m.sa > m.sb : m.sb > m.sa;
  if (won) d.wins++;
}
const duoRows = [...duo].map(([k, v]) => ({ k, ...v, winPct: v.wins / v.games }));
const bestDuo = duoRows.filter((d) => d.games >= R.minimums.together)
  .reduce((a, b) => (b.winPct > a.winPct ? b : a));
t('best partnership rate', top(R.records.partnership) === Math.round(100 * bestDuo.winPct),
  `${top(R.records.partnership)} vs ${Math.round(100 * bestDuo.winPct)}`);
// A record's headline number and its holder's number must be the same number.
for (const [key, rec] of Object.entries(R.records)) {
  if (!rec) continue;
  for (const pl of rec.places) {
    t(`${key}: place ${pl.place} value equals its holders' value`, pl.holders.every((h) => h.value === pl.value),
      `place ${pl.value} vs holders ${pl.holders.map((h) => h.value).join()}`);
  }
}
const mostDuo = duoRows.reduce((a, b) => (b.games > a.games ? b : a));
t('most-played partnership', top(R.records.mostPlayedPair) === mostDuo.games);
t('partnership floor is respected',
  won(R.records.partnership).every((h) => duo.get([h.id, h.id2].sort().join('|')).games >= R.minimums.together));

/* ------------------------------------------------------------------ rivalry */
const riv = new Map();
for (const m of matches) for (const u of m.a) for (const v of m.b) {
  const k = [u, v].sort().join('|');
  riv.set(k, (riv.get(k) ?? 0) + 1);
}
const bestRiv = Math.max(...riv.values());
t('fiercest rivalry value', top(R.records.rivalry) === bestRiv, `${top(R.records.rivalry)} vs ${bestRiv}`);
t('each meeting counted once', [...riv.values()].reduce((a, b) => a + b, 0) === matches.length * 4);

/* --------------------------------------------------------------- busiest day */
const perDay = new Map();
for (const m of matches) perDay.set(m.date, (perDay.get(m.date) ?? 0) + 1);
t('busiest day', top(R.records.busiestDay) === Math.max(...perDay.values()));

/* ----------------------------------------------------------- sanity on shape */
for (const [key, rec] of Object.entries(R.records)) {
  if (!rec) continue;
  t(`${key}: has at least one place`, rec.places.length >= 1);
  t(`${key}: never more than three places`, rec.places.length <= 3, String(rec.places.length));
  t(`${key}: gold has at least one holder`, won(rec).length >= 1);
  for (const pl of rec.places) {
    t(`${key}: place ${pl.place} tied flag agrees with holder count`, pl.tied === (pl.holders.length > 1));
    t(`${key}: place ${pl.place} ids are real players or null`,
      pl.holders.every((h) => h.id === null || players.some((p) => p.id === h.id)));
  }
  // The podium ranks distinct VALUES. Two places sharing a value would mean a
  // tie had quietly eaten a place, which is the bug this shape exists to avoid.
  const vals = rec.places.map((pl) => pl.value);
  t(`${key}: places run strictly downwards`, vals.every((v, i) => i === 0 || v < vals[i - 1]),
    vals.join(' > '));
  t(`${key}: places are numbered 1,2,3 in order`,
    rec.places.every((pl, i) => pl.place === i + 1));
  // Nobody can hold two places at once.
  const seen = new Set(); let dup = false;
  for (const pl of rec.places) for (const h of pl.holders) {
    const k = [h.id, h.id2, h.date].join('|');
    if (seen.has(k)) dup = true; seen.add(k);
  }
  t(`${key}: no holder appears on two places`, !dup);
}

/* ------------------------------------------ the podium, recomputed slowly */
// Not just "is it sorted" - are these actually the three best marks? Recompute
// the distinct values the long way and demand the same three.
{
  const distinct = (f, filter = () => true) =>
    [...new Set(rows.filter(filter).map(f))].sort((a, b) => b - a).slice(0, 3);

  t('most games: the three best marks are right',
    R.records.ironMan.places.map((pl) => pl.value).join() === distinct((r) => r.games).join(),
    `${R.records.ironMan.places.map((pl) => pl.value)} vs ${distinct((r) => r.games)}`);

  t('most partners: the three best marks are right',
    R.records.social.places.map((pl) => pl.value).join() === distinct((r) => r.partners.size).join());

  t('most points: the three best marks are right',
    R.records.scorer.places.map((pl) => pl.value).join() === distinct((r) => r.pf).join());

  // And every holder listed on a place really does hold that mark.
  for (const pl of R.records.ironMan.places) {
    t(`most games: place ${pl.place} lists everyone who holds it`,
      pl.holders.map((h) => h.id).sort().join() ===
      rows.filter((r) => r.games === pl.value).map((r) => r.id).sort().join());
  }
}

/* ------------------------------------------------------- the detail panels */
{
  // The partnership detail claims to list the games the pair lost. Recompute
  // that pair's games from scratch and demand the same losses - this is the
  // number Dave actually asked about, so a wrong one is worse than none.
  for (const pl of R.records.partnership.places) {
    for (const h of pl.holders) {
      const theirs = matches.filter((m) =>
        [m.a, m.b].some((side) => side.length === 2 && side.includes(h.id) && side.includes(h.id2)));
      const lost = theirs.filter((m) => {
        const mine = m.a.includes(h.id) ? m.sa : m.sb, other = m.a.includes(h.id) ? m.sb : m.sa;
        return mine < other;
      });
      const d = h.detail;
      t(`partnership detail: ${h.name} played-together count is right`,
        d.facts.find((f) => f[0] === 'Played together')[1] === `${theirs.length} games`,
        `${d.facts.find((f) => f[0] === 'Played together')[1]} vs ${theirs.length}`);
      t(`partnership detail: ${h.name} loss count is right`,
        d.facts.find((f) => f[0] === 'Lost')[1] === String(lost.length));
      t(`partnership detail: ${h.name} lists the losses, not the wins`,
        d.rows.length === Math.min(lost.length, 10));
      t(`partnership detail: ${h.name} loss dates match`,
        d.rows.map((r) => r.date).join() === lost.slice(0, 10).map((m) => m.date).join());
    }
  }

  // The rivalry detail must name whoever is actually ahead.
  for (const pl of R.records.rivalry.places) {
    for (const h of pl.holders) {
      const met = matches.filter((m) =>
        (m.a.includes(h.id) && m.b.includes(h.id2)) || (m.b.includes(h.id) && m.a.includes(h.id2)));
      let aw = 0;
      for (const m of met) {
        const aSide = m.a.includes(h.id);
        if ((aSide && m.sa > m.sb) || (!aSide && m.sb > m.sa)) aw++;
      }
      const bw = met.length - aw;
      const leader = aw === bw ? null : name(aw > bw ? h.id : h.id2);
      t(`rivalry detail: ${h.name} names the real leader`,
        leader === null ? /level/i.test(h.detail.lead) : h.detail.lead.startsWith(leader),
        `${h.detail.lead} | truth ${aw}-${bw}`);
      t(`rivalry detail: ${h.name} puts the bigger number first`,
        aw === bw || h.detail.lead.includes(`${Math.max(aw, bw)}\u2013${Math.min(aw, bw)}`),
        h.detail.lead);
      t(`rivalry detail: ${h.name} meeting count matches the record`, met.length === pl.value);
    }
  }
}


/* ===================================================================== */
/* The 2026 additions. Each one recomputed the slow, obvious way.        */
/* ===================================================================== */

const M = R.minimums;
const isA = (m, id) => m.a.includes(id);
const mineOf = (m, id) => (isA(m, id) ? m.sa : m.sb);
const theirsOf = (m, id) => (isA(m, id) ? m.sb : m.sa);
const wonBy = (m, id) => mineOf(m, id) > theirsOf(m, id);
const everyone = [...new Set(matches.flatMap((m) => [...m.a, ...m.b]))];

/* ------------------------------------------------------------- most wins */
{
  const best = maxBy((r) => r.wins);
  t('most wins: the number', top(R.records.mostWins) === best.best,
    `${top(R.records.mostWins)} vs ${best.best}`);
  t('most wins: the holders', won(R.records.mostWins).map((h) => h.id).sort().join() === best.ids.sort().join());
  t('most wins is not just most games',
    typeof top(R.records.mostWins) === 'number' && top(R.records.mostWins) <= top(R.records.ironMan));
}

/* --------------------------------------------------------- perfect night */
{
  // Brute force: bucket every player's games by date, then count the dates on
  // which they played at least the threshold and lost none of them.
  const nights = new Map();
  for (const id of everyone) {
    const byDate = new Map();
    for (const m of matches) {
      if (!m.a.includes(id) && !m.b.includes(id)) continue;
      if (!byDate.has(m.date)) byDate.set(m.date, []);
      byDate.get(m.date).push(m);
    }
    const perfect = [...byDate.entries()]
      .filter(([, gs]) => gs.length >= M.perfectNight && gs.every((m) => wonBy(m, id)))
      .map(([d]) => d).sort();
    if (perfect.length) nights.set(id, perfect);
  }
  const best = Math.max(...[...nights.values()].map((v) => v.length));
  const ids = [...nights].filter(([, v]) => v.length === best).map(([id]) => id);
  t('perfect night: the number', top(R.records.perfectNight) === best,
    `${top(R.records.perfectNight)} vs ${best}`);
  t('perfect night: the holders',
    won(R.records.perfectNight).map((h) => h.id).sort().join() === ids.sort().join(),
    `${won(R.records.perfectNight).map((h) => h.id)} vs ${ids}`);
  for (const pl of R.records.perfectNight.places) {
    for (const h of pl.holders) {
      const truth = nights.get(h.id) ?? [];
      t(`perfect night: ${h.name} count matches the dates listed`, truth.length === pl.value);
      t(`perfect night: ${h.name} dates are real and in order`,
        h.detail.rows.map((r) => r.date).join() === truth.slice(0, 10).join(),
        `${h.detail.rows.map((r) => r.date)} vs ${truth.slice(0, 10)}`);
      // and every listed night really was a clean sweep
      for (const row of h.detail.rows) {
        const gs = matches.filter((m) => m.date === row.date && (m.a.includes(h.id) || m.b.includes(h.id)));
        t(`perfect night: ${h.name} on ${row.date} really won everything`,
          gs.length >= M.perfectNight && gs.every((m) => wonBy(m, h.id)),
          `${gs.filter((m) => !wonBy(m, h.id)).length} losses in ${gs.length}`);
      }
    }
  }
}

/* --------------------------------------------- one-point games: both ways */
{
  const one = new Map();
  for (const id of everyone) one.set(id, { g: 0, w: 0, l: 0 });
  for (const m of matches) {
    if (Math.abs(m.sa - m.sb) !== 1) continue;
    for (const id of [...m.a, ...m.b]) {
      const o = one.get(id);
      o.g++; wonBy(m, id) ? o.w++ : o.l++;
    }
  }
  const pool = [...one].filter(([, o]) => o.g >= M.onePointers);
  const bestRate = Math.max(...pool.map(([, o]) => Math.round(100 * o.w / o.g)));
  const rateIds = pool.filter(([, o]) => Math.round(100 * o.w / o.g) === bestRate).map(([id]) => id);
  t('ice in the veins: the number', top(R.records.clutch) === bestRate,
    `${top(R.records.clutch)} vs ${bestRate}`);
  t('ice in the veins: the holders',
    won(R.records.clutch).map((h) => h.id).sort().join() === rateIds.sort().join());
  t('ice in the veins: every holder clears the minimum',
    R.records.clutch.places.every((pl) => pl.holders.every((h) => one.get(h.id).g >= M.onePointers)));

  const worst = Math.max(...[...one.values()].map((o) => o.l));
  const sadIds = [...one].filter(([, o]) => o.l === worst).map(([id]) => id);
  t('most heartbreak: the number', top(R.records.heartbreak) === worst,
    `${top(R.records.heartbreak)} vs ${worst}`);
  t('most heartbreak: the holders',
    won(R.records.heartbreak).map((h) => h.id).sort().join() === sadIds.sort().join());
  // Heartbreak counts losses, so it must never exceed that player's one-pointers.
  t('most heartbreak: losses never exceed one-point games played',
    R.records.heartbreak.places.every((pl) => pl.holders.every((h) => pl.value <= one.get(h.id).g)));
}

/* ------------------------------------------------------------ most improved */
{
  const seq = new Map();
  const ordered = [...matches].sort((x, y) =>
    (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.ts ?? 0) - (y.ts ?? 0)));
  for (const m of ordered) for (const id of [...m.a, ...m.b]) {
    if (!seq.has(id)) seq.set(id, []);
    seq.get(id).push(wonBy(m, id) ? 1 : 0);
  }
  const W = M.improveWindow;
  const pool = [...seq].filter(([, a]) => a.length >= M.improveGames).map(([id, a]) => {
    const early = Math.round(100 * a.slice(0, W).reduce((x, y) => x + y, 0) / W);
    const late = Math.round(100 * a.slice(-W).reduce((x, y) => x + y, 0) / W);
    return { id, gain: late - early, early, late, games: a.length };
  }).filter((r) => r.gain > 0);
  const best = Math.max(...pool.map((r) => r.gain));
  const ids = pool.filter((r) => r.gain === best).map((r) => r.id);
  t('most improved: the number', top(R.records.improved) === best,
    `${top(R.records.improved)} vs ${best}`);
  t('most improved: the holders',
    won(R.records.improved).map((h) => h.id).sort().join() === ids.sort().join());
  t('most improved: every holder clears the games minimum',
    R.records.improved.places.every((pl) => pl.holders.every((h) => seq.get(h.id).length >= M.improveGames)));
  for (const pl of R.records.improved.places) for (const h of pl.holders) {
    const truth = pool.find((r) => r.id === h.id);
    t(`most improved: ${h.name} then/now figures match the gain`,
      truth && (truth.late - truth.early) === pl.value, `${h.context}`);
  }
}

/* ------------------------------------------------------------- giant killer */
{
  // Rebuild the ten giants the slow way and confirm the published list agrees.
  const pool = rows.filter((r) => r.games >= 500).sort((x, y) => y.winPct - x.winPct).slice(0, 10);
  t('giant killer: the ten are the ten best win rates past 500 games',
    R.giants.map((g) => g.id).join() === pool.map((r) => r.id).join(),
    `${R.giants.map((g) => g.id)} vs ${pool.map((r) => r.id)}`);
  const giantSet = new Set(pool.map((r) => r.id));
  const vs = new Map();
  for (const m of matches) {
    for (const [side, other] of [[m.a, m.b], [m.b, m.a]]) {
      if (!other.some((o) => giantSet.has(o))) continue;
      for (const id of side) {
        if (giantSet.has(id)) continue;
        if (!vs.has(id)) vs.set(id, { g: 0, w: 0 });
        const v = vs.get(id);
        v.g++; if (wonBy(m, id)) v.w++;
      }
    }
  }
  const qual = [...vs].filter(([, v]) => v.g >= M.vsGiants);
  const best = Math.max(...qual.map(([, v]) => Math.round(100 * v.w / v.g)));
  const ids = qual.filter(([, v]) => Math.round(100 * v.w / v.g) === best).map(([id]) => id);
  t('giant killer: the number', top(R.records.giantKiller) === best,
    `${top(R.records.giantKiller)} vs ${best}`);
  t('giant killer: the holders',
    won(R.records.giantKiller).map((h) => h.id).sort().join() === ids.sort().join());
  t('giant killer: no giant can win the giant-killer award',
    R.records.giantKiller.places.every((pl) => pl.holders.every((h) => !giantSet.has(h.id))));
}

/* ------------------------------------------------ chemistry, both directions */
{
  const solo = new Map(rows.map((r) => [r.id, r.winPct]));
  const pair = new Map();
  for (const m of matches) {
    for (const side of [m.a, m.b]) {
      if (side.length !== 2) continue;
      const k = [...side].sort().join('|');
      if (!pair.has(k)) pair.set(k, { g: 0, w: 0 });
      const p = pair.get(k);
      p.g++; if (wonBy(m, side[0])) p.w++;
    }
  }
  const lifted = [...pair].filter(([, v]) => v.g >= M.chemistry).map(([k, v]) => {
    const [a, b] = k.split('|');
    return { a, b, g: v.g, w: v.w,
             lift: Math.round(100 * v.w / v.g) - Math.round(100 * (solo.get(a) + solo.get(b)) / 2) };
  });
  const up = lifted.filter((r) => r.lift > 0);
  const bestUp = Math.max(...up.map((r) => r.lift));
  t('dream team: the number', top(R.records.dreamTeam) === bestUp,
    `${top(R.records.dreamTeam)} vs ${bestUp}`);
  t('dream team: the pair',
    won(R.records.dreamTeam).map((h) => [h.id, h.id2].sort().join('|')).sort().join() ===
    up.filter((r) => r.lift === bestUp).map((r) => [r.a, r.b].sort().join('|')).sort().join());

  const down = lifted.filter((r) => r.lift < 0);
  const worst = Math.max(...down.map((r) => -r.lift));
  t('chemistry check: the number', top(R.records.chemistryCheck) === worst,
    `${top(R.records.chemistryCheck)} vs ${worst}`);
  t('chemistry check: the pair',
    won(R.records.chemistryCheck).map((h) => [h.id, h.id2].sort().join('|')).sort().join() ===
    down.filter((r) => -r.lift === worst).map((r) => [r.a, r.b].sort().join('|')).sort().join());
  t('chemistry records never overlap',
    !won(R.records.dreamTeam).some((h) =>
      won(R.records.chemistryCheck).some((x) => [x.id, x.id2].sort().join() === [h.id, h.id2].sort().join())));
  t('every chemistry holder clears the games minimum',
    [...R.records.dreamTeam.places, ...R.records.chemistryCheck.places].every((pl) =>
      pl.holders.every((h) => (pair.get([h.id, h.id2].sort().join('|'))?.g ?? 0) >= M.chemistry)));
}

/* ------------------------------------------------------------- the nemesis */
{
  const met = new Map();
  for (const m of matches) {
    for (const u of [...m.a, ...m.b]) for (const v of [...m.a, ...m.b]) {
      if (u >= v) continue;
      const sameSide = (m.a.includes(u) && m.a.includes(v)) || (m.b.includes(u) && m.b.includes(v));
      if (sameSide) continue;
      const k = u + '|' + v;
      if (!met.has(k)) met.set(k, { n: 0, uw: 0 });
      const r = met.get(k);
      r.n++; if (wonBy(m, u)) r.uw++;
    }
  }
  const pool = [...met].filter(([, r]) => r.n >= M.nemesis).map(([k, r]) => {
    const [u, v] = k.split('|');
    const hi = Math.max(r.uw, r.n - r.uw);
    return { k, u, v, n: r.n, hi, low: r.n - hi,
             leader: r.uw >= r.n - r.uw ? u : v, trailer: r.uw >= r.n - r.uw ? v : u,
             share: Math.round(100 * hi / r.n) };
  });
  const best = Math.max(...pool.map((r) => r.share));
  const winners = pool.filter((r) => r.share === best);
  t('the nemesis: the number', top(R.records.nemesis) === best,
    `${top(R.records.nemesis)} vs ${best}`);
  t('the nemesis: the pairing',
    won(R.records.nemesis).map((h) => [h.id, h.id2].sort().join('|')).sort().join() ===
    winners.map((r) => r.k).sort().join());
  t('the nemesis: the name reads leader first',
    won(R.records.nemesis).every((h) => {
      const truth = winners.find((r) => r.k === [h.id, h.id2].sort().join('|'));
      return truth && h.id === truth.leader && h.id2 === truth.trailer;
    }), JSON.stringify(won(R.records.nemesis).map((h) => h.name)));
  t('the nemesis: the record line matches the meetings',
    R.records.nemesis.places.every((pl) => pl.holders.every((h) => {
      const truth = pool.find((r) => r.k === [h.id, h.id2].sort().join('|'));
      return truth && h.context.includes(`${truth.hi}–${truth.low}`) && h.context.includes(`${truth.n} meetings`);
    })), JSON.stringify(R.records.nemesis.places.flatMap((pl) => pl.holders.map((h) => h.context))));
  t('the nemesis is never less one-sided than the fiercest rivalry is common',
    top(R.records.nemesis) >= 50);
}

/* ------------------------------------------------------------ century club */
{
  const truth = rows.filter((r) => r.games >= M.century).sort((x, y) => y.games - x.games);
  const roll = R.rolls.century.members;
  t('century club: the same people', roll.map((m) => m.id).join() === truth.map((r) => r.id).join(),
    `${roll.length} vs ${truth.length}`);
  t('century club: ordered by games, descending',
    roll.every((m, i) => i === 0 || roll[i - 1].games >= m.games));
  t('century club: every game count is right',
    roll.every((m) => m.games === truth.find((r) => r.id === m.id).games));
  t('century club: everybody listed really is past the line',
    roll.every((m) => m.games >= M.century));
  t('century club: nobody past the line is missing',
    truth.every((r) => roll.some((m) => m.id === r.id)));
}

/* --------------------------------------------- structure, across every record */
{
  const every = Object.entries(R.records).filter(([, rec]) => rec);
  t('every record exists', every.length === Object.keys(R.records).length,
    JSON.stringify(Object.entries(R.records).filter(([, v]) => !v).map(([k]) => k)));
  for (const [key, rec] of every) {
    t(`${key}: has a label`, typeof rec.label === 'string' && rec.label.length > 0);
    t(`${key}: places run strictly downwards`,
      rec.places.every((pl, i) => i === 0 || rec.places[i - 1].value > pl.value),
      JSON.stringify(rec.places.map((p) => p.value)));
    t(`${key}: no place is empty`, rec.places.every((pl) => pl.holders.length > 0));
    t(`${key}: every holder carries the value of its place`,
      rec.places.every((pl) => pl.holders.every((h) => h.value === pl.value)),
      JSON.stringify(rec.places.map((p) => [p.value, p.holders.map((h) => h.value)])));
    t(`${key}: the tied flag matches the holder count`,
      rec.places.every((pl) => Boolean(pl.tied) === (pl.holders.length > 1)));
    t(`${key}: every holder is named or dated`,
      rec.places.every((pl) => pl.holders.every((h) => h.name || h.date)));
  }
  // Every rate-shaped record must state its floor, or the number is a lie.
  for (const key of ['winRate', 'partnership', 'clutch', 'giantKiller', 'nemesis',
                     'dreamTeam', 'chemistryCheck', 'improved', 'perfectNight']) {
    t(`${key}: states its minimum`, Boolean(R.records[key].minimum), R.records[key].minimum);
  }
  // The playful ones are tagged, so the page can mark them as jokes.
  for (const key of ['heartbreak', 'chemistryCheck', 'nemesis']) {
    t(`${key}: is tagged playful`, R.records[key].tone === 'playful');
  }
}


/* -------------------------------------------------------------- the clock */
// The only measured figure on the site, so the arithmetic gets checked the
// slow way and the SCOPE gets checked too - a mean that quietly spoke for
// games that were never timed would be the easiest lie on the page.
{
  const timed = matches.filter((m) => Number.isFinite(m.dur) && m.dur > 0);
  const c = R.clock;
  t('clock: there is something to report', Boolean(c) && timed.length > 0);
  t('clock: counts exactly the games carrying a duration', c.counted === timed.length,
    `${c.counted} vs ${timed.length}`);
  t('clock: the share is of ALL games, not of the timed ones',
    Math.abs(c.share - timed.length / matches.length) < 1e-9,
    `${c.share} vs ${timed.length / matches.length}`);
  t('clock: it does not claim to cover every game', c.share < 1);

  const total = timed.reduce((a, m) => a + m.dur, 0);
  t('clock: the mean is the mean', c.meanSeconds === Math.round(total / timed.length),
    `${c.meanSeconds} vs ${Math.round(total / timed.length)}`);
  const sorted = timed.map((m) => m.dur).sort((x, y) => x - y);
  t('clock: the median is the median', c.medianSeconds === sorted[Math.floor(sorted.length / 2)]);
  t('clock: median and mean are close enough to both be believable',
    Math.abs(c.meanSeconds - c.medianSeconds) < 120, `${c.meanSeconds} vs ${c.medianSeconds}`);

  t('clock: the quickest game is the quickest', c.shortest.seconds === sorted[0]);
  t('clock: the longest game is the longest', c.longest.seconds === sorted[sorted.length - 1]);
  t('clock: quickest is not longer than longest', c.shortest.seconds <= c.longest.seconds);

  // Both extremes must be real games that really happened, with the right
  // people on the right side of the result.
  for (const [label, g] of [['quickest', c.shortest], ['longest', c.longest]]) {
    const found = timed.filter((m) => m.dur === g.seconds && m.date === g.date);
    t(`clock: the ${label} game exists in the match list`, found.length > 0, JSON.stringify(g));
    const hit = found.find((m) => {
      const w = (m.sa > m.sb ? m.a : m.b).map(name).sort().join();
      return w === [...g.winners].sort().join();
    });
    t(`clock: the ${label} game names its winners correctly`, Boolean(hit), JSON.stringify(g));
    if (hit) {
      t(`clock: the ${label} game's score is the real score`,
        g.score === `${Math.max(hit.sa, hit.sb)}–${Math.min(hit.sa, hit.sb)}`, g.score);
      t(`clock: the ${label} game's losers are the other pair`,
        [...g.losers].sort().join() === (hit.sa > hit.sb ? hit.b : hit.a).map(name).sort().join());
      t(`clock: nobody appears on both sides of the ${label} game`,
        !g.winners.some((w) => g.losers.includes(w)));
    }
  }

  // Every duration that survived the importer's filters must be plausible on
  // its own terms: a real game, at a pace a real game is played at.
  const perPoint = timed.map((m) => m.dur / (m.sa + m.sb));
  t('clock: no game is faster than eight seconds a point',
    Math.min(...perPoint) >= 8, String(Math.min(...perPoint).toFixed(1)));
  t('clock: no game runs past half an hour',
    Math.max(...sorted) < 1800, String(Math.max(...sorted)));
  t('clock: the first timed game is the earliest one with a clock',
    c.firstDate === timed.map((m) => m.date).sort()[0]);
  t('clock: nothing before the clock existed carries one',
    timed.every((m) => m.date >= c.firstDate));

  /* ------------------------------------------------------- the changeover */
  const waited = matches.filter((m) => Number.isFinite(m.wait));
  const w = c.wait;
  t('wait: there is a changeover figure', Boolean(w) && waited.length > 0);
  t('wait: it counts every game carrying one', w.counted === waited.length,
    `${w.counted} vs ${waited.length}`);
  const ws = waited.map((m) => m.wait).sort((x, y) => x - y);
  t('wait: the median is the median', w.medianSeconds === ws[Math.floor(ws.length / 2)]);
  t('wait: the quartiles bracket the median',
    w.quickSeconds <= w.medianSeconds && w.medianSeconds <= w.slowSeconds,
    `${w.quickSeconds}/${w.medianSeconds}/${w.slowSeconds}`);
  t('wait: the quartiles are the quartiles',
    w.quickSeconds === ws[Math.floor(ws.length * 0.25)]
    && w.slowSeconds === ws[Math.floor(ws.length * 0.75)]);
  // The headline must be the median, not the mean - the long tail here is real
  // (a court genuinely sat empty) and would drag a mean well off an ordinary
  // changeover. If these ever coincide the distinction has been lost.
  const meanWait = Math.round(ws.reduce((a, b) => a + b, 0) / ws.length);
  t('wait: the reported figure is the median, not the mean',
    w.medianSeconds !== meanWait && w.medianSeconds < meanWait,
    `median ${w.medianSeconds}, mean ${meanWait}`);
  t('wait: a zero changeover survives as zero rather than being dropped',
    ws.filter((x) => x === 0).length === waited.filter((m) => m.wait === 0).length);
  t('wait: a cycle is one game plus one changeover',
    w.cycleSeconds === c.medianSeconds + w.medianSeconds);
  t('wait: the play share follows from the cycle',
    Math.abs(w.playShare - c.medianSeconds / w.cycleSeconds) < 1e-9);
  t('wait: the play share is a fraction under one', w.playShare > 0 && w.playShare < 1,
    String(w.playShare));
  t('wait: playing takes up more of the cycle than waiting', w.playShare > 0.5);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
