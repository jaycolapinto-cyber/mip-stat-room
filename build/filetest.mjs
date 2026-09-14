import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis|ERR_TUNNEL|favicon/.test(m.text())) errs.push('console: ' + m.text()); });

await p.goto('file:///home/claude/mip/standalone/MIP-Stat-Room.html');
await p.waitForTimeout(1200);
console.log('loaded from file://:', JSON.stringify(await p.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  winrate: document.querySelector('.ringmid strong')?.textContent.trim(),
  ringOffset: getComputedStyle(document.querySelector('.ring-fill')).strokeDashoffset,
  partners: document.querySelectorAll('tbody tr').length,
  chart: document.querySelectorAll('.chartwrap svg path').length,
  players: document.querySelectorAll('#selPlayer option').length,
}))));

await p.selectOption('#selPlayer', 'karen-polito');
await p.waitForTimeout(400);
await p.click('.pcard.best');
await p.waitForTimeout(600);
console.log('partner click -> compare:', JSON.stringify(await p.evaluate(() => ({
  tab: document.querySelector('#tab-compare')?.getAttribute('aria-selected'),
  sides: [...document.querySelectorAll('.vs-side .nm')].map(e => e.textContent.trim()),
  panels: document.querySelectorAll('#compareBody .duel').length,
}))));
await p.screenshot({ path: '/home/claude/mip/shots/07-standalone.png' });

await p.click('#tab-player');
await p.waitForTimeout(400);
await p.click('#btnMore');
await p.waitForTimeout(300);
console.log('full log opens:', await p.evaluate(() => !document.querySelector('#fullLog').hasAttribute('hidden')));

console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
