import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(() => {
  const strip = document.querySelector('.tabs');
  const last = document.querySelector('#tab-standings');
  return {
    stripClientW: strip.clientWidth, stripScrollW: strip.scrollWidth,
    scrollable: strip.scrollWidth > strip.clientWidth,
    lastTabFullyVisible: last.getBoundingClientRect().right <= strip.getBoundingClientRect().right + 1,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
  };
}), null, 1));
await p.screenshot({ path: 'shots/home-mobile-top.png', clip: { x: 0, y: 0, width: 390, height: 300 } });
await b.close();
