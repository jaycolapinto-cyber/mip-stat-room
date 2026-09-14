// Sorting is the kind of feature that looks right and is wrong: a column sorts
// as text and 9 lands above 10, a dash floats to the top, or the third click
// does not restore the order the page chose. Assert all of it in a browser.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let pass = 0, fail = 0;
const t = (n, c, x = '') => { c ? pass++ : (fail++, console.log('  FAIL:', n, x)); };

for (const [w, h, tag] of [[1400, 1000, 'desktop'], [390, 844, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: tag === 'phone', hasTouch: tag === 'phone' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  const id = await p.evaluate(async () => {
    const { matches } = await import('./data.js');
    const c = new Map();
    for (const m of matches) for (const x of [...m.a, ...m.b]) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0][0];
  }).catch(() => null) ?? (await (async () => { await p.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' }); return p.evaluate(async () => {
    const { matches } = await import('./data.js');
    const c = new Map();
    for (const m of matches) for (const x of [...m.a, ...m.b]) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0][0];
  }); })());

  for (const url of [`#/player/${id}`, '#/standings/master']) {
    await p.goto('http://127.0.0.1:8321/' + url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);

    const tables = await p.evaluate(() => document.querySelectorAll('[id^="panel-"]:not([hidden]) table[data-sortable]').length);
    t(`${tag} ${url}: tables are armed for sorting`, tables >= 1, String(tables));

    const headers = await p.evaluate(() => {
      const tb = document.querySelector('[id^="panel-"]:not([hidden]) table[data-sortable]');
      return [...tb.tHead.rows[0].cells].map(c => ({ label: c.textContent.trim(), btn: !!c.querySelector('.sortbtn'), numeric: c.dataset.numeric === '1' }));
    });
    t(`${tag} ${url}: every labelled heading is a button`,
      headers.every(h => !h.label || h.btn), JSON.stringify(headers));
    t(`${tag} ${url}: at least one numeric column detected`,
      headers.some(h => h.numeric), JSON.stringify(headers.map(h => [h.label, h.numeric])));

    // Find a numeric column and drive the three states through it.
    const col = headers.findIndex(h => h.numeric);
    const read = () => p.evaluate((c) => {
      const tb = document.querySelector('[id^="panel-"]:not([hidden]) table[data-sortable]');
      return {
        vals: [...tb.tBodies[0].rows].map(r => r.cells[c]?.textContent.replace(/\s+/g, ' ').trim() ?? ''),
        ord: [...tb.tBodies[0].rows].map(r => Number(r.dataset.ord)),
        aria: tb.tHead.rows[0].cells[c].getAttribute('aria-sort'),
        marked: [...tb.tHead.rows[0].cells].filter(x => x.getAttribute('aria-sort') !== 'none').length,
      };
    }, col);

    const before = await read();
    const click = () => p.evaluate((c) => document.querySelector('[id^="panel-"]:not([hidden]) table[data-sortable]').tHead.rows[0].cells[c].querySelector('.sortbtn').click(), col);
    const nums = (v) => v.map(s => s === '—' || s === '' ? null : parseFloat(s.replace(/[^\d.+-]/g, '')));

    await click(); const d1 = await read();
    const n1 = nums(d1.vals).filter(x => x !== null);
    t(`${tag} ${url}: first click sorts figures high to low`,
      n1.every((v, i) => i === 0 || n1[i - 1] >= v), JSON.stringify(n1.slice(0, 8)));
    t(`${tag} ${url}: descending is announced`, d1.aria === 'descending', String(d1.aria));
    t(`${tag} ${url}: exactly one column is marked sorted`, d1.marked === 1, String(d1.marked));
    t(`${tag} ${url}: missing figures sink when descending`,
      (() => { const v = nums(d1.vals); const firstNull = v.indexOf(null); return firstNull === -1 || v.slice(firstNull).every(x => x === null); })(),
      JSON.stringify(d1.vals.slice(-5)));
    t(`${tag} ${url}: no row is lost by sorting`, d1.ord.length === before.ord.length);
    t(`${tag} ${url}: the same rows are present`,
      [...d1.ord].sort((a, b) => a - b).join() === [...before.ord].sort((a, b) => a - b).join());

    await click(); const d2 = await read();
    const n2 = nums(d2.vals).filter(x => x !== null);
    t(`${tag} ${url}: second click sorts low to high`,
      n2.every((v, i) => i === 0 || n2[i - 1] <= v), JSON.stringify(n2.slice(0, 8)));
    t(`${tag} ${url}: ascending is announced`, d2.aria === 'ascending', String(d2.aria));
    t(`${tag} ${url}: missing figures still sink when ascending`,
      (() => { const v = nums(d2.vals); const firstNull = v.indexOf(null); return firstNull === -1 || v.slice(firstNull).every(x => x === null); })(),
      JSON.stringify(d2.vals.slice(-5)));

    await click(); const d3 = await read();
    t(`${tag} ${url}: third click restores the page's own order`,
      d3.ord.join() === before.ord.join(), JSON.stringify(d3.ord.slice(0, 8)));
    t(`${tag} ${url}: nothing is marked sorted once restored`, d3.marked === 0, String(d3.marked));
    t(`${tag} ${url}: the values come back too`, d3.vals.join() === before.vals.join());

    // A name column must sort alphabetically, not by its numeric junk.
    const nameCol = headers.findIndex(h => h.label && !h.numeric);
    if (nameCol >= 0) {
      await p.evaluate((c) => document.querySelector('[id^="panel-"]:not([hidden]) table[data-sortable]').tHead.rows[0].cells[c].querySelector('.sortbtn').click(), nameCol);
      const names = await p.evaluate((c) => [...document.querySelector('[id^="panel-"]:not([hidden]) table[data-sortable]').tBodies[0].rows]
        .map(r => r.cells[c].textContent.replace(/\s+/g, ' ').trim().toLowerCase()), nameCol);
      t(`${tag} ${url}: a name column opens A to Z`,
        names.every((v, i) => i === 0 || names[i - 1].localeCompare(v) <= 0), JSON.stringify(names.slice(0, 5)));
    }

    // Sorting must not fire the row's own "open this player" handler.
    t(`${tag} ${url}: sorting never navigates away`,
      p.url().includes(url.replace('#', '')), p.url());
  }


  /* ------------------------------------------------- capped tables */
  // The busiest player has 242 partners. The table shows the top slice and
  // keeps the rest behind a button - and the cap has to survive sorting, or
  // "sort by games" would show the best twelve of an arbitrary twelve.
  await p.goto(`http://127.0.0.1:8321/#/player/${id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  {
    const vis = () => p.evaluate(() => {
      const t = [...document.querySelectorAll('#panel-player table[data-cap]')]
        .find(x => x.tHead.rows[0].cells[0].textContent.trim() === 'Partner');
      const rows = [...t.tBodies[0].rows];
      const shown = rows.filter(r => !r.hidden);
      const btn = t.closest('.scroller').nextElementSibling;
      return {
        total: rows.length, shown: shown.length, cap: Number(t.dataset.cap),
        btn: btn && btn.classList.contains('morebtn') ? btn.textContent.trim() : null,
        expanded: btn?.getAttribute('aria-expanded'),
        games: shown.map(r => Number(r.cells[1].textContent.trim())),
      };
    });
    const tap = () => p.evaluate(() => {
      const t = [...document.querySelectorAll('#panel-player table[data-cap]')]
        .find(x => x.tHead.rows[0].cells[0].textContent.trim() === 'Partner');
      t.closest('.scroller').nextElementSibling.click();
    });

    const v0 = await vis();
    t(`${tag}: the partners table has a long tail to hide`, v0.total > v0.cap, String(v0.total));
    t(`${tag}: only the capped number is shown`, v0.shown === v0.cap, `${v0.shown} of ${v0.total}`);
    t(`${tag}: a button offers the rest, and counts them`,
      v0.btn && v0.btn.includes(String(v0.total)) && /partners/.test(v0.btn), String(v0.btn));
    t(`${tag}: the button starts collapsed`, v0.expanded === 'false', String(v0.expanded));

    await tap();
    const v1 = await vis();
    t(`${tag}: tapping it shows every partner`, v1.shown === v1.total, `${v1.shown} of ${v1.total}`);
    t(`${tag}: and offers to collapse again`, /top/i.test(v1.btn ?? ''), String(v1.btn));
    t(`${tag}: expansion is announced`, v1.expanded === 'true', String(v1.expanded));

    await tap();
    const v2 = await vis();
    t(`${tag}: tapping again collapses it`, v2.shown === v2.cap, `${v2.shown} of ${v2.total}`);

    // Sorting must re-cap against the NEW order.
    await p.evaluate(() => {
      const t = [...document.querySelectorAll('#panel-player table[data-cap]')]
        .find(x => x.tHead.rows[0].cells[0].textContent.trim() === 'Partner');
      const i = [...t.tHead.rows[0].cells].findIndex(c => c.textContent.trim() === 'Games');
      t.tHead.rows[0].cells[i].querySelector('.sortbtn').click();
    });
    const v3 = await vis();
    t(`${tag}: the cap survives a sort`, v3.shown === v3.cap, `${v3.shown} of ${v3.total}`);
    t(`${tag}: sorting by games shows the most-played, not a slice of a slice`,
      v3.games.every((g, i) => i === 0 || v3.games[i - 1] >= g), JSON.stringify(v3.games));
    const maxAll = await p.evaluate(() => {
      const t = [...document.querySelectorAll('#panel-player table[data-cap]')]
        .find(x => x.tHead.rows[0].cells[0].textContent.trim() === 'Partner');
      return Math.max(...[...t.tBodies[0].rows].map(r => Number(r.cells[1].textContent.trim())));
    });
    t(`${tag}: the top row really is the club-wide maximum`, v3.games[0] === maxAll,
      `${v3.games[0]} vs ${maxAll}`);
  }

  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  t(`${tag}: no sideways overflow after sorting`, over <= 0, String(over));
  t(`${tag}: no page errors`, errs.length === 0, JSON.stringify(errs));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
