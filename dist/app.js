import { DATA, players, leagues, master, matches, dupr, coverage, source } from './data.js';

/**
 * Head-to-head, rebuilt from the matches at load.
 *
 * This used to ship in data.js and cost 587 KB - more than a third of the file -
 * to restate what the match list already contains. Deriving it here costs a few
 * milliseconds and makes it impossible for a pair record to disagree with the
 * games it came from.
 */
const h2h = (() => {
  const pair = new Map();
  for (const m of matches) {
    const won = m.sa > m.sb ? m.a : m.b;
    const lost = m.sa > m.sb ? m.b : m.a;
    for (const w of won) for (const l of lost) {
      const kw = w + '|' + l, kl = l + '|' + w;
      let A = pair.get(kw); if (!A) pair.set(kw, A = { a: w, b: l, w: 0, l: 0 });
      let B = pair.get(kl); if (!B) pair.set(kl, B = { a: l, b: w, w: 0, l: 0 });
      A.w++; B.l++;
    }
  }
  return [...pair.values()];
})();
import { perspective, summarize, partners, pairGames, partnershipEdges, recent } from './stats.js';
import { clubRecords } from './records.js';
import { mountFeedback } from './feedback.js';

const MIN_TOGETHER = 5;
const RECENT_ROWS = 6;
const RING_C = (2 * Math.PI * 52).toFixed(1);

const $ = (s) => document.querySelector(s);
const live = $('#live');
const say = (m) => { live.textContent = m; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (n) => Math.round(n * 100) + '%';
const signed = (n) => (n >= 0 ? '+' : '') + n;

const byId = new Map(players.map((p) => [p.id, p]));
const nameOf = (id) => byId.get(id)?.name ?? id;
const leagueById = new Map(leagues.map((l) => [l.id, l]));
const masterById = new Map(master.rows.map((r) => [r.id, r]));

// league rows per player
const leagueRowsById = new Map();
for (const l of leagues) {
  for (const row of l.standings) {
    if (!leagueRowsById.has(row.id)) leagueRowsById.set(row.id, []);
    leagueRowsById.get(row.id).push({ league: l, row });
  }
}
// cumulative head-to-head, both directions
const h2hById = new Map();
for (const x of h2h) {
  for (const [a, b, w, l] of [[x.a, x.b, x.w, x.l], [x.b, x.a, x.l, x.w]]) {
    if (!h2hById.has(a)) h2hById.set(a, new Map());
    const m = h2hById.get(a);
    const prev = m.get(b) ?? { id: b, w: 0, l: 0 };
    m.set(b, { id: b, w: Math.max(prev.w, w), l: Math.max(prev.l, l) });
  }
}
const h2hFor = (id) => [...(h2hById.get(id)?.values() ?? [])].filter((r) => r.w + r.l > 0);
const h2hPair = (a, b) => h2hById.get(a)?.get(b) ?? null;

/** Best available overall record: the master standings, else the league files summed. */
/**
 * A player's headline record.
 *
 * This now comes from the MATCHES, because the matches are the complete record
 * and the standings sheets are not. The master sheet covers one week; the
 * league sheets cover one league each. Using either as the headline produced a
 * scoreboard reading "10 games" directly above a rivals panel reading "17
 * meetings with Vincent Cusumano" - two true numbers from two different
 * questions, sitting next to each other looking like a contradiction.
 *
 * The weekly rank still comes from the master sheet, since that is Dave's own
 * published standing and nothing here should second-guess it.
 */
function overall(id) {
  const s = summarize(matches, id);
  const m = masterById.get(id);
  return { wins: s.wins, losses: s.losses, games: s.games, diff: s.diff,
           winPct: s.winPct, rank: m?.rank ?? null, from: 'matches' };
}

// Open on someone whose profile is actually full: league standings AND
// head-to-head history AND game-by-game detail. Many players have only one.
const detailedIds = new Set(matches.flatMap((m) => [...m.a, ...m.b]));
const rankedPlayers = players
  .map((p) => ({
    ...p,
    o: overall(p.id),
    completeness: (leagueRowsById.has(p.id) ? 1 : 0) + (h2hFor(p.id).length ? 1 : 0) + (detailedIds.has(p.id) ? 1 : 0),
  }))
  .sort((a, b) => b.completeness - a.completeness || b.o.games - a.o.games || b.o.winPct - a.o.winPct);

const state = {
  view: 'home',
  player: rankedPlayers[0].id,
  a: rankedPlayers[0].id,
  b: rankedPlayers[1].id,
  league: 'master',
};

/* ------------------------------------------------------------------ pieces */
function ring(winPct, label) {
  return `<div class="ringwrap">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring-track" cx="60" cy="60" r="52"/>
      <circle class="ring-fill" cx="60" cy="60" r="52"
        style="--full:${RING_C};stroke-dasharray:${RING_C};stroke-dashoffset:${(RING_C * (1 - winPct)).toFixed(1)}"/>
    </svg>
    <span class="ringmid"><strong class="num">${Math.round(winPct * 100)}<i>%</i></strong><span>${esc(label)}</span></span>
  </div>`;
}

const COURT = `<svg class="sb-court" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2">
    <rect x="14" y="16" width="372" height="188"/><line x1="200" y1="16" x2="200" y2="204"/>
    <line x1="141" y1="16" x2="141" y2="204"/><line x1="259" y1="16" x2="259" y2="204"/>
    <line x1="14" y1="110" x2="141" y2="110"/><line x1="259" y1="110" x2="386" y2="110"/>
  </g></svg>`;

/**
 * What goes in the left column of a log row.
 *
 * A game joined to a Scoreholio session log has a real date, time and court, so
 * show the date. A game that only ever appeared in the head-to-head sheet has
 * nothing but its batch label, so show that - and say so on hover, rather than
 * dressing an undated game up as a dated one.
 */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (iso) => { const [y, m, d] = String(iso).split('-'); return `${MON[+m - 1]} ${+d}, ${y}`; };

function logStamp(g) {
  if (g.date) {
    const [y, m, d] = g.date.split('-');
    const when = `${MON[+m - 1]} ${+d}`;
    const full = [g.session, `${MON[+m - 1]} ${+d}, ${y}`, g.time, g.court ? `court ${g.court}` : null]
      .filter(Boolean).join(' \u00B7 ');
    return `<span class="logdate num dated" title="${esc(full)}">${esc(when)}</span>`;
  }
  const label = String(g.event || '').replace(/^New /, '');
  return `<span class="logdate num" title="No date recorded for this game \u2014 the head-to-head sheet lists it under ${esc(label)} only.">${esc(label)}</span>`;
}

function logRows(views) {
  return views.map((v) => `
    <div class="logrow">
      <span class="wl ${v.won ? 'w' : 'l'}" aria-hidden="true">${v.won ? 'W' : 'L'}</span>
      ${logStamp(v)}
      <span class="logwho"><span class="sr-only">${v.won ? 'Win' : 'Loss'}. </span>
        with <strong>${esc(nameOf(v.partner))}</strong>
        <em>vs ${v.opp.map((n) => esc(nameOf(n))).join(' &amp; ')}</em></span>
      <span class="logscore num">${v.mine}<span class="s2">–${v.theirs}</span></span>
    </div>`).join('');
}


/* ------------------------------------------------------------- home view */
const REC = clubRecords(matches, players);

// A short, human-checkable stamp for the build this page is running. Derived
// from the data timestamp, so it moves whenever the data does and needs no
// separate version file to keep in step.
const BUILD = (DATA.generated ?? '').replace(/[-:T]/g, '').slice(2, 12) || 'unknown';

const nf = (n) => Number(n).toLocaleString();
const longDate = (iso) => {
  if (!iso) return '\u2014';
  const [y, m, d] = String(iso).split('-');
  return `${MON[+m - 1]} ${+d}, ${y}`;
};

/**
 * Count a number up on first paint.
 *
 * This is the one flourish on the page and it is the point of the hero: a
 * counter that lands on 6,529 reads as an achievement in a way that 6,529
 * printed flat does not. It respects prefers-reduced-motion, and it always
 * finishes on the exact figure rather than an eased approximation.
 */
function countUp(el, to, ms = 1400) {
  // The real number goes in FIRST, every time, and the animation only ever
  // replaces a correct number with the same correct number.
  //
  // It has to be this way round because requestAnimationFrame does not run in a
  // background tab. Open the site in a background tab - a middle-click, a
  // restored session, a link preview - and an animation that starts at zero
  // never gets a frame to leave zero with, so the biggest number on the page
  // reads "0 games played" until the tab is focused. The marquee counters were
  // already built this way after the same bug hit them below the fold; the hero
  // counter was still starting from a hardcoded 0 in the markup.
  el.textContent = nf(to);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.hidden) return;          // no frames will come; keep the truth
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = nf(Math.round(to * ease(t)));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = nf(to);
  };
  requestAnimationFrame(step);
}

/**
 * One Wall of Fame card: a podium, and the story behind it on demand.
 *
 * Built as a native <details>, not a hover tooltip. A tooltip is invisible on a
 * phone, which is where most of the league will read this, and <details> also
 * works with the keyboard and without JavaScript.
 *
 * The gold holder gets the big number. Silver and bronze sit under it as two
 * quiet lines - present, but never competing with the record itself.
 */
const PLACE_WORD = ['', 'Gold', 'Silver', 'Bronze'];
const MAX_STORY_BLOCKS = 6;

/**
 * How many runner-up lines a card will print before it stops counting.
 *
 * Longest streak has six players tied on 18. Printed in full, that one card ran
 * to twice the height of every other card on the wall, blew a hole in the grid
 * and pushed its own last line off the bottom of the screen. A record shared by
 * six people is worth saying; listing all six on the face is not.
 */
const MAX_RUNNERS = 3;

/** One runner-up line: the place, the number, the name, and their own record. */
function podiumRow(h, place) {
  const goto = h.id ? ` data-goto="${esc(h.id)}"` : '';
  const who = h.name ?? longDate(h.date);
  return `<span class="wof-run">
    <span class="wof-place p${place}">${esc(PLACE_WORD[place] ?? '')}</span>
    <span class="wof-runval num">${nf(h.value)}</span>
    <span class="wof-runbody">
      <span class="wof-runwho"${goto}>${esc(who)}</span>
      ${h.context ? `<span class="wof-runctx">${esc(h.context)}</span>` : ''}
    </span></span>`;
}

function detailBlock(d) {
  if (!d) return '';
  const rows = (d.rows ?? []).map((r) => `<li><span class="dd-date">${longDate(r.date)}</span>
    <span class="dd-text">${esc(r.text)}</span>
    <span class="dd-score num">${esc(r.score)}</span></li>`).join('');
  // A fact whose value is a bare date gets the same long form the game rows
  // use, so one card never shows "Aug 7, 2026" and "2026-09-03" side by side.
  const facts = (d.facts ?? []).map(([k, v]) =>
    `<div><span>${esc(k)}</span><b>${esc(/^\d{4}-\d{2}-\d{2}$/.test(v) ? longDate(v) : v)}</b></div>`).join('');
  return `${d.lead ? `<p class="dd-lead">${esc(d.lead)}</p>` : ''}
    ${rows ? `<ul class="dd-list">${rows}</ul>` : ''}
    ${d.more ? `<p class="dd-more">and ${d.more} more</p>` : ''}
    ${facts ? `<div class="dd-facts">${facts}</div>` : ''}`;
}

/**
 * The story panel: every place that has one, each under its own heading.
 *
 * It used to carry gold's story alone, so tapping a card after reading the
 * silver line showed you gold again and looked like a bug. Silver and bronze
 * earned their place on the card; they get their story too.
 */
function storyPanel(rec) {
  const blocks = [];
  for (const pl of rec.places) {
    for (const h of pl.holders) {
      if (!h.detail) continue;
      blocks.push({ place: pl.place, name: h.name ?? longDate(h.date), detail: h.detail });
    }
  }
  if (!blocks.length) return '';
  const shown = blocks.slice(0, MAX_STORY_BLOCKS);
  const rest = blocks.length - shown.length;
  return shown.map((b) => `<section class="dd-block">
      <p class="dd-head"><span class="wof-place p${b.place}">${esc(PLACE_WORD[b.place] ?? '')}</span>
        <span>${esc(b.name)}</span></p>
      ${detailBlock(b.detail)}
    </section>`).join('')
    + (rest ? `<p class="dd-more">and ${rest} more sharing these places</p>` : '');
}

/**
 * One Wall of Fame card.
 *
 * The podium is on the FACE of the card - gold, silver and bronze all readable,
 * each with their own number and record, without touching anything. Hiding
 * second and third behind a toggle meant the card asked you to go looking for
 * information it should simply have shown.
 *
 * So the split is clean: the card states the record, and the disclosure tells
 * the story behind each place - who beat them, when the run ended. Built as a
 * native <details> rather than a hover tooltip, because a tooltip is invisible
 * on a phone and this works by tap, click and keyboard alike.
 */
function recordCard(rec) {
  if (!rec || !rec.places?.length) return '';
  const gold = rec.places[0];
  const h = gold.holders[0];
  // A date-holding record (the busiest day) names the day; everything else
  // names people. There is no third case, so there is no fallback text.
  const who = h.name ?? longDate(h.date);
  const tied = gold.tied ? `<span class="wof-tied">tied \u00d7${gold.holders.length}</span>` : '';
  const goto = h.id ? ` data-goto="${esc(h.id)}"` : '';
  const val = rec.unit === '%' ? `${nf(gold.value)}<i>%</i>`
    : `${nf(gold.value)}<i>${esc(rec.unit)}</i>`;

  // Anyone else who shares gold, then silver and bronze - capped, because one
  // six-way tie should not be allowed to set the height of the whole grid.
  const everyRunner = [
    ...gold.holders.slice(1).map((x) => ({ h: x, place: 1 })),
    ...rec.places.slice(1).flatMap((pl) => pl.holders.map((x) => ({ h: x, place: pl.place }))),
  ];
  const shownRunners = everyRunner.slice(0, MAX_RUNNERS);
  const hiddenRunners = everyRunner.length - shownRunners.length;
  const runners = shownRunners.map(({ h: x, place }) => podiumRow(x, place)).join('')
    + (hiddenRunners ? `<span class="wof-rest">and ${hiddenRunners} more sharing these places</span>` : '');

  const face = `<span class="wof-label">${esc(rec.label)}${
      rec.minimum ? `<span class="wof-min">${esc(rec.minimum)}</span>` : ''}</span>
    ${rec.note ? `<span class="wof-note">${esc(rec.note)}</span>` : ''}
    <span class="wof-val">${val}</span>
    <span class="wof-who"><span class="wof-place p1">Gold</span><span class="wof-goldname"><span${goto}>${esc(who)}</span>${tied}</span></span>
    <span class="wof-ctx">${esc(h.context)}${h.date && h.name ? ` \u00b7 ${longDate(h.date)}` : ''}</span>
    ${everyRunner.length ? `<span class="wof-runners">${runners}</span>` : ''}`;

  const cls = `wof${rec.tone === 'playful' ? ' wof-fun' : ''}`;
  const story = storyPanel(rec);
  if (!story) return `<div class="${cls}">${face}</div>`;

  return `<details class="${cls}"><summary>${face}<span class="wof-more">The story</span></summary>
    <div class="wof-open">${story}</div>
  </details>`;
}

/**
 * The four records that open the wall, printed on the dark ground the home page
 * uses for its own headline figure.
 *
 * The wall used to open straight onto nineteen equal cards, which is a filing
 * cabinet rather than a wall of fame: everything present, nothing celebrated.
 * These four are chosen because they are the ones people repeat out loud - a
 * career total, an unbeaten run, a partnership that barely lost, and a
 * head-to-head somebody never won.
 */
function marqueeCard(rec) {
  if (!rec || !rec.places?.length) return '';
  const gold = rec.places[0];
  const h = gold.holders[0];
  const who = h.name ?? longDate(h.date);
  const extra = gold.holders.length > 1 ? ` +${gold.holders.length - 1}` : '';
  const unit = rec.unit === '%' ? '%' : rec.unit;
  return `<div class="mq">
    <span class="mq-label">${esc(rec.label)}</span>
    <span class="mq-val"><b class="num" data-to="${gold.value}">${nf(gold.value)}</b><i>${esc(unit)}</i></span>
    <span class="mq-who">${esc(who)}${esc(extra)}</span>
    <span class="mq-ctx">${esc(h.context)}</span>
  </div>`;
}

/** Initials, for the Century Club chips. Two letters, never more. */
const initials = (name) => String(name).split(/\s+/).filter(Boolean)
  .slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/**
 * The Century Club: every player past a thousand career games.
 *
 * Deliberately not a podium. Thirty-three people have done this, and the point
 * of the honour is how many - a card naming three of them would say the
 * opposite of what the number means.
 */
function centuryRoll(roll) {
  if (!roll?.members?.length) return '';
  const chips = roll.members.map((m, i) => `<button class="cc" data-goto="${esc(m.id)}">
      <span class="cc-rank">${i + 1}</span>
      <span class="cc-av" aria-hidden="true">${esc(initials(m.name))}</span>
      <span class="cc-body"><span class="cc-name">${esc(m.name)}</span>
        <span class="cc-ctx">${esc(m.context)}</span></span>
      <span class="cc-games num">${nf(m.games)}</span>
    </button>`).join('');
  return `<section class="wsec">
    <div class="wsec-h"><h3>${esc(roll.label)}</h3><span>${esc(roll.note)} \u00b7 ${roll.members.length} players</span></div>
    <div class="ccwrap">${chips}</div>
  </section>`;
}

/** One titled group of record cards. */
function wallSection(title, blurb, cards) {
  const body = cards.map(recordCard).filter(Boolean).join('');
  if (!body) return '';
  return `<section class="wsec">
    <div class="wsec-h"><h3>${esc(title)}</h3><span>${esc(blurb)}</span></div>
    <div class="wall">${body}</div>
  </section>`;
}

/**
 * The most recent night of play, for the landing page.
 *
 * A front page that opens on a three-year total reads like a monument. One line
 * about the last time anyone actually played tells a visitor the league is
 * running, which is the thing a stats site most easily fails to say.
 */
function lastNight() {
  const day = REC.totals.lastDate;
  const games = matches.filter((m) => m.date === day);
  const count = new Map();
  for (const m of games) for (const id of [...m.a, ...m.b]) count.set(id, (count.get(id) ?? 0) + 1);
  const busiest = [...count.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
  return { day, games: games.length, players: count.size, busiest };
}

/**
 * Games on record, by calendar year.
 *
 * One series, so no legend: the caption names it. The caption also says what
 * the first and last bars are NOT - 2023 starts in August because that is when
 * the league started, and 2026 stops at the last night played. Without that
 * line the shape reads as growth alone, and a reader would take a partial year
 * for a small one.
 */
function byYear() {
  const y = new Map();
  for (const m of matches) {
    const k = m.date.slice(0, 4);
    y.set(k, (y.get(k) ?? 0) + 1);
  }
  const rows = [...y].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const top = Math.max(...rows.map((r) => r[1]));
  return rows.map(([year, games]) => ({ year, games, pct: Math.round((games / top) * 100) }));
}

/**
 * How long a game takes, from the scoreboard's own clock.
 *
 * The only figure on this site measured rather than counted. Scoreholio times
 * a game while it is being scored on the scoreboard, so this is a real
 * stopwatch reading and not an estimate from timestamps.
 *
 * It covers about half the games and says so on its face. Printing "the
 * average game is 6:45" over a page headlined with 24,000 games would claim a
 * measurement of all of them, and the clock simply does not go back that far -
 * DUPR carries none at all and Scoreholio only started recording one in late
 * 2025. The line under the panel is not a disclaimer, it is the scope.
 */
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function clockPanel(c) {
  if (!c || !c.counted) return '';
  const side = (g, label) => `<div class="clk-x">
      <span class="clk-lab">${label}</span>
      <span class="clk-t num">${mmss(g.seconds)}</span>
      <span class="clk-who">${g.winners.map(esc).join(' &amp; ')}
        <em>beat</em> ${g.losers.map(esc).join(' &amp; ')}</span>
      <span class="clk-meta">${esc(g.score)} &middot; ${longDate(g.date)}</span>
    </div>`;
  return `<section class="clk">
    <div class="clk-h"><h3>On the clock</h3>
      <span>Scoreholio times each game on the scoreboard</span></div>
    <div class="clk-grid">
      <div class="clk-avg">
        <span class="clk-lab">Average game</span>
        <span class="clk-big num">${mmss(c.meanSeconds)}</span>
        <span class="clk-meta">Half of them finish inside ${mmss(c.medianSeconds)}</span>
      </div>
      ${side(c.shortest, 'Quickest ever')}
      ${side(c.longest, 'Longest ever')}
      ${c.wait ? `<div class="clk-x">
        <span class="clk-lab">Between games</span>
        <span class="clk-t num">${mmss(c.wait.medianSeconds)}</span>
        <span class="clk-who">A court turns over every ${mmss(c.wait.cycleSeconds)}</span>
        <span class="clk-meta">Most changeovers land between
          ${mmss(c.wait.quickSeconds)} and ${mmss(c.wait.slowSeconds)} &middot;
          you are playing ${Math.round(100 * c.wait.playShare)}% of your time on court</span>
      </div>` : ''}
    </div>
    <p class="foot">From the ${nf(c.counted)} games with a clock on them &mdash;
      ${Math.round(100 * c.share)}% of all games, starting ${longDate(c.firstDate)}.
      Earlier games were never timed.</p>
  </section>`;
}

const LAUNCH = [
  { view: 'records', group: 'Records', title: 'Wall of Fame', blurb: 'Nineteen club records \u2014 longest streak, the perfect night, the fiercest rivalry \u2014 each with the games behind it.' },
  { view: 'player', group: 'Look someone up', title: 'Player profile', blurb: 'One player\u2019s whole record: partners, rivals, streaks and every game they have played.' },
  { view: 'compare', group: 'Two players', title: 'Head to head', blurb: 'Put any two players side by side and see who has the better of it.' },
  { view: 'standings', group: 'Leagues', title: 'Standings', blurb: 'Dave\u2019s published standings for every league, week by week.' },
];

function renderHome() {
  const T = REC.totals;
  const gen = DATA.generated ? new Date(DATA.generated) : null;
  const ln = lastNight();

  const years = byYear();
  const first = years[0], last = years[years.length - 1];

  $('#panel-home').innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <p class="hero-kicker">Merrick In A Pickle</p>
          <h1 class="hero-title">The Stat Room</h1>
          <p class="hero-what">Every game the league has ever played, and everyone who played it.
            Look up a player, settle an argument, see who holds what.</p>
          <p class="counter"><span id="bigCount">${nf(T.games)}</span><span class="unit">games played</span></p>
          <p class="hero-sub"><b>${longDate(T.firstDate)}</b> to <b>${longDate(T.lastDate)}</b></p>
        </div>
        <figure class="yearchart">
          <h3>Games on record, by year</h3>
          <div class="ybars" role="img" aria-label="${years.map((y) => `${y.year}: ${nf(y.games)} games`).join('. ')}">
            ${years.map((y) => `<div class="ybar" title="${y.year}: ${nf(y.games)} games">
              <span class="yv">${nf(y.games)}</span>
              <span class="ytrack"><span class="yf" style="height:${y.pct}%"></span></span>
              <span class="yl">${y.year}</span>
            </div>`).join('')}
          </div>
          <figcaption class="ycap">${first.year} starts in August, when the league did.
            ${last.year} runs to the last night played.</figcaption>
        </figure>
      </div>
    </section>

    <div class="goto-h">
      <h2>Have a look around</h2>
      <span>Four places to go &mdash; pick one</span>
    </div>
    <nav class="launch" aria-label="Where to go">
      ${LAUNCH.map((l) => `<button type="button" data-view="${l.view}">
        <span class="lg">${esc(l.group)}</span>
        <span class="lt">${esc(l.title)}</span>
        <span class="ld">${esc(l.blurb)}</span>
      </button>`).join('')}
    </nav>

    <div class="lastnight">
      <h3>Last time out</h3>
      <b>${longDate(ln.day)}</b>
      <span>${nf(ln.games)} games &middot; ${nf(ln.players)} players${
        ln.busiest ? ` &middot; most games: <b style="font-size:13px">${esc(nameOf(ln.busiest[0]))}</b> (${ln.busiest[1]})` : ''}</span>
    </div>

    <div class="strip">
      <div><b>${nf(T.players)}</b><span>Players</span></div>
      <div><b>${nf(T.days)}</b><span>Playing days</span></div>
      <div><b>${nf(T.averagePerDay)}</b><span>Games a day</span></div>
      <div><b>${nf(T.points)}</b><span>Points played</span></div>
    </div>

    ${clockPanel(REC.clock)}

    <div class="freshbar">
      <div>Oldest game on record <b>${longDate(T.firstDate)}</b></div>
      <div>Most recent <b>${longDate(T.lastDate)}</b></div>
      <div>Data refreshed <b>${gen ? gen.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'unknown'}</b>
        <span class="buildstamp" title="The build this page is running. If it does not match what you just uploaded, you are looking at a cached copy.">build ${esc(BUILD)}</span></div>
    </div>

    <details class="about" id="dataNotice"></details>`;

  renderNotice();
  countUp($('#bigCount'), T.games);
}

/* ------------------------------------------------------- wall of fame view */
/**
 * The wall, in sections.
 *
 * Nineteen records in one undifferentiated grid is a list, not a wall: nothing
 * leads, nothing relates to anything next to it, and the reader has no idea
 * where they are. Grouping them answers "what kind of thing am I looking at"
 * before the numbers arrive, and lets the playful records sit together where
 * they read as jokes rather than as judgements.
 */
function renderRecords() {
  const T = REC.totals, R = REC.records, M = REC.minimums;
  const giants = REC.giants.map((g) => g.name).join(', ');

  $('#panel-records').innerHTML = `
    <div class="wof-hero">
      <div class="wof-hero-in">
        <p class="hero-kicker">Merrick In A Pickle</p>
        <h2 class="wof-hero-title">Wall of Fame</h2>
        <p class="wof-hero-sub">Every record on this page is computed from all
          <b>${nf(T.games)}</b> games the club has played, from
          <b>${longDate(T.firstDate)}</b> to <b>${longDate(T.lastDate)}</b>.</p>
        <div class="mqrow">${[R.ironMan, R.streak, R.partnership, R.nemesis].map(marqueeCard).join('')}</div>
      </div>
    </div>

    ${wallSection('The big ones', 'Careers measured end to end.',
        [R.ironMan, R.mostWins, R.winRate, R.streak])}

    ${wallSection('Nerve', 'What happens when the game is actually on the line.',
        [R.perfectNight, R.clutch, R.heartbreak, R.busiestDay])}

    ${wallSection('Chemistry', 'Some people are better together than they have any right to be. Some are not.',
        [R.partnership, R.dreamTeam, R.mostPlayedPair, R.chemistryCheck])}

    ${wallSection('Rivalry and reach', 'The other side of the net — and how much of the club you have met.',
        [R.rivalry, R.nemesis, R.social])}

    ${wallSection('The long game', 'Three years of getting better, and the arithmetic to prove it.',
        [R.improved, R.giantKiller, R.scorer, R.pointDiff])}

    ${centuryRoll(REC.rolls?.century)}

    <div class="wof-foot">
      <p><b>Why the minimums.</b> A rate record with no floor is won by whoever played
        three games and got lucky, so each one carries a threshold and says what it is:
        ${M.rate}+ games for win rate, ${M.together}+ together for a partnership,
        ${M.chemistry}+ for a chemistry record, ${M.meetings}+ meetings for a rivalry,
        ${M.nemesis}+ for the Nemesis, ${M.onePointers}+ one-point games for Ice in the Veins,
        ${M.improveGames}+ games for Most Improved.</p>
      <p><b>The Perfect Night</b> needs ${M.perfectNight} games that night, because a full
        MIP night is ten to twelve games and winning three of three is not the same feat.</p>
      <p><b>Giant killer</b> measures you against the ten players with the best win rate
        among everyone past 500 games: ${esc(giants)}. Those ten are ranked on this
        club's own games rather than an outside rating, because only 68 of
        ${nf(T.players)} players carry a DUPR figure and a club record should not
        quietly ignore the rest.</p>
      <p><b>Ties are shared, not broken.</b> Two people on the same mark both take the
        place, and the next place is the next distinct mark below them.</p>
    </div>`;

  countUpOnView($('#panel-records'));
}

/**
 * Animate the marquee counters that are already on screen.
 *
 * The number is written into the markup at its real value, and the animation
 * only ever replaces a correct number with the same correct number. The first
 * version of this started every counter at zero and let an IntersectionObserver
 * fill it in, which meant a phone showed "0 in a row" for any card below the
 * fold - and left it at zero for good if the reader never scrolled that far. An
 * animation is worth having; it is not worth being wrong for.
 */
function countUpOnView(root) {
  for (const el of root.querySelectorAll('.mq-val b[data-to]')) {
    const box = el.getBoundingClientRect();
    if (box.top < innerHeight && box.bottom > 0) countUp(el, Number(el.dataset.to), 1100);
  }
}

/* ------------------------------------------------------------ player view */
function renderPlayer() {
  const id = state.player;
  const p = byId.get(id);
  const o = overall(id);
  const lrows = (leagueRowsById.get(id) ?? []).slice()
    .sort((a, b) => (b.row.games ?? 0) - (a.row.games ?? 0));
  const rivals = h2hFor(id).sort((a, b) => (b.w + b.l) - (a.w + a.l));
  const prows = partners(matches, id);
  const { best, worst, eligible } = partnershipEdges(prows, MIN_TOGETHER);
  const mine = recent(matches, id);
  const mstat = summarize(matches, id);

  const dr = dupr[id];
  // DUPR gives a current rating and no history, so any movement we can show is
  // movement BETWEEN OUR OWN READINGS. With one reading there is no movement to
  // show and the chip stays a bare number rather than implying a trend.
  const duprChip = (() => {
    if (!dr) return '';
    const h = dr.history ?? [];
    const first = h[0], last = h[h.length - 1];
    const moved = h.length > 1 ? last.rating - first.rating : 0;
    const arrow = !moved ? ''
      : `<em class="dmove ${moved > 0 ? 'up' : 'down'}">${moved > 0 ? '\u25B2' : '\u25BC'}${Math.abs(moved).toFixed(3)}</em>`;
    const title = h.length > 1
      ? `Doubles rating from the Merrick In A Pickle DUPR club listing. ${first.rating.toFixed(3)} on ${first.date}, ${last.rating.toFixed(3)} on ${last.date} \u2014 change between our readings, not DUPR's own history.`
      : `Doubles rating from the Merrick In A Pickle DUPR club listing, read ${dr.asOf ?? 'recently'}. One reading so far, so there is no history to chart yet.`;
    return `<span class="rankchip dupr" title="${esc(title)}">DUPR ${dr.rating.toFixed(3)} \u00B7 doubles${arrow}</span>`;
  })();
  // An alias identical to the name above it is not an alias. Mike Breitinger's
  // row lists "Mike Breitinger" among his aliases, which was true and useful
  // while the site called him "Mike"; now that it calls him by that name, the
  // line read "MIKE BREITINGER / Also appears as Mike B., Mike Breitinger".
  const otherNames = (p.aliases ?? []).filter((a) => a.toLowerCase() !== p.name.toLowerCase());
  const aliasLine = otherNames.length
    ? `<p class="sb-club">Also appears as ${otherNames.map((a) => esc(a)).join(', ')}</p>` : '';
  // No "possibly the same person as..." line here, deliberately.
  //
  // It used to appear on 87 profiles, and only 5 of those were flagged
  // confident - the rest were a shared first name and nothing more: Adrian Lim
  // beside Adrian Murillo, Frank Pryz beside Frank Rossetti, Lisa oliver beside
  // Julio Olivo. Printing an unresolved data question on a player's own page
  // casts doubt over every number on it, for a reader who cannot act on the
  // doubt anyway.
  //
  // The honest disclosure still exists, in one place rather than eighty-seven:
  // the coverage notice at the top of the site says how many players may be
  // listed twice. The full list stays in the build output, where the people who
  // can actually resolve it will see it.
  const conflictLine = p.nameConflict
    ? `<p class="sb-club" style="color:#FFD98A">Two players share this name in the workbooks — this is the ${esc(p.club || 'unlisted')} entry.</p>` : '';

  $('#playerBody').innerHTML = `
    <section class="scoreboard">${COURT}
      <div class="sb-grid">
        <div class="sb-id">
          <span class="rankchip">${o.rank ? `#${o.rank} this week` : 'Season record'}${p.displayOnly ? ' · display name' : ''}</span>${duprChip}
          <h1 class="sb-name">${esc(p.name)}</h1>
          <p class="sb-club">${esc(p.club || 'Club not set')}${lrows.length ? ` · ${lrows.length} league${lrows.length > 1 ? 's' : ''}` : ''}</p>
          ${aliasLine}${conflictLine}
        </div>
        <div class="sb-right">
          ${ring(o.winPct, 'Win rate')}
          <div class="sb-stats">
            <div class="stat"><b class="num">${o.wins}</b><span>Wins</span></div>
            <div class="stat"><b class="num">${o.losses}</b><span>Losses</span></div>
            <div class="stat"><b class="num">${o.games}</b><span>Games</span></div>
            <div class="stat ${o.diff >= 0 ? 'pos' : ''}"><b class="num">${signed(o.diff ?? 0)}</b><span>Pt diff</span></div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid">
      <div class="card">
        <div class="card-h"><h2>League records</h2><span class="badge ok">Published</span></div>
        ${lrows.length ? `<div class="scroller"><table>
          <thead><tr><th>League</th><th>Rank</th><th>W</th><th>L</th><th>Games</th><th>Win rate</th><th>Pts</th></tr></thead>
          <tbody>${lrows.map(({ league, row }) => `<tr>
            <td><strong>${esc(league.label)}</strong><span class="thin"> ${esc(league.note)}</span></td>
            <td class="num">${row.rank ?? '—'}</td><td class="num">${row.wins ?? '—'}</td>
            <td class="num">${row.losses ?? '—'}</td><td class="num">${row.games ?? '—'}</td>
            <td class="num">${row.winPct != null ? pct(row.winPct) : '—'}</td>
            <td class="num">${row.points ?? '—'}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="emptybox" style="margin-top:14px">${esc(p.name)} doesn't appear in any of the six published league files — their record here comes from tournament play.</div>`}
        <p class="foot">Straight from the standings workbooks on merrickinapickle.com. These should match Dave's spreadsheets exactly.${dr ? ` DUPR ${dr.rating.toFixed(3)} is this player's doubles rating from the club's DUPR listing${dr.duprName !== p.name ? ` (listed there as ${esc(dr.duprName)})` : ''}, read ${dr.asOf ? prettyDate(dr.asOf) : 'recently'}${(dr.history?.length ?? 0) > 1 ? `. We hold ${dr.history.length} readings, back to ${prettyDate(dr.history[0].date)}` : ' — the only reading we hold so far'}.` : ''}</p>
      </div>

      <div class="card">
        <div class="card-h"><h2>Rivals</h2><span class="badge ok">All-time</span></div>
        ${rivals.length ? `<div class="edges">
          ${rivalCard('Most played', rivals[0])}
          ${(() => {
            const beaten = rivals.filter((x) => x.w + x.l >= 3).sort((a, b) => (b.w / (b.w + b.l)) - (a.w / (a.w + a.l)));
            return beaten.length ? rivalCard('Best record against', beaten[0], 'best') : '';
          })()}
        </div>` : `<div class="emptybox">No head-to-head games recorded yet.</div>`}
        <p class="foot">From all ${coverage.games.toLocaleString()} games on record, ${prettyDate(coverage.firstDate)} to ${prettyDate(coverage.lastDate)}.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><h2>Partners</h2><span class="badge">Every game</span></div>
      <p class="foot" style="margin:2px 0 0">From all ${coverage.games.toLocaleString()} games on record. Sorted by win rate, ${MIN_TOGETHER}+ games together first. Tap a heading to sort by it.</p>
      ${prows.length ? `<div class="scroller"><table data-cap="12" data-cap-noun="partners">
        <thead><tr><th>Partner</th><th>Games</th><th>W</th><th>L</th><th>Win rate</th><th></th></tr></thead>
        <tbody>${[...prows].sort((x, y) =>
          (y.games >= MIN_TOGETHER) - (x.games >= MIN_TOGETHER) || y.winPct - x.winPct || y.games - x.games)
          .map((r) => `<tr data-cmp="${esc(r.id)}">
            <td><button class="namebtn" data-cmp="${esc(r.id)}">${esc(nameOf(r.id))}</button>${r.games < MIN_TOGETHER ? '<span class="small-chip">small sample</span>' : ''}</td>
            <td class="num">${r.games}</td><td class="num">${r.wins}</td><td class="num">${r.losses}</td>
            <td class="num">${pct(r.winPct)} <span class="bar"><i style="width:${Math.round(r.winPct * 100)}%"></i></span></td>
            <td class="thin">Compare&nbsp;↗</td></tr>`).join('')}</tbody></table></div>
        ${best ? `<p class="foot">Strongest pairing with ${MIN_TOGETHER}+ games: <strong>${esc(nameOf(best.id))}</strong> (${pct(best.winPct)}, ${best.games} games)${worst && worst.id !== best.id ? ` · toughest: <strong>${esc(nameOf(worst.id))}</strong> (${pct(worst.winPct)}, ${worst.games} games)` : ''}. ${eligible.length} of ${prows.length} partners qualify.</p>` : ''}`
        : `<div class="emptybox" style="margin-top:12px">No detailed games on record for ${esc(p.name)} yet — only totals.</div>`}
    </div>

    ${rivals.length ? `<div class="card">
      <div class="card-h"><h2>Head-to-head record</h2><span class="meta">${rivals.length} opponents · all-time</span></div>
      <p class="foot" style="margin:2px 0 0">Every opponent on record, most-played first. Tap a heading to sort, or a row to open the comparison.</p>
      <div class="scroller"><table data-cap="12" data-cap-noun="opponents">
        <thead><tr><th>Opponent</th><th>W</th><th>L</th><th>Meetings</th><th>Win rate</th><th></th></tr></thead>
        <tbody>${rivals.map((x) => {
          const n = x.w + x.l, wp = n ? x.w / n : 0;
          return `<tr data-cmp="${esc(x.id)}">
            <td><button class="namebtn" data-cmp="${esc(x.id)}">${esc(nameOf(x.id))}</button>${n < 3 ? '<span class="small-chip">small sample</span>' : ''}</td>
            <td class="num">${x.w}</td><td class="num">${x.l}</td><td class="num">${n}</td>
            <td class="num">${pct(wp)} <span class="bar"><i style="width:${Math.round(wp * 100)}%"></i></span></td>
            <td class="thin">Compare&nbsp;↗</td></tr>`;
        }).join('')}</tbody></table></div>
    </div>` : ''}

    ${mine.length ? `<div class="card">
      <div class="card-h"><h2>Match log</h2><span class="meta">${mstat.wins}–${mstat.losses} in ${mine.length} detailed games</span></div>
      <div class="log">${logRows(mine.slice(0, RECENT_ROWS))}</div>
      ${mine.length > RECENT_ROWS ? `<button class="morebtn" id="btnMore" type="button" aria-expanded="false" aria-controls="fullLog">Show all ${mine.length} games</button>
        <div class="fulllog log" id="fullLog" hidden>${logRows(mine)}</div>` : ''}
    </div>` : ''}

    <p class="feedback" id="playerFeedback"></p>`;

  // Carries the player's name, because a report that says "this page is wrong"
  // without saying whose page is a report nobody can act on. Renders nothing
  // until a form exists - see feedback.js.
  mountFeedback($('#playerFeedback'), { subject: nameOf(id) });
}

function rivalCard(tag, r, kind = '') {
  const n = r.w + r.l;
  return `<button class="pcard ${kind || 'best'}" type="button" data-cmp="${esc(r.id)}">
    <span class="tag">${esc(tag)}</span>
    <span class="row"><span class="nm">${esc(nameOf(r.id))}</span><span class="pct num">${r.w}–${r.l}</span></span>
    <span class="sub num">${n} meeting${n === 1 ? '' : 's'} · ${pct(n ? r.w / n : 0)} win rate</span>
    <span class="go">Compare ↗</span></button>`;
}

/* ----------------------------------------------------------- compare view */
function renderCompare() {
  const { a, b } = state;
  const A = byId.get(a), B = byId.get(b);
  const oa = overall(a), ob = overall(b);
  const duel = h2hPair(a, b);
  const tog = pairGames(matches, a, b, true);
  const vs = pairGames(matches, a, b, false);
  const togW = tog.filter((g) => perspective(g, a).won).length;
  const history = [...tog.map((g) => ({ g, kind: 'tog' })), ...vs.map((g) => ({ g, kind: 'opp' }))];

  const aW = duel ? duel.w : 0, bW = duel ? duel.l : 0, meets = aW + bW;

  $('#compareBody').innerHTML = `
    <section class="vs">${COURT}
      <div class="vs-grid">
        <div class="vs-side"><p class="nm">${esc(A.name)}</p>
          <p class="rec num"><b>${oa.wins}–${oa.losses}</b> overall · ${pct(oa.winPct)}</p></div>
        <span class="vs-mid">VS</span>
        <div class="vs-side r"><p class="nm">${esc(B.name)}</p>
          <p class="rec num"><b>${ob.wins}–${ob.losses}</b> overall · ${pct(ob.winPct)}</p></div>
      </div>
    </section>

    <div class="grid2">
      <div class="card">
        <div class="card-h"><h2>Head to head</h2><span class="badge ok">All-time</span></div>
        ${meets ? `
          <div class="duel">
            <div class="side ${aW >= bW ? 'lead' : ''}"><b class="num">${aW}</b><span>${esc(A.name.split(' ')[0])}</span></div>
            <span class="dash">–</span>
            <div class="side ${bW > aW ? 'lead' : ''}"><b class="num">${bW}</b><span>${esc(B.name.split(' ')[0])}</span></div>
          </div>
          <div class="splitbar" role="img" aria-label="${esc(A.name)} ${aW}, ${esc(B.name)} ${bW}">
            <i style="width:${(aW / meets) * 100}%"></i><i style="width:${(bW / meets) * 100}%"></i></div>
          <p class="keyline"><span>${aW === bW ? 'Dead even' : `${esc((aW > bW ? A : B).name.split(' ')[0])} leads`}</span><span class="num">${meets} meetings</span></p>
          ${meets < MIN_TOGETHER ? `<p class="foot">Fewer than ${MIN_TOGETHER} meetings — small sample.</p>` : ''}`
        : `<div class="emptybox" style="margin-top:14px">${esc(A.name)} and ${esc(B.name)} have never faced each other in the recorded games.</div>`}
        <p class="foot">Computed from every game on record, so these numbers always agree with the match log below.</p>
      </div>

      <div class="card">
        <div class="card-h"><h2>On the same team</h2><span class="badge">Every game</span></div>
        ${tog.length ? `
          <div class="duel">
            <div class="side lead"><b class="num">${togW}</b><span>Wins together</span></div>
            <span class="dash">–</span>
            <div class="side dim"><b class="num">${tog.length - togW}</b><span>Losses together</span></div>
          </div>
          <div class="splitbar wlbar" role="img" aria-label="${togW} wins, ${tog.length - togW} losses as partners">
            <i style="width:${(togW / tog.length) * 100}%"></i><i style="width:${((tog.length - togW) / tog.length) * 100}%"></i></div>
          <p class="keyline"><span>${pct(togW / tog.length)} as partners</span><span class="num">${tog.length} games</span></p>`
        : `<div class="emptybox" style="margin-top:14px">These two have never played in the same game.</div>`}
        <p class="foot">From all ${coverage.games.toLocaleString()} games on record.</p>
      </div>
    </div>

    ${history.length ? `<div class="card">
      <div class="card-h"><h2>Shared games</h2><span class="meta">${history.length} on record</span></div>
      <div class="log" style="max-height:430px;overflow-y:auto">${history.map(({ g, kind }) => {
        const v = perspective(g, a);
        return `<div class="logrow">
          <span class="wl ${v.won ? 'w' : 'l'}" aria-hidden="true">${v.won ? 'W' : 'L'}</span>
          ${logStamp(g)}
          <span class="logwho"><span class="tagpill ${kind}">${kind === 'tog' ? 'Together' : 'Opposed'}</span>
            ${v.me.map((n) => esc(nameOf(n))).join(' &amp; ')} <em>vs</em> ${v.opp.map((n) => esc(nameOf(n))).join(' &amp; ')}</span>
          <span class="logscore num">${v.mine}<span class="s2">–${v.theirs}</span></span></div>`;
      }).join('')}</div>
      <p class="foot">Scores shown from ${esc(A.name)}'s side.</p>
    </div>` : ''}`;
}

/* --------------------------------------------------------- standings view */
function renderStandings() {
  if (state.league === 'master') return renderMaster();
  const l = leagueById.get(state.league);
  const rows = [...l.standings].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  $('#standingsBody').innerHTML = `
    <div class="card">
      <div class="card-h"><h2>${esc(l.label)}</h2><span class="meta">${esc(l.note)} · ${rows.length} players</span></div>
      <p class="foot" style="margin:2px 0 0">Compare this against the same workbook on merrickinapickle.com — the numbers should be identical.</p>
      <div class="scroller"><table>
        <thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>Games</th><th>Win rate</th><th>Pts for</th><th>Pts agst</th><th>Diff</th><th>Points</th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-player="${esc(r.id)}">
          <td class="num thin">${r.rank ?? ''}</td>
          <td><button class="namebtn" data-player="${esc(r.id)}">${esc(nameOf(r.id))}</button></td>
          <td class="num">${r.wins ?? '—'}</td><td class="num">${r.losses ?? '—'}</td><td class="num">${r.games ?? '—'}</td>
          <td class="num">${r.winPct != null ? pct(r.winPct) : '—'}</td>
          <td class="num">${r.pf ?? '—'}</td><td class="num">${r.pa ?? '—'}</td>
          <td class="num">${r.diff != null ? signed(r.diff) : '—'}</td>
          <td class="num">${r.points ?? '—'}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}


/* ------------------------------------------------------------- combobox */
/**
 * Type-to-filter player picker.
 *
 * The list is NOT truncated. It used to stop at 60 names, written when the
 * roster was 174 and a full list felt unwieldy. At 300-odd players the 60th
 * name falls in the C's, so anyone scrolling for Vincent Cusumano simply hit a
 * wall and had to know to start typing. A capped list is only honest if it says
 * it is capped, and this one did not - so it scrolls instead. The listbox is
 * 320px tall with its own scrollbar, and 300 list items is nothing to render.
 */
function mountCombo(inputId, listId, getId, setId) {
  const input = $('#' + inputId);
  const list = $('#' + listId);
  let items = [], active = -1, open = false;

  const label = (p) => p.name;
  const sub = (p) => {
    const bits = [];
    if (p.nameConflict && p.club) bits.push(p.club);
    if (p.leagues?.length) bits.push(`${p.leagues.length} league${p.leagues.length > 1 ? 's' : ''}`);
    else if (p.displayOnly) bits.push('tournament play');
    return bits.join(' · ');
  };

  const close = () => {
    open = false; active = -1;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const paint = () => {
    list.innerHTML = items.length
      ? items.map((p, i) => `<li role="option" id="${inputId}-o${i}" data-id="${esc(p.id)}"
          aria-selected="${i === active}"><span>${esc(label(p))}</span><span class="sub">${esc(sub(p))}</span></li>`).join('')
      : '<li class="none">No player by that name</li>';
    list.hidden = false;
    open = true;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${inputId}-o${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    }
  };
  const search = (q) => {
    const t = q.trim().toLowerCase();
    const pool = players.filter((p) => p.id !== (inputId === 'selA' ? state.b : inputId === 'selB' ? state.a : null));
    items = (!t ? pool : pool.filter((p) =>
      p.name.toLowerCase().includes(t) || (p.aliases ?? []).some((a) => a.toLowerCase().includes(t))))
      .sort((a, b) => {
        const ai = a.name.toLowerCase().startsWith(t) ? 0 : 1, bi = b.name.toLowerCase().startsWith(t) ? 0 : 1;
        return ai - bi || a.name.localeCompare(b.name);
      });
  };
  // A blur schedules a reset 140ms later, late enough for a click on an option
  // to land first. If focus comes BACK before it fires - which is exactly what
  // clicking from one box to the other does - that reset must be cancelled, or
  // it rewrites the box while the user is already typing into it. That is what
  // turned "lauren" into "Josh Callahanauren": the first keystroke went in, the
  // stale timer then restored the old name, and the rest appended to it.
  let blurTimer = null;
  const cancelReset = () => { clearTimeout(blurTimer); blurTimer = null; };
  const pick = (p) => { if (!p) return; cancelReset(); input.value = label(p); close(); setId(p.id); };

  // Clearing on focus, rather than selecting the existing text.
  //
  // This used to call input.select() and trust the selection to survive. It
  // does not: a real mouse click fires focus on mousedown, and the browser then
  // places the caret itself on mouseup, wiping the selection. So typing
  // sometimes replaced the name and sometimes appended to it - "Frank Rossetti"
  // plus "josh" became "Frank Rossettijosh", which matches nobody, and the box
  // looked like it had stopped accepting input.
  //
  // Emptying the field has no such race. The placeholder says "Type a name",
  // the full list drops open underneath, and blur puts the previous name back
  // if nothing was chosen - so a stray click costs nothing.
  input.addEventListener('focus', () => { cancelReset(); input.value = ''; search(''); active = -1; paint(); });
  input.addEventListener('input', () => { search(input.value); active = items.length ? 0 : -1; paint(); });
  input.addEventListener('blur', () => {
    cancelReset();
    blurTimer = setTimeout(() => {
      blurTimer = null;
      if (document.activeElement === input) return;   // came back; leave it alone
      close();
      input.value = label(byId.get(getId())) ?? '';
    }, 140);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { search(input.value); active = -1; }
      if (!items.length) return paint();
      active = e.key === 'ArrowDown'
        ? (active + 1) % items.length
        : (active <= 0 ? items.length - 1 : active - 1);
      paint();
    } else if (e.key === 'Enter') {
      if (open && active >= 0) { e.preventDefault(); pick(items[active]); }
    } else if (e.key === 'Escape') {
      close(); input.value = label(byId.get(getId()));
    }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) { e.preventDefault(); pick(byId.get(li.dataset.id)); }
  });

  return { set: (id) => { input.value = label(byId.get(id)) ?? ''; } };
}

/** This week's cross-league table, straight from the master standings sheet. */
function renderMaster() {
  const rows = [...master.rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  $('#standingsBody').innerHTML = `
    <div class="card">
      <div class="card-h"><h2>This week, all leagues</h2><span class="meta">${rows.length} players</span></div>
      <p class="foot" style="margin:2px 0 0">${esc(master.title)}</p>
      <div class="scroller"><table>
        <thead><tr><th>#</th><th>Player</th><th>Events</th><th>W</th><th>L</th><th>Games</th><th>Win rate</th><th>Pts for</th><th>Pts agst</th><th>Diff</th></tr></thead>
        <tbody>${rows.map((r) => {
          const g = r.games ?? (r.wins + r.losses);
          return `<tr data-player="${esc(r.id)}">
            <td class="num thin">${r.rank ?? ''}</td>
            <td><button class="namebtn" data-player="${esc(r.id)}">${esc(nameOf(r.id))}</button></td>
            <td class="num">${r.events ?? '—'}</td>
            <td class="num">${r.wins ?? '—'}</td><td class="num">${r.losses ?? '—'}</td><td class="num">${g ?? '—'}</td>
            <td class="num">${g ? pct(r.wins / g) : '—'}</td>
            <td class="num">${r.pf ?? '—'}</td><td class="num">${r.pa ?? '—'}</td>
            <td class="num">${r.diff != null ? signed(r.diff) : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>
    </div>`;
}

/* --------------------------------------------------------- sortable tables */
/**
 * Make every data table sortable by tapping a column heading.
 *
 * Applied to the rendered DOM rather than to each render function. Four
 * different bits of code build tables here - partners, head-to-head, league
 * standings, the master sheet - each with its own row shape, and threading a
 * sort key through all four would disturb a lot of working code to add one
 * behaviour. The tables already hold everything a sort needs: the figures are
 * in the cells, and the cells that hold figures are already marked `num`.
 *
 * Three states per column, not two. Each table's default order is a real
 * editorial choice - partners lead with the pairings that have enough games to
 * mean anything, standings lead with Dave's published rank - so a third tap
 * restores it rather than stranding the reader in an order the page never
 * intended.
 */
/**
 * Long tables show their first rows and keep the rest behind a button.
 *
 * The busiest player has 242 partners and 300-odd opponents, and printing all
 * of them meant scrolling past a hundred people he played once to reach the
 * next section. The tail is real data and it stays available - it just should
 * not stand between the reader and the rest of the page.
 *
 * The hidden rows stay in the DOM rather than being cut from the markup, which
 * is what makes this safe to combine with sorting: a sort reorders all 242 and
 * the cap is then re-applied to the new order, so "sort by games" shows the
 * twelve most-played partners and not the best twelve of an arbitrary twelve.
 */
const ROW_CAP = 12;

function applyCap(table) {
  const cap = table.dataset.capped === 'off' ? Infinity : Number(table.dataset.cap || ROW_CAP);
  [...table.tBodies[0].rows].forEach((tr, i) => { tr.hidden = i >= cap; });
}

function addCapToggle(table) {
  const total = table.tBodies[0].rows.length;
  const cap = Number(table.dataset.cap || ROW_CAP);
  if (total <= cap) return;
  const noun = table.dataset.capNoun || 'rows';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'morebtn';
  btn.setAttribute('aria-expanded', 'false');
  const label = () => (table.dataset.capped === 'off'
    ? `Show only the top ${cap}` : `Show all ${total} ${noun}`);
  btn.textContent = label();
  btn.addEventListener('click', () => {
    const opening = table.dataset.capped !== 'off';
    table.dataset.capped = opening ? 'off' : 'on';
    applyCap(table);
    btn.textContent = label();
    btn.setAttribute('aria-expanded', String(opening));
    say(opening ? `Showing all ${total} ${noun}.` : `Showing the top ${cap} ${noun}.`);
    // Collapsing from the bottom of a long table would otherwise leave the
    // reader looking at whatever now sits where the table used to be.
    if (!opening) btn.scrollIntoView({ block: 'nearest' });
  });
  (table.closest('.scroller') ?? table).after(btn);
}

function sortKey(tr, i) {
  const td = tr.cells[i];
  if (!td) return null;
  const text = td.textContent.replace(/\s+/g, ' ').trim();
  // An em dash means the figure is missing, which is not the same as zero.
  return !text || text === '—' ? null : text;
}

function makeSortable(root) {
  for (const table of root.querySelectorAll('table')) {
    if (table.dataset.sortable) continue;
    const head = table.tHead?.rows[0], body = table.tBodies[0];
    if (!head || !body || body.rows.length < 2) continue;
    table.dataset.sortable = 'on';
    [...body.rows].forEach((tr, i) => { tr.dataset.ord = String(i); });

    [...head.cells].forEach((th, i) => {
      const label = th.textContent.trim();
      if (!label) return;                    // the unlabelled "Compare" column
      // Numeric when most of the column is marked as figures. Win rate reads
      // "83%" followed by a bar, and the bar carries no text, so it parses.
      const nums = [...body.rows].filter((tr) => tr.cells[i]?.classList.contains('num')).length;
      th.dataset.numeric = nums > body.rows.length / 2 ? '1' : '';
      th.dataset.state = 'none';
      th.setAttribute('aria-sort', 'none');
      th.innerHTML = `<button type="button" class="sortbtn">
        <span>${esc(label)}</span><span class="sortar" aria-hidden="true"></span></button>`;
      th.querySelector('.sortbtn').addEventListener('click', () => cycleSort(table, i));
    });

    if (table.dataset.cap) { applyCap(table); addCapToggle(table); }
  }
}

function cycleSort(table, index) {
  const head = table.tHead.rows[0], body = table.tBodies[0];
  const th = head.cells[index];
  // A column of figures opens on its biggest value; a column of names opens on
  // A-Z. That is what someone means by "sort by wins" and by "sort by partner".
  const order = th.dataset.numeric ? ['none', 'desc', 'asc'] : ['none', 'asc', 'desc'];
  const next = order[(order.indexOf(th.dataset.state) + 1) % order.length];

  for (const c of head.cells) {
    if (!c.dataset.state) continue;
    c.dataset.state = 'none';
    c.setAttribute('aria-sort', 'none');
  }
  th.dataset.state = next;
  th.setAttribute('aria-sort',
    next === 'asc' ? 'ascending' : next === 'desc' ? 'descending' : 'none');

  const rows = [...body.rows];
  const original = (a, b) => Number(a.dataset.ord) - Number(b.dataset.ord);
  if (next === 'none') rows.sort(original);
  else {
    const dir = next === 'asc' ? 1 : -1;
    const numeric = Boolean(th.dataset.numeric);
    rows.sort((a, b) => {
      const x = sortKey(a, index), y = sortKey(b, index);
      // A missing figure sinks either way round. A dash is not a small number,
      // and floating it to the top of an ascending sort would say it was.
      if (x === null || y === null) return x === y ? original(a, b) : x === null ? 1 : -1;
      if (numeric) {
        const nx = parseFloat(x.replace(/[^\d.+-]/g, ''));
        const ny = parseFloat(y.replace(/[^\d.+-]/g, ''));
        if (Number.isNaN(nx) || Number.isNaN(ny)) return original(a, b);
        return nx === ny ? original(a, b) : (nx - ny) * dir;
      }
      return x.localeCompare(y, undefined, { sensitivity: 'base' }) * dir || original(a, b);
    });
  }
  for (const tr of rows) body.appendChild(tr);
  // Re-cap against the NEW order, so a capped table shows the top of whatever
  // the reader just sorted by rather than the top of the order before it.
  if (table.dataset.cap) applyCap(table);
  say(next === 'none'
    ? 'Back to the original order.'
    : `Sorted by ${th.textContent.trim()}, ${next === 'asc' ? 'lowest' : 'highest'} first.`);
}

/* ------------------------------------------------------------------ shell */
const opt = (v, t, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`;
const playerOpts = (sel) => [...players].sort((x, y) => x.name.localeCompare(y.name))
  .map((p) => opt(p.id, p.name, sel)).join('');

function setView(view, focus) {
  state.view = view;
  // Every panel, home included. Leaving 'home' out of this list did not throw
  // and did not look broken on a desktop - it just never hid the home page, so
  // the panel you asked for opened two screens below it and the page appeared
  // not to react at all. On a phone the home page is ~2,000px tall, which put
  // the new panel entirely out of sight.
  for (const id of ['home', 'records', 'player', 'compare', 'standings']) {
    const on = id === view;
    const tab = $('#tab-' + id);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $('#panel-' + id).toggleAttribute('hidden', !on);
  }
  if (focus) $('#tab-' + view).focus();
  render();
}

function openCompare(a, b) {
  if (a === b) return;
  state.a = a; state.b = b;
  comboA.set(a); comboB.set(b);
  setView('compare');
  say(`Comparing ${nameOf(a)} with ${nameOf(b)}.`);
}
function openPlayer(id) {
  state.player = id;
  comboPlayer.set(id);
  setView('player');
  say(`Showing ${nameOf(id)}.`);
}

function render() {
  if (state.view === 'home') renderHome();
  else if (state.view === 'records') renderRecords();
  else if (state.view === 'player') renderPlayer();
  else if (state.view === 'compare') renderCompare();
  else renderStandings();
  // Every panel is rebuilt from scratch on each render, so the headings have to
  // be re-armed here rather than once at startup.
  makeSortable($('#panel-' + state.view));
  const h = state.view === 'home' ? '#/'
    : state.view === 'records' ? '#/records'
    : state.view === 'player' ? `#/player/${state.player}`
    : state.view === 'compare' ? `#/compare/${state.a}/${state.b}`
    : `#/standings/${state.league}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const [v, ...rest] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (v === 'home' || v === '') { state.view = 'home'; return true; }
  if (v === 'records') { state.view = 'records'; return true; }
  if (v === 'player' && byId.has(rest[0])) { state.view = 'player'; state.player = rest[0]; return true; }
  if (v === 'compare' && byId.has(rest[0]) && byId.has(rest[1])) {
    state.view = 'compare'; state.a = rest[0]; state.b = rest[1]; return true;
  }
  if (v === 'standings' && (rest[0] === 'master' || leagueById.has(rest[0]))) {
    state.view = 'standings'; state.league = rest[0]; return true;
  }
  return false;
}

let comboPlayer, comboA, comboB;


/**
 * The coverage notice is generated from the build, not typed by hand.
 *
 * Every number here moves on its own as data arrives. A notice written as prose
 * goes stale the first time a session is imported and nobody remembers to edit
 * it, and a stale caveat on a stats page is worse than none: it tells the reader
 * the data is thinner or thicker than it really is.
 */
function renderNotice() {
  const el = $('#dataNotice');
  if (!el) return;
  const c = coverage;
  const snaps = c.duprSnapshots ?? [];
  // The record now spans three calendar years, so a bare "Jan 9-Sep 11" reads
  // like one season. Every date here carries its year.
  const pretty = prettyDate;
  const n = (x) => Number(x).toLocaleString();

  // The caveats are real and stay one click away at all times. They are folded
  // rather than removed: six lines of qualification above the hero buries the
  // thing the page is actually for, and a caveat nobody reads because it is
  // wallpaper is worth no more than one that is hidden.
  const detail = [
    `${n(c.games)} matches over ${c.days} playing days, ${pretty(c.firstDate)} to ${pretty(c.lastDate)}. They come from two places that agree with each other: Merrick In A Pickle's DUPR club record, and the club's own Scoreholio match logs${c.gamesFromScoreholioOnly ? ` \u2014 ${n(c.gamesFromScoreholioOnly)} of these games were played, scored and stored in Scoreholio and never submitted to DUPR` : ''}. A game in both is matched on its players, score and day and counted once. Partner records, rivals, head-to-head and every club record are computed from those same games, so no two panels can disagree.`,
    `League standings come from the ranking workbooks published on merrickinapickle.com and should match them exactly.`,
  ];
  if (c.gamesWithTimeAndCourt) {
    detail.push(`${n(c.gamesWithTimeAndCourt)} games also carry a start time and court, joined from Scoreholio. The rest have the date but no clock.`);
  }
  if (snaps.length) {
    detail.push(snaps.length === 1
      ? `DUPR ratings are a single reading of the club listing, ${pretty(snaps[0])}, covering ${c.duprMatched} players \u2014 no rating history yet.`
      : `DUPR ratings come from ${snaps.length} readings of the club listing, ${pretty(snaps[0])} \u2013 ${pretty(snaps[snaps.length - 1])}, covering ${c.duprMatched} players.`);
  }
  if (c.possibleDuplicates) {
    detail.push(`<strong>${c.possibleDuplicates} people may be listed twice</strong> under slightly different spellings, which would also split their records. They are deliberately kept apart until someone who knows the club confirms it \u2014 merging two players by mistake would hand one of them the other's record.`);
  }

  // Says what the data IS, rather than warning that the site is unfinished.
  // "Still a test build" told a reader the numbers might be wrong, which was
  // never the point - every figure here is checked against the match record on
  // every build. What a reader actually needs is the window the data covers and
  // the one honest caveat, with the rest a click away.
  // A <details> at the foot of the landing page. The headline no longer claims
  // DUPR as the source: most games now come from Scoreholio's own match logs,
  // and a provenance note that names the wrong source is worse than none.
  el.innerHTML = `<summary>Where these numbers come from</summary>
    <div>${detail.join(' ')}</div>`;
}

function init() {
  comboPlayer = mountCombo('selPlayer', 'listPlayer', () => state.player,
    (id) => { state.player = id; render(); say(`Showing ${nameOf(id)}.`); });
  comboA = mountCombo('selA', 'listA', () => state.a, (id) => {
    state.a = id;
    if (state.a === state.b) { state.b = players.find((p) => p.id !== state.a).id; comboB.set(state.b); }
    render();
  });
  comboB = mountCombo('selB', 'listB', () => state.b, (id) => {
    state.b = id;
    if (state.a === state.b) { state.a = players.find((p) => p.id !== state.b).id; comboA.set(state.a); }
    render();
  });
  comboPlayer.set(state.player); comboA.set(state.a); comboB.set(state.b);
  $('#selLeague').innerHTML = opt('master', 'This week — all leagues', state.league)
    + leagues.map((l) => opt(l.id, `${l.label} — ${l.note}`, state.league)).join('');
  $('#ctlNote').textContent =
    `${players.length} players · ${coverage.games.toLocaleString()} games · ${coverage.days} playing days · ${prettyDate(coverage.firstDate)} to ${prettyDate(coverage.lastDate)}`;

  // The coverage note is part of the landing page now, so renderHome paints it.

  $('#btnSwap').addEventListener('click', () => {
    [state.a, state.b] = [state.b, state.a];
    comboA.set(state.a); comboB.set(state.b);
    render(); say(`Swapped. Now ${nameOf(state.a)} against ${nameOf(state.b)}.`);
  });
  $('#selLeague').addEventListener('change', (e) => { state.league = e.target.value; render(); });

  $('#playerBody').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cmp]');
    if (c) return openCompare(state.player, c.dataset.cmp);
    const more = e.target.closest('#btnMore');
    if (more) {
      const box = $('#fullLog');
      const open = box.hasAttribute('hidden');
      box.toggleAttribute('hidden', !open);
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Hide match log' : `Show all ${box.children.length} games`;
    }
  });
  $('#panel-home').addEventListener('click', (e) => {
    const go = e.target.closest('[data-view]');
    if (go) { setView(go.dataset.view); return; }
    const card = e.target.closest('[data-goto]');
    if (!card) return;
    // A name now sits inside a <summary>, so a click on it would both open the
    // profile AND toggle the card. Suppress the toggle: the tap was aimed at a
    // person, not at the disclosure.
    e.preventDefault();
    e.stopPropagation();
    openPlayer(card.dataset.goto);
  });
  $('#panel-records').addEventListener('click', (e) => {
    const card = e.target.closest('[data-goto]');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    openPlayer(card.dataset.goto);
  });
  $('#standingsBody').addEventListener('click', (e) => {
    const t = e.target.closest('[data-player]');
    if (t) openPlayer(t.dataset.player);
  });

  const tabs = ['home', 'records', 'player', 'compare', 'standings'];
  tabs.forEach((name, i) => {
    const t = $('#tab-' + name);
    t.addEventListener('click', () => setView(name));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      setView(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
    });
  });

  // A URL like #/player/<id> changes state after the combos were filled, so
  // re-sync them or the box shows one player while the page shows another.
  readHash();
  comboPlayer.set(state.player); comboA.set(state.a); comboB.set(state.b);
  addEventListener('hashchange', () => {
    if (!readHash()) return;
    comboPlayer.set(state.player); comboA.set(state.a); comboB.set(state.b);
    setView(state.view);
  });
  setView(state.view);

  // Site-wide, with no subject: reachable from every page, for the reports that
  // are not about one player. Renders nothing until a form is configured.
  mountFeedback($('#siteFeedback'), { label: 'Spotted a mistake, or want something added? Tell us.' });
}

init();
