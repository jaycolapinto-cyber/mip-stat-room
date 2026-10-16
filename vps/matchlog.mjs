// Is an exported Scoreholio match log whole? Kept apart from the browser
// script so it can be tested without Scoreholio.

/** A match log that is whole: games present, and as many rows as the highest game number. */
export function checkMatchLog(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (!/^\uFEFF?"#"/.test(lines[0] || '')) return { ok: false, why: 'not a match log (header missing)' };
  const nums = lines.slice(1).map((l) => Number(/^"(\d+)"/.exec(l)?.[1]));
  if (!nums.length) return { ok: false, why: 'header only, no games (the table had not loaded)' };
  if (nums.some((x) => !Number.isFinite(x))) return { ok: false, why: 'a row without a game number' };
  const max = Math.max(...nums);
  if (max !== nums.length) return { ok: false, why: `${nums.length} rows but the highest game number is ${max}` };
  return { ok: true, games: nums.length };
}
