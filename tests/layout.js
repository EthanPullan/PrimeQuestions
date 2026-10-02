// Schema 5 in the test editor: the right-click question menu, answer areas (line / blank space / none), extra writing space and
// "fill rest of page", sections, and the font. Printing is checked by turning the paper into PDFs and reading them with poppler.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

const pdfPages = f => Number((/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString()) || [])[1]);
const pdfText = f => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const pdfPage = (f, n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', f, '-']).toString();
const pdfFonts = f => execFileSync('pdffonts', [f]).toString();
const words = (f, n) => Array.from(execFileSync('pdftotext', ['-bbox', '-f', String(n || 1), '-l', String(n || 1), f, '-']).toString().matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)).map(m => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] }));
const MM = 72 / 25.4;

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  page.setDefaultTimeout(8000);
  await openApp(page);
  const modal = page.locator('.modal');
  const D = () => page.evaluate(() => PQ.active.exam.getDraft());
  const sheet = () => page.locator('#sheet-preview .sheet');
  const q = t => page.locator('#sheet-preview .tp-q', { hasText: t });
  const rc = async (t, pos) => { await q(t).click({ button: 'right', position: pos || { x: 80, y: 8 } }); };
  const menuIds = () => page.locator('.menu .menu-item').evaluateAll(els => els.map(e => e.id));
  const fmtPrint = async (extra, file, ids) => {
    await page.evaluate(async ([extra, ids]) => { const t = Object.assign({}, PQ.state.tests[0], extra); if (ids) t.questionIds = ids; await PQ.preparePrint('test', 'A', t); }, [extra, ids || null]);
    await page.pdf({ path: file, preferCSSPageSize: true });
  };

  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString(), B1 = PQ_.DEFAULT_BANK_ID;
    const mk = (id, type, prompt, answer, extra) => Object.assign(PQ_.emptyQuestion(type, B1), { id, prompt, answer, status: 'ready' }, extra || {});
    const qs = [
      mk('q1', 'mc', 'QONE choose well', { options: ['red', 'green', 'blue', 'grey'], correct: 0 }),
      mk('q2', 'tf', 'QTWO the sun is a star', { correct: true }),
      mk('q3', 'numeric', 'QTHREE speed of a car', { value: '60', units: 'km/h', tolerance: 0 }),
      mk('q4', 'short', 'QFOUR explain why ice floats', { lines: 3, rubric: 'density' }),
      mk('q5', 'numeric', 'QFIVE seven times eight', { value: '56', units: '', tolerance: 0 }),
      mk('q6', 'multipart', 'QSIX a car travels', { parts: [{ type: 'numeric', prompt: 'find the speed', answer: { value: '60', units: '', tolerance: 0 } }, { type: 'short', prompt: 'explain', answer: { lines: 2, rubric: '' } }, { type: 'tf', prompt: 'is it fast', answer: { correct: true } }] }),
      mk('q7', 'matching', 'QSEVEN match these', { pairs: [{ left: 'Na', right: 'Sodium' }, { left: 'K', right: 'Potassium' }] })];
    const test = { id: 'test1', title: 'Layout Test', course: '', questionIds: qs.map(x => x.id), seed: 11, created: t, updated: t };
    await PQ_.db.applyBatch({ questions: qs, tests: [test] }); await PQ_.loadAll();
  });
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .tp-q');

  console.log('1. the question menu');
  await rc('QTHREE');
  check('right-clicking a question opens a menu where you clicked', await page.locator('.menu').isVisible());
  const ids3 = await menuIds();
  check('numeric question: Edit, Start new section, Answer area, Work space, Fill rest of page, Remove', ['mi-q-edit', 'mi-q-section', 'mi-q-answer', 'mi-q-space', 'mi-q-rest', 'mi-q-remove'].every(i => ids3.includes(i)), ids3);
  check('the menu shows the current choices at the right (Answer line, None)', /Answer line/.test(await page.locator('#mi-q-answer').innerText()) && /None/.test(await page.locator('#mi-q-space').innerText()));
  await page.keyboard.press('Escape');
  check('Escape closes it', (await page.locator('.menu').count()) === 0);
  await rc('QTWO'); const idsTf = await menuIds(); await page.keyboard.press('Escape');
  check('a true/false question has no answer-area choice (nothing to change) but has the rest', !idsTf.includes('mi-q-answer') && idsTf.includes('mi-q-space') && idsTf.includes('mi-q-section'), idsTf);
  await rc('QSIX'); const idsMp = await menuIds(); await page.keyboard.press('Escape');
  check('right-clicking a multipart question away from a part offers no answer area (it says to click a part)', idsMp.includes('mi-q-answer-hint') && !idsMp.includes('mi-q-answer'), idsMp);
  await page.locator('#sheet-preview .tp-q', { hasText: 'QSIX' }).locator('.tp-part').first().click({ button: 'right', position: { x: 60, y: 6 } });
  check('right-clicking a part of a multipart question offers that part\'s answer area', /Part \(a\) answer area/.test(await page.locator('#mi-q-answer').innerText()));
  await page.keyboard.press('Escape');
  await q('QONE').hover();
  await page.locator('button[aria-label="More options for question 1"]').click();
  check('the ⋯ button in the question\'s tool row opens the same menu (for people who do not right-click)', await page.locator('#mi-q-space').isVisible());
  await page.keyboard.press('Escape');
  await page.mouse.move(700, 400);
  await q('QSEVEN').click({ button: 'right', position: { x: 80, y: 8 } });
  const box = await page.locator('.menu').boundingBox();
  check('a menu opened near the bottom of the window stays fully on screen', box.y >= 0 && box.y + box.height <= 950 + 1, box);
  await page.keyboard.press('Escape');
  await page.click('#pv-b'); await q('QTHREE').click({ button: 'right' }).catch(() => {});
  check('on Version B (read-only) there is no menu', (await page.locator('.menu').count()) === 0);
  await page.click('#pv-a');

  console.log('2. answer area: line, blank space, none');
  const keys0 = Object.keys(await D());
  check('an untouched test has no questionOptions, sections or font', !['questionOptions', 'sections', 'font'].some(k => keys0.includes(k)), keys0);
  check('numeric default prints "Answer:" and a line', /Answer:/.test(await q('QTHREE').innerText()) && (await q('QTHREE').locator('.tp-blankline').count()) === 1);
  await rc('QTHREE'); await page.click('#mi-q-answer'); await page.click('#mi-q-answer-blank');
  check('Blank space removes the "Answer:" label and the line and leaves empty space', !/Answer:/.test(await q('QTHREE').innerText()) && (await q('QTHREE').locator('.tp-blankline').count()) === 0 && (await q('QTHREE').locator('.tp-blankarea').count()) === 1);
  check('it is stored on the test for that question only', JSON.stringify((await D()).questionOptions) === JSON.stringify({ q3: { answerStyle: 'blank' } }) && /Answer:/.test(await q('QFIVE').innerText()));
  const ba = await q('QTHREE').locator('.tp-blankarea').boundingBox();
  check('the blank area is 14 mm tall', Math.abs(ba.height - 14 * 96 / 25.4) < 2, ba.height);
  await rc('QTHREE'); check('the menu shows Blank space with a check mark', /Blank space/.test(await page.locator('#mi-q-answer').innerText())); await page.click('#mi-q-answer'); check('and the choice is checked in the submenu', (await page.locator('#mi-q-answer-blank .menu-check').innerText()) === '✓' && (await page.locator('#mi-q-answer-line .menu-check').innerText()) === ''); await page.click('#mi-q-answer-none');
  check('None prints nothing after the question', (await q('QTHREE').locator('.tp-blankarea, .tp-numeric').count()) === 0 && (await D()).questionOptions.q3.answerStyle === 'none');
  await rc('QTHREE'); await page.click('#mi-q-answer'); await page.click('#mi-q-answer-line');
  check('choosing the normal answer line again removes the entry, so the test is exactly as it was (and not unsaved)', !('questionOptions' in (await D())) && !(await page.evaluate(() => PQ.active.exam.isDirty())));
  // short answer
  await rc('QFOUR'); await page.click('#mi-q-answer');
  check('short answer offers Ruled lines / Blank space / None', /Ruled lines/.test(await page.locator('#mi-q-answer-line').innerText()) && await page.locator('#mi-q-answer-blank, #mi-q-answer-none').count() === 2);
  await page.click('#mi-q-answer-blank');
  check('short answer as blank space: no ruled lines, the same height as the lines would take (3 x 22 pt)', (await q('QFOUR').locator('.tp-rule').count()) === 0 && Math.abs((await q('QFOUR').locator('.tp-blankarea').boundingBox()).height - 3 * 22 * 96 / 72) < 2);
  // a part of a multipart question
  await page.locator('#sheet-preview .tp-q', { hasText: 'QSIX' }).locator('.tp-part').nth(1).click({ button: 'right', position: { x: 60, y: 6 } });
  await page.click('#mi-q-answer'); await page.click('#mi-q-answer-none');
  check('a part has its own answer area, stored under questionId#partIndex', (await D()).questionOptions['q6#1'].answerStyle === 'none' && (await q('QSIX').locator('.tp-rule').count()) === 0);
  await page.locator('#sheet-preview .tp-q', { hasText: 'QSIX' }).locator('.tp-part').first().click({ button: 'right', position: { x: 60, y: 6 } });
  await page.click('#mi-q-answer'); await page.click('#mi-q-answer-blank');
  check('another part can differ (the numeric part is blank, the short part is none)', (await q('QSIX').locator('.tp-part').first().locator('.tp-blankarea').count()) === 1 && !/Answer:/.test(await q('QSIX').innerText()));
  await page.click('#btn-undo'); await page.click('#btn-undo'); await page.click('#btn-undo');
  check('Undo steps back through these choices', !('questionOptions' in (await D())) && /Answer:/.test(await q('QTHREE').innerText()) && (await q('QFOUR').locator('.tp-rule').count()) === 3);

  console.log('3. writing space');
  await rc('QTWO'); await page.click('#mi-q-space'); await page.click('#mi-q-space-medium');
  const sp = await q('QTWO').locator('.tp-space').boundingBox();
  check('Work space > Medium adds 40 mm of space after the question (shown dashed with a label while editing)', Math.abs(sp.height - 40 * 96 / 25.4) < 2 && /40 mm/.test(await q('QTWO').locator('.tp-space-label').innerText()) && (await D()).questionOptions.q2.space === 40, sp.height);
  await rc('QTWO'); await page.click('#mi-q-space'); await page.click('#mi-q-space-small');
  check('Small is 20 mm and Large is 70 mm', Math.abs((await q('QTWO').locator('.tp-space').boundingBox()).height - 20 * 96 / 25.4) < 2);
  await rc('QTWO'); await page.click('#mi-q-space'); await page.click('#mi-q-space-large');
  check('Large is 70 mm', (await D()).questionOptions.q2.space === 70);
  await rc('QTWO'); await page.click('#mi-q-space'); await page.click('#mi-q-space-custom');
  check('Custom opens a dialog with the current size', /Writing space/.test(await modal.innerText()) && (await page.inputValue('#space-mm')) === '70');
  await page.fill('#space-mm', '3'); check('under 5 mm is refused', await modal.locator('.btn.primary').isDisabled());
  await page.fill('#space-mm', '250'); check('over 200 mm is refused', await modal.locator('.btn.primary').isDisabled());
  await page.fill('#space-mm', '55.5'); await modal.locator('.btn.primary').click();
  check('Apply stores the size in mm and the menu says Custom is checked', (await D()).questionOptions.q2.space === 55.5);
  await rc('QTWO'); await page.click('#mi-q-space'); check('Custom is the checked row', (await page.locator('#mi-q-space-custom .menu-check').innerText()) === '✓' && (await page.locator('#mi-q-space-large .menu-check').innerText()) === ''); await page.click('#mi-q-space-none');
  check('Work space > None removes it again', !('questionOptions' in (await D())) && (await q('QTWO').locator('.tp-space').count()) === 0);
  await rc('QTWO'); await page.click('#mi-q-space'); await page.click('#mi-q-space-small');
  await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .tp-q');
  check('it survives save and reload', (await q('QTWO').locator('.tp-space').count()) === 1 && (await D()).questionOptions.q2.space === 20);
  // printing: heights
  await fmtPrint({ questionOptions: { q2: { space: 40 }, q3: { answerStyle: 'blank' }, q5: { answerStyle: 'none' } } }, 'l-space.pdf');
  const lw = words('l-space.pdf', 1), yOf = t => lw.find(w => w.text === t).y0;
  const gap = yOf('QTHREE') - yOf('QTWO');
  const gapNo = (await (async () => { await fmtPrint({ questionOptions: {} }, 'l-nospace.pdf'); const w = words('l-nospace.pdf', 1); return w.find(x => x.text === 'QTHREE').y0 - w.find(x => x.text === 'QTWO').y0; })());
  check('printed: 40 mm of writing space pushes the next question down by 40 mm (and the print sheet has no dashed outline or label)', Math.abs((gap - gapNo) - 40 * MM) < 6 && (await page.evaluate(() => document.querySelectorAll('#print-root .tp-space-label').length === 0)), [gap, gapNo]);
  const t1 = pdfText('l-space.pdf');
  check('printed: the blank and the "none" numeric questions have no "Answer:" label; only the numeric part of the multipart question keeps one', /QTHREE/.test(t1) && /QFIVE/.test(t1) && (t1.match(/Answer:/g) || []).length === 1, (t1.match(/Answer:/g) || []).length);

  console.log('4. fill rest of page');
  await rc('QSEVEN'); await page.click('#mi-q-rest');
  check('Fill rest of page is stored as "rest" and checked in the menu, with a placeholder on screen', (await D()).questionOptions.q7.space === 'rest' && /rest of the page/.test(await q('QSEVEN').locator('.tp-space-label').innerText()));
  await rc('QSEVEN'); check('the menu row is checked', (await page.locator('#mi-q-rest .menu-check').innerText()) === '✓' && /Rest of page/.test(await page.locator('#mi-q-space').innerText())); await page.keyboard.press('Escape');
  const restTest = async (k) => {    // k filler questions, then the rest-of-page question, then one more
    const ids = await page.evaluate(async k => {
      const PQ_ = window.PQ, extra = [];
      for (let i = 0; i < k; i++) extra.push(Object.assign(PQ_.emptyQuestion('mc', PQ_.DEFAULT_BANK_ID), { id: 'f' + i, prompt: 'FILL' + i, status: 'ready', answer: { options: ['one', 'two', 'three', 'four'], correct: 0 } }));
      extra.push(Object.assign(PQ_.emptyQuestion('numeric', PQ_.DEFAULT_BANK_ID), { id: 'rq', prompt: 'QREST here', status: 'ready', answer: { value: '1', units: '', tolerance: 0 } }), Object.assign(PQ_.emptyQuestion('tf', PQ_.DEFAULT_BANK_ID), { id: 'nx', prompt: 'QNEXT here', status: 'ready', answer: { correct: true } }));
      await PQ_.db.applyBatch({ questions: extra }); await PQ_.loadAll(); return extra.map(x => x.id);
    }, k);
    return ids;
  };
  let ids0 = await restTest(0);
  await fmtPrint({ questionOptions: { rq: { space: 'rest' } } }, 'r-0.pdf', ['rq', 'nx']);
  check('printed: the question after a "rest of page" question starts on the next page (the space took the rest of page 1)', pdfPages('r-0.pdf') === 2 && /QREST/.test(pdfPage('r-0.pdf', 1)) && /QNEXT/.test(pdfPage('r-0.pdf', 2)), [pdfPages('r-0.pdf')]);
  await fmtPrint({}, 'r-0n.pdf', ['rq', 'nx']);
  check('and without it both are on one page (so the space really is what moved it)', pdfPages('r-0n.pdf') === 1);
  // the sweep: the rest-of-page question lands at different heights on the page; never a blank page, never more than one extra page
  const sweep = [];
  for (const k of [0, 3, 5, 7, 9, 11]) {
    await page.evaluate(async () => { const x = PQ.state.questions.filter(q => /^(f\d+|rq|nx)$/.test(q.id)).map(q => q.id); await PQ.db.applyBatch({ deletes: { questions: x } }); await PQ.loadAll(); });
    const fill = await restTest(k), order = fill.slice(0, k).concat(['rq', 'nx']);
    await fmtPrint({ questionOptions: { rq: { space: 'rest' } } }, 'r-s' + k + '.pdf', order);
    await fmtPrint({}, 'r-b' + k + '.pdf', order);
    const n = pdfPages('r-s' + k + '.pdf'), nb = pdfPages('r-b' + k + '.pdf');
    const per = Array.from({ length: n }, (_, i) => pdfPage('r-s' + k + '.pdf', i + 1));
    const pg = tok => per.findIndex(p => p.includes(tok)) + 1;
    sweep.push({ k, n, nb, blank: per.some(p => !p.trim()), rest: pg('QREST'), next: pg('QNEXT') });
  }
  check('SWEEP: wherever the question lands, no page is blank, at most one page is added, and the next question is never on the same page as unspent space', sweep.every(r => !r.blank && r.n <= r.nb + 1 && r.next >= r.rest && r.next - r.rest <= 1), sweep);
  check('SWEEP: when there is room left on its page the next question moves to the following page', sweep.some(r => r.next === r.rest + 1) && sweep.filter(r => r.next === r.rest + 1).length >= 3, sweep);
  await page.evaluate(async () => { const x = PQ.state.questions.filter(q => /^(f\d+|rq|nx)$/.test(q.id)).map(q => q.id); await PQ.db.applyBatch({ deletes: { questions: x } }); await PQ.loadAll(); });

  console.log('5. sections');
  await rc('QFOUR'); await page.click('#mi-q-section');
  check('Start new section here adds a heading above that question and puts the cursor in its title', (await page.locator('#sheet-preview .tp-section').count()) === 1 && (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('tp-sec-title'))));
  await page.keyboard.type('Short Answer');
  await page.fill('#sheet-preview .tp-sec-instr', 'Answer in the space provided. Show all work.');
  const sec = (await D()).sections;
  check('typing sets the section title and instructions (stored with the question it starts at)', sec.length === 1 && sec[0].title === 'Short Answer' && sec[0].startId === 'q4' && /Show all work/.test(sec[0].instructions), sec);
  check('the heading sits inside the block of its first question, above it', await q('QFOUR').evaluate(e => e.closest('.tp-block').firstElementChild.classList.contains('tp-section')));
  await rc('QFOUR'); check('"Start new section here" is greyed out where a section already starts', await page.locator('#mi-q-section').isDisabled()); await page.keyboard.press('Escape');
  check('questions keep counting across sections (the heading does not restart numbering)', (await page.locator('#sheet-preview .tp-num').allInnerTexts()).join() === '1.,2.,3.,4.,5.,6.,7.');
  // print
  await fmtPrint({ sections: (await D()).sections }, 'sec-a.pdf');
  const st = pdfText('sec-a.pdf');
  check('printed: the heading and its instruction line appear directly above the question, in bold and italic, once', /Short Answer\s+Answer in the space provided\. Show all work\.\s+4\./.test(st.replace(/\n+/g, ' ').replace(/\s+/g, ' ')) && (st.match(/Short Answer/g) || []).length === 1, st.slice(0, 600));
  const fonts = pdfFonts('sec-a.pdf');
  check('printed: the heading is bold and the instructions italic (bold and italic fonts are in the PDF)', /Bold/.test(fonts) && /Italic|Oblique/.test(fonts), fonts);
  // Version B and the key
  await page.click('#pv-b');
  const bHead = await page.locator('#sheet-preview .tp-section').count(), bIdx = await page.evaluate(() => { const bl = Array.from(document.querySelectorAll('#sheet-preview .tp-block')); return bl.findIndex(b => b.querySelector('.tp-section')); });
  check('Version B shows the heading (read-only) above the first question of its stretch, and no editing inputs', bHead === 1 && (await page.locator('#sheet-preview .tp-section input').count()) === 0 && /Short Answer/.test(await page.locator('#sheet-preview .tp-section').innerText()), [bHead, bIdx]);
  const bq = await page.evaluate(() => Array.from(document.querySelectorAll('#sheet-preview .tp-q .tp-prompt')).map(p => p.textContent.slice(0, 5)).join());
  check('Version B shuffles only within the sections: the first three questions are still QONE, QTWO and QTHREE in some order', bq.split(',').slice(0, 3).sort().join() === ['QONE ', 'QTWO ', 'QTHRE'].sort().join(), bq);
  await page.click('#pv-a');
  // remove the question a section starts at: it moves to the next question
  await page.locator('button[aria-label="Remove question 4 from the test"]').click();
  check('removing the question a section starts at moves the section to the next question', (await D()).sections[0].startId === 'q5' && (await q('QFIVE').evaluate(e => e.closest('.tp-block').firstElementChild.classList.contains('tp-section'))));
  await page.click('#btn-undo');
  check('Undo puts the question back and the section on it', (await D()).sections[0].startId === 'q4' && (await D()).questionIds.includes('q4'));
  // two sections, remove with the x
  await rc('QSEVEN'); await page.click('#mi-q-section'); await page.keyboard.type('Matching');
  check('a second section can be added anywhere', (await D()).sections.length === 2 && (await page.locator('#sheet-preview .tp-section').count()) === 2);
  await page.locator('#sheet-preview .tp-section').last().hover(); await page.locator('#sheet-preview .tp-sec-x').last().click();
  check('the × on a heading removes the heading and keeps the questions', (await D()).sections.length === 1 && (await page.locator('#sheet-preview .tp-q').count()) === 7);
  // removing the last question removes a section that has nothing after it
  await page.click('#btn-undo');
  await page.locator('button[aria-label="Remove question 7 from the test"]').click();
  check('removing the last question removes a section that started there (nothing is left to start at)', (await D()).sections.length === 1 && (await D()).sections[0].startId === 'q4');
  await page.click('#btn-undo');
  // Check lists a section whose question is gone
  await page.evaluate(() => { const d = PQ.active.exam.getDraft(); d.sections = d.sections.concat([{ id: 'ghost', startId: 'gone', title: 'Ghost', instructions: '' }]); });
  await page.keyboard.press('Control+s');
  await page.click('#btn-check');
  check('Check reports a section that points at a question that is not on the paper, and can remove it', /section heading/.test(await modal.innerText()) && await modal.locator('button:has-text("Remove those section headings")').count() === 1, await modal.innerText());
  await modal.locator('button:has-text("Remove those section headings")').click();
  check('after the fix only the real section is left', (await D()).sections.every(x => x.startId !== 'gone') && (await D()).sections.length === 2);
  await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  const saved = await page.evaluate(() => PQ.state.tests[0]);
  check('sections and question options are saved on the test', saved.sections.length === 2 && saved.questionOptions.q2.space === 20, saved);
  const rt = await page.evaluate(async () => { const p = await PQ.collectPayload(); const r = await PQ.buildBankPdf(p, {}); const back = await PQ.readPdfPayload(r.bytes); return { same: PQ.stable(back) === PQ.stable(p), ok: PQ.parsePayload(back).ok, has: ['sections', 'questionOptions'].map(k => k in back.tests[0]) }; });
  check('export -> read back: sections and question options survive the bank PDF and validate', rt.same && rt.ok && rt.has.join() === 'true,true', rt);
  await page.click('#btn-history'); await page.waitForSelector('.vcard, #history-empty');
  check('version history stores them too (the latest save has the sections)', (await page.evaluate(async () => (await PQ.db.getAll('testVersions')).some(v => (v.snapshot.sections || []).length === 2))));
  await page.click('#btn-history-close');

  console.log('6. font');
  await page.click('#menu-format'); await page.click('#mi-font');
  check('Format > Font opens a dialog with a name box, a list that starts with the default, and a preview', /Font/.test(await modal.locator('h3').innerText()) && await page.locator('#font-input').isVisible() && (await page.locator('#font-list .font-item').first().innerText()).startsWith('Default') && await page.locator('#font-preview').isVisible());
  check('the list offers the default and the common font names', (await page.locator('#font-list .font-item').count()) >= 10);
  await page.fill('#font-input', 'DejaVu Serif');
  check('typing a name shows it in the preview and in the list filter', (await page.locator('#font-preview').evaluate(e => getComputedStyle(e).fontFamily)).startsWith('"DejaVu Serif"'));
  await page.fill('#font-input', 'bad"name');
  check('a name with quotes is refused (Apply is off, the hint turns red)', await modal.locator('.btn.primary').isDisabled() && /Use only letters/.test(await page.locator('#font-hint').innerText()));
  await page.fill('#font-input', 'Tim');
  check('typing narrows the list', (await page.locator('#font-list .font-item').allInnerTexts()).some(t => /Times/.test(t)) && !(await page.locator('#font-list .font-item').allInnerTexts()).some(t => /Georgia/.test(t)));
  await page.locator('#font-list .font-item', { hasText: 'Times New Roman' }).click();
  check('clicking a font puts its name in the box', (await page.inputValue('#font-input')) === 'Times New Roman');
  await page.keyboard.press('Escape');
  check('Escape changes nothing', !('font' in (await D())));
  await page.click('#menu-format'); await page.click('#mi-font'); await page.fill('#font-input', 'DejaVu Serif'); await modal.locator('.btn.primary').click();
  check('Apply stores the font on the test, the paper uses it, and the menu shows it', (await D()).font === 'DejaVu Serif' && (await sheet().evaluate(e => getComputedStyle(e).fontFamily)).startsWith('"DejaVu Serif"') && await (async () => { await page.click('#menu-format'); const t = await page.locator('#mi-font .menu-value').innerText(); await page.keyboard.press('Escape'); return t === 'DejaVu Serif'; })());
  check('the title and course boxes on the paper use the font too', (await page.locator('#f-test-title').evaluate(e => getComputedStyle(e).fontFamily)).startsWith('"DejaVu Serif"'));
  await fmtPrint({ font: 'DejaVu Serif' }, 'f-serif.pdf');
  check('printed: the PDF really uses the font (poppler lists it)', /DejaVuSerif/.test(pdfFonts('f-serif.pdf')), pdfFonts('f-serif.pdf'));
  await fmtPrint({ font: 'DejaVu Sans Mono' }, 'f-mono.pdf');
  check('another font changes the printed font', /DejaVuSansMono/.test(pdfFonts('f-mono.pdf')) && !/DejaVuSerif/.test(pdfFonts('f-mono.pdf')));
  await fmtPrint({ font: 'Definitely Not Installed 123' }, 'f-missing.pdf');
  check('printed: a font that is not installed falls back to the default (Helvetica-like), the paper still prints', pdfPages('f-missing.pdf') >= 1 && /Liberation ?Sans|Helvetica|Arial|DejaVuSans/.test(pdfFonts('f-missing.pdf')) && /QONE/.test(pdfText('f-missing.pdf')), pdfFonts('f-missing.pdf'));
  await fmtPrint({}, 'f-default.pdf');
  check('no font set prints with the default stack as before', /Liberation ?Sans|Helvetica|Arial/.test(pdfFonts('f-default.pdf')) && !/DejaVuSerif/.test(pdfFonts('f-default.pdf')));
  // listing the computer's fonts (Chromium only, with permission): mocked here because the sandbox has no permission prompt
  await page.evaluate(() => { window.queryLocalFonts = async () => [{ family: 'Zeta Sans' }, { family: 'Alpha Serif' }, { family: 'Alpha Serif' }, { family: 'Mid Mono' }]; });
  await page.click('#menu-format'); await page.click('#mi-font');
  check('where the browser can list fonts there is a button for it', await page.locator('#btn-local-fonts').isVisible());
  await page.click('#btn-local-fonts');
  const fl = await page.locator('#font-list .font-item').allInnerTexts();
  check('it replaces the list with the computer\'s fonts, sorted and without repeats', fl.join('|') === 'Default (Helvetica)|Alpha Serif|Mid Mono|Zeta Sans', fl);
  await page.locator('#font-list .font-item', { hasText: 'Mid Mono' }).click(); await modal.locator('.btn.primary').click();
  check('and one of them can be chosen', (await D()).font === 'Mid Mono');
  await page.evaluate(() => { window.queryLocalFonts = async () => { throw new Error('denied'); }; });
  await page.click('#menu-format'); await page.click('#mi-font'); await page.click('#btn-local-fonts');
  check('if the browser refuses permission it says so and keeps the typed-name way', /did not allow/.test(await page.locator('.toast').last().innerText()) && await page.locator('#font-input').isVisible());
  await modal.locator('button:has-text("Use the default")').click();
  check('Use the default removes the font from the test again', !('font' in (await D())));

  console.log('7. nothing splits across pages with sections, space and fonts in play');
  const gen = await page.evaluate(async () => {
    const T = '2026-10-01T10:00:00.000Z', ids = [], qs = [], opts = {};
    for (let i = 0; i < 24; i++) {
      const n = String(i).padStart(2, '0'), kind = i % 4, id = 'p' + n;
      if (kind === 0) qs.push(Object.assign(PQ.emptyQuestion('mc', PQ.DEFAULT_BANK_ID), { id, prompt: 'QS' + n + ' ' + 'A reasonably long question stem. '.repeat(2), status: 'ready', answer: { options: ['a', 'b', 'c', 'QE' + n], correct: 0 } }));
      else if (kind === 1) { qs.push(Object.assign(PQ.emptyQuestion('numeric', PQ.DEFAULT_BANK_ID), { id, prompt: 'QS' + n + ' number QE' + n, status: 'ready', answer: { value: '1', units: '', tolerance: 0 } })); opts[id] = { space: 25 }; }
      else if (kind === 2) qs.push(Object.assign(PQ.emptyQuestion('short', PQ.DEFAULT_BANK_ID), { id, prompt: 'QS' + n + ' short QE' + n, status: 'ready', answer: { lines: 3, rubric: '' } }));
      else { qs.push(Object.assign(PQ.emptyQuestion('multipart', PQ.DEFAULT_BANK_ID), { id, prompt: 'QS' + n + ' intro', status: 'ready', answer: { parts: [{ type: 'numeric', prompt: 'p1', answer: { value: '1', units: '', tolerance: 0 } }, { type: 'short', prompt: 'p2 QE' + n, answer: { lines: 2, rubric: '' } }] } })); opts[id + '#0'] = { answerStyle: 'blank' }; }
      ids.push(id);
    }
    await PQ.db.applyBatch({ questions: qs }); await PQ.loadAll();
    return { ids, opts };
  });
  const sections = [{ id: 's1', startId: 'p00', title: 'Part one', instructions: 'Circle or write.' }, { id: 's2', startId: 'p08', title: 'Part two', instructions: '' }, { id: 's3', startId: 'p16', title: 'Part three', instructions: 'Show all work.' }];
  const viol = []; let layouts = 0;
  for (const font of ['', 'DejaVu Serif']) for (const style of ['standard', 'classic', 'condensed']) for (const paper of ['letter', 'a4']) {
    const extra = { sections, questionOptions: Object.assign({}, gen.opts, { p01: { space: 'rest' }, p12: { space: 'rest' } }), questionStyle: style, margins: { top: 10, right: 12, bottom: 10, left: 12 } };
    if (font) extra.font = font;
    await page.evaluate(p => localStorage.setItem('prime-questions:paper', p), paper);
    const f = ['p', font ? 'serif' : 'def', style, paper].join('-') + '.pdf';
    await fmtPrint(extra, f, gen.ids);
    const n = pdfPages(f), pages = Array.from({ length: n }, (_, i) => pdfPage(f, i + 1)), pageOf = tok => pages.findIndex(p => p.includes(tok));
    layouts++;
    for (const id of gen.ids) { const k = id.slice(1), a = pageOf('QS' + k), b = pageOf('QE' + k); if (a < 0 || b < 0 || a !== b) violations(id, f, a, b); }
    if (pages.some(p => !p.trim())) viol.push(f + ' blank page');
    for (const t of ['Part one', 'Part two', 'Part three']) { const pi = pageOf(t); const nextQ = { 'Part one': 'QS00', 'Part two': 'QS08', 'Part three': 'QS16' }[t]; if (pi < 0 || pi !== pageOf(nextQ)) viol.push(f + ' heading ' + t + ' not with its first question'); }
  }
  function violations(id, f, a, b) { viol.push(f + ' ' + id + ' ' + (a + 1) + ' ' + (b + 1)); }
  check('PROPERTY: over ' + layouts + ' layouts (2 fonts x 3 styles x 2 papers, 3 sections, writing space, two fill-the-page questions, blank parts) no question splits, no page is blank, and every heading is on the page of its first question', viol.length === 0, viol.slice(0, 6));
  const greys = await (async () => { await page.emulateMedia({ media: 'print' }); const r = await page.evaluate(() => { const bad = [], ach = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return true; const [r, g, b, a] = m.map(Number); return (a === 0) || (r === g && g === b); };
    for (const e of document.querySelectorAll('#print-root, #print-root *')) { const s = getComputedStyle(e); for (const k of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'outlineColor']) { const w = !k.startsWith('border') && k !== 'outlineColor' || parseFloat(s[k.replace('Color', 'Width')]) > 0; if (w && !ach(s[k])) bad.push(e.className + ':' + k); }
      if (parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none') bad.push(e.className + ':outline'); }
    return { bad: bad.slice(0, 5), controls: document.querySelectorAll('#print-root input, #print-root button, #print-root textarea, #print-root .ed-only, #print-root .tp-space-label').length }; }); await page.emulateMedia({ media: null }); return r; })();
  check('the printed paper has no outlines, labels or controls (editing aids never print) and is plain black', greys.bad.length === 0 && greys.controls === 0, greys);

  console.log('8. network and errors');
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
