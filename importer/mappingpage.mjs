// Builds a standalone page Dave can open and answer in a couple of minutes.
// No account, no server - he taps his answers and copies the result back.
import { writeFileSync, readFileSync } from 'node:fs';

const w = JSON.parse(readFileSync(new URL('./worklist.json', import.meta.url), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hasEmoji = (s) => /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u.test(s);
/** Two plain words reads as a real name, not a Scoreholio handle. */
const looksLikeRealName = (s) => {
  const t = String(s).trim().split(/\s+/);
  return t.length >= 2 && !hasEmoji(s) && !/\.$/.test(s)
    && t[t.length - 1].replace(/\./g, '').length >= 2
    && t.every((x) => /^[A-Za-z'’.-]+$/.test(x));
};

// A weak first-name-only guess against someone whose name already looks real is
// noise - drop it rather than make Dave rule it out.
const needsCall = [], ownPerson = [];
for (const it of w.items) {
  const confident = it.suggestions[0]?.confident;
  const real = looksLikeRealName(it.handle);
  if (it.suggestions.length && !(real && !confident)) needsCall.push(it);
  else ownPerson.push({ ...it, suggestions: [] });
}
needsCall.sort((a, b) => (b.games + b.meetings) - (a.games + a.meetings));
ownPerson.sort((a, b) => (b.games + b.meetings) - (a.games + a.meetings));

const card = (it, i) => `
<section class="q" data-handle="${esc(it.handle)}">
  <div class="qhead">
    <h3>${esc(it.handle)}</h3>
    <span class="vol">${it.games} games · ${it.meetings} head-to-head results</span>
  </div>
  ${it.ambiguous ? `<p class="warn">This name matches more than one player, so we can't pick on our own.</p>` : ''}
  <div class="opts">
    ${it.suggestions.map((s, j) => `
      <label class="opt${s.confident ? ' best' : ''}">
        <input type="radio" name="q${i}" value="${esc(s.id)}" data-label="${esc(s.name)}">
        <span class="who">${esc(s.name)}</span>
        ${s.confident ? '<span class="pill">our best guess</span>' : ''}
      </label>`).join('')}
    <label class="opt">
      <input type="radio" name="q${i}" value="__own__" data-label="their own person">
      <span class="who">Nobody — this is their own person</span>
    </label>
    <label class="opt other">
      <input type="radio" name="q${i}" value="__other__" data-label="">
      <span class="who">Someone else:</span>
      <input type="text" class="othername" placeholder="type the real name" aria-label="Real name for ${esc(it.handle)}">
    </label>
  </div>
</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MIP — who is who?</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;--court:#0A3B2C;--court-deep:#06291E;--lime:#D9F84B;--lime-ink:#1B2708;
 --ink:#0D1A15;--muted:#64756D;--faint:#8B9A92;--bg:#F1F4F0;--line:#E2E8E2;--win:#17794F;--win-bg:#E4F4EC;
 --display:"Barlow Condensed","Arial Narrow",system-ui,sans-serif;--sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55}
.top{background:var(--court-deep);color:#fff;padding:18px 16px}
.top-in{max-width:760px;margin:0 auto;display:flex;align-items:center;gap:12px}
.mark{width:40px;height:40px;border-radius:11px;background:var(--lime);color:var(--lime-ink);display:grid;
 place-items:center;font-family:var(--display);font-weight:700;font-size:19px}
.top h1{margin:0;font-family:var(--display);font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 80px}
.intro{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin:18px 0;
 box-shadow:0 1px 2px rgba(10,59,44,.05)}
.intro p{margin:0 0 10px}.intro p:last-child{margin:0}
h2{font-family:var(--display);font-size:22px;text-transform:uppercase;letter-spacing:.02em;margin:28px 0 4px}
.sub{color:var(--muted);font-size:14px;margin:0 0 14px}
.q{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:12px}
.qhead{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.qhead h3{margin:0;font-size:21px;font-family:var(--display);font-weight:700}
.vol{font-size:12.5px;color:var(--faint);font-weight:600}
.warn{margin:0 0 10px;font-size:13px;color:#8A4B12;background:#FFF1E3;border:1px solid #F3D6B6;
 border-radius:8px;padding:7px 10px}
.opts{display:flex;flex-direction:column;gap:7px}
.opt{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--line);
 border-radius:11px;cursor:pointer;font-size:15px}
.opt:hover{background:#F7FAF6;border-color:#C9D3C9}
.opt.best{border-color:#BFE3D0;background:var(--win-bg)}
.opt input[type=radio]{accent-color:var(--court);width:18px;height:18px;flex:none}
.opt:has(input:checked){border-color:var(--court);box-shadow:0 0 0 2px rgba(10,59,44,.12)}
.who{font-weight:600}
.pill{margin-left:auto;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
 color:var(--win);background:#fff;border:1px solid #BFE3D0;border-radius:6px;padding:2px 7px}
.othername{flex:1;min-width:110px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:14px}
.small{font-size:14px;color:var(--muted)}
.own{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.own ul{margin:10px 0 0;padding-left:20px;columns:2;column-gap:24px}
.own li{font-size:14.5px;margin-bottom:4px;break-inside:avoid}
.bar{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--line);padding:14px 16px;margin-top:24px}
.bar-in{max-width:760px;margin:0 auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
button{font:inherit;font-weight:700;border:0;border-radius:11px;padding:12px 20px;cursor:pointer;
 background:var(--court);color:#fff;font-size:15px}
button:hover{background:#0d4a37}
#count{font-size:14px;color:var(--muted);font-weight:600}
#out{width:100%;margin-top:12px;min-height:150px;padding:12px;border:1px solid var(--line);border-radius:11px;
 font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5}
@media (max-width:560px){.own ul{columns:1}.wrap{padding:0 12px 80px}}
</style></head><body>
<header class="top"><div class="top-in">
  <span class="mark">MIP</span>
  <h1>Who is who?</h1>
</div></header>

<div class="wrap">
  <div class="intro">
    <p><strong>Dave — this takes about two minutes.</strong></p>
    <p>Players pick their own nicknames in Scoreholio, so the stats page can't always tell whether
    <em>D-Hub27🍺</em> and <em>David Huber</em> are the same person or two different people.</p>
    <p>We won't guess. A wrong guess would hand one player someone else's wins and nobody would
    ever notice. So: pick the right answer for each one below, hit <strong>Copy answers</strong> at the
    bottom, and send the result to Jay.</p>
  </div>

  <h2>Needs your call</h2>
  <p class="sub">${needsCall.length} nicknames. The number beside each shows how many real results depend on getting it right.</p>
  ${needsCall.map(card).join('')}

  <h2>Probably their own person</h2>
  <p class="sub">These look like real names already and we found no convincing match to anyone else.
  Just glance down the list — if any of them is actually a nickname for somebody, tell Jay.</p>
  <div class="own">
    <ul>${ownPerson.map((i) => `<li>${esc(i.handle)} <span class="small">(${i.games}g)</span></li>`).join('')}</ul>
  </div>
</div>

<div class="bar"><div class="bar-in">
  <button id="copy" type="button">Copy answers</button>
  <span id="count">0 of ${needsCall.length} answered</span>
</div>
<div class="bar-in"><textarea id="out" readonly placeholder="Your answers will appear here"></textarea></div>
</div>

<script>
const cards = [...document.querySelectorAll('.q')];
const tally = () => {
  const done = cards.filter(c => c.querySelector('input[type=radio]:checked')).length;
  document.getElementById('count').textContent = done + ' of ' + cards.length + ' answered';
};
document.addEventListener('change', (e) => {
  if (e.target.type === 'radio') {
    const other = e.target.closest('.q').querySelector('.othername');
    if (other && e.target.value === '__other__') other.focus();
  }
  tally();
});
document.addEventListener('input', (e) => { if (e.target.classList.contains('othername')) tally(); });

document.getElementById('copy').addEventListener('click', async () => {
  const lines = ['MIP nickname answers', ''];
  for (const c of cards) {
    const picked = c.querySelector('input[type=radio]:checked');
    const handle = c.dataset.handle;
    if (!picked) { lines.push(handle + ' -> (not answered)'); continue; }
    if (picked.value === '__other__') {
      const typed = c.querySelector('.othername').value.trim();
      lines.push(handle + ' -> ' + (typed || '(said someone else but left it blank)'));
    } else if (picked.value === '__own__') {
      lines.push(handle + ' -> their own person, do not merge');
    } else {
      lines.push(handle + ' -> ' + picked.dataset.label + '   [id: ' + picked.value + ']');
    }
  }
  const text = lines.join('\\n');
  const out = document.getElementById('out');
  out.value = text;
  try { await navigator.clipboard.writeText(text); document.getElementById('copy').textContent = 'Copied'; }
  catch { out.removeAttribute('readonly'); out.select(); document.getElementById('copy').textContent = 'Select the text below and copy'; }
  setTimeout(() => { document.getElementById('copy').textContent = 'Copy answers'; }, 2500);
});
tally();
</script>
</body></html>`;

writeFileSync('/mnt/user-data/outputs/MIP-name-check.html', html);
console.log('needs a call:', needsCall.length, '| own person:', ownPerson.length);
console.log('size:', (html.length / 1024).toFixed(0) + 'KB');
