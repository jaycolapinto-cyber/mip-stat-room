import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.|favicon|ERR_TUNNEL/.test(m.text())) errs.push('console: '+m.text()); });
const t0 = Date.now();
await p.goto('http://127.0.0.1:8321/#player/jay-colapinto', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
console.log('load ms:', Date.now() - t0);
const info = await p.evaluate(() => ({
  name: document.querySelector('.sb-name')?.textContent.trim(),
  chips: [...document.querySelectorAll('.rankchip')].map(e=>e.textContent.trim()),
  ring: document.querySelector('.ringmid strong')?.textContent.trim(),
  logRows: document.querySelectorAll('.logrow').length,
  ctlNote: document.querySelector('#ctlNote')?.textContent,
  notice: document.querySelector('#dataNotice')?.textContent.replace(/\s+/g,' ').slice(0, 260),
  firstLog: (() => { const r = document.querySelector('.logrow'); return r && { stamp: r.querySelector('.logdate')?.textContent, who: r.querySelector('.logwho')?.textContent.replace(/\s+/g,' ').trim().slice(0,70), score: r.querySelector('.logscore')?.textContent }; })(),
}));
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: 'shots/v3-player.png' });
await p.click('#tab-standings'); await p.waitForTimeout(800);
console.log('standings rows:', await p.$$eval('#standingsBody tbody tr', r => r.length));
console.log('errors:', errs.length ? errs.slice(0,5) : 'none');
await b.close();
