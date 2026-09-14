import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8321/#player/noah-hackmack', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/v2-desktop.png' });
const m = await (await b.newContext({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 })).newPage();
await m.goto('http://127.0.0.1:8321/#player/jay-colapinto', { waitUntil: 'networkidle' });
await m.waitForTimeout(900);
await m.screenshot({ path: 'shots/v2-mobile.png' });
// Does the page ever scroll sideways on a phone?
console.log('mobile h-overflow:', await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
console.log('mobile log stamps:', await m.$$eval('.logrow .logdate.dated', els => els.slice(0,3).map(e=>getComputedStyle(e).display + ':' + e.textContent)));
await b.close();
