// One command for everything that happens AFTER the match logs are downloaded.
//
// WHY THIS EXISTS.
//
// Collecting the nights from Scoreholio needs a signed-in browser and a person
// (see REFRESH.md). Everything after that is mechanical, takes about half a
// minute, and was being done as six separate steps with a human comparing
// numbers between them. Comparing numbers by eye is the part that fails
// quietly, so it is the part that is now code.
//
// What it does, in order:
//
//   1. measures the tree as it stands now      (the BEFORE reading)
//   2. adopts every new match log it was given
//   3. rebuilds, runs the full suite, re-measures (the AFTER reading)
//   4. judges the difference, and REVERTS if the judgement is bad
//
// Step 4 is the point. A refresh that makes the site worse never survives
// this script: the new CSVs are removed and dist/data.js is rebuilt from the
// old ones, so the tree is handed back exactly as it was found. Last week's
// site staying up is always better than a wrong one.
//
//   node importer/refresh.mjs --from ~/Downloads
//   node importer/refresh.mjs --from ~/Downloads --dry

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, copyFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMatchLog } from './adopt-matchlog.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPORTS = fileURLToPath(new URL('./live/exports', import.meta.url));

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const DRY = args.includes('--dry');
const FROM = flag('--from');

if (!FROM) {
  console.error('usage: node importer/refresh.mjs --from <downloads-dir> [--dry]');
  process.exit(2);
}

const run = (cmd, cmdArgs) => {
  try {
    return { ok: true, out: execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

/**
 * Build once and read back the three numbers that decide whether a refresh is
 * sound: how many games we hold, the last night covered, and every warning the
 * verifier raised.
 *
 * The warnings matter as much as the count. A run can add games correctly and
 * still surface a new disagreement with Dave's published grid - that is worth
 * knowing about, and it is invisible unless you hold the previous run's list
 * beside this one.
 */
function measure({ withTests = false } = {}) {
  const build = run('node', ['importer/emit.mjs']);
  if (!build.ok) return { fatal: 'the build itself failed', out: build.out };

  const m = build.out.match(/^matches\s+(\d+) over \d+ days, (\S+) to (\S+)/m);
  if (!m) return { fatal: 'could not read the game count out of the build', out: build.out };

  const reading = { games: Number(m[1]), firstDate: m[2], lastDate: m[3], warnings: [], testsOk: null, testOut: '' };

  // The full suite is only worth its 12 seconds on the AFTER reading - the
  // BEFORE reading is a tree that already passed on the last run.
  const verify = withTests ? run('npm', ['test']) : run('node', ['importer/verify.mjs']);
  reading.testsOk = withTests ? verify.ok : null;
  reading.testOut = verify.out;

  // Warning lines are the indented ones between the WARNINGS and NOTES headers.
  const lines = verify.out.split('\n');
  const start = lines.findIndex((l) => l.startsWith('WARNINGS'));
  const end = lines.findIndex((l) => l.startsWith('NOTES'));
  if (start >= 0 && end > start) {
    reading.warnings = lines.slice(start + 1, end).filter((l) => l.startsWith('  ')).map((l) => l.trim());
  }
  return reading;
}

/** Match logs sitting in `dir`, identified by their header and named by their id. */
function candidates(dir) {
  const found = [];
  for (const f of readdirSync(dir)) {
    if (f.startsWith('~$') || !/\.(csv|tmp)$/i.test(f)) continue;
    const full = `${dir}/${f}`;
    let text;
    try {
      if (!statSync(full).isFile()) continue;
      text = readFileSync(full, 'utf8');
    } catch { continue; }
    if (!isMatchLog(text).ok) continue;

    const id = (f.match(/^Matchlog-([A-Za-z0-9]{12,})\.csv$/) ?? [])[1] ?? null;
    const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).length - 1;
    found.push({ file: f, full, id, rows, already: id ? existsSync(`${EXPORTS}/Matchlog-${id}.csv`) : false });
  }
  return found;
}

const say = (...a) => console.log(...a);

const all = candidates(FROM);
const unnamed = all.filter((c) => !c.id);
const fresh = all.filter((c) => c.id && !c.already);
const seen = all.filter((c) => c.already);

say(`match logs in ${FROM}: ${all.length}  (new ${fresh.length}, already held ${seen.length}, unidentifiable ${unnamed.length})`);
for (const c of unnamed) {
  say(`  ? ${c.file} is a match log but not named Matchlog-<id>.csv - adopt it by hand with its tournament id`);
}

if (!fresh.length) {
  say('\nnothing new to bring in. The site already has every night in that folder.');
  process.exit(0);
}

for (const c of fresh) say(`  + ${c.file}  ${c.rows} rows`);
const importedRows = fresh.reduce((a, c) => a + c.rows, 0);

if (DRY) { say('\n--dry: stopping before anything is copied.'); process.exit(0); }

say('\nreading the tree as it stands...');
const before = measure();
if (before.fatal) { say(`STOP: ${before.fatal}\n${before.out}`); process.exit(1); }
say(`  before: ${before.games} games, through ${before.lastDate}, ${before.warnings.length} warning(s)`);

for (const c of fresh) copyFileSync(c.full, `${EXPORTS}/Matchlog-${c.id}.csv`);
const revert = () => {
  for (const c of fresh) rmSync(`${EXPORTS}/Matchlog-${c.id}.csv`, { force: true });
  run('node', ['importer/emit.mjs']);
};

say('rebuilding and running every check...');
const after = measure({ withTests: true });
if (after.fatal) { revert(); say(`STOP: ${after.fatal} - reverted.\n${after.out}`); process.exit(1); }

const added = after.games - before.games;
say(`  after:  ${after.games} games, through ${after.lastDate}, ${after.warnings.length} warning(s)`);

// The four ways a refresh can be wrong, in the order they matter.
const faults = [];
if (!after.testsOk) faults.push('a check failed - see the suite output above');
if (added < 0) faults.push(`the game count went DOWN by ${-added}`);
if (added > importedRows) faults.push(`the count rose by ${added}, more than the ${importedRows} rows imported`);

if (faults.length) {
  say('\n' + '='.repeat(60));
  say('REFUSED - nothing has been changed.');
  for (const f of faults) say('  * ' + f);
  if (!after.testsOk) say('\n' + after.testOut.split('\n').slice(-40).join('\n'));
  revert();
  say('\nThe new CSVs were removed and dist/data.js rebuilt from the old ones.');
  process.exit(1);
}

// Sound, but say plainly what changed - including anything newly flagged.
const newWarnings = after.warnings.filter((w) => !before.warnings.includes(w));
const goneWarnings = before.warnings.filter((w) => !after.warnings.includes(w));

say('\n' + '='.repeat(60));
say(`OK - ${fresh.length} night(s) added, ${importedRows} rows imported, ${added} new game(s).`);
say(`   ${before.games} -> ${after.games} games`);
say(`   last night covered: ${before.lastDate} -> ${after.lastDate}${after.lastDate === before.lastDate ? '  (unchanged - check this is what you expected)' : ''}`);
say('   every check passed.');

if (newWarnings.length) {
  say('\nNEW since the last build - worth a look before you push:');
  for (const w of newWarnings) say('  ! ' + w);
}
if (goneWarnings.length) {
  say('\nno longer flagged:');
  for (const w of goneWarnings) say('  - ' + w);
}
if (!newWarnings.length) say('\nNo new warnings.');

say('\nChanged: dist/data.js, importer/live/unknown-handles.json, and the new CSVs.');
say('Commit and push in GitHub Desktop; Cloudflare publishes from there.');
