// "Share my night": a 1080x1350 picture of a player's latest night, drawn on a
// <canvas> in the browser. No server and no new library: the numbers already
// arrived in data.js (player.share, player.power), and this only paints them.
//
// Nothing goes on the card that is not already on the player's own page: no
// photo, no email, no club membership details - a name, a night and its record.

const W = 1080, H = 1350;
const C = {
  court: '#0A3B2C', deep: '#06291E', soft: '#11523D', line: 'rgba(217,248,75,.10)',
  lime: '#D9F84B', ink: '#1B2708', white: '#FFFFFF', dim: 'rgba(255,255,255,.62)',
  faint: 'rgba(255,255,255,.42)', box: 'rgba(255,255,255,.07)', boxLine: 'rgba(255,255,255,.14)',
  up: '#7BE3A6', down: '#FF9C90',
};
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = 'Inter, system-ui, sans-serif';
const SITE = 'stats.estimator.trade';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const nightDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${MON[m - 1]} ${d}, ${y}`;
};
const winPct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) + '%' : '—');

/** Largest size (down to `min`) at which `text` fits in `max` pixels. */
function fit(ctx, text, weight, family, size, max, min = 24) {
  let s = size;
  for (; s > min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= max) break;
  }
  return s;
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  // Canvas letterSpacing is not everywhere yet; draw letter by letter instead.
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the card. `card` = { name, date, league, w, l, season, rank, move, rating, partner }. */
export async function drawShareCard(card) {
  // The canvas only gets a web font that has finished loading, and a font no
  // element on the page has used yet may not have started. Ask for each face
  // the card uses, then wait for the whole set.
  if (document.fonts) {
    await Promise.all([
      `700 100px ${DISPLAY}`, `600 40px ${DISPLAY}`, `600 30px ${SANS}`, `700 30px ${SANS}`, `500 30px ${SANS}`,
    ].map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Court green, lit from the top right, with the court lines faintly over it.
  const g = ctx.createRadialGradient(W * 0.85, 0, 40, W * 0.85, 0, H * 1.1);
  g.addColorStop(0, C.soft); g.addColorStop(0.55, C.court); g.addColorStop(1, C.deep);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.line; ctx.lineWidth = 3;
  // Kept above the three boxes so no line runs behind their text.
  ctx.strokeRect(70, 370, W - 140, 490);
  ctx.beginPath(); ctx.moveTo(W / 2, 370); ctx.lineTo(W / 2, 860); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(70, 615); ctx.lineTo(W - 70, 615); ctx.stroke();

  const PAD = 80;
  // Masthead
  ctx.fillStyle = C.lime;
  ctx.font = `700 46px ${DISPLAY}`;
  spaced(ctx, 'THE MIP STAT ROOM', PAD, 128, 7);
  ctx.fillStyle = C.dim;
  ctx.font = `600 30px ${SANS}`;
  const when = nightDate(card.date) + (card.league ? `  ·  ${card.league}` : '');
  fit(ctx, when, 600, SANS, 30, W - 2 * PAD, 20);
  ctx.fillText(when, PAD, 182);

  // The player
  ctx.fillStyle = C.white;
  const name = card.name.toUpperCase();
  fit(ctx, name, 700, DISPLAY, 132, W - 2 * PAD, 54);
  ctx.fillText(name, PAD, 330);

  // The night, very large
  ctx.fillStyle = C.faint;
  ctx.font = `700 26px ${SANS}`;
  spaced(ctx, 'THE NIGHT', PAD, 420, 5);
  ctx.fillStyle = C.lime;
  const wl = `${card.w}–${card.l}`;
  fit(ctx, wl, 700, DISPLAY, 400, W - 2 * PAD, 120);
  ctx.fillText(wl, PAD - 8, 760);
  ctx.fillStyle = C.dim;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(`${card.w + card.l} game${card.w + card.l === 1 ? '' : 's'} · ${winPct(card.w, card.l)} won`, PAD, 826);

  // Three boxes
  const top = 900, bh = 250, gap = 24, bw = (W - 2 * PAD - 2 * gap) / 3;
  const boxes = [
    { lab: 'SEASON', val: `${card.season.w}–${card.season.l}`, sub: `${winPct(card.season.w, card.season.l)} win rate` },
    card.rank
      ? { lab: 'POWER RANK', val: `#${card.rank}`, move: card.move, sub: `rating ${card.rating}` }
      : { lab: 'POWER RATING', val: String(card.rating), sub: 'not ranked yet' },
    card.partner
      ? { lab: 'BEST PARTNER', name: card.partner.name, sub: `${card.partner.w}–${card.partner.l} together` }
      : { lab: 'BEST PARTNER', val: '—', sub: 'min 3 games together' },
  ];
  boxes.forEach((b, i) => {
    const x = PAD + i * (bw + gap);
    roundRect(ctx, x, top, bw, bh, 26);
    ctx.fillStyle = C.box; ctx.fill();
    ctx.strokeStyle = C.boxLine; ctx.lineWidth = 2; ctx.stroke();
    const ix = x + 26, iw = bw - 52;
    ctx.fillStyle = C.faint;
    ctx.font = `700 21px ${SANS}`;
    spaced(ctx, b.lab, ix, top + 50, 3);
    ctx.fillStyle = C.white;
    if (b.name) {
      // A name gets two lines before it gets small.
      const parts = b.name.split(/\s+/);
      const lines = parts.length > 1 ? [parts.slice(0, -1).join(' '), parts.at(-1)] : [b.name];
      const s = Math.min(...lines.map((ln) => fit(ctx, ln.toUpperCase(), 700, DISPLAY, 58, iw, 28)));
      ctx.font = `700 ${s}px ${DISPLAY}`;
      lines.forEach((ln, k) => ctx.fillText(ln.toUpperCase(), ix, top + 112 + k * (s + 2)));
    } else {
      ctx.font = `700 92px ${DISPLAY}`;
      fit(ctx, b.val, 700, DISPLAY, 92, iw, 40);
      ctx.fillText(b.val, ix, top + 160);
      if (b.move) {
        const vw = ctx.measureText(b.val).width;
        ctx.font = `700 34px ${SANS}`;
        ctx.fillStyle = b.move.dir > 0 ? C.up : b.move.dir < 0 ? C.down : C.dim;
        ctx.fillText(b.move.text, ix + vw + 14, top + 156);
      }
    }
    ctx.fillStyle = C.dim;
    ctx.font = `500 24px ${SANS}`;
    fit(ctx, b.sub, 500, SANS, 24, iw, 16);
    ctx.fillText(b.sub, ix, top + bh - 30);
  });

  // Footer
  ctx.fillStyle = C.white;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText('Every game. Every league. Every night.', PAD, H - 92);
  ctx.fillStyle = C.lime;
  ctx.font = `700 30px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.fillText(SITE, W - PAD, H - 92);
  ctx.textAlign = 'left';

  return new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('canvas gave no image'))), 'image/png'));
}

export function shareFileName(playerId, date) {
  return `mip-${String(playerId).replace(/[^a-z0-9-]/gi, '')}-${date}.png`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Share on a phone, download everywhere else. `mode` 'save' always downloads.
 * Returns what happened, for the page's live-region message.
 */
export async function shareOrSave(card, playerId, mode) {
  const blob = await drawShareCard(card);
  const name = shareFileName(playerId, card.date);
  const phone = matchMedia('(pointer: coarse)').matches;
  if (mode !== 'save' && phone && navigator.canShare) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${card.name} · MIP Stat Room`, text: `${SITE}` });
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';
        // Anything else: fall through to a download rather than nothing.
      }
    }
  }
  download(blob, name);
  return 'saved';
}
