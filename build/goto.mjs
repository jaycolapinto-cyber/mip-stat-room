// How the page checks open a URL. 'networkidle' is right for a fresh page
// load, but on a hash-only jump within the page already open Playwright can
// miss it and wait out its full 30 s with nothing in flight. That failed the
// 11:15 PM run of Oct 16 2026 at random (about 1 run in 5). A hash jump
// fetches nothing, so it waits for 'load' instead; every caller already
// pauses afterwards for the page to render.
export function go(page, url) {
  const sameDoc = page.url().split('#')[0] === url.split('#')[0];
  return page.goto(url, { waitUntil: sameDoc ? 'load' : 'networkidle' });
}
