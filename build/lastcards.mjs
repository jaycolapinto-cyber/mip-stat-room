import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({viewport:{width:1280,height:1200}})).newPage();
await p.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rec')].slice(-3).map(c=>({
  label: c.querySelector('.rec-label')?.textContent,
  val: c.querySelector('.rec-val')?.textContent.trim(),
  who: c.querySelector('.rec-who')?.textContent.trim(),
  ctx: c.querySelector('.rec-ctx')?.textContent.trim() }))), null, 1));
await b.close();
