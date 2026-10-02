// Questions written by an AI: ai-instructions.md, the JSON draft import (paste or file), and tools/draft_to_bank_pdf.py.
// The example inside ai-instructions.md is extracted and imported for real, so the document cannot drift from the app.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

const ROOT = path.join(__dirname, '..');
const DOC = fs.readFileSync(path.join(ROOT, 'ai-instructions.md'), 'utf8');
const exampleText = (() => { const i = DOC.indexOf('## Complete example'); const m = /```json\n([\s\S]*?)```/.exec(DOC.slice(i)); return m && m[1]; })();
const SCRIPT = path.join(ROOT, 'tools', 'draft_to_bank_pdf.py');

(async () => {
  const { browser, ctx, page, problems, requests } = await launch();
  await ctx.setOffline(true);
  page.setDefaultTimeout(8000);
  await openApp(page);
  const modal = page.locator('.modal');
  const goImports = () => page.click('#nav-imports');
  const paste = async text => { await goImports(); await page.fill('#paste-box', text); await page.click('#btn-import-paste'); };
  const count = () => page.evaluate(() => PQ.state.questions.length);
  const wipe = async () => { await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); })); await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready); };

  console.log('1. the instructions file');
  check('ai-instructions.md exists at the repo root and its example is valid JSON', !!exampleText && (() => { try { JSON.parse(exampleText); return true; } catch (e) { return false; } })());
  check('it covers every type, maths rules, stimuli, tables, limits and a checklist', ['`mc`', '`tf`', '`numeric`', '`short`', '`matching`', '`multipart`', 'Maths and chemistry', 'Shared stimuli', '## Tables', 'What you cannot do', 'Check before you reply', 'keepOrder', 'doubled'].every(w => DOC.includes(w)));
  check('it tells the AI to use the site address for the live copy and names the import page', /ethanpullan\.github\.io\/PrimeQuestions\/ai-instructions\.md/.test(DOC) && /Questions written by an AI/.test(DOC));
  const ex = JSON.parse(exampleText);
  check('the example uses every question type', ['mc', 'tf', 'numeric', 'short', 'matching', 'multipart'].every(t => ex.questions.some(q => q.type === t)));

  console.log('2. the pure converter');
  const U = await page.evaluate(ex => {
    const run = (d, o) => PQ.draftToPayload(d, Object.assign({ now: '2026-10-02T10:00:00.000Z' }, o || {}));
    const base = a => ({ questions: [Object.assign({ type: 'tf', prompt: 'p', answer: { correct: true } }, a)] });
    const r = run(ex), p = r.payload;
    const errs = d => { const x = run(d); return x.ok ? null : x.errors; };
    return {
      ok: r.ok, count: r.count, valid: PQ.parsePayload(p).ok, parseErrors: PQ.parsePayload(p).errors,
      statuses: Array.from(new Set(p.questions.map(q => q.status))), banks: p.banks.map(b => b.name), allInBank: p.questions.every(q => q.bankId === p.banks[0].id) && p.stimuli.every(s => s.bankId === p.banks[0].id),
      ids: new Set(p.questions.map(q => q.id).concat(p.stimuli.map(s => s.id), p.banks.map(b => b.id))).size === p.questions.length + p.stimuli.length + 1,
      letter: p.questions[0].answer.correct, keep: p.questions[0].keepOrder, noKeep: 'keepOrder' in p.questions[1],
      stim: p.questions[2].stimulusId === p.stimuli[0].id && p.questions[3].stimulusId === p.stimuli[0].id, tbl: p.stimuli[0].table.rows.length,
      tolerance: p.questions[2].answer.tolerance, defaults: [p.questions[4].course, p.questions[4].difficulty, p.questions[4].tags.length, p.questions[4].notes],
      mp: p.questions[6].answer.parts.map(x => x.type).join(), unusedStim: r.unusedStimuli, schema: p.schemaVersion,
      bare: run([{ type: 'tf', prompt: 'x', answer: { correct: 'False' } }]).payload.questions[0].answer.correct,
      lower: run(base({ type: ' MC ', answer: { options: ['a', 'b'], correct: 'b' } })).payload.questions[0].answer.correct,
      num: run({ questions: [{ type: 'numeric', prompt: 'n', answer: { value: 9.8 } }] }).payload.questions[0].answer,
      short: run({ questions: [{ type: 'short', prompt: 's', answer: {} }] }).payload.questions[0].answer,
      tagsStr: run(base({ tags: 'a, b ,a' })).payload.questions[0].tags,
      reuse: (() => { const b = { id: 'existing-bank', name: 'science 9: matter', created: 'x', updated: 'y' }; const x = run(Object.assign({}, ex), { banks: [b] }); return [x.payload.banks[0].id, x.payload.questions[0].bankId]; })(),
      e: {
        notObj: errs('x'), empty: errs({ questions: [] }), badFormat: errs({ format: 'other', questions: [{}] }), badType: errs(base({ type: 'essay' })), noPrompt: errs(base({ prompt: '' })),
        badLetter: errs(base({ type: 'mc', answer: { options: ['a', 'b'], correct: 'D' } })), fewOpts: errs(base({ type: 'mc', answer: { options: ['a'], correct: 'A' } })),
        tf: errs(base({ answer: { correct: 'maybe' } })), numNoValue: errs(base({ type: 'numeric', answer: {} })), numTol: errs(base({ type: 'numeric', answer: { value: '1', tolerance: -1 } })),
        lines: errs(base({ type: 'short', answer: { lines: 99 } })), pairs: errs(base({ type: 'matching', answer: { pairs: [{ left: 'a', right: 'b' }] } })),
        parts0: errs(base({ type: 'multipart', answer: { parts: [] } })), nested: errs(base({ type: 'multipart', answer: { parts: [{ type: 'multipart', prompt: 'x', answer: {} }] } })),
        stim: errs(base({ stimulus: 'nope' })), diff: errs(base({ difficulty: 'impossible' })), tableCols: errs(base({ table: { headers: ['a', 'b'], rows: [['1']] } })),
        dupKey: errs({ stimuli: [{ key: 'k', title: 't' }, { key: 'k', title: 'u' }], questions: [{ type: 'tf', prompt: 'p', answer: { correct: true } }] }),
        ctrl: errs(base({ prompt: 'x\fy' })), tab: errs(base({ type: 'mc', answer: { options: ['a\tb', 'c'], correct: 'A' } })),
        many: (() => { const x = run({ questions: Array.from({ length: 60 }, () => ({ type: 'zzz' })) }); return x.errors.length; })()
      },
      msgHasPath: (errs(base({ type: 'mc', answer: { options: ['a', 'b'], correct: 'D' } }) || []).join(' ')),
      noThrow: (() => { let n = 0; for (const v of [null, undefined, 5, 'x', [], {}, [null], [[]], { questions: [null] }, { questions: [[]] }, { questions: [{ type: 'mc', answer: null }] }, { stimuli: 5, questions: [{ type: 'tf', prompt: 'a', answer: { correct: true } }] }]) { try { run(v); } catch (e) { n++; } } return n; })()
    };
  }, ex);
  check('the document\'s example converts to a payload that passes the strict validator', U.ok && U.valid && U.count === 8 && U.schema === 4, U.parseErrors || U);
  check('every question is marked "Needs review", all land in the named bank, and all ids are new and unique', U.statuses.join() === 'review' && U.banks.join() === 'Science 9: Matter' && U.allInBank && U.ids, U);
  check('a letter answer becomes the right index; keepOrder only where asked; stimulus keys resolve; tables and tolerance kept', U.letter === 0 && U.keep === true && U.noKeep === false && U.stim && U.tbl === 3 && U.tolerance === 0.05, U);
  check('optional fields default sensibly (difficulty medium, no tags, no notes) and multipart parts keep their types', U.defaults[1] === 'medium' && U.defaults[2] === 0 && U.mp === 'numeric,tf', U.defaults);
  check('lenient where an AI is likely to vary: "False" text, lower-case/padded type, number as value, empty short answer, tags as a string', U.bare === false && U.lower === 1 && U.num.value === '9.8' && U.short.lines === 4 && U.tagsStr.join() === 'a,b', [U.bare, U.lower, U.num, U.short, U.tagsStr]);
  check('a bank with the same name (any case) is reused instead of making a duplicate', U.reuse[0] === 'existing-bank' && U.reuse[1] === 'existing-bank', U.reuse);
  const e = U.e;
  check('bad drafts are refused with messages that name the item and say what to do', e.notObj && e.empty && e.badFormat && /questions\[1\]\.answer\.correct/.test(U.msgHasPath) && /letter/.test(U.msgHasPath) && /questions\[1\]\.type/.test(e.badType.join()) && /prompt/.test(e.noPrompt.join()), U.msgHasPath);
  check('each kind of mistake is caught: letter, option count, true/false, numeric value and tolerance, lines, pairs, parts, nesting, stimulus key, difficulty, table width, duplicate key', [e.badLetter, e.fewOpts, e.tf, e.numNoValue, e.numTol, e.lines, e.pairs, e.parts0, e.nested, e.stim, e.diff, e.tableCols, e.dupKey].every(Boolean), e);
  check('a LaTeX command written with one backslash (form feed, tab) is refused with the fix, not silently corrupted', e.ctrl && /doubled/.test(e.ctrl.join()) && e.tab && /doubled/.test(e.tab.join()), [e.ctrl, e.tab]);
  check('at most 40 messages, and nothing ever throws on odd input', e.many === 40 && U.noThrow === 0, [e.many, U.noThrow]);

  console.log('3. reading the AI\'s reply');
  const J = await page.evaluate(() => {
    const x = t => PQ.extractJson(t);
    return {
      plain: x('{"a":1}'), fence: x('Here you go:\n```json\n{"a":2}\n```\nHope that helps!'), prose: x('Sure! {"a":3} Let me know.'), array: x('[{"a":4}]'), bom: x('﻿{"a":5}'),
      single: x('{"p":"\\(x\\)","q":"\\alpha"}'), notJson: x('hello there'), cut: x('{"a": [1, 2'), trailingComma: x('{"a":1,}')
    };
  });
  check('plain JSON, a fenced block, JSON inside prose, a bare list and a byte-order mark all read', J.plain.value.a === 1 && J.fence.value.a === 2 && J.prose.value.a === 3 && J.array.value[0].a === 4 && J.bom.value.a === 5, J);
  check('single-backslash LaTeX (\\( \\alpha) is repaired, so the usual AI slip still imports', J.single.ok && J.single.value.p === '\\(x\\)' && J.single.value.q === '\\alpha', J.single);
  check('text that is not JSON gives a clear message', !J.notJson.ok && /not valid JSON/.test(J.notJson.error) && !J.cut.ok && !J.trailingComma.ok);

  console.log('4. importing by pasting');
  await paste(exampleText);
  await modal.waitFor();
  const t = (await modal.innerText()).replace(/\s+/g, ' ');
  check('the dialog says these come from a text draft, names the bank as new, and says they are marked Needs review', /Import these questions/.test(t) && /8 questions come from a text draft/.test(t) && /Science 9: Matter” \(a new bank\)/.test(t) && /Needs review/.test(t), t.slice(0, 400));
  check('the summary table counts the new bank, questions and stimulus', /Question banks 1 0 0 0/.test(t) && /Questions 8 0 0 0/.test(t) && /Shared stimuli 1 0 0 0/.test(t), t);
  check('nothing is written before Apply', (await count()) === 0);
  await modal.locator('button:has-text("Cancel")').click();
  check('Cancel changes nothing', (await count()) === 0 && (await page.evaluate(() => PQ.state.banks.length)) === 1);
  await page.click('#btn-import-paste'); await modal.waitFor(); await modal.locator('button:has-text("Apply")').click();
  await page.waitForFunction(() => PQ.state.questions.length === 8);
  const S = await page.evaluate(() => ({ banks: PQ.state.banks.map(b => b.name).sort(), st: Array.from(new Set(PQ.state.questions.map(q => q.status))), withStim: PQ.state.questions.filter(q => q.stimulusId).length, mp: PQ.state.questions.find(q => q.type === 'multipart').answer.parts.length, keep: PQ.state.questions.filter(q => q.keepOrder).length }));
  check('applying adds the bank and 8 questions, all "review", stimulus links and the multipart intact', S.banks.join() === 'My Questions,Science 9: Matter' && S.st.join() === 'review' && S.withStim === 2 && S.mp === 2 && S.keep === 1, S);
  check('the Imports page logs it', /pasted text/.test(await page.locator('#import-log').innerText()) && /8 questions/.test(await page.locator('#import-log').innerText()));
  check('none of the imported questions has a maths or missing-answer problem (the example renders)', await page.evaluate(() => PQ.state.questions.every(q => PQ.checkQuestion(q).length === 0)));
  // the imported questions are real: open one in the editor and print a test from them
  await page.click('#nav-banks'); await page.locator('#page-banks .card-tile', { hasText: 'Science 9' }).locator('.ct-main').click();
  check('the bank opens with its 8 questions and the stimulus', (await page.locator('.qrow').count()) === 8);
  await page.locator('.qrow', { hasText: 'densest' }).click();
  check('an imported question opens in the editor as Needs review with its stimulus selected', (await page.inputValue('#f-status')) === 'review' && (await page.locator('#f-stimulus').evaluate(e => e.selectedOptions[0].text)) === 'Densities of four samples');
  // importing the same text again adds them again (documented), as new questions
  await page.click('#btn-close').catch(() => {});
  await paste(exampleText); await modal.waitFor();
  check('importing the same text again offers to reuse the existing bank (not a second bank) and adds 8 new questions', /8 questions come from a text draft/.test(await modal.innerText()) && !/a new bank/.test(await modal.innerText()) && /Questions 8 0 0 0/.test((await modal.innerText()).replace(/\s+/g, ' ')));
  await modal.locator('button:has-text("Cancel")').click();

  console.log('5. errors from pasted text');
  const bad = JSON.parse(exampleText); bad.questions[0].answer.correct = 'Z'; bad.questions[2].stimulus = 'zzz'; bad.questions[4].type = 'essay';
  const before = await count();
  await paste(JSON.stringify(bad)); await modal.waitFor();
  const errText = await modal.innerText();
  check('a bad draft shows every problem by number, says nothing was changed, and offers to copy the messages', /cannot be imported yet/.test(errText) && /Nothing was changed/.test(errText) && /questions\[1\]\.answer\.correct/.test(errText) && /questions\[3\]\.stimulus/.test(errText) && /questions\[5\]\.type/.test(errText) && await modal.locator('button:has-text("Copy messages")').count() === 1, errText);
  await modal.locator('button:has-text("Close")').click();
  check('and nothing was written', (await count()) === before);
  await paste('this is just a sentence'); await modal.waitFor();
  check('text that is not JSON gets a plain explanation', /not valid JSON/.test(await modal.innerText()) && /Nothing was changed/.test(await modal.innerText()));
  await modal.locator('button:has-text("OK")').click();
  await page.fill('#paste-box', ''); await page.click('#btn-import-paste');
  check('pressing Import with an empty box asks for text instead of failing', /Paste the AI/.test(await page.locator('.toast').last().innerText()) && !(await modal.isVisible()));
  await paste('```json\n' + JSON.stringify({ questions: [{ type: 'tf', prompt: 'One more', answer: { correct: true }, notes: 'x' }] }) + '\n```\nThanks!'); await modal.waitFor();
  check('a reply with a code fence and chatter around it still imports', /Import these questions/.test(await modal.innerText()) && /1 question come/.test(await modal.innerText()), await modal.innerText());
  await modal.locator('button:has-text("Cancel")').click();
  // maths problems are reported in the dialog but do not block (they arrive as Needs review)
  const brokenMath = { questions: [{ type: 'tf', prompt: 'Broken \\(\\frac{1}{\\) maths', answer: { correct: true } }] };
  await paste(JSON.stringify(brokenMath)); await modal.waitFor();
  check('a question whose maths does not render is flagged in the dialog but can still be imported', /1 question has maths that does not render/.test((await modal.innerText()).replace(/\s+/g, ' ')) && await modal.locator('button:has-text("Apply")').count() === 1, await modal.innerText());
  await modal.locator('button:has-text("Cancel")').click();

  console.log('6. importing a .json file, by choosing it and by dropping it');
  fs.writeFileSync('draft.json', exampleText);
  await wipe();
  await page.setInputFiles('#file-input', 'draft.json'); await modal.waitFor();
  check('choosing a .json file opens the same summary', /Import these questions/.test(await modal.innerText()));
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.questions.length === 8);
  await wipe();
  await page.evaluate(async text => {
    const dt = new DataTransfer(); dt.items.add(new File([text], 'from-ai.json', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, exampleText);
  await modal.waitFor();
  check('dropping a .json file anywhere also works', /Import these questions/.test(await modal.innerText()));
  await modal.locator('button:has-text("Cancel")').click();
  fs.writeFileSync('not-a-pdf.pdf', 'this is not a pdf');
  await page.setInputFiles('#file-input', 'not-a-pdf.pdf'); await modal.waitFor();
  check('a file named .pdf that is not a PDF still gets the PDF message (not the JSON one)', /not a PDF/.test(await modal.innerText()));
  await modal.locator('button:has-text("OK")').click();

  console.log('7. a draft imports into a bank that already exists');
  await wipe();
  await page.evaluate(async () => { const t = new Date().toISOString(); const b = { id: PQ.uuid(), name: 'Science 9: Matter', created: t, updated: t }; await PQ.db.applyBatch({ banks: [b] }); await PQ.loadAll(); });
  await paste(exampleText); await modal.waitFor();
  check('the existing bank is reused: no "new bank" and the bank row shows it as already there', !/a new bank/.test(await modal.innerText()) && /Question banks 0 0 0 1/.test((await modal.innerText()).replace(/\s+/g, ' ')), (await modal.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.questions.length === 8);
  check('the questions joined that bank; there is still just one bank of that name', await page.evaluate(() => PQ.state.banks.filter(b => b.name === 'Science 9: Matter').length === 1 && PQ.state.questions.every(q => q.bankId === PQ.state.banks.find(b => b.name === 'Science 9: Matter').id)));

  console.log('8. the Imports page links to the instructions');
  await goImports();
  check('it has a link to the instructions and a copy button', (await page.locator('#ai-instructions-link').getAttribute('href')) === 'https://ethanpullan.github.io/PrimeQuestions/ai-instructions.md' && await page.locator('#btn-copy-ai-link').isVisible());

  console.log('9. the optional Python script');
  fs.writeFileSync('example.json', exampleText);
  execFileSync('python3', [SCRIPT, 'example.json', 'from-script.pdf']);
  const list = execFileSync('pdfdetach', ['-list', 'from-script.pdf']).toString();
  check('it writes a PDF with prime-questions.pq inside (poppler)', /prime-questions\.pq/.test(list));
  fs.rmSync('sc', { recursive: true, force: true }); fs.mkdirSync('sc'); execFileSync('pdfdetach', ['-saveall', '-o', 'sc', 'from-script.pdf']);
  const sp = JSON.parse(fs.readFileSync('sc/prime-questions.pq', 'utf8'));
  // the app's own converter on the same text, to compare shapes (ids and dates differ by design)
  const app = await page.evaluate(ex => PQ.draftToPayload(JSON.parse(ex)).payload, exampleText);
  const strip = p => JSON.stringify(p, (k, v) => (['id', 'bankId', 'stimulusId', 'created', 'updated', 'exportedAt'].includes(k) ? (v === null ? null : 'x') : v));
  check('the script\'s payload has the same content as the app\'s own conversion (ids and dates aside)', strip(sp) === strip(app), [sp.questions.length, app.questions.length]);
  check('the script\'s ids link up (questions point at their bank and stimulus)', sp.questions.every(q => q.bankId === sp.banks[0].id) && sp.questions.filter(q => q.stimulusId).every(q => sp.stimuli.some(s => s.id === q.stimulusId)) && sp.questions.every(q => q.status === 'review'));
  await wipe();
  await goImports(); await page.setInputFiles('#file-input', 'from-script.pdf'); await modal.waitFor();
  check('the app accepts the script\'s PDF: 8 questions in a new bank', /Import this bank/.test(await modal.innerText()) && /Questions 8 0 0 0/.test((await modal.innerText()).replace(/\s+/g, ' ')), (await modal.innerText()).replace(/\s+/g, ' ').slice(0, 300));
  await modal.locator('button:has-text("Apply")').click(); await page.waitForFunction(() => PQ.state.questions.length === 8);
  check('they arrive as Needs review and every one renders', await page.evaluate(() => PQ.state.questions.every(q => q.status === 'review' && PQ.checkQuestion(q).length === 0)));
  // the script refuses bad drafts and tolerates fences and single backslashes, like the app
  const run = (text, name) => { fs.writeFileSync(name, text); try { return { code: 0, out: execFileSync('python3', [SCRIPT, name, name + '.pdf'], { stdio: 'pipe' }).toString() }; } catch (err) { return { code: err.status, err: String(err.stderr) }; } };
  const badRun = run(JSON.stringify(bad), 'bad.json');
  check('the script refuses a bad draft with the same kind of messages and writes nothing', badRun.code === 1 && /questions\[1\]\.answer\.correct/.test(badRun.err) && !fs.existsSync('bad.json.pdf'), badRun);
  const fenced = run('Here:\n```json\n{"questions":[{"type":"tf","prompt":"Uses \\(x^2\\)","answer":{"correct":true}}]}\n```', 'fenced.json');
  check('the script reads a fenced reply with a single-backslash \\( like the app does', fenced.code === 0 && fs.existsSync('fenced.json.pdf'), fenced);
  const ctrl = run('{"questions":[{"type":"tf","prompt":"a \\frac b","answer":{"correct":true}}]}', 'ctrl.json');
  check('the script also refuses a form feed from \\frac', ctrl.code === 1 && /doubled/.test(ctrl.err), ctrl);

  console.log('10. network and errors');
  check('zero network requests', requests.length === 0, requests);
  check('no console errors or warnings', problems.length === 0, problems);

  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
