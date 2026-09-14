// Proposes roster matches for unmapped Scoreholio handles.
// These are SUGGESTIONS ONLY. Nothing here is ever applied automatically —
// a wrong guess silently mis-credits wins, so a human confirms every one.

const NICK = {
  bob: 'robert', bobby: 'robert', rob: 'robert', robbie: 'robert',
  bill: 'william', billy: 'william', will: 'william',
  andy: 'andrew', drew: 'andrew',
  tim: 'timothy', tom: 'thomas', tommy: 'thomas',
  dave: 'david', davey: 'david', dhub: 'david',
  mike: 'michael', mikey: 'michael', mick: 'michael',
  chris: 'christopher', topher: 'christopher',
  jon: 'jonathan', jonny: 'jonathan', johnny: 'john', jack: 'john',
  ron: 'ronald', ronnie: 'ronald',
  joe: 'joseph', joey: 'joseph',
  dan: 'daniel', danny: 'daniel',
  steve: 'stephen', steph: 'stephen',
  ed: 'edward', eddie: 'edward', ted: 'edward',
  rick: 'richard', ricky: 'richard', dick: 'richard',
  jim: 'james', jimmy: 'james',
  matt: 'matthew', nick: 'nicholas', tony: 'anthony',
  ken: 'kenneth', kenny: 'kenneth', sal: 'salvatore',
  lauren: 'lauren', jeff: 'jeffrey', greg: 'gregory',
};
const canon = (w) => NICK[w] ?? w;
const letters = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const words = (s) => String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

/** shared leading characters */
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function suggestFor(handle, roster) {
  const hw = words(handle);
  const hl = letters(handle);
  if (!hw.length) return [];

  const out = [];
  for (const p of roster) {
    const pw = words(p.name);
    if (!pw.length) continue;
    const first = pw[0], last = pw[pw.length - 1];
    let score = 0; const why = [];

    for (const w of hw) {
      const cw = canon(w), cf = canon(first);
      // first-name match, allowing for nicknames in either direction
      if (cw === cf) { score += 4; why.push(w === first ? 'first name' : `"${w}" = ${first}`); }
      else if (w.length >= 3 && (cf.startsWith(cw) || cw.startsWith(cf))) { score += 2; why.push('first-name prefix'); }
      // last-name match, tolerating shortenings like "Glods" for "Glodny"
      if (last.length >= 4) {
        if (w === last) { score += 5; why.push('last name'); }
        else if (commonPrefix(w, last) >= 4) { score += 4; why.push(`"${w}" ~ ${last}`); }
      }
      // single letter next to a matching surname: "Tim L", "Bobby P"
      if (w.length === 1 && w === last[0] && hw.some((x) => canon(x) === canon(first))) {
        score += 3; why.push('last initial');
      }
      // shortened surname beside a first initial: "D-Hub" -> David Huber
      if (w.length >= 3 && commonPrefix(w, last) >= 3 && hw.some((x) => x.length === 1 && x === first[0])) {
        score += 4; why.push(`"${w}" ~ ${last}, first initial`);
      }
    }
    // handle squashed into one token: "DHub27", "Scadutes", "JonMac75"
    if (commonPrefix(hl, letters(p.name)) >= 5) { score += 4; why.push('name prefix'); }
    if (last.length >= 5 && hl.includes(letters(last).slice(0, 5))) { score += 4; why.push('contains last name'); }
    if (first.length >= 3 && last.length >= 3 && hl.includes(letters(first).slice(0, 3) + letters(last).slice(0, 3))) {
      score += 5; why.push('first+last fragments');
    }

    // Confidence requires SURNAME evidence. A shared first name is not enough:
    // "Karen Mangione" is not "Karen Polito", and "David J." is not David Huber.
    const surname = why.some((w) => /last name|last initial|~ |contains last name|first\+last fragments/.test(w));

    // A full word in the handle that matches neither the first name nor the
    // surname is positive evidence they are DIFFERENT people.
    const contradicts = hw.some((w) => w.length >= 4
      && canon(w) !== canon(first)
      && commonPrefix(w, last) < 4
      && !letters(p.name).includes(w));

    if (score > 0) out.push({ id: p.id, name: p.name, score, surname, contradicts,
                              why: [...new Set(why)].join(', ') });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = out.slice(0, 3);
  // Confident only with surname evidence, no contradicting word, a decent
  // score, and a clear gap to the runner-up.
  const confident = top.length > 0 && top[0].surname && !top[0].contradicts && top[0].score >= 6
    && (top.length === 1 || top[0].score - top[1].score >= 3);
  return top.map((t, i) => ({ ...t, confident: i === 0 && confident }));
}
