// Shared pieces for the VPS updater (see vps/README.md).
//
// Everything here runs as the `mipstats` user on Jay's VPS. Saved logins live
// in that user's home, never in this repo, and nothing here ever reads, types
// or prints a password, cookie or key.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freemem } from 'node:os';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const HOME = process.env.MIP_HOME || '/home/mipstats';
export const PROFILES = `${HOME}/profiles`;
export const LOGS = `${HOME}/logs`;
const RESEND_KEY = `${HOME}/.config/mip/resend.key`;

export const SERVER = '100.110.182.100';
export const ALERT_TO = 'jaycolapinto@gmail.com';

/** Today's date in New York, YYYY-MM-DD - the date Jay would write on it. */
export const todayET = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

/** Whole days between two YYYY-MM-DD dates. */
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Chromium needs about 1 GB while a pull runs. The estimator shares this
 * machine, so a pull that would squeeze it does not start.
 */
export function enoughMemory(needMb = 1024) {
  // MemAvailable counts reclaimable cache; os.freemem() does not.
  try {
    const kb = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]);
    return { ok: kb / 1024 >= needMb, mb: Math.round(kb / 1024) };
  } catch {
    const mb = Math.round(freemem() / 1048576);
    return { ok: mb >= needMb, mb };
  }
}

/** One line appended to logs/runs.log - the run history Jay or Claude can read. */
export function logLine(text) {
  mkdirSync(LOGS, { recursive: true });
  appendFileSync(`${LOGS}/runs.log`, `${new Date().toISOString()}  ${text}\n`);
}

/**
 * Email Jay. Every alert must make sense to someone who has forgotten this
 * whole project exists, so callers pass a complete explanation; this adds the
 * same footer to all of them.
 */
export async function sendAlert(subject, body) {
  const text = `${body.trim()}

----
This email came from the MIP Stat Room updater: a small program on your
server (${SERVER}) that keeps stats.estimator.trade up to date by itself.
It only emails you when something needs you. Until this is sorted out the
website keeps showing its last good update - nothing is broken or lost.

Stuck? Paste this whole email into Claude Code and say: help me with this.
`;
  // MIP_NO_EMAIL=1: practice runs print the alert instead of sending it.
  if (process.env.MIP_NO_EMAIL === '1') {
    console.log(`ALERT (practice run, not sent): ${subject}\n${text}`);
    return false;
  }
  if (!existsSync(RESEND_KEY)) {
    console.error(`ALERT (no email key, not sent): ${subject}\n${text}`);
    logLine(`alert NOT sent (no key): ${subject}`);
    return false;
  }
  const key = readFileSync(RESEND_KEY, 'utf8').trim();
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'MIP Stats <stats@estimator.trade>', to: [ALERT_TO], subject, text }),
  });
  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    console.error(`alert email failed (${res.status}): ${out.message || 'unknown error'}`);
    logLine(`alert FAILED to send: ${subject}`);
    return false;
  }
  logLine(`alert sent: ${subject}`);
  return true;
}

/** The email for an expired login. Written for Jay nine months from now. */
export function loginExpiredEmail(site) {
  const name = { dupr: 'DUPR', scoreholio: 'Scoreholio' }[site] || site;
  return {
    subject: `MIP Stats: please sign in to ${name} again (about 5 minutes)`,
    body: `
${name} has signed your server out, which websites do every few months.
Until you sign in again, the Stat Room can't fetch ${site === 'dupr' ? 'the weekly DUPR ratings' : 'new league nights'}.

You need: your Windows PC, Google Chrome, and your ${name} email and password.
You will type the password into ${name}'s own page. Nobody else sees it.

STEP 1 - Connect to your server
  a. On your PC, click Start, type  PowerShell  and press Enter.
  b. In the blue window, type this line exactly and press Enter:
       ssh -L 9222:localhost:9222 Jay@${SERVER}
  c. If it asks for a password, that is your SERVER password (the one you
     use to log in to the server), not ${name}'s.

STEP 2 - Start the sign-in browser on the server
  In that same window, type this and press Enter:
       sudo -u mipstats /home/mipstats/mip-stat-room/vps/sign-in.sh ${site}
  It says "Waiting for you to sign in". Leave this window open.

STEP 3 - Open that browser from your PC
  a. Open Google Chrome on your PC.
  b. Click the address bar, type  chrome://inspect  and press Enter.
  c. Under "Remote Target" you will see a ${name} page. Click the blue word
     "inspect" under it. A new window opens with the ${name} page on the left.
     (Nothing listed? Wait 10 seconds - it refreshes by itself.)

STEP 4 - Sign in
  In that window, click into ${name}'s Email box and sign in the normal way
  (if a cookie notice shows, click Accept first).
  When you're signed in, go back to the PowerShell window. Within a few
  seconds it says "Signed in and saved". You're done - close both windows.

If the PowerShell window says "Gave up waiting", just start again at Step 2.
These same steps are on the server in /home/mipstats/mip-stat-room/vps/HOW-TO-SIGN-IN.md
`,
  };
}

/** Exit code a pull uses to say "the saved login has expired". */
export const LOGIN_EXPIRED = 3;
