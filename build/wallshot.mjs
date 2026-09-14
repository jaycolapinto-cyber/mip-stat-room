import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w,h,tag] of [[1280,900,'desk'],[390,844,'phone']]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8321/#/records',{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);
  await p.screenshot({ path:`/tmp/wall-${tag}-full.png`, fullPage:true });
  await p.screenshot({ path:`/tmp/wall-${tag}-top.png` });
  const over = await p.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(tag,'overflow',over,'errors',errs.length? errs : 'none');
  await ctx.close();
}
await b.close();
