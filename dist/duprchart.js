/**
 * A player's DUPR doubles rating, and how it has moved.
 *
 * WHAT THIS IS NOT: a club leaderboard. DUPR's own site already ranks the club,
 * and a ranking turns a stats page into a thing people check their position on.
 * This is per-player and you only see it by going to that player's page.
 *
 * WHAT THE NUMBER MEANS. It is DUPR's rating, read off the Merrick In A Pickle
 * club listing on a given date. It is NOT computed from the wins and losses on
 * this site, and nothing here writes back to DUPR.
 *
 * WHAT THE MOVEMENT MEANS, and the honest limit on it. DUPR publishes a current
 * rating and no history: once a rating moves, the old value is gone from their
 * site for good. So every figure here is movement BETWEEN OUR OWN READINGS, and
 * it can only describe the span we happen to have taken readings across. With
 * one reading there is no movement and this draws no chart and no arrow - a
 * single point joined to nothing is not a trend, and drawing one would be a
 * lie told in a shape people trust.
 */

const nf3 = (n) => n.toFixed(3);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayMs = 86400000;
const parse = (d) => new Date(d + 'T00:00:00Z').getTime();

/** Readings sorted oldest first, with anything unusable dropped. */
function clean(history) {
  return (history ?? [])
    .filter((h) => h && typeof h.rating === 'number' && Number.isFinite(h.rating) && h.date)
    .sort((a, b) => parse(a.date) - parse(b.date));
}

/**
 * The reading closest to `days` ago, but only if one exists at least that far
 * back. Returning the oldest reading we happen to have and calling it "a month
 * ago" would put a made-up timeframe on a real number.
 */
export function readingAgo(history, days) {
  const h = clean(history);
  if (h.length < 2) return null;
  const target = parse(h[h.length - 1].date) - days * dayMs;
  const old = h.filter((r) => parse(r.date) <= target);
  return old.length ? old[old.length - 1] : null;
}

/**
 * How the rating moved, and over what span - described in the span we actually
 * have, never in a rounder one we do not.
 */
export function movement(history) {
  const h = clean(history);
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  const monthAgo = readingAgo(h, 28);
  const from = monthAgo ?? h[0];
  const delta = last.rating - from.rating;
  const spanDays = Math.round((parse(last.date) - parse(from.date)) / dayMs);
  // "In the last month" is only allowed to mean a month. readingAgo finds the
  // newest reading at least 28 days old, and when readings are sparse that can
  // be considerably older - if the only earlier reading is from ten weeks back,
  // this is a ten-week move and saying "the last month" would put a borrowed
  // timeframe on a real number. So the phrase has to earn itself.
  const aboutAMonth = monthAgo && spanDays <= 45;
  return {
    from, last, delta, spanDays,
    // Percent of the rating, which is what "up 2%" means to a player. DUPR
    // ratings sit around 2-6, so a 0.1 move is a real one and reads as ~2%.
    pct: from.rating ? (delta / from.rating) * 100 : 0,
    label: aboutAMonth
      ? 'in the last month'
      : `over ${spanDays} day${spanDays === 1 ? '' : 's'}`,
  };
}

/**
 * A sparkline. One series, so no legend - the heading names it.
 *
 * Deliberately small and axis-light: this answers "which way am I going", not
 * "what exactly was I on 14 August". The exact numbers are in the table that
 * ships underneath it, which is also what a screen reader reads.
 */
function sparkline(h, { w = 260, ht = 56, pad = 6 } = {}) {
  const lo = Math.min(...h.map((r) => r.rating));
  const hi = Math.max(...h.map((r) => r.rating));
  // A flat run would divide by zero and, worse, draw a line through the middle
  // implying a mid-range value. Give it a band so it draws flat where it is.
  const span = hi - lo || 0.1;
  const t0 = parse(h[0].date), t1 = parse(h[h.length - 1].date);
  const tspan = (t1 - t0) || 1;
  const x = (r) => pad + ((parse(r.date) - t0) / tspan) * (w - pad * 2);
  const y = (r) => ht - pad - ((r.rating - lo) / span) * (ht - pad * 2);

  const pts = h.map((r) => `${x(r).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
  const last = h[h.length - 1];
  const rising = last.rating >= h[0].rating;

  // Markers are only drawn when there is room for them; on a long series they
  // become noise and the line carries the shape on its own.
  const dots = h.length <= 14
    ? h.map((r) => `<circle class="dpt" cx="${x(r).toFixed(1)}" cy="${y(r).toFixed(1)}" r="2.5"
        data-d="${esc(r.date)}" data-r="${nf3(r.rating)}"><title>${esc(r.date)}: ${nf3(r.rating)}</title></circle>`).join('')
    : '';

  return `<svg class="dspark ${rising ? 'up' : 'down'}" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}"
      role="img" aria-label="Rating from ${nf3(h[0].rating)} on ${esc(h[0].date)} to ${nf3(last.rating)} on ${esc(last.date)}. Exact readings are in the table below.">
    <polyline class="dline" points="${pts}" fill="none" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    <circle class="dend" cx="${x(last).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4"/>
  </svg>`;
}

/**
 * The whole panel. Returns '' for a player with no DUPR rating, which is most
 * of them - only about 70 of the club's 500-odd players have linked an account,
 * and an empty "DUPR" box on everyone else's page would read as missing data
 * rather than as a thing that does not apply.
 */
export function duprPanel(dr) {
  if (!dr || typeof dr.rating !== 'number') return '';
  const h = clean(dr.history);
  const mv = movement(h);

  const arrow = mv && mv.delta !== 0
    ? `<span class="dmv ${mv.delta > 0 ? 'up' : 'down'}">
         ${mv.delta > 0 ? '▲' : '▼'} ${Math.abs(mv.delta).toFixed(3)}
         <span class="dpct">(${mv.delta > 0 ? '+' : '−'}${Math.abs(mv.pct).toFixed(1)}%)</span>
         <span class="dspan">${esc(mv.label)}</span>
       </span>`
    : '';

  // Under two readings there is nothing to draw. Say so plainly rather than
  // showing an empty frame that looks like it failed to load.
  const body = h.length >= 2
    ? `${sparkline(h)}
       <details class="dtable">
         <summary>All ${h.length} readings</summary>
         <table><thead><tr><th>Date</th><th>Rating</th></tr></thead><tbody>
           ${h.slice().reverse().map((r) => `<tr><td>${esc(r.date)}</td><td class="num">${nf3(r.rating)}</td></tr>`).join('')}
         </tbody></table>
       </details>`
    : `<p class="dnone">One reading so far, taken ${esc(dr.asOf ?? 'recently')}. The chart
       starts once there are two — DUPR doesn't publish past ratings, so this can
       only ever show movement from the day we started looking.</p>`;

  return `<section class="card duprcard">
    <div class="card-h"><h2>DUPR rating</h2><span class="meta">doubles</span></div>
    <p class="dnum"><b>${nf3(dr.rating)}</b>${arrow}</p>
    ${body}
    <p class="dfoot">DUPR's own doubles rating for ${esc(dr.duprName ?? 'this player')}, read from the
      Merrick In A Pickle club listing. Not calculated from the results on this site.</p>
  </section>`;
}
