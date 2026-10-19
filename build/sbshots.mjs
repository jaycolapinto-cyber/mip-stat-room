// Screenshot a player's scoreboard at several widths and report anything in
// it that overlaps a neighbour or is clipped/wrapped. Usage:
//   node build/sbshots.mjs <outdir> <player-id> [<player-id> ...]
import { chromium } from 'playwright';
import { executablePath } from './chrome.mjs';
import { go } from './goto.mjs';

const [out, ...ids] = process.argv.slice(2);
const b = await chromium.launch({ executablePath });
let bad = 0;
for (const id of ids) for (const w of [390, 768, 900, 1024, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
  const p = await ctx.newPage();
  await go(p, `http://127.0.0.1:8321/#/player/${id}`);
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const sb = document.querySelector('.scoreboard');
    if (!sb) return { err: 'no scoreboard' };
    const box = (e) => e.getBoundingClientRect();
    const S = box(sb), issues = [];
    // Leaf blocks a reader sees: tiles, stats, ring, name, buttons, closing bar.
    const parts = [...sb.querySelectorAll('.ftile,.stat,.ringwrap,.sb-name,.sharebtn,.closing,.sb-chips,.sb-form')];
    for (let i = 0; i < parts.length; i++) {
      const a = box(parts[i]);
      if (a.width === 0) continue;
      if (a.right > S.right + 0.5 || a.left < S.left - 0.5) issues.push('outside card: ' + parts[i].className);
      for (let j = i + 1; j < parts.length; j++) {
        if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue;
        const c = box(parts[j]);
        if (c.width === 0) continue;
        if (a.left < c.right - 0.5 && a.right > c.left + 0.5 && a.top < c.bottom - 0.5 && a.bottom > c.top + 0.5)
          issues.push(`overlap: ${parts[i].className} / ${parts[j].className}`);
      }
    }
    // A number that wraps or spills its own box.
    for (const n of sb.querySelectorAll('.ftile b,.stat b,.ringmid strong')) {
      const lh = parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.1;
      if (n.getBoundingClientRect().height > lh * 1.6) issues.push('wraps: ' + n.textContent);
      if (n.scrollWidth > n.clientWidth + 1) issues.push('spills: ' + n.textContent);
    }
    const tiles = [...sb.querySelectorAll('.ftile')].map((t) => Math.round(box(t).width));
    return { issues, tiles, hScroll: document.documentElement.scrollWidth > innerWidth,
             hasShare: !!sb.querySelector('.sharebar'), hasClosing: !!sb.querySelector('.closing') };
  });
  if (r.hScroll) r.issues.push('page scrolls sideways');
  if (r.err || r.issues.length) bad++;
  console.log(`${id} @${w}: ${r.err || (r.issues.length ? r.issues.join('; ') : 'ok')}  tiles=${r.tiles} share=${r.hasShare} closing=${r.hasClosing}`);
  await (await p.$('.scoreboard')).screenshot({ path: `${out}/${id}-${w}.png` });
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
