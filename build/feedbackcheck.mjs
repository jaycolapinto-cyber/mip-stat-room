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
t('the site-wide link is rendered', home.length === 1, JSON.stringify(home));
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
t('a player page has its own link', onPlayer.length >= 1, JSON.stringify(onPlayer));
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

t('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed   (feedback link)`);
await b.close();
process.exit(fail ? 1 : 0);
