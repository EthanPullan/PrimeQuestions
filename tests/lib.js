// Shared helpers for the Prime Questions browser tests.
// No package.json: these need Node 18+, Playwright (global or local) with Chromium, and
// poppler-utils (pdfdetach, pdfinfo, pdftotext, pdftoppm). See tests/README.md.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright',
    path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')].filter(Boolean);
  for (const t of tries) { try { return createRequire(__filename)(t); } catch (e) { /* try next */ } }
  throw new Error('Playwright not found. Install it, or set PLAYWRIGHT_PATH to its folder.');
}
const { chromium } = loadPlaywright();

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) { const p = path.join(root, d, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; }
  } catch (e) { /* fall through to Playwright's own lookup */ }
  return undefined;
}

// All files the tests write (PDFs, screenshots) go to a scratch folder, never into the repo.
const OUT = process.env.PQ_TEST_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pq-tests-'));
fs.mkdirSync(OUT, { recursive: true });
process.chdir(OUT);

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

async function launch(opts) {
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1400, height: 900 }, acceptDownloads: true }, opts || {}));
  const page = await ctx.newPage();
  const problems = [], requests = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push('console.' + m.type() + ': ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(file:|data:|blob:|about:)/.test(u)) requests.push(u); });
  return { browser, ctx, page, problems, requests };
}
async function openApp(page) {
  await page.goto(APP);
  await page.waitForFunction(() => window.PQ && window.PQ.ready === true, null, { timeout: 15000 });
}
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
}
const summary = () => { console.log(`\n${pass} passed, ${fail} failed`); return fail; };
module.exports = { launch, openApp, check, summary, APP, OUT };
