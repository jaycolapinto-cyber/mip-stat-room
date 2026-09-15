// Tests for the "Something look wrong?" link, now that a form exists.
//
// These replaced an earlier set that asserted the OFF state - no link, no
// footer, no href. Those were not wasted: when the form URL went in, all five
// of them failed, which is exactly what a test for "this is switched off"
// should do the moment it is switched on. What matters now is different:
// the link must exist on every page, it must point at the real form, and it
// must never send a reader somewhere unintended.

import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd6zyLwa-T_2HyR8N9Fm1iBOi3ttbc9bCQJxmbj9UvY4NB6wQ/viewform';

await page.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

/* ---------------------------------------------------------------- the link */
const home = await page.$$eval('.feedback-link', (a) => a.map((e) => ({
  href: e.href, text: e.textContent.trim(), target: e.target, rel: e.rel,
})));
t('exactly one card is rendered, not one per panel', home.length === 1, JSON.stringify(home));
t('and points at the real form', home[0]?.href.startsWith(FORM), home[0]?.href);
t('and opens in a new tab', home[0]?.target === '_blank');
t('with rel=noopener, so the form cannot reach back into the page',
  /noopener/.test(home[0]?.rel ?? ''), home[0]?.rel);
t('and says what it is for in plain words',
  /mistake|wrong|added/i.test(home[0]?.text ?? ''), home[0]?.text);

/* -------------------------------------------- the player page carries a name */
const { id, name } = await page.evaluate(async () => {
  const { matches, players } = await import('./data.js');
  const pid = matches[matches.length - 1].a[0];
  return { id: pid, name: players.find((p) => p.id === pid)?.name };
});
await page.goto(`http://127.0.0.1:8321/#/player/${id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const onPlayer = await page.$$eval('.feedback-link', (a) => a.map((e) => ({ href: e.href, text: e.textContent.trim() })));
t('a player page still shows exactly one card, never two', onPlayer.length === 1, JSON.stringify(onPlayer));
t('and names the player in it, so a report says whose page it is about',
  onPlayer.some((l) => l.text.includes(name)), `${name} | ${JSON.stringify(onPlayer.map(l=>l.text))}`);

/* ------------------------------------------------------------- safety rails */
{
  const checks = await page.evaluate(async () => {
    const m = await import('./feedback.js');
    return {
      // Only a Google Form is ever honoured. This field is the one place a
      // wrong paste would send every reader somewhere unintended.
      configured: m.FORM_URL,
      linkIsHttps: (m.formLink() || '').startsWith('https://'),
      // Nothing from the page should end up in the URL unless a prefill field
      // id was deliberately set.
      fieldsDeclared: m.FIELDS,
    };
  });
  t('the configured URL is the real form', checks.configured === FORM, checks.configured);
  t('the built link is https', checks.linkIsHttps);
  t('no context is smuggled into the URL without a declared prefill field',
    Object.values(checks.fieldsDeclared).every((v) => typeof v === 'string'));
}

t('every link on the page resolves to the form host, and nowhere else',
  (await page.$$eval('.feedback-link', (a) => a.every((e) =>
    new URL(e.href).host === 'docs.google.com'))));


/* ------------------------------------ where the card sits, and what it covers */
//
// It used to be a sticky strip across the top of the content column, and it
// covered the player search box. Anything spanning that column will eventually
// sit on top of something, so the test is not "is it sticky" - it is "does it
// overlap the page".
{
  const overlap = await page.evaluate(() => {
    const card = document.querySelector('.feedback-link');
    if (!card) return { err: 'no card' };
    const c = card.getBoundingClientRect();
    const hits = [];
    // Everything a reader actually needs to click or read.
    for (const sel of ['.comboinput', '.tab', '.topbar', '.scoreboard']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) {
          hits.push(sel);
          break;
        }
      }
    }
    return { position: getComputedStyle(document.querySelector('.feedbar')).position,
             overlaps: [...new Set(hits)], cardRight: Math.round(c.right),
             viewport: innerWidth };
  });
  t('the card is pinned, not flowing with the content',
    overlap.position === 'fixed', JSON.stringify(overlap));
  t('and it never covers the search box, the tabs or the top bar - the actual bug',
    overlap.overlaps?.length === 0, JSON.stringify(overlap));
  t('and it stays inside the viewport',
    overlap.cardRight <= overlap.viewport, JSON.stringify(overlap));

  // Still reachable after scrolling - that was the point of moving it up.
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(400);
  const stillVisible = await page.evaluate(() => {
    const b = document.querySelector('.feedback-link')?.getBoundingClientRect();
    return !!b && b.top >= 0 && b.bottom <= innerHeight;
  });
  t('and is still on screen after scrolling down a long page', stillVisible);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/* ------------------------------------------- narrow screens have no gutter */
{
  const narrow = await b.newContext({ viewport: { width: 900, height: 800 } });
  const np = await narrow.newPage();
  await np.goto(`http://127.0.0.1:8321/#/player/${id}`, { waitUntil: 'networkidle' });
  await np.waitForTimeout(900);
  const n = await np.evaluate(() => {
    const card = document.querySelector('.feedback-link');
    if (!card) return { err: 'no card' };
    const c = card.getBoundingClientRect();
    const hits = [];
    for (const sel of ['.comboinput', '.tab', '.topbar', '.scoreboard']) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top) { hits.push(sel); break; }
      }
    }
    return { overlaps: [...new Set(hits)], inView: c.right <= innerWidth && c.bottom <= innerHeight };
  });
  t('at 900px wide, where there is no gutter, it still covers no controls',
    n.overlaps?.length === 0, JSON.stringify(n));
  t('and is still fully on screen at that width', n.inView === true, JSON.stringify(n));
  await narrow.close();
}

/* ---------------------------- a wide screen: it belongs in the empty gutter */
{
  const wide = await b.newContext({ viewport: { width: 1700, height: 900 } });
  const wp = await wide.newPage();
  await wp.goto(`http://127.0.0.1:8321/#/player/${id}`, { waitUntil: 'networkidle' });
  await wp.waitForTimeout(900);
  const w = await wp.evaluate(() => {
    const card = document.querySelector('.feedback-link');
    const shell = document.querySelector('.shell') || document.querySelector('.scoreboard');
    if (!card || !shell) return { err: 'missing' };
    const c = card.getBoundingClientRect(), s = shell.getBoundingClientRect();
    return { cardLeft: Math.round(c.left), contentRight: Math.round(s.right),
             clearOfContent: c.left >= s.right, onScreen: c.right <= innerWidth,
             showsSubject: /Tell us about/.test(card.innerText) };
  });
  t('on a wide screen the card sits clear of the content column, in the gutter',
    w.clearOfContent === true, JSON.stringify(w));
  t('and stays on screen', w.onScreen === true, JSON.stringify(w));
  t('and has room to name the player', w.showsSubject === true, JSON.stringify(w));
  await wide.close();
}

/* -------------------------------------- it follows the reader between views */
{
  await page.click('#tab-records');
  await page.waitForTimeout(600);
  const onRecords = await page.$$eval('.feedback-link', (a) => a.map((e) => e.textContent.trim()));
  t('switching to another view keeps exactly one card', onRecords.length === 1, JSON.stringify(onRecords));
  t('and it drops the player name when the page is not about a player',
    !onRecords[0]?.includes(name), onRecords[0]);
}

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed   (feedback link)`);
await b.close();
process.exit(fail ? 1 : 0);
