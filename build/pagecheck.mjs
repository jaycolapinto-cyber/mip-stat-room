// Cross-panel consistency, asserted in a real browser.
//
// This exists because of a bug no unit test could have caught: the scoreboard
// was reading a player's record from Dave's weekly standings sheet while the
// panels beneath it were computing from the match list. Both numbers were
// individually true and they sat side by side contradicting each other -
// "10 games" above "17 meetings with Vincent Cusumano".
//
// The rule: every number on a player's page must be answerable from the same
// match list, and they must add up.
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1200 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.|favicon|ERR_TUNNEL/.test(m.text())) errs.push('console: ' + m.text()); });

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { cond ? pass++ : (fail++, console.log('  FAIL:', name, extra)); };

await page.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// A spread of players: heavy, light, and one added from DUPR.
const ids = await page.evaluate(async () => {
  const { matches, players } = await import('./data.js');
  const count = new Map();
  for (const m of matches) for (const p of [...m.a, ...m.b]) count.set(p, (count.get(p) ?? 0) + 1);
  const sorted = [...count].sort((a, b) => b[1] - a[1]);
  const fromDupr = players.find((p) => p.fromDupr && count.get(p.id) > 20);
  return [sorted[0][0], sorted[Math.floor(sorted.length / 2)][0], sorted.at(-1)[0], fromDupr?.id].filter(Boolean);
});

for (const id of ids) {
  await page.goto(`http://127.0.0.1:8321/#player/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => {
    const num = (sel) => { const e = document.querySelector(sel); return e ? Number(e.textContent.replace(/[^\d-]/g, '')) : null; };
    const stats = [...document.querySelectorAll('.sb-stat, .ringstat, .sb-num')].map((e) => e.textContent.trim());
    const cells = [...document.querySelectorAll('#playerBody table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
    return {
      name: document.querySelector('.sb-name')?.textContent.trim(),
      ring: document.querySelector('.ringmid strong')?.textContent.trim(),
      board: [...document.querySelectorAll('.sb-grid > div, .board > div')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      // The page renders a short log AND a hidden full one. Count the full
      // list where it exists, otherwise the short one - never both.
      logRows: (document.querySelector('#fullLog')
        ? document.querySelectorAll('#fullLog .logrow')
        : document.querySelectorAll('.log .logrow')).length,
      partnerRows: cells.length,
      raw: document.body.innerText,
      stats, cells,
    };
  });

  // Pull wins/losses/games out of the scoreboard text, then compare to the
  // match log length and the partner table.
  const m = v.raw.match(/(\d+)\s*WINS\s*(\d+)\s*LOSSES\s*(\d+)\s*GAMES/i)
    || v.raw.match(/(\d+)\nWINS\n(\d+)\nLOSSES\n(\d+)\nGAMES/i);
  if (!m) { t(`${id}: scoreboard is readable`, false, v.raw.slice(0, 200).replace(/\n/g, ' | ')); continue; }
  const [, w, l, g] = m.map(Number);

  t(`${v.name}: wins + losses = games on the scoreboard`, w + l === g, `${w}+${l}!=${g}`);
  t(`${v.name}: match log holds every game`, v.logRows === g, `log ${v.logRows} vs scoreboard ${g}`);
  const ringPct = Number(String(v.ring).replace('%', ''));
  t(`${v.name}: win-rate ring matches the record`, Math.abs(ringPct - Math.round(100 * w / g)) <= 1,
    `ring ${ringPct}% vs ${Math.round(100 * w / g)}%`);
}

/* ------------------------------------------------- tabs, at phone width */
// This exists because of a bug that no unit test and no desktop look could
// have caught: setView hid every panel EXCEPT home, so tapping "Head to head"
// opened the right panel - 2,000 pixels below the home page that was still
// sitting on top of it. On a desktop you could scroll down and find it. On a
// phone the panel landed two and a half screens down and the page simply
// looked dead. So the rule is asserted the way a person experiences it: after
// a tap, exactly one panel is visible and it is at the top of the page.
const phone = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
           + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const ph = await phone.newPage();
ph.on('pageerror', (e) => errs.push('phone pageerror: ' + e.message));
await ph.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
await ph.waitForTimeout(600);

const VIEWS = ['home', 'records', 'player', 'compare', 'standings'];
const panelState = () => ph.evaluate((views) => ({
  visible: views.filter((v) => !document.querySelector('#panel-' + v).hasAttribute('hidden')),
  selected: views.filter((v) => document.querySelector('#tab-' + v).getAttribute('aria-selected') === 'true'),
  top: Math.round(
    (document.querySelector('#panel-' + views.find((v) => !document.querySelector('#panel-' + v).hasAttribute('hidden')))
      ?.getBoundingClientRect().top) ?? -9999),
}), VIEWS);

{
  const s0 = await panelState();
  t('phone: exactly one panel showing on load', s0.visible.length === 1, s0.visible.join(','));
  t('phone: it is the home panel', s0.visible[0] === 'home', s0.visible.join(','));
}

for (const view of ['compare', 'records', 'player', 'standings', 'home']) {
  // Tap, not click - this is the phone context.
  await ph.tap('#tab-' + view);
  await ph.waitForTimeout(400);
  const st = await panelState();
  t(`phone: tapping ${view} shows exactly one panel`, st.visible.length === 1,
    `visible: ${st.visible.join(',') || '(none)'}`);
  t(`phone: tapping ${view} shows the ${view} panel`, st.visible[0] === view, `got ${st.visible[0]}`);
  t(`phone: tapping ${view} marks exactly that one tab selected`,
    st.selected.length === 1 && st.selected[0] === view, `selected: ${st.selected.join(',')}`);
  // The panel must be on screen, not pushed below whatever came before it.
  t(`phone: the ${view} panel is on screen, not below the fold`, st.top < 844, `top=${st.top}px`);
}

/* ------------------------------------------------- the landing page says where you are */
// Most visitors arrive from a link on the club's site or Facebook with no idea
// what they just opened. The hero has to name the place in words, not just show
// a number.
{
  const hero = await ph.evaluate(() => ({
    title: document.querySelector('.hero-title')?.textContent.trim() ?? '',
    what: document.querySelector('.hero-what')?.textContent.trim() ?? '',
    bars: [...document.querySelectorAll('.ybar')].map((b) => ({
      year: b.querySelector('.yl')?.textContent.trim(),
      value: b.querySelector('.yv')?.textContent.trim(),
      height: b.querySelector('.yf')?.getBoundingClientRect().height ?? 0,
    })),
    // The hero must be ONE column on a phone. A media query written above the
    // rule it overrides loses the cascade and silently does nothing, which is
    // exactly how this shipped broken once.
    cols: getComputedStyle(document.querySelector('.hero-grid')).gridTemplateColumns.split(' ').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  t('the hero names the place', hero.title.length > 3, hero.title);
  t('the hero says what the place is for', hero.what.length > 30, hero.what.slice(0, 40));
  t('the year chart has a bar per year', hero.bars.length >= 3, String(hero.bars.length));
  t('every bar has a year, a value and a visible height',
    hero.bars.every((b) => b.year && b.value && b.height > 0),
    JSON.stringify(hero.bars.map((b) => `${b.year}:${Math.round(b.height)}px`)));
  t('the tallest bar is the biggest year',
    hero.bars.indexOf(hero.bars.reduce((a, b) => (b.height > a.height ? b : a)))
      === hero.bars.map((b) => Number(b.value.replace(/,/g, ''))).indexOf(
         Math.max(...hero.bars.map((b) => Number(b.value.replace(/,/g, ''))))));
  t('phone: the hero collapses to one column', hero.cols === 1, `${hero.cols} columns`);
  t('phone: nothing overflows the viewport sideways', hero.overflow <= 0, `${hero.overflow}px`);
}

/* ------------------------------------------ the landing page's own buttons */
// The tab strip and the big buttons are the same navigation said twice. If the
// buttons stop moving the page, a first-time visitor has no way in at all.
await ph.tap('#tab-home');
await ph.waitForTimeout(400);
{
  const n = await ph.evaluate(() => document.querySelectorAll('.launch button[data-view]').length);
  t('phone: the landing page offers a button per destination', n === 4, String(n));
  for (const view of ['records', 'player', 'compare', 'standings']) {
    await ph.tap('#tab-home');
    await ph.waitForTimeout(300);
    await ph.tap(`.launch button[data-view="${view}"]`);
    await ph.waitForTimeout(400);
    const st = await panelState();
    t(`phone: the ${view} button opens the ${view} panel`, st.visible[0] === view, `got ${st.visible[0]}`);
    t(`phone: the ${view} button also moves the tab strip`,
      st.selected.length === 1 && st.selected[0] === view, `selected: ${st.selected.join(',')}`);
  }
}

/* ------------------------------------- the wall of fame, on a phone */
// The detail is a native <details> rather than a hover tooltip precisely so it
// works here. That claim is worth testing on a touch context, not asserting.
// The wall lives on its own tab now - home is a landing page.
await ph.tap('#tab-records');
await ph.waitForTimeout(500);
{
  const before = await ph.evaluate(() => ({
    cards: document.querySelectorAll('.wof').length,
    open: document.querySelectorAll('details.wof[open]').length,
  }));
  t('phone: the wall renders cards', before.cards >= 8, String(before.cards));
  t('phone: every card starts closed', before.open === 0, String(before.open));

  // Tap the summary of the first expandable card.
  const opened = await ph.evaluate(() => {
    const d = document.querySelector('details.wof');
    d.querySelector('summary').click();
    return { open: d.open, detailVisible: !!d.querySelector('.wof-open')?.offsetHeight };
  });
  t('phone: tapping a card opens it', opened.open);
  t('phone: the detail is actually visible once open', opened.detailVisible);

  const again = await ph.evaluate(() => {
    const d = document.querySelector('details.wof');
    d.querySelector('summary').click();
    return d.open;
  });
  t('phone: tapping again closes it', !again);

  // The podium must be readable WITHOUT opening anything - that is the whole
  // point of moving it onto the face of the card. So this reads the closed
  // card and demands gold, silver and bronze are already there.
  const podium = await ph.evaluate(() => {
    const out = [];
    for (const c of document.querySelectorAll('.wof')) {
      const openEl = c.tagName === 'DETAILS' ? c : null;
      // Only the chips on the FACE of the card. The story panel carries its own
      // Gold/Silver/Bronze headings and is in the DOM even while closed, so an
      // unscoped query reads two podiums back to back.
      const inSummary = [...c.querySelectorAll('.wof-place')]
        .filter((e) => !e.closest('.wof-open')).map((e) => e.textContent.trim());
      out.push({ label: c.querySelector('.wof-label')?.textContent.trim().slice(0, 30),
                 places: inSummary, wasOpen: openEl ? openEl.open : null,
                 runnersHidden: !c.querySelector('.wof-runners') ? null
                   : !c.querySelector('.wof-runners').offsetHeight });
    }
    return out;
  });
  t('phone: every card shows Gold on its face', podium.every((c) => c.places[0] === 'Gold'),
    JSON.stringify(podium.find((c) => c.places[0] !== 'Gold')));
  t('phone: places only ever read Gold, Silver or Bronze',
    podium.every((c) => c.places.every((w) => ['Gold', 'Silver', 'Bronze'].includes(w))),
    JSON.stringify(podium.find((c) => c.places.some((w) => !['Gold','Silver','Bronze'].includes(w)))));
  t('phone: places never run out of order',
    podium.every((c) => {
      const rank = { Gold: 1, Silver: 2, Bronze: 3 };
      return c.places.every((w, i) => i === 0 || rank[w] >= rank[c.places[i - 1]]);
    }), JSON.stringify(podium.map((c) => c.places)));
  t('phone: the runners-up are visible without opening the card',
    podium.every((c) => c.runnersHidden !== true),
    JSON.stringify(podium.find((c) => c.runnersHidden === true)));
  t('phone: at least one card really has three places',
    podium.some((c) => c.places.length >= 3), JSON.stringify(podium.map((c) => c.places.length)));
  t('phone: cards were still closed while all that was read',
    podium.every((c) => c.wasOpen !== true));

  // Silver and bronze must carry their own record line, and the story panel
  // must hold a block for each place rather than repeating gold three times.
  // Both were real complaints: tapping a card after reading the silver line
  // showed gold's story again, which read as a bug.
  const story = await ph.evaluate(() => {
    const out = [];
    for (const d of document.querySelectorAll('details.wof')) {
      const faceRunners = [...d.querySelectorAll('.wof-runners .wof-run')].map((r) => ({
        place: r.querySelector('.wof-place')?.textContent.trim(),
        hasCtx: !!r.querySelector('.wof-runctx')?.textContent.trim(),
      }));
      const heads = [...d.querySelectorAll('.wof-open .dd-head')].map((h) =>
        h.querySelector('.wof-place')?.textContent.trim());
      const leads = [...d.querySelectorAll('.wof-open .dd-lead')].map((x) => x.textContent.trim());
      out.push({ label: d.querySelector('.wof-label')?.textContent.trim().slice(0, 26),
                 faceRunners, heads, leads });
    }
    return out;
  });
  t('phone: every runner-up shows its own record line',
    story.every((c) => c.faceRunners.every((r) => r.hasCtx)),
    JSON.stringify(story.find((c) => c.faceRunners.some((r) => !r.hasCtx))));
  t('phone: the story panel has a heading for more than just gold',
    story.every((c) => c.heads.length >= 2), JSON.stringify(story.map((c) => c.heads.length)));
  t('phone: the story panel covers silver, not only gold',
    story.every((c) => c.heads.includes('Silver')),
    JSON.stringify(story.find((c) => !c.heads.includes('Silver'))?.heads));
  t('phone: story headings never run out of order',
    story.every((c) => {
      const rank = { Gold: 1, Silver: 2, Bronze: 3 };
      return c.heads.every((w, i) => i === 0 || rank[w] >= rank[c.heads[i - 1]]);
    }), JSON.stringify(story.map((c) => c.heads)));
  // The bug in his words: "it is repeating the gold".
  t('phone: the story panel does not repeat one lead for every place',
    story.every((c) => c.leads.length < 2 || new Set(c.leads).size > 1),
    JSON.stringify(story.find((c) => c.leads.length >= 2 && new Set(c.leads).size === 1)?.leads));

  /* ---------------- the play clock on the landing page ---------------- */
  // A measured figure has to carry its scope on the page, not just in the
  // code. "The average game is 6:45" under a headline of 24,000 games would
  // claim a stopwatch reading for games nobody ever timed.
  {
    await ph.tap('#tab-home');
    await ph.waitForTimeout(400);
    const k = await ph.evaluate(() => {
      const el = document.querySelector('.clk');
      if (!el) return { missing: true };
      const txt = el.innerText;
      return {
        times: [...el.querySelectorAll('.clk-big, .clk-t')].map((x) => x.textContent.trim()),
        named: [...el.querySelectorAll('.clk-who')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
        foot: el.querySelector('.foot')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        all: txt.replace(/\s+/g, ' ').trim(),
        entities: /&amp;|&lt;|&gt;|&quot;/.test(txt),
        cols: getComputedStyle(el.querySelector('.clk-grid')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    t('phone: the clock panel renders', !k.missing);
    t('phone: it shows an average, both extremes and the changeover',
      k.times.length === 4, JSON.stringify(k.times));
    t('phone: every time reads as minutes and seconds',
      k.times.every((x) => /^\d+:[0-5]\d$/.test(x)), JSON.stringify(k.times));
    t('phone: the quickest is quicker than the longest',
      (() => { const s = (x) => { const [m, ss] = x.split(':').map(Number); return m * 60 + ss; };
               return s(k.times[1]) < s(k.times[2]); })(), JSON.stringify(k.times));
    t('phone: both extremes name who played',
      k.named.filter((x) => /beat/.test(x)).length === 2, JSON.stringify(k.named));
    t('phone: the changeover says how often a court turns over',
      k.named.some((x) => /turns over every \d+:[0-5]\d/.test(x)), JSON.stringify(k.named));
    t('phone: and what share of court time is spent playing',
      /playing \d+% of your time on court/.test(k.all), k.all.slice(0, 200));
    t('phone: the changeover is shorter than the average game',
      (() => { const s = (x) => { const [m, ss] = x.split(':').map(Number); return m * 60 + ss; };
               return s(k.times[3]) < s(k.times[0]); })(), JSON.stringify(k.times));
    t('phone: no raw HTML entity leaks into the names', !k.entities, JSON.stringify(k.named));
    // The scope line is the point of the panel being honest.
    t('phone: the panel says how many games it speaks for', /\d[\d,]* games with a clock/.test(k.foot), k.foot);
    t('phone: and says it is not all of them', /% of all games/.test(k.foot), k.foot);
    t('phone: and says when timing started', /starting \w+ \d+, \d{4}/.test(k.foot), k.foot);
    t('phone: the clock panel is one column', k.cols === 1, String(k.cols));
    t('phone: the landing page never scrolls sideways', k.overflow <= 0, String(k.overflow));
    await ph.tap('#tab-records');
    await ph.waitForTimeout(400);
  }

  /* ---------------- the 2026 wall: sections, marquee, century club ---------- */
  // The wall used to be one flat grid of ten cards. It is now nineteen records
  // in titled sections with an opening band, and every one of those pieces has
  // a way of silently disappearing: a null record drops a card, a renamed CSS
  // class drops a section, a tie explosion blows the grid apart again.
  {
    const w = await ph.evaluate(() => {
      const cards = [...document.querySelectorAll('.wof')];
      return {
        marquee: document.querySelectorAll('.mq').length,
        marqueeBlank: [...document.querySelectorAll('.mq-val b')]
          .filter((b) => !b.textContent.trim() || b.textContent.trim() === '0').length,
        sections: [...document.querySelectorAll('.wsec-h h3')].map((h) => h.textContent.trim()),
        sectionsHaveBlurb: [...document.querySelectorAll('.wsec-h')].every((h) => h.querySelector('span')?.textContent.trim()),
        cards: cards.length,
        cardsOutsideSection: cards.filter((c) => !c.closest('.wsec')).length,
        // Nobody should have to scroll a card sideways, and no card may print
        // more runner lines than the cap.
        maxRunners: Math.max(...cards.map((c) => c.querySelectorAll('.wof-run').length)),
        restNotes: document.querySelectorAll('.wof-rest').length,
        century: document.querySelectorAll('.cc').length,
        centuryTruncated: [...document.querySelectorAll('.cc-name')]
          .filter((n) => n.scrollWidth > n.clientWidth + 1).length,
        centuryDescends: (() => {
          const n = [...document.querySelectorAll('.cc-games')].map((e) => Number(e.textContent.replace(/[^\d]/g, '')));
          return n.every((v, i) => i === 0 || n[i - 1] >= v);
        })(),
        playful: document.querySelectorAll('.wof-fun').length,
        notes: document.querySelectorAll('.wof-note').length,
        foot: (document.querySelector('.wof-foot')?.innerText ?? '').length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    t('phone: the wall opens with four marquee records', w.marquee === 4, String(w.marquee));
    t('phone: no marquee number is left blank', w.marqueeBlank === 0, String(w.marqueeBlank));
    t('phone: the wall is split into named sections', w.sections.length >= 5, JSON.stringify(w.sections));
    t('phone: every section says what it holds', w.sectionsHaveBlurb);
    t('phone: all nineteen records render', w.cards === 19, String(w.cards));
    t('phone: no card sits outside a section', w.cardsOutsideSection === 0, String(w.cardsOutsideSection));
    t('phone: no card prints more than the runner cap', w.maxRunners <= 3, String(w.maxRunners));
    t('phone: a capped card says how many it left out', w.restNotes >= 1, String(w.restNotes));
    t('phone: the century club renders its roll', w.century >= 30, String(w.century));
    t('phone: no century club name is cut off', w.centuryTruncated === 0, String(w.centuryTruncated));
    t('phone: the century club descends by games', w.centuryDescends);
    t('phone: the playful records are visibly marked', w.playful === 3, String(w.playful));
    t('phone: the records that need explaining carry a note', w.notes >= 6, String(w.notes));
    t('phone: the wall explains its own minimums', w.foot > 400, String(w.foot));
    t('phone: the wall never scrolls sideways', w.overflow <= 0, String(w.overflow));

    // Tapping a century club chip must open that player, like every other name
    // on the wall. It is a button, so this is easy to get wrong by forgetting
    // the data-goto entirely.
    const jumped = await ph.evaluate(() => {
      const c = document.querySelector('.cc[data-goto]');
      if (!c) return null;
      const want = c.dataset.goto;
      c.click();
      return { want, hash: location.hash };
    });
    t('phone: a century club chip opens that player',
      jumped && jumped.hash.includes(jumped.want), JSON.stringify(jumped));
    await ph.goto('http://127.0.0.1:8321/#/records', { waitUntil: 'networkidle' });
    await ph.waitForTimeout(400);
  }

  // No player profile may print an unresolved duplicate suspicion. This is the
  // kind of regression nobody spots by clicking around - it showed up on 87 of
  // 315 profiles and went unnoticed until someone happened to open David
  // Jacobs and read that he might be David Huber.
  {
    const ids = await ph.evaluate(async () => {
      const { players, matches } = await import('./data.js');
      const seen = new Set(matches.flatMap((m) => [...m.a, ...m.b]));
      // Check the ones most likely to carry a suspicion, plus a plain control.
      const flagged = players.filter((p) => p.maybe).map((p) => p.id);
      const normal = players.filter((p) => seen.has(p.id) && !p.maybe).slice(0, 2).map((p) => p.id);
      return [...flagged.slice(0, 4), ...normal];
    });
    let leaked = null;
    for (const id of ids) {
      await ph.goto(`http://127.0.0.1:8321/#/player/${id}`, { waitUntil: 'networkidle' });
      await ph.waitForTimeout(250);
      const txt = await ph.evaluate(() => document.querySelector('#playerBody')?.innerText ?? '');
      if (/possibly the same person/i.test(txt)) { leaked = id; break; }
    }
    t('no profile prints a duplicate suspicion to the reader', leaked === null, String(leaked));
    await ph.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
    await ph.waitForTimeout(400);
  }

  // The player picker must list EVERY player, not a truncated head of the
  // alphabet. It used to stop at 60 names, so with 300-odd players the list
  // ended in the C's and the only way past was to know to start typing.
  await ph.tap('#tab-player');
  await ph.waitForTimeout(400);
  {
    const picker = await ph.evaluate(async () => {
      const { players } = await import('./data.js');
      const input = document.querySelector('#selPlayer');
      input.focus();
      input.dispatchEvent(new Event('focus'));
      const lis = [...document.querySelectorAll('#listPlayer li[data-id]')];
      const names = lis.map((li) => li.querySelector('span')?.textContent.trim());
      const box = document.querySelector('#listPlayer');
      return { shown: lis.length, total: players.length,
               first: names[0], last: names.at(-1),
               scrolls: box.scrollHeight > box.clientHeight + 4 };
    });
    t('phone: the picker lists every player',
      picker.shown === picker.total, `${picker.shown} of ${picker.total}`);
    t('phone: the picker reaches past the start of the alphabet',
      !/^[A-C]/i.test(picker.last ?? ''), `last name shown: ${picker.last}`);
    t('phone: the picker list actually scrolls', picker.scrolls);
  }
  await ph.tap('#tab-home');
  await ph.waitForTimeout(400);

  // A tap on a person's name inside a card must open their profile, NOT just
  // toggle the card. Both handlers live on the same element tree.
  const jump = await ph.evaluate(() => {
    const d = document.querySelector('details.wof [data-goto]');
    if (!d) return null;
    const want = d.dataset.goto;
    d.click();
    return { want, hash: location.hash };
  });
  if (jump) {
    t('phone: tapping a name on a card opens that player', jump.hash.includes(jump.want),
      `${jump.hash} should contain ${jump.want}`);
  }
  await ph.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
  await ph.waitForTimeout(400);
}

/* ------------------------------ switching between the two name boxes */
// A blur used to schedule a reset 140ms later and fire it even if focus had
// come back. Clicking from one box to the other and typing straight away
// therefore got the first keystroke, then the old name restored on top of it:
// "lauren" came out as "Josh Callahanauren". It only misfired inside that
// window, so it needs testing at several delays, not one.
{
  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => errs.push('compare pageerror: ' + e.message));
  await desk.goto('http://127.0.0.1:8321/#/compare/jay-colapinto/frank-rossetti', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(500);

  for (const wait of [0, 80, 139, 141, 400]) {
    await desk.click('#selA');
    await desk.waitForTimeout(40);
    await desk.click('#selB');
    await desk.waitForTimeout(wait);
    await desk.keyboard.type('lauren', { delay: 30 });
    await desk.waitForTimeout(220);
    const v = await desk.evaluate(() => document.querySelector('#selB').value);
    t(`compare: typing ${wait}ms after switching boxes types only what was typed`,
      v === 'lauren', `got ${JSON.stringify(v)}`);
    await desk.keyboard.press('Escape');
    await desk.waitForTimeout(180);
  }

  // The whole point of the panel: pick two different people and have the page
  // follow. Done with the mouse, the way a person does it.
  await desk.click('#selA');
  await desk.waitForTimeout(60);
  await desk.keyboard.type('vincent c', { delay: 30 });
  await desk.waitForTimeout(200);
  await desk.click('#listA li:first-child');
  await desk.waitForTimeout(150);
  await desk.click('#selB');
  await desk.waitForTimeout(50);
  await desk.keyboard.type('lauren g', { delay: 30 });
  await desk.waitForTimeout(200);
  await desk.click('#listB li:first-child');
  await desk.waitForTimeout(350);
  const end = await desk.evaluate(() => ({
    a: document.querySelector('#selA').value,
    b: document.querySelector('#selB').value,
    hash: location.hash,
  }));
  t('compare: both names can be set one after the other',
    end.a === 'Vincent Cusumano' && end.b === 'Lauren Glodny', JSON.stringify(end));
  t('compare: the page follows both picks',
    end.hash === '#/compare/vincent-cusumano/lauren-glodny', end.hash);

  // Clicking in and straight out again must not lose the name that was there.
  await desk.click('#selB');
  await desk.waitForTimeout(150);
  await desk.click('body', { position: { x: 5, y: 5 } });
  await desk.waitForTimeout(350);
  const restored = await desk.evaluate(() => document.querySelector('#selB').value);
  t('compare: leaving a box without picking restores the name',
    restored === 'Lauren Glodny', JSON.stringify(restored));
  await desk.close();
}

/* ------------------------------------------- the hero counter, in a tab that
 * nobody is looking at.
 *
 * requestAnimationFrame does not run in a background tab. The hero counter
 * animated up from a hardcoded 0 in the markup, so a page opened in one - a
 * middle-click, a restored session, a link preview, a screenshot - sat on
 * "0 games played", the largest number on the site, until someone focused it.
 *
 * Emulating a hidden page is the only way to catch this: focused, everything
 * looks perfect. The assertion is not "the animation works", it is "the number
 * is never wrong", which is the property that actually matters.
 */
{
  const hidden = await b.newContext({ viewport: { width: 1400, height: 1200 } });
  const hp = await hidden.newPage();
  // Make the page report itself hidden BEFORE any of its script runs.
  await hp.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { get: () => true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
  });
  await hp.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
  await hp.waitForTimeout(900);
  const shown = await hp.evaluate(() => document.querySelector('#bigCount')?.textContent?.trim());
  const real = await hp.evaluate(async () => {
    const { matches } = await import('./data.js');
    return matches.length.toLocaleString('en-US');
  });
  t('the hero counter shows the real total in a background tab, not 0',
    shown === real, `showed ${JSON.stringify(shown)}, expected ${JSON.stringify(real)}`);
  t('and it is not left at zero', shown !== '0', JSON.stringify(shown));

  // Same property for the marquee counters, which were fixed for the
  // below-the-fold version of this and must not regress into the hidden one.
  const zeros = await hp.evaluate(() =>
    [...document.querySelectorAll('.mq-val b[data-to]')]
      .filter((e) => e.textContent.trim() === '0' && e.dataset.to !== '0').length);
  t('no marquee counter is stranded at zero either', zeros === 0, `${zeros} stuck`);
  await hidden.close();
}

/* ---------------------------- tournaments, and the wall by year */
// The landing page's tournament count comes from the build, and the Wall of
// Fame can be re-scoped to one year. A year's wall must be computed from that
// year's games only, say so, survive a reload via its URL, and go back to all
// time cleanly - including the Century Club, which is all-time only.
{
  await page.goto('http://127.0.0.1:8321/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);   // the counter counts up; let it land
  const home = await page.evaluate(async () => {
    const { coverage } = await import('./data.js');
    return { want: coverage.tournaments, shown: document.querySelector('#tourCount')?.textContent };
  });
  t('home: the tournament count is on the page and matches the build',
    home.want > 0 && home.shown === Number(home.want).toLocaleString(), JSON.stringify(home));

  await page.goto('http://127.0.0.1:8321/#/records', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const years = await page.evaluate(() => [...document.querySelectorAll('.wof-yr')].map((b) => b.textContent.trim()));
  t('wall: the year filter offers All time first', years[0] === 'All time', years.join(','));
  t('wall: 2023 (a partial first season) gets no button of its own', !years.includes('2023'), years.join(','));
  const pick = years.find((y) => /^\d{4}$/.test(y));
  await page.click(`.wof-yr[data-year="${pick}"]`);
  await page.waitForTimeout(400);
  const one = await page.evaluate(async (y) => {
    const { matches } = await import('./data.js');
    const games = matches.filter((m) => m.date.startsWith(y)).length;
    return { games, hash: location.hash, sub: document.querySelector('.wof-hero-sub')?.innerText ?? '',
             pressed: document.querySelector('.wof-yr[aria-pressed="true"]')?.textContent.trim(),
             cards: document.querySelectorAll('.wof').length, century: !!document.querySelector('.ccwrap') };
  }, pick);
  t('wall: a year is computed from that year\'s games', one.sub.includes(Number(one.games).toLocaleString()) && one.sub.includes(pick), one.sub);
  t('wall: the chosen year is marked pressed', one.pressed === pick, one.pressed);
  t('wall: the year is in the URL', one.hash === `#/records/${pick}`, one.hash);
  t('wall: a year still shows all nineteen records', one.cards === 19, String(one.cards));
  t('wall: the Century Club is all-time only', !one.century);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const again = await page.evaluate(() => document.querySelector('.wof-yr[aria-pressed="true"]')?.textContent.trim());
  t('wall: a year survives a reload', again === pick, again);
  await page.click('.wof-yr[data-year=""]');
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({ hash: location.hash, century: !!document.querySelector('.ccwrap') }));
  t('wall: All time goes back to the full wall', back.hash === '#/records' && back.century, JSON.stringify(back));
}

t('no page errors anywhere', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fail} failed   (checked ${ids.length} players + tab switching at 390px)`);
await b.close();
process.exit(fail ? 1 : 0);
