// Pulls new games off DUPR's club match list. Runs IN THE PAGE, via the
// browser pane's javascript_tool, against a session Jay signed in himself.
//
// WHY IT TAKES A CUTOFF DATE INSTEAD OF JUST READING THE LIST.
//
// The list is infinite-scroll and ~25,000 games long. Reading the whole thing
// costs real money every run and returns the same games we already hold. So
// the caller passes the newest date already in the build and this scrolls only
// until it has gone past that, then emits the games above it and stops.
//
// It emits the EXACT eight-line block DUPR's own copy-paste produces, because
// importer/duprmatches.mjs already parses that shape and is already tested on
// it. Inventing a tidier format here would mean a second parser to keep in
// step with the first.
//
// It reads NO auth token and no cookie. The session is simply already there.
//
// Returns { ok, newest, oldestSeen, blocks, text, note } as JSON. On a
// signed-out page it returns ok:false with a note, and NEVER an empty list
// that a caller could mistake for "no new games this week".

async function pullDupr(cutoffISO, { maxScrolls = 80, settleMs = 900 } = {}) {
  const out = { ok: false, newest: null, oldestSeen: null, blocks: 0, text: '', note: '' };

  // A dead session renders the login form, not an empty list. Say so loudly.
  const bodyText = document.body.innerText || '';
  if (/Sign In|Forgot Password|Claim Your Account/i.test(bodyText) && !/Match ID:/.test(bodyText)) {
    out.note = 'signed out - the saved DUPR session has expired and needs a fresh sign-in';
    return out;
  }

  const cards = () => [...document.querySelectorAll('div.bg-white.rounded-2xl')]
    .filter((e) => e.innerText && e.innerText.split('Match ID:').length === 2);

  const iso = (s) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const dateOf = (c) => iso((c.innerText.split('\n').find((l) => l.trim()) || '').trim());

  // Scroll until something older than the cutoff has loaded, or the list stops
  // growing. Both endings are normal; running out of scrolls is not, and says so.
  let seen = 0, stale = 0, hitCutoff = false, scrolls = 0;
  for (; scrolls < maxScrolls; scrolls++) {
    const cs = cards();
    const oldest = cs.length ? dateOf(cs[cs.length - 1]) : null;
    if (oldest && oldest < cutoffISO) { hitCutoff = true; break; }
    if (cs.length === seen) { if (++stale >= 3) break; } else stale = 0;
    seen = cs.length;
    const el = document.scrollingElement || document.documentElement;
    el.scrollTo(0, el.scrollHeight);
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, settleMs));
  }

  const all = cards();
  if (!all.length) {
    out.note = 'no matches rendered - the page may not have finished loading';
    return out;
  }

  // Keep only what is strictly newer than what we already hold. Equal dates are
  // excluded: the build already has that whole day, and re-importing it would
  // rely on duplicate detection to undo a mistake we can simply not make.
  const fresh = all.filter((c) => { const d = dateOf(c); return d && d > cutoffISO; });

  const dates = all.map(dateOf).filter(Boolean).sort();
  out.oldestSeen = dates[0] ?? null;
  out.newest = dates[dates.length - 1] ?? null;
  out.blocks = fresh.length;
  out.text = fresh.map((c) => c.innerText.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')).join('\n\n');
  out.ok = true;
  if (!hitCutoff && scrolls >= maxScrolls) {
    out.note = `stopped after ${maxScrolls} scrolls without reaching ${cutoffISO} - there may be more`;
  } else if (!fresh.length) {
    out.note = `nothing newer than ${cutoffISO}`;
  }
  return out;
}
