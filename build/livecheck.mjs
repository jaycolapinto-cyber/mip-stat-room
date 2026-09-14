import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
const types = {};
p.on('response', r => { const u = new URL(r.url()).pathname; if (/\.(js|html)$/.test(u) || u === '/') types[u] = r.status() + ' ' + (r.headers()['content-type'] || '?'); });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('https://stats.estimator.trade/', { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(3000);
const info = await p.evaluate(() => ({
  bodyLen: document.body.innerText.length,
  bigCount: document.querySelector('#bigCount')?.textContent ?? null,
  heroTitle: document.querySelector('.hero-title')?.textContent ?? null,
}));
console.log('assets:', JSON.stringify(types, null, 1));
console.log('page  :', JSON.stringify(info));
console.log('errors:', errs.length ? errs : 'none');
await b.close();
