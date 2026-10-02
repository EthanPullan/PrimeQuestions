// Phase 3: question banks, the Home/Tests/Banks/Imports pages, the Multipart type, the equation dialog and backtick typing,
// the test editor (paper + bank panel, drag and drop, undo/redo, menus, check, history) and printing the new page options.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

const FIX2 = path.join(__dirname, 'fixtures', 'bank-schema2-v0.2.0.pdf');
const pdfPage = (file, n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', file, '-']).toString();
const pdfAll = file => execFileSync('pdftotext', ['-layout', file, '-']).toString();
const pdfInfo = file => execFileSync('pdfinfo', [file]).toString();

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  page.setDefaultTimeout(8000);
  await openApp(page);
  const modal = page.locator('.modal');
  const toastText = async () => (await page.locator('.toast').allInnerTexts()).join(' | ');
  const stat = async () => (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ');
  const bankCards = () => page.locator('#page-banks .card-tile[data-id]');
  const openBankNamed = async name => { await page.click('#nav-banks'); await page.locator('#page-banks .card-tile', { hasText: name }).locator('.ct-main').click(); await page.waitForSelector('#page-bank'); };
  const newQ = async t => { await page.click('#btn-new'); await page.click('#new-' + t); };
  const D = () => page.evaluate(() => PQ.active.exam.getDraft());
  const ids = () => page.evaluate(() => PQ.active.exam.getDraft().questionIds.slice());
  const settled = () => page.waitForFunction(() => { const e = document.querySelector('.exam'); return e && e.dataset.busy === '0'; });
  const promptOrder = async () => { await settled(); return page.locator('#sheet-preview .tp-q .tp-prompt').allInnerTexts(); };
  const saveTest = async () => { await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty()); };
  const openHistory = async () => { await page.click('#btn-history'); await page.waitForSelector('.vcard, #history-empty'); };

  console.log('1. Home, Tests, Question Banks, Imports');
  check('the app opens on Home with a New Test tile, the default bank and a New Question Bank tile', await page.locator('#page-home #tile-new-test').isVisible() && /My Questions/.test(await page.locator('#page-home').innerText()) && await page.locator('#page-home #tile-new-bank').isVisible());
  check('Home labels the default bank "My Questions" and shows no confusing 2000 date', !/2000/.test(await page.locator('#page-home').innerText()));
  for (const n of ['tests', 'banks', 'imports', 'home']) { await page.click('#nav-' + n); check('sidebar: ' + n + ' page opens and is marked current', await page.locator('#page-' + n).isVisible() && (await page.locator('#nav-' + n).getAttribute('aria-current')) === 'page'); }
  await page.click('#nav-imports');
  check('Imports shows a drop zone, a Choose button, how it works and an empty log', await page.locator('#drop-zone').isVisible() && await page.locator('#btn-choose-import').isVisible() && await page.locator('#import-log-empty').isVisible());

  console.log('2. banks: create, rename, move a question, delete');
  await page.click('#nav-banks'); await page.click('#btn-new-bank');
  await page.fill('#prompt-input', 'Chemistry 10'); await modal.locator('button:has-text("Create")').click();
  await page.waitForSelector('#page-bank');
  check('a new bank opens its workspace, empty, named as typed', (await page.locator('#bank-name').innerText()) === 'Chemistry 10' && /No questions in this bank yet/.test(await page.locator('.qlist').innerText()));
  await page.click('#btn-rename-bank'); await page.fill('#prompt-input', 'Chemistry 11'); await modal.locator('button:has-text("Rename")').click();
  await page.waitForFunction(() => document.getElementById('bank-name').innerText === 'Chemistry 11');
  check('rename updates the title and the stored bank', await page.evaluate(() => PQ.state.banks.some(b => b.name === 'Chemistry 11')));
  // a question in this bank (through the editor)
  await newQ('tf'); await page.fill('#f-prompt', 'Sodium is a metal.'); await page.click('.seg button:has-text("True")'); await page.selectOption('#f-status', 'ready'); await page.click('#btn-save');
  await page.waitForFunction(() => PQ.state.questions.length === 1);
  const q1 = await page.evaluate(() => PQ.state.questions[0]);
  check('a question created in a bank gets that bank id', q1.bankId === (await page.evaluate(() => PQ.state.banks.find(b => b.name === 'Chemistry 11').id)));
  await page.click('#nav-banks');
  check('the bank card counts its questions', /1 question/.test(await page.locator('#page-banks .card-tile', { hasText: 'Chemistry 11' }).innerText()) && /0 questions/.test(await page.locator('#page-banks .card-tile', { hasText: 'My Questions' }).innerText()));
  // move to another bank with the Question bank select
  await openBankNamed('Chemistry 11'); await page.locator('.qrow').first().click();
  await page.selectOption('#f-bank', { label: 'My Questions' }); await page.click('#btn-save');
  await page.waitForFunction(() => PQ.state.questions[0].bankId === PQ.DEFAULT_BANK_ID);
  check('changing the Question bank select moves the question and it leaves the old list', (await page.locator('.qrow').count()) === 0);
  await page.click('#nav-banks');
  check('counts follow the move', /1 question/.test(await page.locator('#page-banks .card-tile', { hasText: 'My Questions' }).innerText()));
  // a stimulus does not follow a question into another bank
  await openBankNamed('My Questions'); await page.click('#tab-stimuli'); await page.click('#btn-new'); await page.fill('#f-title', 'Passage'); await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.stimuli.length === 1);
  await page.click('#tab-questions'); await page.locator('.qrow').first().click(); await page.selectOption('#f-stimulus', { index: 1 });
  await page.selectOption('#f-bank', { label: 'Chemistry 11' });
  check('moving a question to another bank drops a stimulus of the old bank and says so', (await page.inputValue('#f-stimulus')) === '' && /belongs to the previous bank/.test(await toastText()));
  check('the Shared stimulus list only offers the chosen bank\'s stimuli', (await page.locator('#f-stimulus option').count()) === 1);
  await page.selectOption('#f-bank', { label: 'My Questions' }); await page.selectOption('#f-stimulus', { index: 1 }); await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.questions[0].stimulusId);
  // delete a bank: cancel, then confirm; it removes its questions and takes them out of tests
  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString(), b = PQ_.state.banks.find(x => x.name === 'Chemistry 11');
    const q = PQ_.emptyQuestion('tf', b.id); q.prompt = 'In bank to delete'; q.answer = { correct: false }; q.status = 'ready';
    const test = { id: PQ_.uuid(), title: 'T', course: '', questionIds: [q.id, PQ_.state.questions[0].id], seed: 5, created: t, updated: t };
    await PQ_.db.applyBatch({ questions: [q], tests: [test] }); await PQ_.loadAll();
  });
  await page.click('#nav-banks');
  await page.locator('#page-banks .card-tile', { hasText: 'Chemistry 11' }).locator('button:has-text("Delete")').click();
  const dt = (await modal.innerText()).replace(/\s+/g, ' ');
  check('delete asks first and says how many questions and tests are affected', /Delete this question bank/.test(dt) && /1 question/.test(dt) && /1 saved test/.test(dt), dt);
  await page.keyboard.press('Enter');
  check('Enter does not confirm a bank delete (focus starts on Cancel)', (await page.evaluate(() => PQ.state.banks.length)) === 2 && !(await modal.isVisible()));
  await page.locator('#page-banks .card-tile', { hasText: 'Chemistry 11' }).locator('button:has-text("Delete")').click(); await modal.locator('button:has-text("Delete bank")').click();
  await page.waitForFunction(() => PQ.state.banks.length === 1);
  const after = await page.evaluate(() => ({ q: PQ.state.questions.map(q => q.prompt), t: PQ.state.tests[0].questionIds.length }));
  check('deleting a bank removes its questions and takes them out of saved tests, the rest is kept', after.q.length === 1 && !after.q.includes('In bank to delete') && after.t === 1, after);
  await page.evaluate(async () => { await PQ.db.applyBatch({ deletes: { tests: PQ.state.tests.map(t => t.id) } }); await PQ.loadAll(); });

  console.log('3. per-bank export and import of a bank from the previous version');
  // a second bank with one question, so a per-bank export has something to exclude
  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString(), b = { id: PQ_.uuid(), name: 'Physics: Waves & Sound', created: t, updated: t };
    const q = PQ_.emptyQuestion('numeric', b.id); q.prompt = 'Speed of sound?'; q.answer = { value: '343', units: 'm/s', tolerance: 1 }; q.status = 'ready';
    await PQ_.db.applyBatch({ banks: [b], questions: [q] }); await PQ_.loadAll();
  });
  await openBankNamed('Physics');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#btn-export-bank')]);
  const bname = dl.suggestedFilename(); await dl.saveAs('bank-one.pdf'); await page.waitForSelector('.toast.ok');
  check('a per-bank export is named after the bank (safe characters only)', /^prime-questions-physics-waves-sound-\d{4}-\d{2}-\d{2}\.pdf$/.test(bname), bname);
  fs.rmSync('b1', { recursive: true, force: true }); fs.mkdirSync('b1'); execFileSync('pdfdetach', ['-saveall', '-o', 'b1', 'bank-one.pdf']);
  const p1 = JSON.parse(fs.readFileSync('b1/prime-questions.pq', 'utf8'));
  check('the per-bank file holds only that bank, its question and no tests', p1.schemaVersion === 4 && p1.banks.length === 1 && p1.banks[0].name === 'Physics: Waves & Sound' && p1.questions.length === 1 && p1.tests.length === 0, [p1.banks.length, p1.questions.length, p1.tests.length]);
  check('a per-bank export does not count as "Last backup"', /Last backup: never/.test(await stat()), await stat());
  check('the bank PDF names the bank on its readable pages', /Physics: Waves & Sound/.test(pdfAll('bank-one.pdf')));
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#btn-export')]);
  await dl2.saveAs('bank-all.pdf'); await page.waitForSelector('.toast.ok >> nth=-1');
  check('Export everything still counts as a backup', /Last backup: today/.test(await stat()));
  fs.rmSync('b2', { recursive: true, force: true }); fs.mkdirSync('b2'); execFileSync('pdfdetach', ['-saveall', '-o', 'b2', 'bank-all.pdf']);
  const pAll = JSON.parse(fs.readFileSync('b2/prime-questions.pq', 'utf8'));
  check('the full export has both banks', pAll.banks.length === 2 && pAll.questions.length === 2, pAll.banks.map(b => b.name));
  // wipe, import the per-bank file: it merges into a fresh install next to the default bank
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.click('#nav-imports');
  await page.setInputFiles('#file-input', 'bank-one.pdf'); await modal.waitFor();
  const sum1 = (await modal.innerText()).replace(/\s+/g, ' ');
  check('the import summary has a row for question banks (1 new) as well as questions', /Question banks 1 0 0 0/.test(sum1) && /Questions 1 0 0 0/.test(sum1), sum1);
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.banks.length === 2);
  check('the imported bank appears next to My Questions', await page.evaluate(() => PQ.state.banks.map(b => b.name).sort().join('|')) === 'My Questions|Physics: Waves & Sound');
  check('the Imports page logs the file with what was added', /bank-one\.pdf/.test(await page.locator('#import-log').innerText()) && /1 bank/.test(await page.locator('#import-log').innerText()), await page.locator('#page-imports').innerText());
  // a bank file from the previous version (schema 2, app 0.2.0)
  await page.setInputFiles('#file-input', FIX2); await modal.waitFor();
  const sum2 = (await modal.innerText()).replace(/\s+/g, ' ');
  check('a schema 2 file (app 0.2.0) is accepted; its questions go into the default bank', /Import this bank/.test(sum2) && /Questions \d+ 0 0 0/.test(sum2), sum2);
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.questions.length > 1);
  check('everything from the old file is in "My Questions" (no orphans without a bank)', await page.evaluate(() => PQ.state.questions.every(q => PQ.state.banks.some(b => b.id === q.bankId)) && PQ.state.stimuli.every(s => PQ.state.banks.some(b => b.id === s.bankId))));
  check('importing the same old file twice changes nothing', await (async () => { await page.setInputFiles('#file-input', FIX2); await modal.waitFor(); const t = await modal.innerText(); await modal.locator('button:has-text("OK")').click(); return /Nothing to import/.test(t); })());
  // drop a file anywhere on the page
  const b64 = fs.readFileSync('bank-all.pdf').toString('base64');
  await page.evaluate(async b64 => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'dropped.pdf', { type: 'application/pdf' }));
    window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, b64);
  await modal.waitFor();
  check('dropping a PDF on the page opens the import summary', /Import this bank/.test(await modal.innerText()));
  await modal.locator('button:has-text("Cancel")').click();

  console.log('4. the equation dialog and typing between backticks');
  await page.click('#nav-banks'); await page.locator('#page-banks .card-tile', { hasText: 'My Questions' }).locator('.ct-main').click();
  await newQ('mc');
  await page.click('#f-prompt'); await page.keyboard.type('Solve ');
  await page.click('#btn-equation');
  check('Equation opens a dialog with a preview, a LaTeX line and a symbol palette', await modal.locator('#eq-input').isVisible() && await modal.locator('#eq-preview').isVisible() && await modal.locator('#eq-grid button').count() > 5 && /Equation/.test(await modal.locator('h3').innerText()));
  check('Insert is disabled until there is something that renders', await modal.locator('.btn.primary').isDisabled());
  await page.fill('#eq-input', '(x+1)/(x-2) = sqrt(3)');
  await page.waitForSelector('#eq-preview math');
  const tex = await page.locator('#eq-tex').innerText();
  check('natural typing is converted live to LaTeX and drawn as MathML', /\\frac\{x\+1\}\{x-2\}/.test(tex) && /\\sqrt\{3\}/.test(tex) && (await page.locator('#eq-preview math').count()) === 1, tex);
  await page.click('#eq-input'); await page.keyboard.press('End');
  await modal.locator('.seg button:has-text("Greek")').click(); await modal.locator('#eq-grid button:text-is("π")').click();
  check('a palette symbol is inserted into the equation at the caret', /π$/.test(await page.inputValue('#eq-input')));
  await page.fill('#eq-input', '(x+1)/(x-2) = sqrt(3)');
  await modal.locator('.btn.primary').click();
  const f1 = await page.inputValue('#f-prompt');
  check('Insert puts \\( … \\) into the text box where the caret was', /^Solve \\\(.*\\frac\{x\+1\}\{x-2\}.*\\\)$/.test(f1), f1);
  await page.waitForSelector('#preview math');
  check('the question preview draws the equation', (await page.locator('#preview math').count()) >= 1);
  // editing an equation that is already there
  await page.fill('#f-prompt', 'a \\(x^2\\) b');
  await page.evaluate(() => { const t = document.getElementById('f-prompt'); t.focus(); t.setSelectionRange(5, 5); });
  await page.click('#btn-equation');
  check('with the caret inside an equation the dialog edits that one (LaTeX shown as is)', /Edit equation/.test(await modal.locator('h3').innerText()) && (await page.inputValue('#eq-input')) === 'x^2' && await page.locator('#eq-raw').isChecked());
  await page.fill('#eq-input', 'x^3'); await modal.locator('.btn.primary').click();
  check('Update replaces just that equation', (await page.inputValue('#f-prompt')) === 'a \\(x^3\\) b', await page.inputValue('#f-prompt'));
  await page.evaluate(() => { const t = document.getElementById('f-prompt'); t.focus(); t.setSelectionRange(0, 0); });
  await page.click('#btn-equation'); await page.check('#eq-raw'); await page.fill('#eq-input', '\\frac{1}{');
  await page.waitForTimeout(150);
  check('broken LaTeX shows the error and disables Insert', (await page.locator('#eq-error').innerText()).length > 3 && await modal.locator('.btn.primary').isDisabled());
  await page.keyboard.press('Escape');
  check('Escape closes the dialog and changes nothing', !(await modal.isVisible()) && (await page.inputValue('#f-prompt')) === 'a \\(x^3\\) b');
  // backticks
  await page.fill('#f-prompt', ''); await page.click('#f-prompt');
  await page.keyboard.type('Half is `1/2` and it costs $5, `x^2');
  const f2 = await page.inputValue('#f-prompt');
  check('typing `1/2` converts when the closing backtick is typed; dollars and an unclosed backtick are left alone', f2 === 'Half is \\(\\frac{1}{2}\\) and it costs $5, `x^2', f2);
  await page.keyboard.type('`');
  check('closing the second backtick converts that one too', /\\\(x\^\{?2\}?\\\)$/.test(await page.inputValue('#f-prompt')), await page.inputValue('#f-prompt'));
  await page.fill('input[aria-label="Option A"]', 'x'); await page.click('input[aria-label="Option A"]'); await page.keyboard.press('End'); await page.keyboard.type(' `a/b`');
  check('backticks work in option fields too', /\\\(\\frac\{a\}\{b\}\\\)/.test(await page.inputValue('input[aria-label="Option A"]')), await page.inputValue('input[aria-label="Option A"]'));
  await page.click('#btn-close'); await modal.locator('button:has-text("Discard changes")').click();

  console.log('5. Multipart questions');
  await newQ('multipart');
  check('a new Multipart question starts with two parts and a "Shared introduction" box', (await page.locator('.part-card').count()) === 2 && /shared introduction/i.test(await page.locator('label[for=f-prompt]').innerText()));
  await page.fill('#f-prompt', 'A car travels 120 km in 2 h.');
  await page.fill('#p0-prompt', 'Which is the average speed?');
  await page.fill('input[aria-label="Part (a) Option A"]', '60 km/h'); await page.fill('input[aria-label="Part (a) Option B"]', '240 km/h'); await page.fill('input[aria-label="Part (a) Option C"]', 'Both A and B'); await page.fill('input[aria-label="Part (a) Option D"]', 'None of the above');
  await page.check('input[aria-label="Part (a) Option A is correct"]');
  check('each part has its own correct-answer radio group', await page.locator('input[name=correctp0-]').count() === 4 && await page.locator('input[name=correctp1-]').count() === 0);
  await page.check('#p0-keeporder');
  check('a problem in a part is named by its part and field', /Part \(b\) Question text/.test(await page.locator('#problems').innerText()), await page.locator('#problems').innerText());
  await page.fill('#p1-prompt', 'Explain how you found it.'); await page.fill('#p1-lines', '3');
  await page.selectOption('#add-part-type', 'numeric'); await page.click('#btn-add-part');
  check('Add part appends a part of the chosen type', (await page.locator('.part-card').count()) === 3 && await page.locator('#p2-value').isVisible());
  await page.fill('#p2-prompt', 'How far in 5 h?'); await page.fill('#p2-value', '300'); await page.fill('#p2-units', 'km');
  await page.click('button[aria-label="Move part (c) up"]');
  const order = await page.evaluate(() => PQ.active.qed.getDraft().answer.parts.map(p => p.type).join());
  check('Move part swaps two parts', order === 'mc,numeric,short', order);
  await page.selectOption('#p2-type', 'tf');
  check('changing a part type shows that type\'s answer controls', await page.locator('.part-card[data-part="2"] .seg').isVisible());
  await page.selectOption('#p2-type', 'short');
  check('switching a part\'s type back keeps what was typed', (await page.inputValue('#p2-lines')) === '3');
  await page.click('button[aria-label="Remove part (c)"]');
  check('Remove part takes it out', (await page.locator('.part-card').count()) === 2);
  await page.click('#btn-add-part'); await page.click('#btn-add-part');
  for (let i = 0; i < 12; i++) { if (await page.locator('#btn-add-part').isDisabled()) break; await page.click('#btn-add-part'); }
  check('at most 12 parts', (await page.locator('.part-card').count()) === 12 && await page.locator('#btn-add-part').isDisabled());
  for (let i = 11; i >= 3; i--) await page.click('button[aria-label="Remove part (' + String.fromCharCode(97 + i) + ')"]');
  check('after removing extra parts, three remain', (await page.locator('.part-card').count()) === 3);
  check('the Add part menu remembers the type last chosen', (await page.inputValue('#add-part-type')) === 'numeric');
  await page.selectOption('#p1-type', 'short'); await page.fill('#p1-prompt', 'Explain how you found it.'); await page.fill('#p1-lines', '3');
  await page.selectOption('#p2-type', 'numeric'); await page.fill('#p2-prompt', 'How far in 5 h?'); await page.fill('#p2-value', '300'); await page.fill('#p2-units', 'km');
  await page.waitForTimeout(200);
  check('the preview shows the introduction and (a) (b) (c)', /A car travels/.test(await page.locator('#preview').innerText()) && /\(a\)/.test(await page.locator('#preview').innerText()) && /\(c\)/.test(await page.locator('#preview').innerText()));
  await page.selectOption('#f-status', 'ready'); await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.questions.some(q => q.type === 'multipart'));
  const mp = await page.evaluate(() => PQ.state.questions.find(q => q.type === 'multipart'));
  check('saved multipart question: 3 parts in order, keepOrder only where ticked, no keepOrder on the question', mp.answer.parts.map(p => p.type).join() === 'mc,short,numeric' && mp.answer.parts[0].keepOrder === true && !('keepOrder' in mp.answer.parts[1]) && !('keepOrder' in mp) && mp.answer.parts[2].answer.value === '300', mp.answer.parts.map(p => [p.type, p.keepOrder]));
  check('the bank list tags it PARTS', /PARTS/.test(await page.locator('.qrow').first().innerText()));
  check('a multipart question has no other-type fields leaking in (no top-level options)', await page.evaluate(() => !('options' in PQ.state.questions.find(q => q.type === 'multipart').answer)));

  console.log('6. the test editor: building the paper');
  // data for the editor: a few questions, one stimulus group, in the default bank; plus a question in a second bank
  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString(), B1 = PQ_.DEFAULT_BANK_ID;
    const other = PQ_.state.banks.find(b => b.id !== B1);
    const mk = (type, prompt, answer, extra, bank) => Object.assign(PQ_.emptyQuestion(type, bank || B1), { prompt, answer, status: 'ready' }, extra || {});
    const stim = { id: PQ_.uuid(), bankId: B1, title: 'Circuit', text: 'A circuit has a 12 V battery.', imageIds: [], table: null, created: t, updated: t };
    const qs = [
      mk('mc', 'Alpha question', { options: ['a1', 'a2', 'a3', 'a4'], correct: 0 }),
      mk('tf', 'Beta question', { correct: true }),
      mk('mc', 'Gamma on the circuit', { options: ['g1', 'g2', 'g3'], correct: 1 }, { stimulusId: stim.id }),
      mk('numeric', 'Delta on the circuit', { value: '12', units: 'V', tolerance: 0 }, { stimulusId: stim.id }),
      mk('short', 'Epsilon question', { lines: 3, rubric: 'ok' }),
      mk('tf', 'Zeta in other bank', { correct: false }, null, other.id)
    ];
    await PQ_.db.applyBatch({ stimuli: [stim], questions: qs }); await PQ_.loadAll();
  });
  await page.evaluate(async () => { await PQ.db.applyBatch({ deletes: { tests: PQ.state.tests.map(t => t.id) } }); await PQ.loadAll(); });   // the old file brought a test; start from none
  await page.click('#nav-tests'); await page.click('#tile-new-test'); await page.waitForSelector('#sheet-preview .sheet');
  check('a new test opens full screen: the sidebar is hidden, menus File/Edit/Format, undo/redo, Check, History, Print, Save', !(await page.locator('#nav-home').isVisible()) && await page.locator('#menu-file, #menu-edit, #menu-format, #btn-undo, #btn-redo, #btn-check, #btn-history, #btn-print, #btn-save').count() === 9);
  check('the paper shows an empty drop target and Undo/Redo/Save are disabled', await page.locator('#tp-empty').isVisible() && await page.locator('#btn-undo').isDisabled() && await page.locator('#btn-redo').isDisabled() && await page.locator('#btn-save').isDisabled());
  const tabNames = await page.locator('.ep-tab').allInnerTexts();
  check('the bank panel opens the first bank, with + to open others', tabNames.length === 1 && await page.locator('#btn-open-bank').isVisible(), tabNames);
  await page.click('#btn-open-bank'); await page.locator('.menu-item', { hasText: 'Physics' }).click();
  check('+ opens another bank as a second tab and shows its questions', (await page.locator('.ep-tab').count()) === 2 && /Speed of sound/.test(await page.locator('#panel-list').innerText()));
  await page.locator('.ep-tab', { hasText: 'Physics' }).locator('.ep-x').click();
  check('× closes a bank tab (never the last one)', (await page.locator('.ep-tab').count()) === 1 && (await page.locator('.ep-tab .ep-x').count()) === 0);
  // add by button
  const card = t => page.locator('#panel-list .qcard', { hasText: t });
  await card('Alpha').locator('button.primary').click();
  check('+ Add puts the question on the paper as number 1', (await promptOrder()).join() === 'Alpha question' && /Added/.test(await card('Alpha').innerText()));
  check('an added card cannot be added or dragged again', await card('Alpha').locator('button.primary').count() === 0 && (await card('Alpha').getAttribute('draggable')) === null);
  // drag a card onto the paper, before and after
  await card('Beta').dragTo(page.locator('#sheet-preview .tp-block').first(), { targetPosition: { x: 120, y: 4 } });
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds.length === 2);
  check('dragging a card above a question inserts it there', (await promptOrder()).join() === 'Beta question,Alpha question', (await promptOrder()).join());
  await card('Epsilon').dragTo(page.locator('#sheet-preview'), { targetPosition: { x: 300, y: 700 } });
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds.length === 3);
  check('dragging to the bottom of the paper appends', (await promptOrder()).join() === 'Beta question,Alpha question,Epsilon question', (await promptOrder()).join());
  // stimulus: first question goes where dropped, the second joins it wherever it is dropped
  await card('Gamma').dragTo(page.locator('#sheet-preview .tp-block').nth(1), { targetPosition: { x: 120, y: 4 } });
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds.length === 4);
  await card('Delta').dragTo(page.locator('#sheet-preview .tp-block').last(), { targetPosition: { x: 120, y: 30 } });
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds.length === 5);
  check('a question that shares a stimulus joins that stimulus\'s group wherever it is dropped', (await promptOrder()).join() === 'Beta question,Gamma on the circuit,Delta on the circuit,Alpha question,Epsilon question', (await promptOrder()).join());
  const flat = await page.evaluate(() => PQ.active.exam.getDraft().questionIds.map(id => PQ.state.questions.find(q => q.id === id).prompt.split(' ')[0]));
  check('the saved order itself keeps the group together (not just the printed one) and a toast said so', flat.join() === 'Beta,Gamma,Delta,Alpha,Epsilon' && /share its stimulus/.test(await toastText()), flat);
  check('the group prints with its stimulus and the "Use the information below" line', /Use the information below to answer questions 2 to 3\./.test(await page.locator('#sheet-preview').innerText()) && /12 V battery/.test(await page.locator('#sheet-preview').innerText()));
  check('the questions are numbered 1 to 5 on the paper', (await page.locator('#sheet-preview .tp-num').allInnerTexts()).join() === '1.,2.,3.,4.,5.');
  // moving blocks: handle drag, arrows
  await page.locator('#sheet-preview .tp-block').nth(1).locator('.tp-stim .ed-handle').dragTo(page.locator('#sheet-preview .tp-block').first(), { targetPosition: { x: 120, y: 4 } });
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds[0] !== undefined && PQ.state.questions.find(q => q.id === PQ.active.exam.getDraft().questionIds[0]).prompt === 'Gamma on the circuit');
  check('dragging a block\'s handle moves the whole block (stimulus and its questions)', (await promptOrder()).join() === 'Gamma on the circuit,Delta on the circuit,Beta question,Alpha question,Epsilon question', (await promptOrder()).join());
  await page.click('button[aria-label="Move the stimulus group down"]');
  check('the group arrows move the block', (await promptOrder()).join() === 'Beta question,Gamma on the circuit,Delta on the circuit,Alpha question,Epsilon question', (await promptOrder()).join());
  await page.click('button[aria-label="Move question 2 down"]');
  check('inside a group the arrows reorder its questions only', (await promptOrder()).join() === 'Beta question,Delta on the circuit,Gamma on the circuit,Alpha question,Epsilon question', (await promptOrder()).join());
  check('the first block cannot move up, the last cannot move down', await page.locator('button[aria-label="Move question 1 up"]').isDisabled() && await page.locator('button[aria-label="Move question 5 down"]').isDisabled());
  const joined = await ids(); const sorted = joined.slice();
  check('every question is on the paper once', new Set(joined).size === 5 && joined.length === 5 && sorted.length === 5);
  await page.click('button[aria-label="Remove question 1 from the test"]');
  check('× removes a question from the paper and its card is available again', (await page.locator('#sheet-preview .tp-q').count()) === 4 && (await card('Beta').locator('button.primary').count()) === 1);
  // a card dragged from a different place cannot be dropped twice
  await card('Beta').locator('button.primary').click();
  check('+ Add after a remove puts it back at the end', (await promptOrder()).pop() === 'Beta question');

  console.log('7. undo and redo');
  const n0 = (await ids()).length;
  await page.click('#btn-undo');
  check('Undo reverses the last change (the re-add)', (await ids()).length === n0 - 1 && await page.locator('#btn-redo').isEnabled());
  await page.click('#btn-redo');
  check('Redo puts it back', (await ids()).length === n0 && await page.locator('#btn-redo').isDisabled());
  await page.click('#btn-undo'); await page.click('#btn-undo');
  check('Undo steps back through block moves and removals', (await promptOrder()).join() === 'Beta question,Delta on the circuit,Gamma on the circuit,Alpha question,Epsilon question', (await promptOrder()).join());
  await page.keyboard.press('Control+y'); await page.keyboard.press('Control+y');
  check('Ctrl+Y redoes and Ctrl+Z undoes from the keyboard', (await ids()).length === n0, await ids());
  await page.keyboard.press('Control+z');
  check('Ctrl+Z undoes', (await ids()).length === n0 - 1);
  await page.keyboard.press('Control+Shift+z');
  check('Ctrl+Shift+Z redoes', (await ids()).length === n0);
  await page.locator('#panel-list .qcard', { hasText: 'Zeta' }).count();
  await page.click('#btn-undo');
  await card('Beta').locator('button.primary').click();    // a new change clears the redo stack
  check('a new change after an undo clears Redo', await page.locator('#btn-redo').isDisabled());
  // typing merges into one undo step
  const d0 = (await D()).title;
  await page.click('#f-test-title'); await page.keyboard.type('Matter Test');
  check('typing a title marks the test unsaved and updates the title in the top bar', /Unsaved/.test(await page.locator('#dirty-flag').innerText()) && (await page.locator('#exam-name').innerText()) === 'Matter Test');
  await page.click('#btn-undo');
  check('one Undo removes the whole typed title (typing is one step)', (await D()).title === d0 && (await page.inputValue('#f-test-title')) === d0, (await D()).title);
  await page.click('#btn-redo');
  check('Redo brings the title back', (await D()).title === 'Matter Test' && (await page.inputValue('#f-test-title')) === 'Matter Test');

  console.log('8. editing on the paper: course, instructions, Name / Class / Date, paper size');
  await page.fill('#f-test-course', 'Science 9');
  check('Name and Date lines are on by default, Class is off (shown dimmed)', await page.locator('#sheet-preview .tp-line[data-line=name]').getAttribute('aria-pressed') === 'true' && await page.locator('#sheet-preview .tp-line[data-line=date]').getAttribute('aria-pressed') === 'true' && await page.locator('#sheet-preview .tp-line[data-line=class]').getAttribute('aria-pressed') === 'false');
  await page.click('#sheet-preview .tp-line[data-line=class]');
  check('clicking the Class line turns it on', await page.locator('#sheet-preview .tp-line[data-line=class]').getAttribute('aria-pressed') === 'true' && (await D()).header.class === true);
  await page.click('#menu-format');
  check('Format shows the same state with check marks (paper size is in a submenu)', (await page.locator('#mi-line-class .menu-check').innerText()) === '✓' && (await page.locator('#mi-line-name .menu-check').innerText()) === '✓' && (await page.locator('#mi-paper .menu-value').innerText()) === 'Letter' && (await page.locator('#mi-instructions .menu-check').innerText()) === '');
  await page.click('#mi-paper');
  check('the paper size submenu checks the current size', (await page.locator('#mi-paper-letter .menu-check').innerText()) === '✓' && (await page.locator('#mi-paper-legal .menu-check').innerText()) === '');
  await page.click('#mi-paper-letter');
  await page.click('#menu-format');
  await page.click('#mi-line-date');
  check('the Format menu toggles the Date line off', (await D()).header.date === false && await page.locator('#sheet-preview .tp-line[data-line=date]').getAttribute('aria-pressed') === 'false');
  await page.click('#btn-add-instructions');
  await page.fill('#f-test-instructions', 'Show your work. Calculators are allowed.');
  check('Add instructions puts a text box under the title', (await D()).instructions === 'Show your work. Calculators are allowed.' && await page.locator('#f-test-instructions').isVisible());
  await page.click('#menu-format'); await page.click('#mi-paper'); await page.click('#mi-paper-legal');
  check('Format > Paper stores the size on the test (and as the next default)', (await D()).paper === 'legal' && await page.evaluate(() => localStorage.getItem('prime-questions:paper')) === 'legal');
  await page.evaluate(() => localStorage.setItem('prime-questions:paper', 'letter'));

  console.log('9. printing what is on the paper');
  await page.click('#menu-file'); await page.click('#mi-save'); await page.waitForFunction(() => PQ.state.tests.length === 1 && !PQ.active.exam.isDirty());
  const saved = await page.evaluate(() => PQ.state.tests[0]);
  check('the saved test keeps header, paper and instructions; title was typed on the paper', saved.title === 'Matter Test' && saved.paper === 'legal' && saved.header.class === true && saved.header.date === false && /Calculators/.test(saved.instructions), saved);
  const dump = async (kind, version, file) => { await page.evaluate(async ([k, v]) => { await PQ.preparePrint(k, v, PQ.state.tests[0]); }, [kind, version]); await page.pdf({ path: file, preferCSSPageSize: true }); };
  await dump('test', 'A', 'e-a.pdf');
  const txt = pdfAll('e-a.pdf');
  check('the page size comes from the test (Legal) even though the saved preference is Letter', /612 x 1008/.test(pdfInfo('e-a.pdf')), pdfInfo('e-a.pdf').match(/Page size.*/)[0]);
  check('the printed paper has the title, course, instructions, Name and Class but no Date line', /Matter Test/.test(txt) && /Science 9/.test(txt) && /Show your work/.test(txt) && /Name:/.test(txt) && /Class:/.test(txt) && !/Date:/.test(txt), txt.slice(0, 300));
  check('no editing controls or "null" text reach the printed paper', await page.evaluate(() => document.querySelectorAll('#print-root .ed-tools, #print-root input, #print-root textarea, #print-root button, #print-root .tp-empty').length === 0) && !/null|undefined/.test(txt));
  const keyP = await (async () => { await dump('key', 'B', 'e-kb.pdf'); return pdfAll('e-kb.pdf'); })();
  check('Version B answer key has no Name/Class/instructions lines', /Answer Key/.test(keyP) && !/Name:/.test(keyP) && !/Show your work/.test(keyP));
  await page.evaluate(async () => { const t = Object.assign({}, PQ.state.tests[0]); delete t.paper; delete t.header; delete t.instructions; PQ.state.tests[0] = t; await PQ.preparePrint('test', 'A', t); });
  await page.pdf({ path: 'e-def.pdf', preferCSSPageSize: true });
  const tdef = pdfAll('e-def.pdf');
  check('a test without page options prints with the defaults (Letter, Name and Date)', /612 x 792/.test(pdfInfo('e-def.pdf')) && /Name:/.test(tdef) && /Date:/.test(tdef) && !/Class:/.test(tdef));
  await page.evaluate(async () => { await PQ.loadAll(); });

  console.log('10. multipart on paper and in the keys');
  await page.evaluate(async () => {
    const t = Object.assign({}, PQ.state.tests[0]); const mpq = PQ.state.questions.find(q => q.type === 'multipart');
    t.questionIds = [mpq.id].concat(t.questionIds.slice(0, 2)); PQ.state.tests[0] = t; await PQ.preparePrint('test', 'A', t);
  });
  await page.pdf({ path: 'mp.pdf', preferCSSPageSize: true });
  const mpt = pdfAll('mp.pdf');
  check('a multipart question prints its introduction, then (a) (b) (c) each with its own answer area', /A car travels 120 km/.test(mpt) && /\(a\)\s+Which is the average speed/.test(mpt) && /\(b\)\s+Explain how/.test(mpt) && /\(c\)\s+How far in 5 h/.test(mpt) && /Answer:/.test(mpt), mpt.slice(0, 500));
  const keys = await page.evaluate(() => { const t = PQ.state.tests[0]; const A = PQ.keyEntries(PQ.planTest(t, PQ.state.questions, PQ.state.stimuli, 'A')), B = PQ.keyEntries(PQ.planTest(t, PQ.state.questions, PQ.state.stimuli, 'B')); return { a: A.map(e => e.text), b: B.map(e => e.text) }; });
  check('the answer key lists the parts of a multipart question, one per line', /\(a\) A\. 60 km\/h/.test(keys.a.find(x => /\(a\)/.test(x))) && /\(c\) 300 km/.test(keys.a.find(x => /\(a\)/.test(x))), keys.a);
  const mpView = await page.evaluate(() => { const q = PQ.state.questions.find(q => q.type === 'multipart'); const a = PQ.questionView(q, 1234, 'A'), b = PQ.questionView(q, 1234, 'B'); return { a: a.parts[0].options.map(o => o.text).join('|'), b: b.parts[0].options.map(o => o.text).join('|'), order: b.parts.map(p => p.type).join() }; });
  check('in Version B a part with keepOrder keeps its options in order, and the parts keep their order', mpView.a === mpView.b && mpView.order === 'mc,short,numeric', mpView);

  console.log('11. History');
  await page.evaluate(() => PQ.loadAll());    // section 10 changed the in-memory copy of the test on purpose
  await page.click('#nav-tests').catch(() => {});
  await page.evaluate(() => PQ.navigate({ name: 'tests' }));
  await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .sheet');
  await openHistory();
  check('History lists the save with its time and a LATEST SAVE tag, and says it stays on this device', (await page.locator('.vcard').count()) === 1 && /LATEST SAVE/.test(await page.locator('.vcard').innerText()) && /not in the exported PDF/.test(await page.locator('#panel-body').innerText()));
  check('the latest save is marked the same as what is on the paper (nothing to restore)', /Same as what is on the paper now/.test(await page.locator('.vcard').innerText()) && await page.locator('.vcard button').isDisabled());
  const firstIds = await ids();
  await page.click('#btn-history-close');
  await page.click('button[aria-label="Remove question 1 from the test"]'); await page.fill('#f-test-title', 'Second title'); await page.click('#btn-save');
  await page.waitForFunction(() => !PQ.active.exam.isDirty());
  await openHistory();
  check('every save adds an entry (newest first)', (await page.locator('.vcard').count()) === 2 && /Second title/.test(await page.locator('.vcard').first().innerText()) && /Matter Test/.test(await page.locator('.vcard').nth(1).innerText()));
  check('an older version says how it differs from the paper', /1 question not on the paper now/.test(await page.locator('.vcard').nth(1).innerText()), await page.locator('.vcard').nth(1).innerText());
  await page.locator('.vcard').nth(1).locator('button').click();
  check('Restore puts the old version on the paper as an unsaved change', (await D()).title === 'Matter Test' && (await ids()).length === firstIds.length && /Unsaved/.test(await page.locator('#dirty-flag').innerText()) && (await page.inputValue('#f-test-title')) === 'Matter Test');
  check('a restore keeps the test\'s own id (it does not become a copy)', (await D()).id === saved.id);
  await page.click('#btn-undo');
  check('Undo reverses a restore', (await D()).title === 'Second title');
  check('the stored test was not touched by the restore until Save', await page.evaluate(() => PQ.state.tests[0].title) === 'Second title');
  // the history cap
  for (let i = 0; i < 52; i++) { await page.fill('#f-test-title', 'rev ' + i); await page.click('#btn-save'); await page.waitForFunction(i => PQ.state.tests[0].title === 'rev ' + i && !PQ.active.exam.isDirty(), i); }
  const nv = await page.evaluate(async () => (await PQ.db.getAll('testVersions')).length);
  check('history keeps the latest 50 saves per test', nv === 50, nv);
  const oldest = await page.evaluate(async () => (await PQ.db.getAll('testVersions')).map(v => v.snapshot.title).sort().slice(0, 3));
  check('and the oldest ones are the ones dropped', !oldest.includes('Matter Test') && !oldest.includes('Second title'), oldest);
  const payload = await page.evaluate(async () => Object.keys(await PQ.collectPayload()));
  check('history is local only: it is not in the exported file', !payload.includes('testVersions') && payload.join() === 'format,schemaVersion,appVersion,requiredFeatures,exportedAt,banks,questions,stimuli,tests,images', payload);

  console.log('12. Check, editing a question from the paper, the unsaved guard');
  await page.click('#btn-history-close');
  await page.click('#btn-check');
  check('Check says how many questions are ready (or lists what to look at)', /Check this test/.test(await modal.innerText()) && (await modal.locator('#check-list, #check-ok').count()) === 1);
  await page.keyboard.press('Escape');
  await page.click('button[aria-label="Edit question 1"]');
  check('the pencil on a question opens it in the side panel (compact), with Back and Save', await page.locator('.exam-panel .editor.compact').isVisible() && await page.locator('.exam-panel #btn-save').isVisible() && !(await page.locator('.ep-tabs').isVisible()));
  const firstText = (await promptOrder())[0];
  await page.fill('.exam-panel #f-prompt', firstText + ' EDITED'); await page.locator('.exam-panel #btn-save').click();
  await page.waitForFunction(t => document.querySelector('#sheet-preview .tp-q .tp-prompt').innerText === t + ' EDITED', firstText);
  check('saving a question in the panel updates the paper straight away', (await promptOrder())[0] === firstText + ' EDITED');
  await page.fill('.exam-panel #f-prompt', 'half-typed');
  await page.locator('.exam-panel #btn-close').click();
  check('Back on a panel editor with unsaved changes asks first (and Escape keeps editing)', /Discard unsaved changes/.test(await modal.innerText()));
  await page.keyboard.press('Escape');
  check('Escape keeps the editor open with the text', (await page.inputValue('.exam-panel #f-prompt')) === 'half-typed');
  await page.locator('.exam-panel #btn-close').click(); await modal.locator('button:has-text("Discard changes")').click();
  check('Discard returns to the bank list', await page.locator('#panel-list').isVisible() && (await promptOrder())[0] === firstText + ' EDITED');
  // a brand new question from the panel, saved and added in one step
  await page.click('#panel-new'); await page.click('#pnew-tf');
  check('"+ New" in the panel starts a question in the open bank', await page.locator('.exam-panel #btn-save-add').isVisible() && /New question/.test(await page.locator('.exam-panel h2').innerText()));
  await page.fill('.exam-panel #f-prompt', 'Brand new from the panel'); await page.click('.exam-panel .seg button:has-text("True")');
  const before = (await ids()).length;
  await page.locator('.exam-panel #btn-save-add').click();
  await page.waitForFunction(n => PQ.active.exam.getDraft().questionIds.length === n + 1, before);
  check('Save & add to test saves the question to the bank and puts it on the paper', (await promptOrder()).pop() === 'Brand new from the panel' && await page.evaluate(() => PQ.state.questions.some(q => q.prompt === 'Brand new from the panel')), await promptOrder());
  await page.locator('.exam-panel #btn-close').click();
  // delete from the panel editor
  await page.locator('#sheet-preview .tp-q', { hasText: 'Brand new from the panel' }).locator('.ed-tools button[aria-label^="Edit question"]').click();
  await page.locator('.exam-panel #btn-delete').click(); await modal.locator('button:has-text("Delete question")').click();
  await page.waitForFunction(() => !PQ.state.questions.some(q => q.prompt === 'Brand new from the panel'));
  check('deleting a question from the panel editor takes it off the paper too', !(await promptOrder()).includes('Brand new from the panel') && await page.locator('#panel-list').isVisible());
  check('and the test is not left looking unsaved or pointing at it', !(await page.evaluate(() => PQ.active.exam.getDraft().questionIds.some(id => !PQ.state.questions.some(q => q.id === id)))));
  // navigating away with unsaved changes
  await page.fill('#f-test-title', 'unsaved title');
  await page.click('#btn-back-tests');
  check('leaving the test editor with unsaved changes asks first', /Discard unsaved changes/.test(await modal.innerText()));
  await page.keyboard.press('Escape');
  check('Escape keeps editing', await page.locator('#sheet-preview').isVisible() && (await page.inputValue('#f-test-title')) === 'unsaved title');
  await page.click('#btn-back-tests'); await modal.locator('button:has-text("Discard changes")').click();
  check('Discard returns to the Tests page and the stored title is unchanged', await page.locator('#page-tests').isVisible() && await page.evaluate(() => PQ.state.tests[0].title) === 'rev 51');

  console.log('13. deleting a test, missing questions, bank tab for a new bank');
  await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .sheet');
  await page.evaluate(async () => { const t = Object.assign({}, PQ.state.tests[0]); t.questionIds = t.questionIds.concat(['gone-1']); t.updated = new Date().toISOString(); await PQ.db.put('tests', t); await PQ.loadAll(); });
  await page.evaluate(() => PQ.navigate({ name: 'tests' })); await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .sheet');
  await page.click('#btn-check');
  check('a question that is no longer in any bank is reported by Check', /no longer in any bank/.test(await modal.innerText()));
  await modal.locator('button:has-text("Remove the missing")').click();
  check('and can be removed in one click, which is an undoable change', !(await ids()).includes('gone-1') && await page.locator('#btn-undo').isEnabled());
  await page.click('#btn-open-bank'); await page.click('#mi-new-bank'); await page.fill('#prompt-input', 'Made in the editor'); await modal.locator('button:has-text("Create")').click();
  await page.waitForFunction(() => PQ.state.banks.some(b => b.name === 'Made in the editor'));
  check('a bank made from the editor\'s + menu opens as a tab (empty)', (await page.locator('.ep-tab.active').innerText()).startsWith('Made in the editor') && /no questions yet/.test(await page.locator('#panel-list').innerText()));
  await page.click('#menu-file'); await page.click('#mi-delete');
  check('File > Delete test asks first', /Delete this test/.test(await modal.innerText()));
  await modal.locator('button:has-text("Delete test")').click();
  await page.waitForFunction(() => PQ.state.tests.length === 0);
  check('deleting a test removes it and its saved history, and returns to Tests', await page.locator('#page-tests').isVisible() && (await page.evaluate(async () => (await PQ.db.getAll('testVersions')).length)) === 0);
  check('the questions of a deleted test are still in their banks', await page.evaluate(() => PQ.state.questions.length) >= 6);

  console.log('14. network and errors');
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
