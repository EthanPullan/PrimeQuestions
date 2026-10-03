// The site says "assessment", never "test", wherever a person can read it: every page, menu, dialog, the printed paper and the
// bank PDF's readable pages. (The folder "tests/" and stored field names are not visible text and are not checked here.)
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  page.setDefaultTimeout(8000);
  await openApp(page);
  const modal = page.locator('.modal');
  const WORD = /\btests?\b/i;
  const seen = [], bad = [];
  const look = async (label, sel) => {
    const t = await page.evaluate(sel => Array.from(document.querySelectorAll(sel || 'body')).map(e => e.innerText + ' ' + Array.from(e.querySelectorAll('[aria-label],[placeholder],[title]')).map(x => [x.getAttribute('aria-label'), x.getAttribute('placeholder'), x.getAttribute('title')].join(' ')).join(' ')).join('\n'), sel || '#root');
    seen.push(label); const m = WORD.exec(t); if (m) bad.push(label + ': …' + t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') + '…');
  };
  const lookModal = async label => { const t = await modal.innerText(); seen.push(label); const m = WORD.exec(t); if (m) bad.push(label + ': …' + t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') + '…'); };

  // one bank, a few questions, one assessment
  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString();
    const mk = (id, type, prompt, answer) => Object.assign(PQ_.emptyQuestion(type, PQ_.DEFAULT_BANK_ID), { id, prompt, answer, status: 'ready' });
    const qs = [mk('a', 'mc', 'Pick one', { options: ['x', 'y', 'z', 'w'], correct: 0 }), mk('b', 'numeric', 'How many', { value: '3', units: '', tolerance: 0 })];
    const as = { id: 'as1', title: '', course: '', questionIds: ['a', 'b'], seed: 5, created: t, updated: t };
    await PQ_.db.applyBatch({ questions: qs, tests: [as] }); await PQ_.loadAll();
  });
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);

  console.log('1. pages');
  await look('Home');
  check('the sidebar says Assessments', (await page.locator('#nav-tests').innerText()).trim().endsWith('Assessments'));
  check('Home has a New Assessment tile', /New Assessment/.test(await page.locator('#tile-new-test').innerText()));
  await page.click('#nav-tests'); await look('Assessments page');
  check('the Assessments page title and its card for an untitled one say Assessment', /Assessments/.test(await page.locator('#page-tests h2').innerText()) && /Untitled Assessment/.test(await page.locator('#page-tests').innerText()));
  await page.click('#nav-banks'); await look('Question Banks'); await page.locator('.card-tile .ct-main').first().click(); await look('bank page');
  await page.click('#btn-new'); await page.click('#new-multipart'); await look('question editor');
  await page.click('#btn-close').catch(() => {});
  await page.click('#nav-imports'); await look('Imports');

  console.log('2. the assessment editor, its menus and dialogs');
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .tp-q');
  await look('editor'); 
  check('the editor shows Untitled Assessment as the name and in the title box', (await page.locator('#exam-name').innerText()) === 'Untitled Assessment' && (await page.locator('#f-test-title').getAttribute('placeholder')) === 'Untitled Assessment');
  check('the back button says Assessments and the version tabs say Version A / Version B', (await page.locator('#btn-back-tests').innerText()).includes('Assessments') && (await page.locator('#pv-a').innerText()) === 'Version A' && (await page.locator('#pv-b').innerText()) === 'Version B');
  for (const [id, label] of [['menu-file', 'File'], ['menu-edit', 'Edit'], ['menu-format', 'Format'], ['btn-print', 'Print']]) { await page.click('#' + id); await look(label + ' menu', '.menu'); await page.keyboard.press('Escape'); }
  await page.click('#menu-format'); for (const sub of ['mi-style', 'mi-margins', 'mi-paper']) { await page.click('#' + sub); await look(sub + ' submenu', '.submenu'); }
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.click('#menu-file'); check('File > Delete this assessment', (await page.locator('#mi-delete').innerText()).includes('Delete this assessment')); await page.keyboard.press('Escape');
  await page.click('#btn-check'); await lookModal('Check'); await page.keyboard.press('Escape');
  await page.click('#btn-history'); await look('History panel', '.exam-panel'); await page.click('#btn-history-close');
  await page.locator('#sheet-preview .tp-q').first().click({ button: 'right', position: { x: 60, y: 8 } }); await look('question menu', '.menu'); await page.keyboard.press('Escape');
  await page.click('#panel-new'); await page.click('#pnew-tf'); await look('new question in the panel', '.exam-panel'); await page.locator('.exam-panel #btn-close').click();
  await page.click('#f-test-title'); await page.keyboard.type('x'); await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  await page.click('#menu-file'); await page.click('#mi-delete'); await lookModal('Delete dialog');
  check('the delete dialog says Delete this assessment', /Delete this assessment\?/.test(await modal.innerText()) && await modal.locator('button:has-text("Delete assessment")').count() === 1);
  await modal.locator('button:has-text("Cancel")').click();
  await page.click('#pv-b'); await look('Version B preview', '#sheet-preview'); await page.click('#pv-ka'); await look('answer key preview', '#sheet-preview');
  await page.click('#pv-a');

  console.log('3. bank deletion, import summary, printed paper and the bank PDF');
  await page.click('#btn-back-tests'); await page.click('#nav-banks');
  await page.locator('#page-banks .card-tile').first().locator('button:has-text("Delete")').click(); await lookModal('Delete bank dialog'); await modal.locator('button:has-text("Cancel")').click();
  await page.evaluate(async () => { await PQ.preparePrint('test', 'A', Object.assign({}, PQ.state.tests[0], { title: '' })); }); await page.pdf({ path: 'w-print.pdf', preferCSSPageSize: true });
  const printed = execFileSync('pdftotext', ['-layout', 'w-print.pdf', '-']).toString();
  check('the printed paper has no "test" and an untitled one is headed Untitled Assessment', !WORD.test(printed) && /Untitled Assessment/.test(printed), printed.slice(0, 200));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#btn-export')]);
  await dl.saveAs('w-bank.pdf'); await page.waitForSelector('.toast.ok');
  const bankText = execFileSync('pdftotext', ['-layout', 'w-bank.pdf', '-']).toString();
  check('the bank PDF\'s readable pages say "Saved Assessments" and never "test"', /Saved Assessments/.test(bankText) && !WORD.test(bankText), bankText.match(/.{0,40}\btests?\b.{0,40}/i));
  await page.click('#nav-imports'); await page.setInputFiles('#file-input', 'w-bank.pdf').catch(() => {});
  await page.waitForTimeout(300);
  if (await modal.count()) { await lookModal('import summary'); await modal.locator('button:has-text("Cancel"), button:has-text("OK")').first().click(); }
  const edit = await page.evaluate(async () => { const p = await PQ.collectPayload(); p.tests[0].title = 'Kept as typed'; return Array.isArray(p.tests); });
  check('stored field names are unchanged (a file written before this change still imports: see the fixtures in the other scripts)', edit);

  check('no visible text on any of ' + seen.length + ' pages, menus and dialogs says "test"', bad.length === 0, bad.slice(0, 6));
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);
  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
