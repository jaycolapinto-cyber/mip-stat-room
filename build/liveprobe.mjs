import { chromium } from 'playwright';
const URL = 'https://little-smoke-d37f.jaycolapinto.workers.dev/?v=' + Date.now();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/fonts\.|favicon/.test(m.text())) errs.push('console: '+m.text()); });
const t0 = Date.now();
await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2500);
console.log('url      :', URL.split('?')[0]);
console.log('load ms  :', Date.now() - t0);
console.log(JSON.stringify(await p.evaluate(() => ({
  ctlNote: document.querySelector('#ctlNote')?.textContent,
  notice: document.querySelector('#dataNotice')?.textContent.replace(/\s+/g,' ').slice(0, 220),
  player: document.querySelector('.sb-name')?.textContent.trim(),
  logRows: document.querySelectorAll('.log .logrow').length,
  tabs: [...document.querySelectorAll('[role="tab"], .tab')].map(e=>e.textContent.trim()).slice(0,4),
})), null, 1));
console.log('errors   :', errs.length ? errs.slice(0,4) : 'none');
await b.close();
