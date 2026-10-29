/**
 * "Something look wrong?" - the one thing on this site that reads FROM its
 * readers instead of at them.
 *
 * The case for it is already in the project's history. Every duplicate identity
 * merged so far was noticed by somebody looking at the site, not by any check
 * in the build - people went on it and said "there are two of me". That is free
 * and it is better than anything automated, because the person behind the
 * handle "Michael S." is the only one who knows which Michael they are, and
 * there are still 84 handles like that holding games back.
 *
 * So this is deliberately NOT a suggestion box. A suggestion box collects
 * opinions about colours. This asks about the thing readers are demonstrably
 * good at, from the page where they noticed it, carrying what they were looking
 * at when they did.
 *
 * WHY A GOOGLE FORM AND NOT A mailto:
 *
 * A mailto would work today with no setup, and it would print the league's
 * email address on a public page for every scraper on the internet to harvest.
 * The form costs two minutes to make and exposes nothing.
 *
 * UNTIL THE FORM EXISTS, THIS RENDERS NOTHING. A link to a form that is not
 * there is worse than no link: the reader writes out a careful report about a
 * duplicate player and lands on a 404.
 */

/** Paste the Google Form's share link here to switch the feature on. */
export const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSd6zyLwa-T_2HyR8N9Fm1iBOi3ttbc9bCQJxmbj9UvY4NB6wQ/viewform';

/**
 * The form's prefill field ids, from its own prefill link.
 *
 * To get them: in the form, ⋮ -> "Get pre-filled link", fill each field with a
 * word you will recognise, Get link, and read the entry.NNNNN ids out of the
 * URL it gives you. Leave any of these blank and that context is simply not
 * sent - the form still works, the reader just has to say which page they
 * were on.
 */
export const FIELDS = {
  page: '',      // which page they were looking at
  subject: '',   // the player or record in question, when there is one
};

const filled = () => FORM_URL && /^https:\/\/docs\.google\.com\/forms\//.test(FORM_URL);

/**
 * A link to the form, carrying what the reader was looking at.
 *
 * @param subject e.g. a player's name, or null on a page that has no one subject
 */
export function formLink(subject = null) {
  if (!filled()) return null;
  const u = new URL(FORM_URL);
  u.searchParams.set('usp', 'pp_url');
  if (FIELDS.page) u.searchParams.set(FIELDS.page, location.hash || '#/');
  if (FIELDS.subject && subject) u.searchParams.set(FIELDS.subject, subject);
  return u.toString();
}

/**
 * Render the link into `el`, or leave the page untouched if there is no form.
 *
 * Opens in a new tab: a reader part-way through comparing two players should
 * not lose that to file a report about it.
 */
export function mountFeedback(el, { subject = null, label = 'Something look wrong?' } = {}) {
  if (!el) return false;
  const href = formLink(subject);
  if (!href) { el.innerHTML = ''; return false; }

  // Built as two lines rather than one sentence: the card lives in the page's
  // side gutter, which is narrow, and a single long sentence there wraps into
  // an awkward ragged block. A short heading with the subject under it fills a
  // small square properly and stays readable when it collapses to a pill on a
  // narrower screen.
  const a = document.createElement('a');
  a.className = 'feedback-link';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const head = document.createElement('b');
  head.className = 'fb-head';
  head.textContent = subject ? 'Something look wrong?' : 'Spotted a mistake?';
  a.appendChild(head);

  const sub = document.createElement('span');
  sub.className = 'fb-sub';
  sub.textContent = subject ? `Tell us about ${subject}.` : 'Or want something added? Tell us.';
  a.appendChild(sub);

  el.innerHTML = '';
  el.appendChild(a);
  keepClear(el.closest('.feedbar'));
  return true;
}

/*
 * Where there is no side gutter the card floats in the bottom-right corner,
 * and whatever the page puts there at that moment is under it. On Oct 29 2026
 * the player page lost its rating panel, the Rivals card moved up, and the
 * card sat on "Most played" at 900px. Rather than hope the layout never moves
 * again, the card checks the corner it is about to use and, if a control is
 * under it, takes the top-right corner below the top bar instead - when that
 * one is clear. Both stay on screen while scrolling.
 */
const WIDE = '(min-width:1580px)';      // the gutter card in index.html
const CONTROLS = 'button, a[href], input, select, textarea, [role="tab"], .tab, .comboinput, .topbar';
let watched = null;

function coversControl(bar, left, top, w, h) {
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 2; j++) {
      const x = left + (w - 1) * i / 4, y = top + (h - 1) * j / 2;
      for (const el of document.elementsFromPoint(x, y)) {
        if (bar.contains(el)) continue;
        if (el.closest(CONTROLS)) return true;
      }
    }
  }
  return false;
}

function place(bar) {
  if (!bar) return;
  bar.style.top = ''; bar.style.bottom = '';
  if (matchMedia(WIDE).matches) return;
  const r = bar.getBoundingClientRect();
  if (!r.width) return;
  if (!coversControl(bar, r.left, r.top, r.width, r.height)) return;
  const tb = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(8, tb + 8);
  if (!coversControl(bar, r.left, top, r.width, r.height)) {
    bar.style.top = `${top}px`; bar.style.bottom = 'auto';
  }
}

function keepClear(bar) {
  if (!bar || typeof window === 'undefined') return;
  if (watched !== bar) {
    watched = bar;
    let queued = false;
    const soon = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; place(bar); }); } };
    addEventListener('scroll', soon, { passive: true });
    addEventListener('resize', soon);
    // The page under it is redrawn on every view change.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(soon).observe(document.body);
  }
  requestAnimationFrame(() => place(bar));
}
