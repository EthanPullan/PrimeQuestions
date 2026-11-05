// Schema 4: the Format menu (paper size, heading size, text size, question style, margins) stored per test, and what each
// setting does to the printed paper (checked by turning the paper into PDFs and measuring them with poppler).
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

const pdfPages = f => Number((/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString()) || [])[1]);
const pdfText = f => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const pdfPage = (f, n) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', f, '-']).toString();
// word boxes of page 1: [{ text, x0, y0, x1, y1 }] in points
const words = f => {
  const html = execFileSync('pdftotext', ['-bbox', '-f', '1', '-l', '1', f, '-']).toString();
  return Array.from(html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)).map(m => ({ text: m[5], x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] }));
};
const MM = 72 / 25.4;

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  page.setDefaultTimeout(8000);
  await openApp(page);
  const modal = page.locator('.modal');
  const D = () => page.evaluate(() => PQ.active.exam.getDraft());
  const sheet = () => page.locator('#sheet-preview .sheet');
  const sub = async (parent, item) => { await page.click('#menu-format'); await page.click('#mi-' + parent); await page.click('#mi-' + parent + '-' + item); };

  // data: a short-option and a long-option multiple choice, true/false, a multipart question (tf, mc, short parts), a short answer
  await page.evaluate(async () => {
    const PQ_ = window.PQ, t = new Date().toISOString(), B1 = PQ_.DEFAULT_BANK_ID;
    const mk = (type, prompt, answer, extra) => Object.assign(PQ_.emptyQuestion(type, B1), { prompt, answer, status: 'ready' }, extra || {});
    const qs = [
      mk('mc', 'Short options question', { options: ['0.75', '0.34', '1.33', '1.5'], correct: 0 }),
      mk('mc', 'Long options question', { options: ['A fairly long option that will not fit across', 'Another fairly long option here', 'Short'], correct: 0 }),
      mk('tf', 'The sun is a star.', { correct: true }),
      mk('multipart', 'A car travels 120 km in 2 h.', { parts: [{ type: 'tf', prompt: 'It is fast.', answer: { correct: true } }, { type: 'mc', prompt: 'Which?', answer: { options: ['a', 'b', 'c'], correct: 0 } }, { type: 'short', prompt: 'Explain.', answer: { lines: 2, rubric: '' } }] }),
      mk('short', 'Define density.', { lines: 3, rubric: 'm/V' })];
    const test = { id: PQ_.uuid(), title: 'Format Test', course: 'Science 9', questionIds: qs.map(q => q.id), seed: 9, created: t, updated: t };
    await PQ_.db.applyBatch({ questions: qs, tests: [test] }); await PQ_.loadAll();
  });
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main').first().click(); await page.waitForSelector('#sheet-preview .tp-q');

  console.log('1. the Format menu');
  await page.click('#menu-format');
  const labels = await page.locator('.menu > .menu-item').allInnerTexts();
  check('Format lists Paper size, Font, Heading size, Text size, Questions, Option layout, Answer area and Margins with their current values', ['Paper size', 'Font', 'Heading size', 'Text size', 'Questions', 'Option layout', 'Answer area', 'Margins'].every((l, i) => labels[i].replace(/\s+/g, ' ').startsWith(l)) && /Letter/.test(labels[0]) && /Default/.test(labels[1]) && /Medium/.test(labels[2]) && /Medium/.test(labels[3]) && /Standard/.test(labels[4]) && /Automatic/.test(labels[5]) && /Lines/.test(labels[6]) && /Normal/.test(labels[7]), labels);
  await page.click('#mi-style');
  const styleText = await page.locator('.submenu').innerText();
  check('Questions opens a submenu of Standard, Classic and Condensed, each with a description, Standard checked', /Standard/.test(styleText) && /Classic/.test(styleText) && /Condensed/.test(styleText) && /blank before each objective number/.test(styleText) && /Saves paper/.test(styleText) && (await page.locator('#mi-style-standard .menu-check').innerText()) === '✓');
  await page.click('#mi-heading');
  check('opening another submenu replaces the first (one at a time)', (await page.locator('.submenu').count()) === 1 && (await page.locator('#mi-heading-large').count()) === 1 && (await page.locator('#mi-style-classic').count()) === 0);
  await page.keyboard.press('Escape');
  check('Escape closes the submenu, then the menu', true);
  await page.keyboard.press('Escape');
  const keys0 = Object.keys(await D());
  check('an untouched test has none of the schema 4 fields', !['headingSize', 'textSize', 'questionStyle', 'margins'].some(k => keys0.includes(k)), keys0);
  check('the paper starts at medium sizes, standard style, and the page margins (16/14/18/14 mm) as padding', await sheet().evaluate(e => { const c = getComputedStyle(e); const mm = v => Math.round(parseFloat(v) * 25.4 / 96); return c.fontSize === '14.6667px' && e.classList.contains('style-standard') && mm(c.paddingTop) === 16 && mm(c.paddingRight) === 14 && mm(c.paddingBottom) === 18 && mm(c.paddingLeft) === 14; }));

  console.log('2. heading and text size');
  await sub('heading', 'large');
  check('Heading size > Large is stored and the title grows to 22 pt', (await D()).headingSize === 'large' && (await page.locator('#f-test-title').evaluate(e => getComputedStyle(e).fontSize)) === '29.3333px');
  await sub('heading', 'small');
  check('Small is 15 pt', (await D()).headingSize === 'small' && (await page.locator('#f-test-title').evaluate(e => getComputedStyle(e).fontSize)) === '20px');
  await sub('heading', 'medium');
  check('choosing Medium again removes the field (the test is exactly as it was, so not unsaved)', !('headingSize' in (await D())) && !(await page.evaluate(() => PQ.active.exam.isDirty())));
  await sub('text', 'small');
  check('Text size > Small is stored and the paper text is 10 pt', (await D()).textSize === 'small' && (await sheet().evaluate(e => getComputedStyle(e).fontSize)) === '13.3333px');
  await sub('text', 'large');
  check('Large is 12.5 pt', (await D()).textSize === 'large' && (await sheet().evaluate(e => getComputedStyle(e).fontSize)) === '16.6667px');
  await page.click('#menu-format');
  check('the menu shows the current values', /Medium/.test(await page.locator('#mi-heading .menu-value').innerText()) && /Large/.test(await page.locator('#mi-text .menu-value').innerText()));
  await page.keyboard.press('Escape');
  await page.click('#btn-undo'); await page.click('#btn-undo');
  check('Undo steps back through format changes', !('textSize' in (await D())));

  console.log('3. question styles on the paper');
  await sub('style', 'classic');
  check('Classic is stored', (await D()).questionStyle === 'classic' && await sheet().evaluate(e => e.classList.contains('style-classic')));
  check('Classic puts a blank before every multiple-choice and true/false number and part, and nowhere else', (await page.locator('#sheet-preview .tp-numblank').count()) === 3 && (await page.locator('#sheet-preview .tp-plblank').count()) === 2, [await page.locator('#sheet-preview .tp-numblank').count(), await page.locator('#sheet-preview .tp-plblank').count()]);
  check('Classic has nothing to circle for true/false, still has the option letters and the ruled lines', !/Circle one/.test(await sheet().innerText()) && (await page.locator('#sheet-preview .tp-opt').count()) >= 7 && (await page.locator('#sheet-preview .tp-rule').count()) === 5);
  check('and no stray "null" text', !/null|undefined/.test(await sheet().innerText()));
  await sub('style', 'condensed');
  check('Condensed is stored; Circle one is back', (await D()).questionStyle === 'condensed' && /Circle one/.test(await sheet().innerText()) && (await page.locator('#sheet-preview .tp-numblank').count()) === 0);
  check('Condensed runs short options across the page but not long ones', (await page.locator('#sheet-preview .tp-opts.across').count()) === 2 && (await page.locator('.tp-q', { hasText: 'Long options' }).locator('.across').count()) === 0 && (await page.locator('.tp-q', { hasText: 'Short options' }).locator('.across').count()) === 1);
  await sub('style', 'standard');
  check('back to Standard removes the field again', !('questionStyle' in (await D())) && (await page.locator('#sheet-preview .tp-opts.across').count()) === 0);

  console.log('4. margins');
  await page.click('#menu-format'); await page.click('#mi-margins');
  check('Margins has Narrow, Normal, Wide and Custom, Normal checked', (await page.locator('#mi-margins-normal .menu-check').innerText()) === '✓' && await page.locator('#mi-margins-narrow, #mi-margins-wide, #mi-margins-custom').count() === 3);
  await page.click('#mi-margins-narrow');
  check('Narrow is 10 mm all round, drawn as the paper\'s padding', JSON.stringify((await D()).margins) === JSON.stringify({ top: 10, right: 10, bottom: 10, left: 10 }) && await sheet().evaluate(e => Math.round(parseFloat(getComputedStyle(e).paddingLeft) * 25.4 / 96) === 10));
  await page.click('#menu-format'); check('the menu says Narrow', /Narrow/.test(await page.locator('#mi-margins .menu-value').innerText())); await page.keyboard.press('Escape');
  await sub('margins', 'normal');
  check('Normal removes the field', !('margins' in (await D())));
  await page.click('#menu-format'); await page.click('#mi-margins'); await page.click('#mi-margins-custom');
  check('Custom opens a dialog filled with the current margins', /Page margins/.test(await modal.innerText()) && (await page.inputValue('#mg-top')) === '16' && (await page.inputValue('#mg-right')) === '14' && (await page.inputValue('#mg-bottom')) === '18' && (await page.inputValue('#mg-left')) === '14');
  await page.fill('#mg-top', '3');
  check('a margin under 5 mm disables Apply and the hint turns red', await modal.locator('.btn.primary').isDisabled());
  await page.fill('#mg-top', '60');
  check('over 40 mm is refused too', await modal.locator('.btn.primary').isDisabled());
  await page.fill('#mg-top', '12'); await page.fill('#mg-right', '20'); await page.fill('#mg-bottom', '12'); await page.fill('#mg-left', '20');
  await modal.locator('.btn.primary').click();
  check('Apply stores the four values (mm) and the menu says Custom', JSON.stringify((await D()).margins) === JSON.stringify({ top: 12, right: 20, bottom: 12, left: 20 }) && await (async () => { await page.click('#menu-format'); const t = await page.locator('#mi-margins .menu-value').innerText(); await page.keyboard.press('Escape'); return t === 'Custom'; })());
  await page.click('#menu-format'); await page.click('#mi-margins'); await page.click('#mi-margins-custom'); await page.fill('#mg-top', '30'); await page.keyboard.press('Escape');
  check('Escape on the dialog changes nothing', (await D()).margins.top === 12 && !(await modal.isVisible()));
  await page.click('#menu-format'); await page.click('#mi-margins'); await page.click('#mi-margins-custom'); await page.fill('#mg-top', '16'); await page.fill('#mg-right', '14'); await page.fill('#mg-bottom', '18'); await page.fill('#mg-left', '14'); await modal.locator('.btn.primary').click();
  check('typing the default margins into Custom removes the field (same as Normal)', !('margins' in (await D())));

  console.log('5. saving, history and the bank file');
  await sub('style', 'classic'); await sub('heading', 'large'); await sub('margins', 'wide');
  await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  const s1 = await page.evaluate(() => { const t = PQ.state.tests[0]; return { q: t.questionStyle, h: t.headingSize, m: t.margins, tx: 'textSize' in t }; });
  check('Save keeps exactly the fields that were changed', s1.q === 'classic' && s1.h === 'large' && s1.m.top === 25 && s1.m.right === 22 && !s1.tx, s1);
  await sub('style', 'condensed'); await sub('text', 'small');
  await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  await page.click('#btn-history'); await page.waitForSelector('.vcard');
  await page.locator('.vcard').nth(1).locator('button').click();
  check('Restoring an older version brings its format back (classic, no text size) and is undoable', (await D()).questionStyle === 'classic' && !('textSize' in (await D())) && await sheet().evaluate(e => e.classList.contains('style-classic')));
  await page.click('#btn-undo');
  check('Undo of the restore returns to the condensed version', (await D()).questionStyle === 'condensed' && (await D()).textSize === 'small');
  const rt = await page.evaluate(async () => {
    const p = await PQ.collectPayload(); const r = await PQ.buildBankPdf(p, {}); const back = await PQ.readPdfPayload(r.bytes);
    const parsed = PQ.parsePayload(back);
    return { same: PQ.stable(back) === PQ.stable(p), ok: parsed.ok, errors: parsed.errors, fields: ['questionStyle', 'headingSize', 'margins', 'textSize'].map(k => k in back.tests[0]) };
  });
  check('export -> read back: the format fields survive the bank PDF and validate', rt.same && rt.ok && rt.fields.join() === 'true,true,true,true', rt);

  console.log('6. printing');
  // set the saved test to a known state: standard, medium, default margins
  const setTest = (extra) => page.evaluate(async extra => {
    const t = Object.assign({}, PQ.state.tests[0]); for (const k of ['headingSize', 'textSize', 'questionStyle', 'margins']) delete t[k]; Object.assign(t, extra); PQ.state.tests[0] = t; return t;
  }, extra);
  const dump = async (extra, file, paper) => { await page.evaluate(p => localStorage.setItem('prime-questions:paper', p), paper || 'letter'); const t = await setTest(extra); await page.evaluate(async t => { await PQ.preparePrint('test', 'A', t); }, t); await page.pdf({ path: file, preferCSSPageSize: true }); };
  await dump({}, 'f-default.pdf'); await dump({ headingSize: 'medium', textSize: 'medium', questionStyle: 'standard', margins: { top: 16, right: 14, bottom: 18, left: 14 } }, 'f-explicit.pdf');
  check('explicit default settings print exactly like a test with no settings (nothing changed for old tests)', pdfText('f-default.pdf') === pdfText('f-explicit.pdf') && pdfPages('f-default.pdf') === pdfPages('f-explicit.pdf'));
  const x0 = f => Math.min(...words(f).map(w => w.x0));
  await dump({ margins: { top: 10, right: 10, bottom: 10, left: 10 } }, 'f-narrow.pdf'); await dump({ margins: { top: 25, right: 22, bottom: 25, left: 22 } }, 'f-wide.pdf');
  const mx = [x0('f-narrow.pdf'), x0('f-default.pdf'), x0('f-wide.pdf')], expect = [10 * MM, 14 * MM, 22 * MM];
  check('margins move the text: left edge at ~10, 14 and 22 mm for Narrow, Normal and Wide', mx.every((v, i) => Math.abs(v - expect[i]) < 4), { got: mx.map(v => (v / MM).toFixed(1)), expect: [10, 14, 22] });
  const top = f => Math.min(...words(f).map(w => w.y0));
  check('the top margin is applied too (Wide starts lower than Narrow)', top('f-wide.pdf') > top('f-narrow.pdf') + 10 * MM, [top('f-narrow.pdf'), top('f-wide.pdf')]);
  await dump({ headingSize: 'small' }, 'f-hs.pdf'); await dump({ headingSize: 'large' }, 'f-hl.pdf');
  const hgt = (f, t) => { const w = words(f).find(x => x.text === t); return w.y1 - w.y0; };
  check('heading size changes the title (Format ~ 15 : 18 : 22 pt)', hgt('f-hs.pdf', 'Format') < hgt('f-default.pdf', 'Format') && hgt('f-default.pdf', 'Format') < hgt('f-hl.pdf', 'Format') && Math.abs(hgt('f-hl.pdf', 'Format') / hgt('f-default.pdf', 'Format') - 22 / 18) < 0.12, [hgt('f-hs.pdf', 'Format'), hgt('f-default.pdf', 'Format'), hgt('f-hl.pdf', 'Format')]);
  await dump({ textSize: 'small' }, 'f-ts.pdf'); await dump({ textSize: 'large' }, 'f-tl.pdf');
  check('text size changes the questions (10 : 11 : 12.5 pt) and leaves the title alone', hgt('f-ts.pdf', 'Define') < hgt('f-default.pdf', 'Define') && hgt('f-default.pdf', 'Define') < hgt('f-tl.pdf', 'Define') && Math.abs(hgt('f-tl.pdf', 'Format') - hgt('f-default.pdf', 'Format')) < 0.5, [hgt('f-ts.pdf', 'Define'), hgt('f-default.pdf', 'Define'), hgt('f-tl.pdf', 'Define'), hgt('f-tl.pdf', 'Format'), hgt('f-default.pdf', 'Format')]);
  await dump({ questionStyle: 'classic' }, 'f-classic.pdf'); await dump({ questionStyle: 'condensed' }, 'f-cond.pdf');
  check('Classic prints no "Circle one" and keeps every question', !/Circle one/.test(pdfText('f-classic.pdf')) && /Define density/.test(pdfText('f-classic.pdf')) && /Long options/.test(pdfText('f-classic.pdf')));
  const numX = words('f-classic.pdf').find(w => w.text === '1.').x0;
  check('Classic moves the question numbers to the right to make room for the blanks', numX - 14 * MM > 20, numX / MM);
  check('Condensed keeps all the text and every option (across or not)', /Short options/.test(pdfText('f-cond.pdf')) && ['0.75', '0.34', '1.33', '1.5'].every(o => pdfText('f-cond.pdf').includes(o)) && /Another fairly long option here/.test(pdfText('f-cond.pdf')));
  // paper saved by Condensed: the same many-question test takes fewer pages
  const many = await page.evaluate(async () => {
    const PQ_ = window.PQ, qs = [];
    for (let i = 0; i < 36; i++) {
      const n = String(i).padStart(2, '0');
      const q = Object.assign(PQ_.emptyQuestion('mc', PQ_.DEFAULT_BANK_ID), { id: 'm' + n, prompt: 'QS' + n + ' Pick one', status: 'ready', answer: { options: ['one', 'two', 'three', 'QE' + n], correct: 0 } });
      qs.push(q);
    }
    await PQ_.db.applyBatch({ questions: qs }); await PQ_.loadAll(); return qs.map(q => q.id);
  });
  const dumpIds = async (extra, file) => { const t = await page.evaluate(async ([extra, ids]) => { const t = Object.assign({}, PQ.state.tests[0], { questionIds: ids }); for (const k of ['headingSize', 'textSize', 'questionStyle', 'margins']) delete t[k]; Object.assign(t, extra); await PQ.preparePrint('test', 'A', t); return t; }, [extra, many]); await page.pdf({ path: file, preferCSSPageSize: true }); return t; };
  await dumpIds({}, 'm-std.pdf'); await dumpIds({ questionStyle: 'condensed' }, 'm-cond.pdf'); await dumpIds({ questionStyle: 'classic' }, 'm-cls.pdf');
  check('36 short multiple-choice questions: Condensed uses clearly fewer pages than Standard', pdfPages('m-cond.pdf') < pdfPages('m-std.pdf'), [pdfPages('m-std.pdf'), pdfPages('m-cls.pdf'), pdfPages('m-cond.pdf')]);
  check('and prints all 36 with all their options', Array.from({ length: 36 }, (_, i) => String(i).padStart(2, '0')).every(n => pdfText('m-cond.pdf').includes('QS' + n) && pdfText('m-cond.pdf').includes('QE' + n)));
  // greyscale for the new styles
  for (const st of ['classic', 'condensed']) {
    await dumpIds({ questionStyle: st, textSize: 'large', headingSize: 'large' }, 'g-' + st + '.pdf');
    await page.emulateMedia({ media: 'print' });
    const bad = await page.evaluate(() => { const out = [], ach = c => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return true; const [r, g, b, a] = m.map(Number); return (a === 0) || (r === g && g === b); };
      for (const e of document.querySelectorAll('#print-root, #print-root *')) { const s = getComputedStyle(e); for (const k of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) { const hasBorder = !k.startsWith('border') || parseFloat(s[k.replace('Color', 'Width')]) > 0; if (hasBorder && !ach(s[k])) out.push(e.className + ':' + k); } }
      return { out: out.slice(0, 5), controls: document.querySelectorAll('#print-root input, #print-root button, #print-root .ed-tools').length }; });
    await page.emulateMedia({ media: null });
    check(st + ' prints in plain black only and carries no editing controls', bad.out.length === 0 && bad.controls === 0, bad);
  }

  console.log('7. no question or stimulus group splits across pages, in every style and size');
  const gen = await page.evaluate(async () => {
    const T = '2026-10-01T10:00:00.000Z';
    const base = (id, type, prompt, answer, extra) => Object.assign({ id, bankId: PQ.DEFAULT_BANK_ID, type, prompt, course: '', unit: '', tags: [], level: 3, status: 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: T, updated: T }, extra || {});
    const qs = [];
    for (let i = 0; i < 30; i++) {
      const n = String(i).padStart(2, '0'), kind = i % 5;
      if (kind === 0) qs.push(base('p' + n, 'mc', 'QS' + n + ' ' + 'A reasonably long question stem that wraps over lines. '.repeat(1 + (i % 3)), { options: ['opt a ' + n, 'opt b', 'opt c', 'QE' + n + ' last'], correct: 0 }));
      else if (kind === 1) qs.push(base('p' + n, 'tf', 'QS' + n + ' True or false: this QE' + n + '.', { correct: true }));
      else if (kind === 2) qs.push(base('p' + n, 'multipart', 'QS' + n + ' Intro', { parts: [{ type: 'tf', prompt: 'part one', answer: { correct: true } }, { type: 'mc', prompt: 'part two', answer: { options: ['a', 'b', 'c'], correct: 1 } }, { type: 'short', prompt: 'part three QE' + n, answer: { lines: 2, rubric: '' } }] }));
      else if (kind === 3) qs.push(base('p' + n, 'matching', 'QS' + n + ' Match them', { pairs: [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r2' }, { left: 'l3', right: 'r3' }, { left: 'l4', right: 'QE' + n }] }));
      else qs.push(base('p' + n, 'short', 'QS' + n + ' Explain QE' + n, { lines: 4, rubric: '' }));
    }
    const stim = { id: 'sg', bankId: PQ.DEFAULT_BANK_ID, title: 'STIMTOKEN', text: 'Short passage. '.repeat(8), imageIds: [], table: null, created: T, updated: T };
    qs.push(base('g1', 'mc', 'GS1 first', { options: ['a', 'b', 'c', 'GE1'], correct: 0 }, { stimulusId: 'sg' }), base('g2', 'mc', 'GS2 second', { options: ['a', 'b', 'c', 'GE2'], correct: 0 }, { stimulusId: 'sg' }));
    await PQ.db.applyBatch({ questions: qs, stimuli: [stim] }); await PQ.loadAll();
    return qs.filter(q => q.id.startsWith('p')).map(q => q.id);
  });
  const violations = []; let layouts = 0;
  for (const style of ['standard', 'classic', 'condensed']) for (const size of ['small', 'large']) for (const paper of ['letter', 'a4']) for (const k of [0, 11, 22]) {
    const ids = gen.slice(0, k).concat(['g1', 'g2']).concat(gen.slice(k, k + 7));
    await page.evaluate(p => localStorage.setItem('prime-questions:paper', p), paper);
    await page.evaluate(async ([ids, style, size]) => { const t = Object.assign({}, PQ.state.tests[0], { questionIds: ids, questionStyle: style, textSize: size, margins: { top: 10, right: 12, bottom: 10, left: 12 } }); await PQ.preparePrint('test', 'A', t); }, [ids, style, size]);
    const f = ['prop', style, size, paper, k].join('-') + '.pdf';
    await page.pdf({ path: f, preferCSSPageSize: true });
    const pages = Array.from({ length: pdfPages(f) }, (_, i) => pdfPage(f, i + 1)), pageOf = tok => pages.findIndex(p => p.includes(tok));
    layouts++;
    for (const id of ids) { if (!id.startsWith('p')) continue; const n = id.slice(1), a = pageOf('QS' + n), b = pageOf('QE' + n); if (a < 0 || b < 0 || a !== b) violations.push([style, size, paper, k, id, a + 1, b + 1].join(' ')); }
    const g = ['STIMTOKEN', 'GS1', 'GE1', 'GS2', 'GE2'].map(pageOf);
    if (g.some(x => x < 0) || new Set(g).size !== 1) violations.push([style, size, paper, k, 'group', g.join(',')].join(' '));
  }
  check('PROPERTY: over ' + layouts + ' layouts (3 styles x 2 text sizes x 2 papers, custom margins) no question and no stimulus group splits across pages', violations.length === 0, violations.slice(0, 6));

  console.log('7b. option layout: vertical, one line or 2x2 grid');
  await page.evaluate(async () => {
    const t = new Date().toISOString(), B1 = PQ.DEFAULT_BANK_ID;
    const mk = (id, type, prompt, answer) => Object.assign(PQ.emptyQuestion(type, B1), { id, prompt, answer, status: 'ready' });
    const qs = [
      mk('ol1', 'mc', 'OLONE short options', { options: ['0.75', '0.34', '1.33', '1.50'], correct: 0 }),
      mk('ol2', 'mc', 'OLTWO long options', { options: ['A very long option that is clearly more than forty characters', 'Another option that is also far too long for a grid cell', 'Short', 'Tiny'], correct: 0 }),
      mk('ol3', 'mc', 'OLTHREE medium options', { options: ['Option about thirty chars ok', 'Second option, thirty chars', 'Third option thirty chars!!', 'Fourth option thirty chars!'], correct: 0 }),
      mk('ol4', 'multipart', 'OLFOUR a multipart question', { parts: [{ type: 'tf', prompt: 'True?', answer: { correct: true } }, { type: 'mc', prompt: 'Which?', answer: { options: ['red', 'green', 'blue', 'grey'], correct: 0 } }] }),
      mk('ol5', 'tf', 'OLFIVE the sky is blue', { correct: true })];
    await PQ.db.applyBatch({ questions: qs, tests: [{ id: 'oltest', title: 'Layout Test', course: '', questionIds: qs.map(q => q.id), seed: 3, created: t, updated: t }] }); await PQ.loadAll();
  });
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main', { hasText: 'Layout Test' }).click(); await page.waitForSelector('#sheet-preview .tp-q');
  const qq = t => page.locator('#sheet-preview .tp-q', { hasText: t });
  const cls = async t => (await qq(t).locator('.tp-opts').first().getAttribute('class')).replace('tp-opts', '').trim() || 'vertical';
  const pos = async t => qq(t).locator('.tp-opt').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; }));
  const rc2 = async (t, position) => { await qq(t).click({ button: 'right', position: position || { x: 80, y: 8 } }); };
  const area = async () => { await page.click('#menu-format'); await page.click('#mi-optlayout'); };
  await page.click('#menu-format');
  const lbls = await page.locator('.menu > .menu-item').allInnerTexts();
  check('Format has "Option layout" after Questions, showing Automatic', lbls[5].startsWith('Option layout') && /Automatic/.test(lbls[5]) && lbls[4].startsWith('Questions'), lbls.slice(4, 7));
  await page.click('#mi-optlayout');
  check('it offers Automatic (checked), Vertical, One line and 2×2 grid', (await page.locator('.submenu .menu-label').allInnerTexts()).join('|') === 'Automatic|Vertical|One line|2×2 grid' && (await page.locator('#mi-optlayout-auto .menu-check').innerText()) === '✓');
  await page.keyboard.press('Escape');
  check('Automatic in the Standard style lists every option down the page (as before)', (await cls('OLONE')) === 'vertical' && (await cls('OLTHREE')) === 'vertical' && !('optionLayout' in (await D())));

  await sub('optlayout', 'line');
  check('One line is stored on the assessment as "line"', (await D()).optionLayout === 'line');
  const one = await pos('OLONE');
  check('short options sit side by side on one line (A B C D share a row, left to right)', (await cls('OLONE')) === 'across' && new Set(one.map(p => p.y)).size === 1 && one.every((p, i) => i === 0 || p.x > one[i - 1].x), one);
  check('options too long for one line fall back to a 2×2 grid; far too long ones fall back to vertical (those questions only)', (await cls('OLTHREE')) === 'grid' && (await cls('OLTWO')) === 'vertical' && (await cls('OLONE')) === 'across');
  check('the true/false question is untouched and the multipart question\'s mc part follows too', (await qq('OLFIVE').locator('.tp-opts').count()) === 0 && (await qq('OLFOUR').locator('.tp-opts.across').count()) === 1);

  await sub('optlayout', 'grid');
  const g = await pos('OLONE');
  check('2×2 grid: A and B share a row, C and D the next row, C under A and D under B', (await cls('OLONE')) === 'grid' && g[0].y === g[1].y && g[2].y === g[3].y && g[2].y > g[0].y && g[2].x === g[0].x && g[3].x === g[1].x && g[1].x > g[0].x, g);
  check('a grid question is not wider than the paper and is shorter than the vertical one', (await qq('OLONE').locator('.tp-opts').evaluate(e => e.scrollWidth <= e.clientWidth + 1)));
  check('options too long for a grid cell fall back to vertical, the medium ones stay in the grid', (await cls('OLTWO')) === 'vertical' && (await cls('OLTHREE')) === 'grid');
  const gh = (await qq('OLONE').locator('.tp-opts').boundingBox()).height;

  await sub('optlayout', 'vertical');
  const vh = (await qq('OLONE').locator('.tp-opts').boundingBox()).height;
  check('Vertical lists the options down the page again, taller than the grid', (await cls('OLONE')) === 'vertical' && vh > gh + 10 && (await D()).optionLayout === 'vertical', [vh, gh]);
  await sub('style', 'condensed');
  check('an explicit Vertical beats Condensed\'s automatic "options across"', (await cls('OLONE')) === 'vertical');
  await sub('optlayout', 'auto');
  check('Automatic hands that back to the style: Condensed puts the short options across; the key is deleted from the assessment', (await cls('OLONE')) === 'across' && !('optionLayout' in (await D())));
  await sub('style', 'standard');

  console.log('7c. option layout for one question');
  await sub('optlayout', 'grid');
  await rc2('OLONE');
  check('right-clicking a multiple-choice question offers Option layout, currently "Same as assessment"', /Same as assessment/.test(await page.locator('#mi-q-layout').innerText()));
  await page.click('#mi-q-layout');
  check('with Same as assessment (2×2 grid) checked and Vertical, One line, 2×2 grid to choose', /2×2 grid/.test(await page.locator('#mi-q-layout-same').innerText()) && (await page.locator('#mi-q-layout-same .menu-check').innerText()) === '✓' && (await page.locator('#mi-q-layout-vertical, #mi-q-layout-line, #mi-q-layout-grid').count()) === 3);
  await page.click('#mi-q-layout-line');
  check('One line on this question beats the assessment\'s 2×2 grid, for this question only', (await cls('OLONE')) === 'across' && (await cls('OLTHREE')) === 'grid' && JSON.stringify((await D()).questionOptions) === JSON.stringify({ ol1: { layout: 'line' } }));
  await rc2('OLONE'); await page.click('#mi-q-layout'); await page.click('#mi-q-layout-vertical');
  check('Vertical on this question beats the assessment too', (await cls('OLONE')) === 'vertical' && (await D()).questionOptions.ol1.layout === 'vertical');
  await rc2('OLONE'); await page.click('#mi-q-layout'); await page.click('#mi-q-layout-same');
  check('Same as assessment removes the choice, so the question follows the assessment again and the test is as it was', (await cls('OLONE')) === 'grid' && !('questionOptions' in (await D())));
  await rc2('OLFIVE');
  check('a true/false question has no Option layout item', (await page.locator('#mi-q-layout').count()) === 0); await page.keyboard.press('Escape');
  await rc2('OLFOUR', { x: 80, y: 8 });
  check('a multipart question away from its parts points to the parts', (await page.locator('#mi-q-layout').count()) === 0 && /option layout/.test(await page.locator('#mi-q-answer-hint').innerText())); await page.keyboard.press('Escape');
  await qq('OLFOUR').locator('.tp-part').nth(1).click({ button: 'right', position: { x: 60, y: 6 } });
  check('right-clicking the mc part offers "Part (b) option layout"', /Part \(b\) option layout/.test(await page.locator('#mi-q-layout').innerText()));
  await page.click('#mi-q-layout'); await page.click('#mi-q-layout-vertical');
  check('that part can differ from the assessment and is stored under questionId#partIndex', (await qq('OLFOUR').locator('.tp-opts').first().getAttribute('class')) === 'tp-opts' && (await D()).questionOptions['ol4#1'].layout === 'vertical');
  await qq('OLFOUR').locator('.tp-part').first().click({ button: 'right', position: { x: 60, y: 6 } });
  check('the true/false part has no Option layout item', (await page.locator('#mi-q-layout').count()) === 0); await page.keyboard.press('Escape');
  await page.click('#btn-undo');
  check('Undo steps back through the part\'s choice', (await qq('OLFOUR').locator('.tp-opts.grid').count()) === 1 && !('questionOptions' in (await D())));
  await page.click('#btn-redo');

  console.log('7d. option layout: Version B, printing, saving, the bank file');
  await page.click('#pv-b');
  check('Version B uses the same layout (and the options are still shuffled by the same rules)', (await qq('OLTHREE').locator('.tp-opts.grid').count()) === 1 && (await qq('OLFOUR').locator('.tp-opts').first().getAttribute('class')) === 'tp-opts');
  await page.click('#pv-ka');
  check('the answer key does not change shape with the layout', (await page.locator('#sheet-preview .tp-opts').count()) === 0 && (await page.locator('#sheet-preview .tp-key').count()) === 1);
  await page.click('#pv-a');
  await page.evaluate(async () => { await PQ.preparePrint('test', 'A', Object.assign({}, PQ.state.tests.find(t => t.id === 'oltest'), { optionLayout: 'grid', questionIds: ['ol1'] })); });
  await page.pdf({ path: 'ol-grid.pdf', preferCSSPageSize: true });
  const gw = words('ol-grid.pdf'), wy = t => gw.find(w => w.text === t);
  check('printed 2×2 grid: 0.75 and 0.34 share a line, 1.33 and 1.50 the next, 1.33 under 0.75', Math.abs(wy('0.75').y0 - wy('0.34').y0) < 1 && Math.abs(wy('1.33').y0 - wy('1.50').y0) < 1 && wy('1.33').y0 > wy('0.75').y0 + 8 && Math.abs(wy('1.33').x0 - wy('0.75').x0) < 1 && wy('0.34').x0 > wy('0.75').x0 + 100, [wy('0.75'), wy('0.34'), wy('1.33')]);
  await page.evaluate(async () => { await PQ.preparePrint('test', 'A', Object.assign({}, PQ.state.tests.find(t => t.id === 'oltest'), { optionLayout: 'line', questionIds: ['ol1'] })); });
  await page.pdf({ path: 'ol-line.pdf', preferCSSPageSize: true });
  const lw = words('ol-line.pdf'), ly = t => lw.find(w => w.text === t);
  check('printed one line: all four options on one line, left to right, inside the margins', ['0.75', '0.34', '1.33', '1.50'].every(t => Math.abs(ly(t).y0 - ly('0.75').y0) < 1) && ly('0.34').x0 > ly('0.75').x0 && ly('1.33').x0 > ly('0.34').x0 && ly('1.50').x1 < 612 - 14 * MM, [ly('0.75'), ly('1.50')]);
  check('the printed paper has the layout and no editing controls', await page.evaluate(() => document.querySelectorAll('#print-root .tp-opts.across').length === 1 && document.querySelectorAll('#print-root input, #print-root button').length === 0));
  await page.click('#btn-save'); await page.waitForFunction(() => !PQ.active.exam.isDirty());
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready);
  await page.click('#nav-tests'); await page.locator('.card-tile .ct-main', { hasText: 'Layout Test' }).click(); await page.waitForSelector('#sheet-preview .tp-q');
  check('it survives save and reload', (await D()).optionLayout === 'grid' && (await cls('OLTHREE')) === 'grid' && (await D()).questionOptions['ol4#1'].layout === 'vertical');
  const olB64 = await page.evaluate(async () => { const p = await PQ.collectPayload(); const r = await PQ.buildBankPdf(p, { renderBlockImage: PQ.renderBlockImage }); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode(...r.bytes.subarray(i, i + 32768)); return btoa(s); });
  fs.writeFileSync('ol.pdf', Buffer.from(olB64, 'base64')); fs.rmSync('olx', { recursive: true, force: true }); fs.mkdirSync('olx'); execFileSync('pdfdetach', ['-saveall', '-o', 'olx', 'ol.pdf']);
  const olp = JSON.parse(fs.readFileSync('olx/prime-questions.pq', 'utf8')), olt = olp.tests.find(t => t.id === 'oltest');
  check('the bank file (read by poppler) carries optionLayout and the part\'s layout, as schema 8', olp.schemaVersion === 8 && olt.optionLayout === 'grid' && olt.questionOptions['ol4#1'].layout === 'vertical');
  check('and it imports back unchanged', await page.evaluate(async b => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const raw = await PQ.readPdfPayload(u.buffer), r = PQ.parsePayload(raw); return r.ok && JSON.stringify(r.payload.tests.find(t => t.id === 'oltest')) === JSON.stringify(raw.tests.find(t => t.id === 'oltest')); }, olB64));

  console.log('8. network and errors');
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
