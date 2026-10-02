#!/usr/bin/env node
// Runs every test script in this folder and reports. Exit code 0 only if all pass.
const { spawnSync } = require('child_process');
const path = require('path');
const scripts = ['smoke.js', 'unit.js', 'ui.js', 'phase2.js', 'phase3.js', 'format.js'];
let failed = 0;
const only = process.argv.slice(2);
for (const s of scripts.filter(x => !only.length || only.some(o => x.startsWith(o)))) {
  console.log('\n=== ' + s + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, s)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log('*** ' + s + ' FAILED (exit ' + r.status + ')'); }
}
console.log(failed ? '\n' + failed + ' script(s) failed' : '\nAll test scripts passed');
process.exit(failed ? 1 : 0);
