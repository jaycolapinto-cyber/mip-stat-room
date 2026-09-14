import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({viewport:{width:1280,height:1000}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8321/#player/noah-hackmack', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
console.log('FOOT:', await p.$eval('.foot', e=>e.textContent.replace(/\s+/g,' ').trim()));
console.log('errors:', errs.length?errs:'none');
await b.close();
