import { chromium } from 'playwright';

const errs = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await pg.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await pg.waitForTimeout(900);

// sanity assertions against rendered DOM
const probe = await pg.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  ring: document.querySelector('.ringmid strong')?.textContent.trim(),
  wins: document.querySelector('.sb-stats .stat b')?.textContent.trim(),
  partnerRows: document.querySelectorAll('tbody tr').length,
  chartPts: document.querySelectorAll('.chartwrap circle').length,
  logRows: document.querySelectorAll('.log .logrow').length,
  players: document.querySelectorAll('#selPlayer option').length,
  seasons: document.querySelectorAll('#selSeason option').length,
}));
console.log('probe:', JSON.stringify(probe));

await pg.screenshot({ path: '/home/claude/mip/shots/01-player-top.png' });
await pg.evaluate(() => scrollTo(0, 640));
await pg.waitForTimeout(400);
await pg.screenshot({ path: '/home/claude/mip/shots/02-player-mid.png' });
await pg.evaluate(() => scrollTo(0, 1450));
await pg.waitForTimeout(300);
await pg.screenshot({ path: '/home/claude/mip/shots/03-player-log.png' });

// click a partner -> compare
await pg.evaluate(() => scrollTo(0, 0));
await pg.click('.pcard.best');
await pg.waitForTimeout(700);
const cmp = await pg.evaluate(() => ({
  heading: [...document.querySelectorAll('.vs-side .nm')].map((e) => e.textContent.trim()),
  together: document.querySelector('.duel .side b')?.textContent.trim(),
  cards: document.querySelectorAll('#compareBody .card').length,
  shared: document.querySelectorAll('#compareBody .logrow').length,
}));
console.log('compare:', JSON.stringify(cmp));
await pg.screenshot({ path: '/home/claude/mip/shots/04-compare.png' });

// keyboard on chart
await pg.click('#tab-player');
await pg.waitForTimeout(500);
await pg.focus('.chartwrap');
await pg.keyboard.press('ArrowLeft');
await pg.keyboard.press('ArrowLeft');
await pg.waitForTimeout(300);
const tip = await pg.evaluate(() => ({ tip: document.querySelector('.tip')?.textContent, live: document.querySelector('#live')?.textContent }));
console.log('chart keyboard:', JSON.stringify(tip));

// season filter + a player with sparse data
await pg.selectOption('#selSeason', 'winter-2026');
await pg.waitForTimeout(400);
await pg.selectOption('#selPlayer', 'stephen-rizzi');
await pg.waitForTimeout(400);
const sparse = await pg.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  empty: !!document.querySelector('.emptybox'),
  games: document.querySelectorAll('.sb-stats .stat b')[2]?.textContent.trim(),
}));
console.log('sparse:', JSON.stringify(sparse));

// mobile
const m = await ctx.newPage();
m.on('pageerror', (e) => errs.push('mobile pageerror: ' + e.message));
await m.setViewportSize({ width: 390, height: 900 });
await m.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await m.waitForTimeout(900);
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile horizontal overflow px:', overflow);
await m.screenshot({ path: '/home/claude/mip/shots/05-mobile.png', fullPage: false });
await m.evaluate(() => scrollTo(0, 760));
await m.waitForTimeout(300);
await m.screenshot({ path: '/home/claude/mip/shots/06-mobile-2.png' });

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console/page errors');
await b.close();
