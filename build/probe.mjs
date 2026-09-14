import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.|favicon|ERR_TUNNEL/.test(m.text())) errs.push('console: '+m.text()); });
await p.goto('http://127.0.0.1:8321/#player/jay-colapinto', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
console.log(JSON.stringify(await p.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  chips: [...document.querySelectorAll('.rankchip')].map(e=>e.textContent.trim()),
  duprTitle: document.querySelector('.rankchip.dupr')?.title,
  duprMove: document.querySelector('.dmove')?.textContent ?? null,
  duprMoveClass: document.querySelector('.dmove')?.className ?? null,
  logRows: document.querySelectorAll('.logrow').length,
  firstFive: [...document.querySelectorAll('.logrow')].slice(0,5).map(r=>({
    stamp: r.querySelector('.logdate')?.textContent.trim(),
    dated: !!r.querySelector('.logdate.dated'),
    title: r.querySelector('.logdate')?.title.slice(0,80),
    who: r.querySelector('.logwho')?.textContent.replace(/\s+/g,' ').trim().slice(0,60),
    score: r.querySelector('.logscore')?.textContent.trim(),
  })),
  lastTwo: [...document.querySelectorAll('.logrow')].slice(-2).map(r=>r.querySelector('.logdate')?.textContent.trim()),
})), null, 2));
await p.screenshot({ path: '/home/claude/mip/shots/s1-player.png', fullPage: false });
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
await p.screenshot({ path: '/home/claude/mip/shots/s2-mobile.png', fullPage: false });
console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
