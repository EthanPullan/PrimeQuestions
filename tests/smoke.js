const { launch, openApp, check, summary } = require('./lib');
(async () => {
  const { browser, page, problems, requests } = await launch();
  await openApp(page);
  console.log('SMOKE');
  check('app loads and PQ.ready', true);
  check('no console errors/warnings', problems.length === 0, problems);
  check('no non-file network requests', requests.length === 0, requests);
  check('sidebar has Home, Tests, Question Banks, Imports and Export', await page.locator('#nav-home, #nav-tests, #nav-banks, #nav-imports, #btn-export').count() === 5);
  const r = await page.evaluate(() => ({
    temml: typeof temml, ce: (() => { try { return temml.renderToString('\\ce{H2O}').length > 0; } catch (e) { return String(e); } })(),
    status: document.querySelector('.statusbar').textContent,
  }));
  check('temml global present', r.temml === 'object', r.temml);
  check('mhchem \\ce works', r.ce === true, r.ce);
  console.log('  statusbar:', r.status);
  await page.screenshot({ path: 'shot-empty.png' });
  process.exitCode = summary() ? 1 : 0;
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(2); });
