// One-time (every few months) sign-in for a site the updater reads.
//
//   sudo -u mipstats /home/mipstats/mip-stat-room/vps/sign-in.sh dupr
//
// The server has no screen, so this starts the server's browser with Chrome's
// remote-debugging port open on the server's OWN localhost (port 9222). Jay
// reaches it through his SSH connection (ssh -L 9222:localhost:9222 ...) and
// sees the page in chrome://inspect on his PC. He signs in on the site's own
// page; this script never reads, types or stores the password - it only waits
// until the page stops being a login page, then closes the browser so the
// profile folder keeps the session. The port closes with it.

import { chromium } from 'playwright';
import { mkdirSync, chmodSync } from 'node:fs';
import { PROFILES, logLine } from './lib.mjs';

export const SITES = {
  dupr: {
    name: 'DUPR',
    start: 'https://dashboard.dupr.com/dashboard/browse/clubs/8246685522',
    // Signed in = on the dashboard with no password box on the page.
    signedIn: async (p) => /dashboard\.dupr\.com\/dashboard/.test(p.url())
      && !(await p.locator('input[type=password]').count()),
  },
  scoreholio: {
    name: 'Scoreholio',
    start: 'https://app.scoreholio.com/v2/pickleball/organizer',
    // Signed out, the organizer page is a lone LOGIN button. Signed in, it
    // lists the account's tournaments under Upcoming / Past.
    signedIn: async (p) => /app\.scoreholio\.com\/v2\/pickleball\/organizer/.test(p.url())
      && !(await p.locator('input[type=password]').count())
      && !(await p.getByText(/^\s*LOGIN\s*$/i).count())
      && (await p.getByText(/^\s*PAST\s*$/i).count()) > 0,
  },
};

const site = SITES[process.argv[2]];
if (!site) {
  console.error(`usage: sign-in.sh <${Object.keys(SITES).join('|')}>`);
  process.exit(2);
}

const dir = `${PROFILES}/${process.argv[2]}`;
mkdirSync(dir, { recursive: true });
chmodSync(PROFILES, 0o700);
chmodSync(dir, 0o700);

const ctx = await chromium.launchPersistentContext(dir, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'],
});
const page = ctx.pages()[0] || await ctx.newPage();

// Closing the PowerShell window or pressing Ctrl+C must not leave the browser
// (and its debugging port) running on the server.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.log('\nStopped. Nothing changed.');
    const bye = setTimeout(() => process.exit(1), 5000);
    ctx.close().finally(() => { clearTimeout(bye); process.exit(1); });
  });
}

await page.goto(site.start, { waitUntil: 'domcontentloaded' });

console.log(`\nWaiting for you to sign in to ${site.name}...`);
console.log('On your PC: Chrome -> chrome://inspect -> click "inspect" under the');
console.log(`${site.name} page -> sign in there. (Gives up after 20 minutes.)\n`);

const deadline = Date.now() + 20 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 3000));
  try {
    if (await site.signedIn(page)) {
      // Let the site finish writing its session before the browser closes.
      await new Promise((r) => setTimeout(r, 5000));
      ok = await site.signedIn(page);
      if (ok) break;
    }
  } catch { /* page mid-navigation; look again next tick */ }
}
await ctx.close();

if (ok) {
  logLine(`signed in: ${process.argv[2]}`);
  console.log(`Signed in and saved. You can close Chrome's inspect window and this one.`);
} else {
  console.log('Gave up waiting (20 minutes). Nothing changed. Run the same command again to retry.');
  process.exit(1);
}
