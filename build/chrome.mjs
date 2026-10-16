// Which Chromium the page checks launch. MIP_CHROME wins if set; otherwise
// the fixed path the cloud updates use; and only where that doesn't exist
// (the VPS) does Playwright fall back to its own installed browser.
import { existsSync } from 'node:fs';
const FIXED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const executablePath =
  process.env.MIP_CHROME || (existsSync(FIXED) ? FIXED : undefined);
