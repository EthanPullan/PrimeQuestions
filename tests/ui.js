const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);                                  // "works with networking off"
  await openApp(page);
  // foreign data on the shared origin: must survive everything this app does
  await page.evaluate(async () => {
    localStorage.setItem('other-app:keep', 'precious');
    await new Promise(r => { const q = indexedDB.open('other-db', 1); q.onupgradeneeded = () => q.result.createObjectStore('x'); q.onsuccess = () => { q.result.close(); r(); }; });
  });

  const modal = page.locator('.modal');
  const stat = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ');

  console.log('1. create a multiple-choice question with maths');
  await page.click('#btn-new');
  check('editor opens for a new question', await page.locator('#btn-save').isVisible());
  check('Save is disabled until something changes', await page.locator('#btn-save').isDisabled());
  check('a blank question lists problems', (await page.locator('#problems li').count()) >= 2);
  // insert buttons
  await page.click('#f-prompt');
  await page.keyboard.type('What is ');
  await page.click('.mathbar button:has-text("a/b")');
  let v = await page.inputValue('#f-prompt');
  let caret = await page.evaluate(() => document.activeElement.selectionStart);
  check('fraction button inserts \\(\\frac{}{}\\) with the caret in the numerator', v === 'What is \\(\\frac{}{}\\)' && caret === 'What is \\(\\frac{'.length, { v, caret });
  await page.keyboard.type('3');
  await page.keyboard.press('Tab');                                  // not part of the feature; just move on
  await page.click('#f-prompt');
  await page.fill('#f-prompt', 'Sam has $12. ');
  await page.evaluate(() => { const t = document.getElementById('f-prompt'); t.focus(); t.setSelectionRange(8, 11); });  // select "$12"
  await page.click('.mathbar button:has-text("√")');
  v = await page.inputValue('#f-prompt');
  check('selection containing "$" survives an insert ($ patterns not interpreted)', v === 'Sam has \\(\\sqrt{$12}\\). ', v);
  await page.fill('#f-prompt', 'What is \\(\\frac{1}{2}+\\frac{1}{4}\\)?');
  await page.fill('input[aria-label="Option A"]', '\\(\\frac{3}{4}\\)');
  await page.fill('input[aria-label="Option B"]', '\\(\\frac{1}{2}\\)');
  await page.fill('input[aria-label="Option C"]', '\\(\\frac{2}{6}\\)');
  await page.fill('input[aria-label="Option D"]', '\\(\\ce{H2O}\\)');
  await page.fill('#f-course', 'Math 8'); await page.fill('#f-unit', 'Fractions'); await page.fill('#f-tags', 'fractions, adding , ');
  await page.waitForTimeout(250);
  check('live preview renders real MathML', (await page.locator('#preview math').count()) >= 4);
  check('no problems -> "can be marked Ready"', /No problems/.test(await page.locator('#problems').innerText()));
  await page.selectOption('#f-status', 'ready');
  check('can mark Ready when there are no problems', await page.inputValue('#f-status') === 'ready');
  // break the maths
  await page.fill('input[aria-label="Option B"]', '\\(\\frac{1}{\\)');
  await page.waitForTimeout(150);
  check('math error is reported with the field name', /Option B/.test(await page.locator('#problems').innerText()) && /MATHS/.test(await page.locator('#problems').innerText()));
  check('status flips to Needs review automatically, with an explanation', await page.inputValue('#f-status') === 'review' && /set to .Needs review./.test(await page.locator('#problems').innerText()));
  check('"Ready" is disabled while a problem exists', await page.locator('#f-status option[value=ready]').isDisabled());
  await page.fill('input[aria-label="Option B"]', '\\(\\frac{1}{2}\\)');
  await page.waitForTimeout(150);
  await page.selectOption('#f-status', 'ready');
  await page.screenshot({ path: 'shot-editor.png' });
  await page.click('#btn-save');
  await page.waitForSelector('.toast.ok');
  check('saved; appears in the list', (await page.locator('.qrow').count()) === 1 && /Questions: 1/.test(await stat()));
  check('tags trimmed/cleaned', await page.evaluate(() => PQ.state.questions[0].tags.join('|')) === 'fractions|adding');

  console.log('2. persistence across reload');
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  check('question survives a reload (IndexedDB)', (await page.locator('.qrow').count()) === 1);
  check('persist() was requested on first save', await page.evaluate(() => localStorage.getItem('prime-questions:persistAsked')) === '1');

  console.log('3. dirty guard, other question types');
  await page.click('.qrow');
  await page.fill('#f-prompt', 'changed but not saved');
  check('unsaved flag shown', /Unsaved/.test(await page.locator('#dirty-flag').innerText()));
  await page.click('#btn-new');
  check('leaving with unsaved changes asks first', await modal.isVisible() && /Discard unsaved changes/.test(await modal.innerText()));
  await page.keyboard.press('Escape');
  check('Escape = keep editing (never discards)', !(await modal.isVisible()) && (await page.inputValue('#f-prompt')) === 'changed but not saved');
  await page.click('#btn-new'); await modal.locator('button:has-text("Discard changes")').click();
  check('Discard works and opens the new question', await page.locator('h2:has-text("New question")').isVisible());
  // true/false
  await page.click('.seg button[data-type=tf]');
  await page.fill('#f-prompt', 'Water boils at 100 °C at sea level.');
  await page.click('.seg:has-text("True") button:has-text("False")'); await page.click('.seg:has-text("False") button:has-text("True")');
  await page.selectOption('#f-status', 'ready'); await page.click('#btn-save'); await page.waitForSelector('.toast.ok');
  // numeric
  await page.click('#btn-new');
  await page.click('.seg button[data-type=numeric]');
  await page.fill('#f-prompt', 'Density of water at 4 °C?'); await page.fill('#f-value', '1.00'); await page.fill('#f-units', '\\(\\mathrm{g/cm^{3}}\\)'); await page.fill('#f-tol', '0.01');
  await page.fill('#f-course', 'Science 9'); await page.click('#btn-save'); await page.waitForSelector('.toast.ok');
  // short answer
  await page.click('#btn-new'); await page.click('.seg button[data-type=short]');
  await page.fill('#f-prompt', 'Explain why ice floats.'); await page.fill('#f-lines', '4'); await page.fill('#f-rubric', 'Mention density'); await page.click('#btn-save'); await page.waitForSelector('.toast.ok');
  // matching with add pair
  await page.click('#btn-new'); await page.click('.seg button[data-type=matching]');
  await page.fill('#f-prompt', 'Match symbol to element');
  await page.fill('input[aria-label="Pair 1 left"]', 'Na'); await page.fill('input[aria-label="Pair 1 right"]', 'Sodium');
  await page.fill('input[aria-label="Pair 2 left"]', 'K'); await page.fill('input[aria-label="Pair 2 right"]', 'Potassium');
  await page.click('button:has-text("+ Add pair")'); await page.fill('input[aria-label="Pair 3 left"]', 'Fe'); await page.fill('input[aria-label="Pair 3 right"]', 'Iron');
  await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.questions.length === 5);
  check('five questions of five types saved', await page.evaluate(() => PQ.state.questions.map(q => q.type).sort().join()) === 'matching,mc,numeric,short,tf', await page.evaluate(() => PQ.state.questions.map(q => q.type)));
  // switching type keeps the old answer
  await page.click('#btn-new'); await page.fill('#f-prompt', 'type switch');
  await page.fill('input[aria-label="Option A"]', 'keepme'); await page.click('.seg button[data-type=tf]'); await page.click('.seg button[data-type=mc]');
  check('switching type and back keeps what was typed', (await page.inputValue('input[aria-label="Option A"]')) === 'keepme');
  await page.click('#btn-close'); await modal.locator('button:has-text("Discard changes")').click();

  console.log('4. search and filters');
  await page.fill('input[aria-label="Search questions"]', 'ice');
  check('search finds by text', (await page.locator('.qrow').count()) === 1);
  await page.fill('input[aria-label="Search questions"]', '');
  await page.selectOption('select[aria-label="Filter by type"]', 'numeric');
  check('type filter works', (await page.locator('.qrow').count()) === 1);
  await page.selectOption('select[aria-label="Filter by type"]', '');
  await page.selectOption('select[aria-label="Filter by status"]', 'review');
  check('status filter works (the short/numeric/matching ones are "review")', (await page.locator('.qrow').count()) === 3, await page.locator('.qrow').count());
  await page.selectOption('select[aria-label="Filter by status"]', '');

  console.log('5. export');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-export')]);
  const name = dl.suggestedFilename();
  await dl.saveAs('ui-export.pdf');
  await page.waitForSelector('.toast.ok');
  check('file named prime-questions-YYYY-MM-DD.pdf', /^prime-questions-\d{4}-\d{2}-\d{2}\.pdf$/.test(name), name);
  check('"Last backup: today" in the status bar', /Last backup: today/.test(await stat()), await stat());
  const list = execFileSync('pdfdetach', ['-list', 'ui-export.pdf']).toString();
  check('exported PDF carries prime-questions.pq (poppler)', /prime-questions\.pq/.test(list), list);
  fs.rmSync('uiex', { recursive: true, force: true }); fs.mkdirSync('uiex'); execFileSync('pdfdetach', ['-saveall', '-o', 'uiex', 'ui-export.pdf']);
  const exported = JSON.parse(fs.readFileSync('uiex/prime-questions.pq', 'utf8'));
  check('payload holds 5 questions, format/schema/appVersion/requiredFeatures set', exported.questions.length === 5 && exported.format === 'prime-questions' && exported.schemaVersion === 1 && exported.appVersion === '0.1.0' && Array.isArray(exported.requiredFeatures), Object.keys(exported));
  fs.copyFileSync('ui-export.pdf', 'ui-export-original.pdf');
  const before = await page.evaluate(async () => { const p = await PQ.collectPayload(); delete p.exportedAt; return JSON.parse(JSON.stringify(p)); });

  console.log('6. wipe, then import (the round trip)');
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  check('bank is empty after the wipe', /Questions: 0/.test(await stat()));
  await page.setInputFiles('#file-input', 'ui-export-original.pdf');
  await modal.waitFor();
  const sum = await modal.innerText();
  check('import summary shown before anything is applied (5 new)', /Import this bank/.test(sum) && /Questions\s*5/.test(sum.replace(/\n/g, ' ').replace(/\s+/g, ' ')), sum.replace(/\s+/g, ' '));
  check('nothing written yet', await page.evaluate(() => PQ.db.getAll('questions').then(r => r.length)) === 0);
  await page.screenshot({ path: 'shot-import.png' });
  await modal.locator('button:has-text("Cancel")').click();
  check('Cancel changes nothing', await page.evaluate(() => PQ.db.getAll('questions').then(r => r.length)) === 0);
  await page.setInputFiles('#file-input', 'ui-export-original.pdf'); await modal.waitFor();
  await modal.locator('button:has-text("Apply")').click();
  await page.waitForSelector('.toast.ok');
  const after = await page.evaluate(async () => { const p = await PQ.collectPayload(); delete p.exportedAt; return JSON.parse(JSON.stringify(p)); });
  check('ROUND TRIP: export -> wipe -> import gives identical data', JSON.stringify(after) === JSON.stringify(before));
  check('list is back', (await page.locator('.qrow').count()) === 5);

  console.log('7. re-import and conflicts');
  await page.setInputFiles('#file-input', 'ui-export-original.pdf'); await modal.waitFor();
  check('importing the same file again says nothing to import', /Nothing to import/.test(await modal.innerText()));
  await modal.locator('button:has-text("OK")').click();
  // make one local copy OLDER than the file, and one NEWER
  const ids = await page.evaluate(async () => {
    const qs = await PQ.db.getAll('questions'); const a = qs[0], b = qs[1];
    a.prompt = 'OLD LOCAL ' + a.prompt; a.updated = '2020-01-01T00:00:00.000Z'; await PQ.db.put('questions', a);
    b.prompt = 'NEWER LOCAL ' + b.prompt; b.updated = '2099-01-01T00:00:00.000Z'; await PQ.db.put('questions', b);
    return [a.id, b.id];
  });
  await page.setInputFiles('#file-input', 'ui-export-original.pdf'); await modal.waitFor();
  const t2 = (await modal.innerText()).replace(/\s+/g, ' ');
  check('summary lists 1 replaced and 1 kept', /replaced by the version in the file/.test(t2) && /your copy is kept/.test(t2), t2);
  check('overwrite is a danger action and offers "Export my current bank first"', await modal.locator('button.danger:has-text("Apply (replaces 1)")').count() === 1 && await modal.locator('button:has-text("Export my current bank first")').count() === 1);
  await page.screenshot({ path: 'shot-conflict.png' });
  await modal.locator('button:has-text("Cancel")').click();
  check('Cancel left the old local copy alone', await page.evaluate(id => PQ.db.getAll('questions').then(r => r.find(q => q.id === id).prompt.startsWith('OLD LOCAL')), ids[0]));
  await page.setInputFiles('#file-input', 'ui-export-original.pdf'); await modal.waitFor();
  await modal.locator('button.danger').click(); await page.waitForSelector('.toast.ok >> nth=-1');
  const res = await page.evaluate(async ids => { const r = await PQ.db.getAll('questions'); return { a: r.find(q => q.id === ids[0]).prompt, b: r.find(q => q.id === ids[1]).prompt }; }, ids);
  check('older local copy replaced by the newer file copy', !/OLD LOCAL/.test(res.a), res.a);
  check('newer local copy kept (not overwritten by the older file)', /NEWER LOCAL/.test(res.b), res.b);

  console.log('8. refusing bad files');
  fs.writeFileSync('not-a-pdf.pdf', 'this is not a pdf');
  await page.setInputFiles('#file-input', 'not-a-pdf.pdf'); await modal.waitFor();
  check('non-PDF refused with a message, nothing changed', /not a PDF/.test(await modal.innerText()) && /Nothing was changed/.test(await modal.innerText()));
  await modal.locator('button:has-text("OK")').click();
  await page.pdf({ path: 'printed.pdf', format: 'Letter' });
  await page.setInputFiles('#file-input', 'printed.pdf'); await modal.waitFor();
  check('a printed/re-saved PDF explains why it has no data', /printed or re-saved/.test(await modal.innerText()));
  await modal.locator('button:has-text("OK")').click();
  const newerB64 = await page.evaluate(async () => { const p = await PQ.collectPayload(); p.schemaVersion = 2; const r = await PQ.buildBankPdf(p, {}); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode(...r.bytes.subarray(i, i + 32768)); return btoa(s); });
  fs.writeFileSync('newer.pdf', Buffer.from(newerB64, 'base64'));
  await page.setInputFiles('#file-input', 'newer.pdf'); await modal.waitFor();
  check('a bank from a newer schema is refused with a clear message', /newer Prime Questions/.test(await modal.innerText()), await modal.innerText());
  await modal.locator('button:has-text("OK")').click();
  const badB64 = await page.evaluate(async () => { const p = await PQ.collectPayload(); p.questions[0].type = 'essay'; const r = await PQ.buildBankPdf(p, {}); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode(...r.bytes.subarray(i, i + 32768)); return btoa(s); });
  fs.writeFileSync('invalid.pdf', Buffer.from(badB64, 'base64'));
  const countBefore = await page.evaluate(() => PQ.db.getAll('questions').then(r => r.length));
  await page.setInputFiles('#file-input', 'invalid.pdf'); await modal.waitFor();
  check('a structurally invalid bank is refused (nothing imported)', /unknown type/.test(await modal.innerText()) && /Nothing was imported/.test(await modal.innerText()), await modal.innerText());
  await modal.locator('button:has-text("OK")').click();
  check('none of the refused imports changed the bank', await page.evaluate(() => PQ.db.getAll('questions').then(r => r.length)) === countBefore);

  console.log('9. delete asks first, and Enter must not confirm it');
  await page.locator('.qrow').first().click();
  await page.click('#btn-delete');
  check('delete confirmation shown', /Delete this question/.test(await modal.innerText()));
  await page.keyboard.press('Enter');
  check('pressing Enter does NOT delete (focus starts on Cancel)', (await page.locator('.qrow').count()) === 5 && !(await modal.isVisible()));
  await page.click('#btn-delete'); await modal.locator('button:has-text("Delete question")').click(); await page.waitForFunction(() => PQ.state.questions.length === 4);
  check('confirmed delete removes it', (await page.locator('.qrow').count()) === 4);

  console.log('10. origin hygiene, network, errors');
  const foreign = await page.evaluate(async () => ({
    ls: localStorage.getItem('other-app:keep'),
    dbs: (await indexedDB.databases()).map(d => d.name).sort().join()
  }));
  check('foreign localStorage key untouched', foreign.ls === 'precious');
  check('foreign IndexedDB untouched; only "prime-questions" added', foreign.dbs === 'other-db,prime-questions', foreign.dbs);
  check('app only wrote prefixed localStorage keys', await page.evaluate(() => Object.keys(localStorage).filter(k => !k.startsWith('prime-questions:') && k !== 'other-app:keep').length === 0));
  check('zero network requests (offline the whole time)', requests.length === 0, requests);
  check('no console errors/warnings', problems.length === 0, problems);

  console.log('11. phone width');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.locator('.qrow').first().click();
  await page.screenshot({ path: 'shot-phone.png' });
  check('no horizontal page scroll at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]));

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
