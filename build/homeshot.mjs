import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.|favicon|ERR_TUNNEL/.test(m.text())) errs.push('console: '+m.text()); });
await p.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
console.log(JSON.stringify(await p.evaluate(() => ({
  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  counter: document.querySelector('#bigCount')?.textContent,
  unit: document.querySelector('.counter .unit')?.textContent,
  sub: document.querySelector('.hero-sub')?.textContent.replace(/\s+/g,' ').trim(),
  strip: [...document.querySelectorAll('.strip div')].map(d=>d.textContent.replace(/\s+/g,' ').trim()),
  cards: document.querySelectorAll('.rec').length,
  clickable: document.querySelectorAll('button.rec').length,
  firstThree: [...document.querySelectorAll('.rec')].slice(0,3).map(c=>({
    label: c.querySelector('.rec-label')?.textContent,
    val: c.querySelector('.rec-val')?.textContent.trim(),
    who: c.querySelector('.rec-who')?.textContent.trim(),
    ctx: c.querySelector('.rec-ctx')?.textContent.trim() })),
  fresh: [...document.querySelectorAll('.freshbar div')].map(d=>d.textContent.replace(/\s+/g,' ').trim()),
})), null, 1));
await p.screenshot({ path: 'shots/home-desktop.png', fullPage: false });
const m = await (await b.newContext({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 })).newPage();
await m.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await m.waitForTimeout(2000);
await m.screenshot({ path: 'shots/home-mobile.png' });
console.log('mobile h-overflow:', await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
console.log('errors:', errs.length ? errs.slice(0,4) : 'none');
await b.close();
