// Phase 2 features in the Phase 3 interface: stimuli, tables, images, the test editor, printing, deletes that keep
// other records in step, and importing a bank written by an earlier version (schema 1, app 0.1.0).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary, OUT } = require('./lib');

const FIXTURE = path.join(__dirname, 'fixtures', 'bank-schema1-v0.1.0.pdf');
const pdfPage = (file, n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', file, '-']).toString();
const pdfPages = file => Number((/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file]).toString()) || [])[1]);

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  await openApp(page);
  const modal = page.locator('.modal');
  const toastText = async () => (await page.locator('.toast').allInnerTexts()).join(' | ');
  const openBank = async () => { await page.click('#nav-banks'); await page.click('.card-tile[data-id] .ct-main'); await page.waitForSelector('#page-bank'); };
  const newQ = async t => { await page.click('#btn-new'); await page.click('#new-' + t); };
  const openTest = async () => { await page.click('#nav-tests'); await page.click('.card-tile .ct-main'); await page.waitForSelector('#sheet-preview .sheet'); };
  const sed = () => 'PQ.active.sed', qed = () => 'PQ.active.qed';

  // image fixtures made in the page itself
  const mk = async (w, h, type) => page.evaluate(async ([w, h, type]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#223'); gr.addColorStop(1, '#8cf'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const b = await new Promise(r => c.toBlob(r, type, 0.9)); return (await PQ.blobToDataUrl(b)).split(',')[1];
  }, [w, h, type]);
  fs.writeFileSync('big.png', Buffer.from(await mk(2400, 1600, 'image/png'), 'base64'));
  fs.writeFileSync('tall.jpg', Buffer.from(await mk(900, 2000, 'image/jpeg'), 'base64'));
  fs.writeFileSync('small.png', Buffer.from(await mk(300, 200, 'image/png'), 'base64'));
  fs.writeFileSync('pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#ddd"/><script>window.__svgran = 1</script></svg>');
  fs.writeFileSync('bad.png', 'not really an image');
  fs.writeFileSync('evil.svg', '<svg xmlns="http://www.w3.org/2000/svg"><unclosed></svg>');

  console.log('1. stimulus editor: text, table, images');
  await openBank(); await page.click('#tab-stimuli');
  check('the Stimuli tab shows the stimuli panel and button label', await page.locator('#btn-new').innerText().then(t => /New stimulus/.test(t)) && /No stimuli yet/.test(await page.locator('.qlist').innerText()));
  await page.click('#btn-new');
  check('Save is disabled for a stimulus with no title', await page.locator('#btn-save').isDisabled());
  await page.fill('#f-title', 'Density data');
  await page.fill('#f-stim-text', 'Four samples. Use \\(\\rho = \\frac{m}{V}\\).');
  await page.click('#btn-add-table');
  await page.fill('input[aria-label="Column 1 heading"]', 'Sample'); await page.fill('input[aria-label="Column 2 heading"]', 'Mass');
  await page.click('#btn-add-col'); await page.fill('input[aria-label="Column 3 heading"]', 'Volume');
  await page.fill('input[aria-label="Row 1, column 1"]', 'A'); await page.fill('input[aria-label="Row 1, column 2"]', '10'); await page.fill('input[aria-label="Row 1, column 3"]', '5');
  await page.click('#btn-add-row'); await page.fill('input[aria-label="Row 2, column 1"]', 'B'); await page.fill('input[aria-label="Row 2, column 3"]', '\\(1.0 \\times 10^{1}\\)');
  let t = await page.evaluate(() => PQ.active.sed.getDraft().table);
  check('table editor builds headers and rows (3 columns, 2 rows, ragged-proof)', t.headers.length === 3 && t.rows.length === 2 && t.rows.every(r => r.length === 3), t);
  await page.click('button[aria-label="Remove column 2"]'); await page.click('#btn-add-col');
  t = await page.evaluate(() => PQ.active.sed.getDraft().table);
  check('removing and adding a column keeps every row the same length', t.headers.length === 3 && t.rows.every(r => r.length === 3) && t.headers[1] === 'Volume', t);
  await page.waitForTimeout(250);
  check('preview shows a real table with MathML inside a cell', (await page.locator('#preview table.pq-table').count()) === 1 && (await page.locator('#preview table math').count()) >= 1);
  // images: big PNG downscaled, SVG kept, bad file refused with a message, evil svg refused
  await page.setInputFiles('#f-image-file', ['big.png', 'pic.svg', 'bad.png', 'evil.svg']);
  await page.waitForFunction(() => PQ.active.sed.getDraft().imageIds.length === 2);
  await page.waitForFunction(() => /evil\.svg/.test(document.getElementById('toasts').innerText));   // files are handled in order; wait for the last one
  const tx = await toastText();
  check('a non-image and a broken SVG are refused with clear messages', /bad\.png: Use a PNG, JPEG or SVG image/.test(tx) && /evil\.svg: Use a PNG, JPEG or SVG image/.test(tx), tx);
  await page.waitForFunction(() => document.querySelectorAll('#preview img').length === 2);
  check('the SVG is shown only through <img> (its script never ran, no inline <svg> in the page)', (await page.evaluate(() => window.__svgran === undefined && document.querySelectorAll('svg').length === 0)) && (await page.locator('#preview img').count()) === 2);
  const idsBefore = await page.evaluate(() => PQ.db.getImageIds());
  check('images are held in memory until Save (nothing in the database yet)', idsBefore.length === 0, idsBefore);
  await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.stimuli.length === 1);
  const stored = await page.evaluate(async () => { const s = PQ.state.stimuli[0]; const out = []; for (const id of s.imageIds) { const b = await PQ.db.getImage(id); out.push({ type: b.type, w: b.type === 'image/svg+xml' ? null : (await createImageBitmap(b)).width, h: b.type === 'image/svg+xml' ? null : (await createImageBitmap(b)).height }); } return out; });
  check('2400x1600 PNG was downscaled to a 1600 px long edge (aspect kept); SVG stored as is', stored[0].type === 'image/png' && stored[0].w === 1600 && stored[0].h === 1067 && stored[1].type === 'image/svg+xml', stored);
  check('both images are now in the database', (await page.evaluate(() => PQ.db.getImageIds())).length === 2);
  // small images are not touched; tall images are limited on the long edge too
  await page.click('#btn-close');
  await page.click('#btn-new'); await page.fill('#f-title', 'Sizes');
  await page.setInputFiles('#f-image-file', ['small.png', 'tall.jpg']);
  await page.waitForFunction(() => PQ.active.sed.getDraft().imageIds.length === 2);
  const dims = await page.evaluate(async () => { const e = PQ.active.sed, out = []; for (const id of e.getDraft().imageIds) { const b = e.pending.get(id); const m = await createImageBitmap(b); out.push([b.type, m.width, m.height]); } return out; });
  check('a small PNG is kept at its size; a tall JPEG is scaled by its long edge (2000 -> 1600)', dims[0][0] === 'image/png' && dims[0][1] === 300 && dims[1][0] === 'image/jpeg' && dims[1][2] === 1600 && dims[1][1] === 720, dims);
  // limit of six
  await page.setInputFiles('#f-image-file', ['small.png', 'small.png', 'small.png', 'small.png', 'small.png']);
  await page.waitForTimeout(600);
  check('at most 6 images per record', (await page.evaluate(() => PQ.active.sed.getDraft().imageIds.length)) === 6 && /At most 6/.test(await toastText()));
  // discarding must not leave orphan images behind
  const keep = (await page.evaluate(() => PQ.db.getImageIds())).length;
  await page.click('#btn-close'); await modal.locator('button:has-text("Discard changes")').click();
  check('discarded images never reach the database (no orphans)', (await page.evaluate(() => PQ.db.getImageIds())).length === keep && keep === 2);

  console.log('2. question editor: stimulus, table, images, keepOrder');
  await page.click('#tab-questions'); await newQ('mc');
  await page.fill('#f-prompt', 'Which sample is densest?');
  await page.fill('input[aria-label="Option A"]', 'A'); await page.fill('input[aria-label="Option B"]', 'B'); await page.fill('input[aria-label="Option C"]', 'Both A and B'); await page.fill('input[aria-label="Option D"]', 'None of the above');
  await page.locator('input[name=correct]').nth(1).check();
  await page.selectOption('#f-stimulus', { index: 1 });
  await page.waitForTimeout(200);
  check('preview shows the stimulus text, its table and its images', /Four samples/.test(await page.locator('#preview').innerText()) && (await page.locator('#preview table').count()) === 1 && (await page.locator('#preview img').count()) === 2);
  await page.click('#btn-add-table'); await page.fill('input[aria-label="Row 1, column 1"]', '\\(\\frac{1}{\\)');
  await page.waitForTimeout(150);
  check('broken maths inside a table cell is reported by field name', /Table row 1, column 1/.test(await page.locator('#problems').innerText()));
  await page.fill('input[aria-label="Row 1, column 1"]', 'x');
  check('keepOrder checkbox is offered for multiple choice', await page.locator('#f-keeporder').isVisible() && !(await page.locator('#f-keeporder').isChecked()));
  await page.check('#f-keeporder'); await page.uncheck('#f-keeporder');
  check('unticking keepOrder leaves the question identical to untouched (property absent)', (await page.evaluate(() => 'keepOrder' in PQ.active.qed.getDraft())) === false);
  await page.check('#f-keeporder');
  await page.click('.seg button[data-type=tf]');
  check('keepOrder is not offered for other types and is dropped on a type change', (await page.locator('#f-keeporder').count()) === 0 && (await page.evaluate(() => 'keepOrder' in PQ.active.qed.getDraft())) === false);
  await page.click('.seg button[data-type=mc]'); await page.check('#f-keeporder');
  await page.selectOption('#f-status', 'ready'); await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.questions.length === 1);
  const q1 = await page.evaluate(() => PQ.state.questions[0]);
  check('saved with stimulusId, keepOrder:true and its own table', q1.keepOrder === true && q1.stimulusId === (await page.evaluate(() => PQ.state.stimuli[0].id)) && q1.table && q1.table.rows[0][0] === 'x', q1);

  console.log('3. test builder');
  // more questions straight into the database (the editor itself is covered in ui.js)
  await page.evaluate(async () => {
    const T = '2026-10-01T10:00:00.000Z'; const sid = PQ.state.stimuli[0].id;
    const base = (id, type, prompt, answer, extra) => Object.assign({ id, bankId: PQ.DEFAULT_BANK_ID, type, prompt, course: 'Science 9', unit: 'Matter', tags: [], difficulty: 'medium', status: 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: T, updated: T }, extra || {});
    const recs = [
      base('q-b', 'mc', 'Greatest mass? (second question on the passage)', { options: ['A', 'B', 'C', 'D'], correct: 1 }, { stimulusId: sid }),
      base('q-c', 'mc', 'What is \\(\\frac{1}{2}+\\frac{1}{4}\\)?', { options: ['\\(\\frac{3}{4}\\)', '\\(\\frac{2}{6}\\)', '\\(\\frac{1}{4}\\)', '\\(\\frac{1}{2}\\)'], correct: 0 }),
      base('q-d', 'tf', 'Water boils at 100 °C at sea level.', { correct: true }),
      base('q-e', 'numeric', 'Density of water at 4 °C?', { value: '1.00', units: 'g/cm3', tolerance: 0.01 }),
      base('q-f', 'short', 'Explain why ice floats on water.', { lines: 4, rubric: 'Less dense than liquid water.' }),
      base('q-g', 'matching', 'Match each symbol to its element.', { pairs: [{ left: 'Na', right: 'Sodium' }, { left: 'K', right: 'Potassium' }, { left: 'Fe', right: 'Iron' }, { left: 'Cu', right: 'Copper' }] }),
      base('q-h', 'mc', 'Needs review', { options: ['x', 'y', '', ''], correct: 0 }, { status: 'review' }),
      base('q-i', 'mc', 'Which is correct?', { options: ['one', 'two', 'All of the above', 'three'], correct: 2 })
    ];
    for (const r of recs) await PQ.db.put('questions', r);
    await PQ.loadAll();
  });
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.click('#nav-tests'); await page.click('#tile-new-test'); await page.waitForSelector('#sheet-preview .sheet');
  check('a new test starts empty: Save is off and printing is off', await page.locator('#btn-save').isDisabled() && await page.locator('#btn-print').isDisabled());
  await page.fill('#f-test-title', 'Matter Unit Test'); await page.fill('#f-test-course', 'Science 9');
  check('the title and course are typed straight onto the paper', await page.locator('#exam-name').innerText() === 'Matter Unit Test' && /Unsaved/.test(await page.locator('#dirty-flag').innerText()));
  check('the bank panel lists every question not yet in the test', (await page.locator('#panel-list .qcard').count()) === 9, (await page.locator('#panel-list').innerText()).slice(0, 80));
  await page.fill('#panel-search', 'ice');
  check('panel search filters the bank', (await page.locator('#panel-list .qcard').count()) === 1);
  await page.fill('#panel-search', '');
  await page.selectOption('#panel-type', 'matching'); check('panel type filter works', (await page.locator('#panel-list .qcard').count()) === 1);
  await page.selectOption('#panel-type', '');
  for (let i = 0; i < 9; i++) await page.locator('#panel-list .qcard button.primary').first().click();
  await page.waitForFunction(() => PQ.active.exam.getDraft().questionIds.length === 9);
  check('adding every question puts all 9 on the paper; each card now says Added', (await page.locator('.tp-q').count()) === 9 && (await page.locator('#panel-list .qcard.used').count()) === 9);
  await page.click('#btn-check');
  const warn = await page.locator('.modal').innerText();
  check('Check warns about review status and an "all of the above" option that is not protected', /1 question is marked .Needs review./.test(warn) && /all\/none of the above/.test(warn), warn);
  await page.keyboard.press('Escape');
  // reorder: the last block moves up one place, then is removed and re-added
  const idsOf = () => page.evaluate(() => PQ.active.exam.getDraft().questionIds.slice());
  const before = await idsOf();
  const lastN = await page.locator('.tp-q').count();
  await page.click('button[aria-label="Move question ' + lastN + ' up"]');
  const after = await idsOf();
  check('move up swaps the last question with the one before it', after[8] === before[7] && after[7] === before[8], { before, after });
  check('first row cannot move up, last cannot move down', await page.locator('button[aria-label="Move question 1 up"]').isDisabled() && await page.locator('button[aria-label="Move question ' + lastN + ' down"]').isDisabled());
  await page.click('button[aria-label="Remove question ' + lastN + ' from the test"]');
  check('remove takes a question out of the test but not the bank', (await idsOf()).length === 8 && (await page.evaluate(() => PQ.state.questions.length)) === 9);
  await page.locator('#panel-list .qcard button.primary').first().click();
  check('re-added question goes to the end', (await idsOf()).length === 9);
  await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.tests.length === 1);
  const saved = await page.evaluate(() => PQ.state.tests[0]);
  check('saved test has title, course, 9 question ids and a seed', saved.title === 'Matter Unit Test' && saved.course === 'Science 9' && saved.questionIds.length === 9 && Number.isInteger(saved.seed) && saved.seed > 0, saved);
  // preview
  await page.waitForTimeout(400);
  const pvA = await page.locator('#sheet-preview').innerText();
  check('paper A: Version A, Name/Date lines, numbered questions and the stimulus intro; title in its box', await page.inputValue('#f-test-title') === 'Matter Unit Test' && await page.inputValue('#f-test-course') === 'Science 9' && /Version A/.test(pvA) && /Name:/.test(pvA) && /Date:/.test(pvA) && /Use the information below to answer questions? \d+( to \d+)?\./.test(pvA), pvA.slice(0, 200));
  await page.click('#pv-b'); await page.waitForTimeout(300);
  check('preview B says Version B (and is not editable)', /Version B/.test(await page.locator('#sheet-preview').innerText()) && (await page.locator('#sheet-preview .ed-tools').count()) === 0 && (await page.locator('#sheet-preview input').count()) === 0);
  await page.click('#pv-kb'); await page.waitForTimeout(300);
  const keyB = await page.locator('#sheet-preview').innerText();
  check('B key has columns B / is A / Answer (as printed on Version B)', /Answer Key · Version B/.test(keyB) && /is A/.test(keyB) && /as printed on Version B/.test(keyB) && /A\d+/.test(keyB), keyB.slice(0, 160));
  await page.click('#pv-ka'); await page.waitForTimeout(300);
  check('A key has No. / Answer only', /Answer Key · Version A/.test(await page.locator('#sheet-preview').innerText()) && !(/is A/.test(await page.locator('#sheet-preview').innerText())));
  await page.click('#pv-a');
  // reshuffle asks first on a saved test
  const seed0 = await page.evaluate(() => PQ.active.exam.getDraft().seed);
  await page.click('#menu-edit'); await page.click('#mi-reseed'); check('reshuffle on a saved test asks first', /Reshuffle Version B/.test(await modal.innerText()));
  await modal.locator('button:has-text("Keep current shuffle")').click();
  check('declining keeps the seed', (await page.evaluate(() => PQ.active.exam.getDraft().seed)) === seed0);
  await page.click('#menu-edit'); await page.click('#mi-reseed'); await modal.locator('button.danger').click();
  const seed1 = await page.evaluate(() => PQ.active.exam.getDraft().seed);
  check('accepting gives a new seed and marks the test unsaved', seed1 !== seed0 && /Unsaved/.test(await page.locator('#dirty-flag').innerText()));
  await page.click('#btn-undo');
  check('Undo brings the old shuffle back (and the test is saved-clean again)', (await page.evaluate(() => PQ.active.exam.getDraft().seed)) === seed0 && !(await page.evaluate(() => PQ.active.exam.isDirty())));
  await page.fill('#f-test-title', 'Matter Unit Test ');   // trailing space: unsaved until saved, then trimmed
  await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.tests[0].title === 'Matter Unit Test' && !PQ.active.exam.isDirty());

  console.log('4. printing: paper sizes, no split questions, greyscale');
  const dump = async (kind, version, paper, file) => {
    await page.evaluate(p => localStorage.setItem('prime-questions:paper', p), paper);
    await page.evaluate(async ([k, v]) => { await PQ.preparePrint(k, v, PQ.state.tests[0]); }, [kind, version]);
    await page.pdf({ path: file, preferCSSPageSize: true });
  };
  await dump('test', 'A', 'letter', 'p-letter.pdf'); await dump('test', 'A', 'legal', 'p-legal.pdf'); await dump('test', 'A', 'a4', 'p-a4.pdf');
  const size = f => /Page size:\s+(.*)/.exec(execFileSync('pdfinfo', [f]).toString())[1];
  check('Letter is the default size and prints portrait', /612 x 792 pts \(letter\)/.test(size('p-letter.pdf')), size('p-letter.pdf'));
  check('Legal prints 612 x 1008', /612 x 1008/.test(size('p-legal.pdf')), size('p-legal.pdf'));
  check('A4 prints 595 x 842', /59[45](\.\d+)? x 84[12]/.test(size('p-a4.pdf')) && /A4/.test(size('p-a4.pdf')), size('p-a4.pdf'));
  check('legal needs no more pages than letter', pdfPages('p-legal.pdf') <= pdfPages('p-letter.pdf'));
  const text1 = pdfPage('p-letter.pdf', 1) + pdfPage('p-letter.pdf', 2);
  check('printed paper has title, course, Version A, Name/Date', /Matter Unit Test/.test(text1) && /Science 9/.test(text1) && /Version A/.test(text1) && /Name:/.test(text1) && /Date:/.test(text1));
  const all = Array.from({ length: pdfPages('p-letter.pdf') }, (_, i) => pdfPage('p-letter.pdf', i + 1)).join('\n');
  check('numbers 1..9 all printed', [1, 2, 3, 4, 5, 6, 7, 8, 9].every(n => new RegExp('(^|\\s)' + n + '\\.\\s').test(all)));
  check('the answer is not printed on the student paper (no "Answer:" line values, no key)', !/Answer Key/.test(all));
  await page.evaluate(async () => { await PQ.preparePrint('test', 'A', PQ.state.tests[0]); });
  await page.emulateMedia({ media: 'print' });
  const colours = await page.evaluate(() => {
    const bad = [], ach = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return true; const [r, g, b, a] = m.map(Number); return (a === 0) || (r === g && g === b); };
    for (const e of document.querySelectorAll('#print-root, #print-root *')) { if (e.closest('img')) continue; const s = getComputedStyle(e); for (const k of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor']) { const hasBorder = !k.startsWith('border') || parseFloat(s[k.replace('Color', 'Width')]) > 0; if (hasBorder && !ach(s[k])) bad.push(e.className + ':' + k + '=' + s[k]); } }
    return { bad: bad.slice(0, 5), appHidden: getComputedStyle(document.querySelector('.app')).display === 'none', rootShown: getComputedStyle(document.getElementById('print-root')).display !== 'none' };
  });
  check('printed sheet is greyscale only (no coloured text, borders or fills)', colours.bad.length === 0, colours.bad);
  check('in print the app chrome is hidden and only the paper shows', colours.appHidden && colours.rootShown);
  await page.emulateMedia({ media: 'screen' });
  check('on screen the print area is hidden', await page.evaluate(() => getComputedStyle(document.getElementById('print-root')).display === 'none'));
  await page.emulateMedia({ media: null });   // back to the default, so page.pdf() prints with print CSS

  // property test: across many layouts and the three sizes, no question and no stimulus group splits across pages
  const gen = await page.evaluate(async () => {
    const T = '2026-10-01T10:00:00.000Z';
    const base = (id, type, prompt, answer, extra) => Object.assign({ id, bankId: PQ.DEFAULT_BANK_ID, type, prompt, course: '', unit: '', tags: [], difficulty: 'medium', status: 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: T, updated: T }, extra || {});
    const qs = [], ids = [];
    for (let i = 0; i < 40; i++) {
      const n = String(i).padStart(2, '0');
      const kind = i % 5;
      if (kind === 0) qs.push(base('p' + n, 'mc', 'QS' + n + ' ' + 'A reasonably long question stem that wraps over lines. '.repeat(1 + (i % 3)), { options: ['opt a ' + n, 'opt b', 'opt c', 'QE' + n + ' last'], correct: 0 }));
      else if (kind === 1) qs.push(base('p' + n, 'tf', 'QS' + n + ' True or false: this QE' + n + '.', { correct: true }));
      else if (kind === 2) qs.push(base('p' + n, 'numeric', 'QS' + n + ' Calculate the thing QE' + n, { value: '1', units: '', tolerance: 0 }));
      else if (kind === 3) qs.push(base('p' + n, 'matching', 'QS' + n + ' Match them', { pairs: [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r2' }, { left: 'l3', right: 'r3' }, { left: 'l4', right: 'QE' + n }] }));
      else qs.push(base('p' + n, 'mc', 'QS' + n + ' with a table', { options: ['a', 'b', 'c', 'QE' + n], correct: 1 }, { table: { headers: ['x', 'y'], rows: [['1', '2'], ['3', '4'], ['5', '6']], caption: 'T' + n } }));
      ids.push('p' + n);
    }
    // a stimulus group: stimulus title token + two questions
    const stim = { id: 'sg', bankId: PQ.DEFAULT_BANK_ID, title: 'STIMTOKEN', text: 'Short passage. '.repeat(8), imageIds: [], table: null, created: T, updated: T };
    qs.push(base('g1', 'mc', 'GS1 first on the passage', { options: ['a', 'b', 'c', 'GE1'], correct: 0 }, { stimulusId: 'sg' }));
    qs.push(base('g2', 'mc', 'GS2 second on the passage', { options: ['a', 'b', 'c', 'GE2'], correct: 0 }, { stimulusId: 'sg' }));
    for (const q of qs) await PQ.db.put('questions', q);
    await PQ.db.put('stimuli', stim);
    await PQ.loadAll();
    return ids.length;
  });
  let violations = [], layouts = 0;
  for (const paper of ['letter', 'legal', 'a4']) {
    for (const k of [0, 3, 6, 9, 12, 15, 18, 21, 24]) {
      const idsList = await page.evaluate(k => { const f = PQ.state.questions.filter(q => q.id.startsWith('p')).slice(0, k).map(q => q.id); return f.concat(['g1', 'g2']).concat(PQ.state.questions.filter(q => q.id.startsWith('p')).slice(k, k + 4).map(q => q.id)); }, k);
      await page.evaluate(ids => { PQ.state.tests[0] = Object.assign({}, PQ.state.tests[0], { questionIds: ids }); }, idsList);
      const f = 'prop-' + paper + '-' + k + '.pdf';
      await dump('test', 'A', paper, f);
      const pages = Array.from({ length: pdfPages(f) }, (_, i) => pdfPage(f, i + 1));
      const pageOf = tok => pages.findIndex(p => p.includes(tok));
      layouts++;
      for (const id of idsList) {
        if (!id.startsWith('p')) continue;
        const n = id.slice(1);
        const a = pageOf('QS' + n), b = pageOf('QE' + n);
        if (a < 0 || b < 0 || a !== b) violations.push(paper + ' k=' + k + ' ' + id + ' start on p' + (a + 1) + ' end on p' + (b + 1));
      }
      const g = ['STIMTOKEN', 'GS1', 'GE1', 'GS2', 'GE2'].map(pageOf);
      if (new Set(g).size !== 1 && g.every(x => x >= 0)) {
        // allowed only if the whole group genuinely cannot fit on one page (it can: it is tiny)
        violations.push(paper + ' k=' + k + ' stimulus group split across pages ' + g.map(x => x + 1).join(','));
      }
      if (g.some(x => x < 0)) violations.push(paper + ' k=' + k + ' group text missing');
    }
  }
  const splitQ = violations.filter(v => !/stimulus group|group text/.test(v)), splitG = violations.filter(v => /stimulus group|group text/.test(v));
  check('PROPERTY: over ' + layouts + ' layouts x 3 paper sizes no question splits across a page', splitQ.length === 0, splitQ.slice(0, 6));
  check('PROPERTY: a stimulus and its questions always stay on one page when they fit', splitG.length === 0, splitG.slice(0, 6));
  // remove the generated records so the delete checks below start from the known set
  await page.evaluate(async () => { const ids = PQ.state.questions.filter(q => /^p\d\d$/.test(q.id) || q.id === 'g1' || q.id === 'g2').map(q => q.id); await PQ.db.applyBatch({ deletes: { questions: ids, stimuli: ['sg'] } }); await PQ.loadAll(); });

  console.log('5. deleting keeps other records in step');
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  // make sure the saved test still has the 9 original questions in it
  const inTest = await page.evaluate(() => PQ.state.tests[0].questionIds.length);
  await openBank();
  await page.fill('input[aria-label="Search questions"]', 'Water boils');
  await page.locator('.qrow').first().click(); await page.click('#btn-delete');
  const delText = await modal.innerText();
  check('deleting a question names the saved tests it will be removed from', /saved test/.test(delText) && /Matter Unit Test/.test(delText), delText);
  await modal.locator('button.danger').click(); await page.waitForFunction(() => !PQ.state.questions.some(q => q.id === 'q-d'));
  const tAfter = await page.evaluate(() => PQ.state.tests[0].questionIds);
  check('the deleted question was removed from the test in the same step', !tAfter.includes('q-d') && tAfter.length === inTest - 1, tAfter);
  check('no dangling ids remain in any test', await page.evaluate(() => { const ids = new Set(PQ.state.questions.map(q => q.id)); return PQ.state.tests.every(t => t.questionIds.every(i => ids.has(i))); }));
  await page.fill('input[aria-label="Search questions"]', '');
  await page.click('#tab-stimuli'); await page.locator('.qrow').first().click();
  check('stimulus list says how many questions use it', /2 questions use it/.test(await page.locator('.qrow').first().innerText()), await page.locator('.qrow').first().innerText());
  await page.click('#btn-delete');
  check('deleting a stimulus says how many questions lose it', /2 questions use it/.test(await modal.innerText()), await modal.innerText());
  await modal.locator('button:has-text("Cancel")').click();
  check('cancelling the delete changes nothing', (await page.evaluate(() => PQ.state.stimuli.length)) === 1);
  await page.click('#btn-delete'); await modal.locator('button.danger').click(); await page.waitForFunction(() => PQ.state.stimuli.length === 0);
  const left = await page.evaluate(() => ({ withStim: PQ.state.questions.filter(q => q.stimulusId).length, total: PQ.state.questions.length }));
  check('after a stimulus delete the questions that used it are kept, with no stimulus', left.withStim === 0 && left.total >= 8, left);

  console.log('6. importing a bank written by the previous version (schema 1, app 0.1.0)');
  // start from an empty database so the counts are exact
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.setInputFiles('#file-input', FIXTURE); await modal.waitFor();
  const sum = (await modal.innerText()).replace(/\s+/g, ' ');
  check('the old file is accepted and summarised: 7 questions, 1 stimulus, 1 test, 1 image, all new', /Import this bank/.test(sum) && /Questions 7 0 0 0/.test(sum) && /Shared stimuli 1/.test(sum) && /Saved tests 1/.test(sum) && /Images 1/.test(sum), sum);
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.tests.length === 1);
  check('everything arrived intact', await page.evaluate(() => PQ.state.questions.length === 7 && PQ.state.stimuli.length === 1 && PQ.state.stimuli[0].table.rows.length === 4 && PQ.state.imageIds.size === 1));
  check('records from the old version were stored exactly as written (no keepOrder invented)', await page.evaluate(() => PQ.state.questions.every(q => !('keepOrder' in q))));
  await openTest();
  await page.waitForTimeout(500);
  const pv = await page.locator('#sheet-preview').innerText();
  check('the imported test builds: stimulus grouped as questions 2 to 3, table and image shown', /answer questions 2 to 3\./.test(pv) && (await page.locator('#sheet-preview table.pq-table').count()) >= 1 && (await page.locator('#sheet-preview img').count()) >= 1, pv.slice(0, 200));
  await page.click('#btn-check');
  check('the imported test warns that its "All of the above" question is not protected', /all\/none of the above/.test(await page.locator('#check-list').innerText()));
  await page.keyboard.press('Escape');

  console.log('7. full round trip with stimuli, tables, images, tests and keepOrder');
  // protect the all-of-the-above question, then export -> wipe -> import
  await page.click('#btn-back-tests'); await openBank(); await page.fill('input[aria-label="Search questions"]', 'frac'); await page.locator('.qrow').first().click();
  await page.check('#f-keeporder'); await page.click('#btn-save'); await page.waitForFunction(() => PQ.state.questions.some(q => q.keepOrder === true));
  await page.fill('input[aria-label="Search questions"]', '');
  const planKey = async v => page.evaluate(v => { const p = PQ.planTest(PQ.state.tests[0], PQ.state.questions, PQ.state.stimuli, v); return JSON.stringify(PQ.keyEntries(p).map(e => [e.number, e.aNumber, e.text])); }, v);
  const keyA0 = await planKey('A'), keyB0 = await planKey('B');
  const snap = async () => page.evaluate(async () => { const p = await PQ.collectPayload(); delete p.exportedAt; return JSON.parse(JSON.stringify(p)); });
  const before2 = await snap();
  check('payload carries schema 2, keepOrder on exactly one question, tables, a stimulus, a test and an image', before2.schemaVersion === 4 && before2.banks.length === 1 && before2.questions.filter(q => q.keepOrder === true).length === 1 && before2.questions.some(q => q.table) && before2.stimuli.length === 1 && before2.tests.length === 1 && Object.keys(before2.images).length === 1);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#btn-export')]);
  await dl.saveAs('p2-export.pdf'); await page.waitForSelector('.toast.ok');
  const list = execFileSync('pdfdetach', ['-list', 'p2-export.pdf']).toString();
  check('exported PDF carries the data (poppler)', /prime-questions\.pq/.test(list));
  fs.rmSync('p2ex', { recursive: true, force: true }); fs.mkdirSync('p2ex'); execFileSync('pdfdetach', ['-saveall', '-o', 'p2ex', 'p2-export.pdf']);
  const ex = JSON.parse(fs.readFileSync('p2ex/prime-questions.pq', 'utf8')); delete ex.exportedAt;
  check('poppler-extracted data equals what the app holds', JSON.stringify(ex) === JSON.stringify(before2));
  const pdfText = execFileSync('pdftotext', ['-layout', 'p2-export.pdf', '-']).toString();
  check('the readable pages mention the stimulus, its table and image placeholders', /Density data/.test(pdfText) && /\[Table:/.test(pdfText) && /image/.test(pdfText) && /Matter quiz/.test(pdfText));
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.setInputFiles('#file-input', 'p2-export.pdf'); await modal.waitFor(); await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.tests.length === 1);
  const after2 = await snap();
  check('ROUND TRIP: export -> wipe -> import is identical, including image bytes', JSON.stringify(after2) === JSON.stringify(before2));
  // the same test prints identically after the round trip (seed and order are data)
  check('Version A and Version B answer keys are identical after the round trip (the test reprints identically)', (await planKey('A')) === keyA0 && (await planKey('B')) === keyB0 && keyB0.length > 50 && keyA0 !== keyB0);

  console.log('8. errors, network');
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
