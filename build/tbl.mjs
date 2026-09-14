import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const m = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
await m.goto('http://127.0.0.1:8321/#player/jay-colapinto', { waitUntil: 'networkidle' });
await m.waitForTimeout(800);
console.log(JSON.stringify(await m.evaluate(() => [...document.querySelectorAll('table')].map(t => {
  const w = t.parentElement;
  return { cols: t.querySelectorAll('thead th').length, tableW: t.scrollWidth,
           wrapW: w.clientWidth, wrapScrollW: w.scrollWidth,
           overflowX: getComputedStyle(w).overflowX, clipped: t.scrollWidth > w.clientWidth };
})), null, 2));
await b.close();
