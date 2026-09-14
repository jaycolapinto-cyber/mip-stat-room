import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.|favicon|ERR_TUNNEL/.test(m.text())) errs.push('console: ' + m.text()); });

await p.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
console.log('player:', JSON.stringify(await p.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  ring: document.querySelector('.ringmid strong')?.textContent.trim(),
  leagueRows: document.querySelectorAll('#playerBody .card:nth-of-type(1) tbody tr').length,
  partnerRows: document.querySelectorAll('#playerBody table tbody tr').length,
  picker: document.querySelector('#selPlayer')?.value,
  note: document.querySelector('#ctlNote')?.textContent,
}))));
await p.screenshot({ path: '/home/claude/mip/shots/r1-player.png' });
await p.evaluate(() => scrollTo(0, 720)); await p.waitForTimeout(300);
await p.screenshot({ path: '/home/claude/mip/shots/r2-player-mid.png' });

await p.click('#tab-standings'); await p.waitForTimeout(600);
console.log('standings:', JSON.stringify(await p.evaluate(() => ({
  league: document.querySelector('#standingsBody h2')?.textContent.trim(),
  rows: document.querySelectorAll('#standingsBody tbody tr').length,
  leagues: document.querySelectorAll('#selLeague option').length,
}))));
await p.screenshot({ path: '/home/claude/mip/shots/r3-standings.png' });

// standings -> player -> compare
await p.click('#standingsBody tbody tr:nth-child(3) .namebtn'); await p.waitForTimeout(600);
const who = await p.evaluate(() => document.querySelector('.sb-name')?.textContent.trim());
await p.click('#playerBody .pcard'); await p.waitForTimeout(700);
console.log('drill-through from', who, '->', JSON.stringify(await p.evaluate(() => ({
  sides: [...document.querySelectorAll('.vs-side .nm')].map((e) => e.textContent.trim()),
  h2h: [...document.querySelectorAll('#compareBody .duel .side b')].map((e) => e.textContent.trim()),
  cards: document.querySelectorAll('#compareBody .card').length,
}))));
await p.screenshot({ path: '/home/claude/mip/shots/r4-compare.png' });

// combobox: type, arrow, enter
await p.click('#tab-player'); await p.waitForTimeout(400);
await p.click('#selPlayer');
await p.fill('#selPlayer', 'hub');
await p.waitForTimeout(350);
const opts = await p.evaluate(() => [...document.querySelectorAll('#listPlayer li')].map(li => li.textContent.trim()));
console.log('combo filter "hub":', JSON.stringify(opts.slice(0, 4)));
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await p.waitForTimeout(600);
console.log('after Enter ->', JSON.stringify(await p.evaluate(() => ({
  input: document.querySelector('#selPlayer')?.value,
  heading: document.querySelector('.sb-name')?.textContent.trim(),
  listClosed: document.querySelector('#listPlayer')?.hidden,
  h2hRows: [...document.querySelectorAll('#playerBody .card')].some(c => /head-to-head record/i.test(c.textContent)),
}))));
await p.screenshot({ path: '/home/claude/mip/shots/r6-combo.png' });

// master standings
await p.click('#tab-standings'); await p.waitForTimeout(500);
console.log('master view:', JSON.stringify(await p.evaluate(() => ({
  heading: document.querySelector('#standingsBody h2')?.textContent.trim(),
  rows: document.querySelectorAll('#standingsBody tbody tr').length,
}))));
await p.screenshot({ path: '/home/claude/mip/shots/r7-master.png' });

const m = await ctx.newPage();
m.on('pageerror', (e) => errs.push('mobile: ' + e.message));
await m.setViewportSize({ width: 390, height: 900 });
await m.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await m.waitForTimeout(900);
console.log('mobile overflow px:', await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await m.screenshot({ path: '/home/claude/mip/shots/r5-mobile.png' });

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
