const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

(async () => {
  const { browser, page, problems } = await launch();
  await openApp(page);

  /* ---------- A. maths ---------- */
  console.log('A. maths checking');
  const notation = [
    '\\frac{3}{4}', '2\\tfrac{1}{3}', '\\sqrt{x+1}', '\\sqrt[3]{27}', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}',
    '6.02 \\times 10^{23}', '10^{-3}', 'x \\le 5', 'x \\ge 5', 'x \\ne 5', '90^{\\circ}', '50\\%',
    '\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}', '\\begin{aligned} 2x+3&=11\\\\ 2x&=8\\\\ x&=4 \\end{aligned}',
    '0.\\overline{3}', '\\angle ABC', 'AB \\parallel CD', 'AB \\perp CD', '\\mathrm{g/cm^{3}}', '\\mathrm{m/s^{2}}',
    '\\ce{H2O}', '\\ce{2H2 + O2 -> 2H2O}', '\\ce{SO4^2-}', '\\ce{NaCl(aq)}', '\\ce{CO2(g)}'
  ];
  const nres = await page.evaluate(n => n.map(t => [t, PQ.mathErrors('\\(' + t + '\\)')]), notation);
  const bad = nres.filter(([, e]) => e.length);
  check('notation check: all ' + notation.length + ' required expressions render without errors', bad.length === 0, bad);
  const m = await page.evaluate(() => ({
    money: PQ.mathErrors('Sam has $12 and $5'),
    unclosed: PQ.mathErrors('a \\(\\frac{1}{2}'),
    stray: PQ.mathErrors('a \\) b'),
    empty: PQ.mathErrors('\\( \\)'),
    badtex: PQ.mathErrors('\\(\\frac{1}{\\)'),
    unknown: PQ.mathErrors('\\(\\notamacro\\)'),
    split: PQ.splitMath('x \\(a\\) y \\(b\\)').parts.map(p => p.math ? 'M:' + p.tex : 'T:' + p.text)
  }));
  check('dollar signs are not math', m.money.length === 0, m.money);
  check('unclosed \\( reported', m.unclosed.length === 1, m.unclosed);
  check('stray \\) reported', m.stray.length === 1, m.stray);
  check('empty math reported', m.empty.length === 1, m.empty);
  check('bad LaTeX reported', m.badtex.length >= 1, m.badtex);
  check('unknown macro reported', m.unknown.length >= 1, m.unknown);
  check('splitMath parts', JSON.stringify(m.split) === JSON.stringify(['T:x ', 'M:a', 'T: y ', 'M:b']), m.split);

  /* ---------- B. readiness ---------- */
  console.log('B. question checks');
  const b = await page.evaluate(() => {
    const q = PQ.emptyQuestion('mc');
    const ok = JSON.parse(JSON.stringify(q)); ok.prompt = 'What is \\(\\frac{1}{2}+\\frac{1}{4}\\)?'; ok.answer = { options: ['\\(\\frac{3}{4}\\)', 'b', '', ''], correct: 0 };
    const blank = PQ.checkQuestion(q);
    const good = PQ.checkQuestion(ok);
    const badCorrect = JSON.parse(JSON.stringify(ok)); badCorrect.answer.correct = 2;
    const badMath = JSON.parse(JSON.stringify(ok)); badMath.answer.options[1] = '\\(\\frac{1}{\\)';
    const num = PQ.emptyQuestion('numeric'); num.prompt = 'x'; num.answer = { value: '1.00', units: '', tolerance: -1 };
    const mt = PQ.emptyQuestion('matching'); mt.prompt = 'x'; mt.answer.pairs = [{ left: 'a', right: 'b' }, { left: 'c', right: '' }];
    return { blank: blank.map(p => p.field), good, badCorrect: PQ.checkQuestion(badCorrect).map(p => p.field), badMath: PQ.checkQuestion(badMath).map(p => p.kind + ':' + p.field), num: PQ.checkQuestion(num).map(p => p.field), mt: PQ.checkQuestion(mt).map(p => p.field) };
  });
  check('blank new question has problems (text + options + correct)', b.blank.includes('Question text') && b.blank.includes('Options'), b.blank);
  check('complete question has no problems', b.good.length === 0, b.good);
  check('correct option must be filled in', b.badCorrect.includes('Correct answer'), b.badCorrect);
  check('math error is a "math" problem naming the field', b.badMath.some(x => x === 'math:Option B'), b.badMath);
  check('negative tolerance flagged', b.num.includes('Tolerance'), b.num);
  check('half-filled matching pair flagged', b.mt.includes('Pairs'), b.mt);

  /* ---------- C. payload validation ---------- */
  console.log('C. payload validation (untrusted input)');
  const c = await page.evaluate(() => {
    const T = '2026-10-01T15:00:00Z';
    const mkq = id => ({ id, type: 'tf', prompt: 'p', course: '', unit: '', tags: [], difficulty: 'easy', status: 'ready', stimulusId: null, imageIds: [], table: null, answer: { correct: true }, notes: '', created: T, updated: T });
    const base = () => ({ format: 'prime-questions', schemaVersion: 1, appVersion: '9', requiredFeatures: [], exportedAt: T, questions: [mkq('a')], stimuli: [], tests: [], images: {} });
    const r = {};
    r.valid = PQ.parsePayload(base());
    r.notObj = PQ.parsePayload(null); r.arr = PQ.parsePayload([]); r.str = PQ.parsePayload('x');
    r.wrongFmt = PQ.parsePayload(Object.assign(base(), { format: 'test-parrot/package' }));
    r.newer = PQ.parsePayload(Object.assign(base(), { schemaVersion: 2 }));
    r.zero = PQ.parsePayload(Object.assign(base(), { schemaVersion: 0 }));
    r.strVer = PQ.parsePayload(Object.assign(base(), { schemaVersion: '1' }));
    r.feat = PQ.parsePayload(Object.assign(base(), { requiredFeatures: ['hologram'] }));
    r.noFeat = (() => { const p = base(); delete p.requiredFeatures; return PQ.parsePayload(p); })();
    r.dup = (() => { const p = base(); p.questions.push(mkq('a')); return PQ.parsePayload(p); })();
    r.badType = (() => { const p = base(); p.questions[0].type = 'essay'; return PQ.parsePayload(p); })();
    r.badAnswer = (() => { const p = base(); p.questions[0].answer = { correct: 'yes' }; return PQ.parsePayload(p); })();
    r.badDate = (() => { const p = base(); p.questions[0].updated = 'yesterday'; return PQ.parsePayload(p); })();
    r.noId = (() => { const p = base(); delete p.questions[0].id; return PQ.parsePayload(p); })();
    r.html = (() => { const p = base(); p.questions[0].prompt = '<img src=x onerror=alert(1)>'; return PQ.parsePayload(p); })();
    r.badImg = (() => { const p = base(); p.images = { i1: 'javascript:alert(1)' }; return PQ.parsePayload(p); })();
    r.imgSvg = (() => { const p = base(); p.images = { i1: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }; return PQ.parsePayload(p); })();
    r.imgProto = (() => { const p = JSON.parse('{"format":"prime-questions","schemaVersion":1,"requiredFeatures":[],"questions":[],"stimuli":[],"tests":[],"images":{"__proto__":"data:image/png;base64,AAAA"}}'); return PQ.parsePayload(p); })();
    r.noQuestions = (() => { const p = base(); delete p.questions; return PQ.parsePayload(p); })();
    r.protoPollution = ({}).polluted === undefined;
    return r;
  });
  check('a valid payload is accepted', c.valid.ok === true, c.valid);
  check('null / array / string payloads refused', !c.notObj.ok && !c.arr.ok && !c.str.ok);
  check('wrong format refused (e.g. a Test Parrot package)', !c.wrongFmt.ok && c.wrongFmt.code === 'format');
  check('newer schema refused with a clear message', !c.newer.ok && c.newer.code === 'newer' && /newer/i.test(c.newer.errors[0]), c.newer);
  check('schemaVersion 0 / "1" refused', !c.zero.ok && !c.strVer.ok);
  check('unknown requiredFeatures refused, naming the feature', !c.feat.ok && /hologram/.test(c.feat.errors[0]), c.feat);
  check('missing requiredFeatures refused', !c.noFeat.ok);
  check('duplicate ids refused', !c.dup.ok && c.dup.errors.some(e => /twice/.test(e)), c.dup);
  check('unknown question type refused', !c.badType.ok);
  check('wrong answer shape refused', !c.badAnswer.ok);
  check('bad date refused', !c.badDate.ok);
  check('missing id refused', !c.noId.ok);
  check('HTML in text is accepted as plain text (never rendered as HTML)', c.html.ok === true);
  check('non-image data URL refused', !c.badImg.ok);
  check('SVG data URL accepted (rendered only through <img>)', c.imgSvg.ok === true, c.imgSvg);
  check('"__proto__" image id refused', !c.imgProto.ok, c.imgProto);
  check('missing questions list refused', !c.noQuestions.ok);
  check('no prototype pollution', c.protoPollution);

  /* ---------- D. migrations ---------- */
  console.log('D. migrations');
  const d = await page.evaluate(() => {
    const out = {};
    const mig = { 1: p => Object.assign({}, p, { schemaVersion: 2, added2: true }), 2: p => Object.assign({}, p, { schemaVersion: 3, added3: true }) };
    const r = PQ.migrate({ schemaVersion: 1 }, mig, 3);
    out.chain = r.schemaVersion === 3 && r.added2 && r.added3;
    out.noop = PQ.migrate({ schemaVersion: 3 }, mig, 3).schemaVersion === 3;
    try { PQ.migrate({ schemaVersion: 1 }, {}, 2); out.missing = 'no throw'; } catch (e) { out.missing = 'threw'; }
    try { PQ.migrate({ schemaVersion: 1 }, { 1: p => p }, 2); out.stuck = 'no throw'; } catch (e) { out.stuck = 'threw'; }
    return out;
  });
  check('migration chain runs in order', d.chain);
  check('current version needs no migration', d.noop);
  check('missing migration step is an error', d.missing === 'threw');
  check('a migration that does not advance the version is an error', d.stuck === 'threw');

  /* ---------- E. merge ---------- */
  console.log('E. merge planning');
  const e = await page.evaluate(() => {
    const T = n => '2026-10-0' + n + 'T10:00:00Z';
    const q = (id, prompt, upd) => ({ id, prompt, updated: T(upd) });
    const local = { questions: [q('same', 'x', 1), q('inNewer', 'old', 1), q('localNewer', 'mine', 5), q('tie', 'mine', 3)], stimuli: [], tests: [], imageIds: new Set(['img1']) };
    const incoming = { questions: [q('same', 'x', 1), q('inNewer', 'new', 4), q('localNewer', 'theirs', 2), q('tie', 'theirs', 3), q('brandNew', 'n', 1)], stimuli: [], tests: [], images: { img1: 'data:x', img2: 'data:y' } };
    const plan = PQ.planMerge(local, incoming);
    const r = plan.collections.questions;
    const w = PQ.recordsToWrite(plan);
    return { newIds: r.new.map(x => x.id), unchanged: r.unchanged.map(x => x.id), changed: r.changed.map(x => x.id + ':' + x.winner), written: w.questions.map(x => x.id + '=' + x.prompt).sort(), imgNew: plan.images.new, imgExisting: plan.images.existing, noop: PQ.planIsNoop(PQ.planMerge({ questions: [q('a', 'x', 1)], stimuli: [], tests: [], imageIds: new Set() }, { questions: [q('a', 'x', 1)], stimuli: [], tests: [], images: {} })) };
  });
  check('new records detected', JSON.stringify(e.newIds) === '["brandNew"]', e.newIds);
  check('identical records are "unchanged"', JSON.stringify(e.unchanged) === '["same"]', e.unchanged);
  check('newer wins; older loses; a tie keeps yours', JSON.stringify(e.changed) === '["inNewer:incoming","localNewer:local","tie:local"]', e.changed);
  check('only new + incoming-newer are written (merge never deletes, never blindly appends)', JSON.stringify(e.written) === '["brandNew=n","inNewer=new"]', e.written);
  check('images: known id is existing, unknown is new', e.imgNew.join() === 'img2' && e.imgExisting === 1, e);
  check('identical import is a no-op', e.noop === true);

  /* ---------- F. text-or-image rule, widths ---------- */
  console.log('F. PDF text rule and widths');
  const f = await page.evaluate(() => ({
    plain: PQ.isTextSafe('Calculate 5 \u00B0C \u00D7 3 \u00F7 2 \u00B1 1 \u00B5 \u00FC'),
    le: PQ.isTextSafe('x \u2264 5'), pi: PQ.isTextSafe('\u03C0'), arrow: PQ.isTextSafe('\u2192'), tick: PQ.isTextSafe('\u2713'), quote: PQ.isTextSafe('\u2018hi\u2019'),
    ctrl: PQ.isTextSafe('a\u0085b'), nl: PQ.isTextSafe('line1\nline2\tx'),
    mathNeeds: PQ.needsImage('a \\(x\\) b'), plainNeeds: PQ.needsImage('just text $12'),
    w: [['Hello World', false, 11], ['Hello World', true, 11], ['The quick brown fox 0123456789', false, 10], ['\u00E9\u00FC\u00B1', true, 12]].map(a => PQ.textWidth(...a))
  }));
  check('Latin-1 symbols are text-safe', f.plain);
  check('≤ π → ✓ and curly quotes force the image route', !f.le && !f.pi && !f.arrow && !f.tick && !f.quote);
  check('C1 control characters are not text-safe', !f.ctrl);
  check('newline/tab are fine', f.nl);
  check('\\( forces the image route; "$12" does not', f.mathNeeds && !f.plainNeeds);
  // expected = sum of Adobe Helvetica / Helvetica-Bold advance widths (no kerning: PDF Tj does not kern)
  const ref = [56.837, 61.116, 147.86, 21.012];
  check('width tables equal the Helvetica AFM advance widths', f.w.every((x, i) => Math.abs(x - ref[i]) < 0.01), { ours: f.w, ref });
  const wrapRes = await page.evaluate(() => {
    const text = 'Supercalifragilisticexpialidocious '.repeat(3) + 'A normal sentence that must wrap onto several lines without ever exceeding the width. '.repeat(3) + 'X'.repeat(200);
    const lines = PQ.wrapText(text, false, 11, 300);
    return { n: lines.length, max: Math.max(...lines.map(l => PQ.textWidth(l, false, 11))) };
  });
  check('wrapping never exceeds the width (long words are broken)', wrapRes.max <= 300 + 0.01 && wrapRes.n > 5, wrapRes);

  /* ---------- G. PDF build, read, verify with poppler ---------- */
  console.log('G. PDF writer/reader');
  const built = await page.evaluate(async () => {
    const T = '2026-10-01T15:00:00.000Z';
    const mk = (i, type, prompt, answer, extra) => Object.assign({ id: 'q-' + String(i).padStart(3, '0'), type, prompt, course: 'Science 9', unit: 'Matter', tags: ['density', 'mass'], difficulty: ['easy', 'medium', 'hard'][i % 3], status: i % 7 === 0 ? 'review' : 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: '2026-09-' + String(10 + (i % 18)).padStart(2, '0') + 'T10:00:00.000Z', updated: T }, extra || {});
    const qs = [];
    for (let i = 0; i < 40; i++) qs.push(mk(i, 'mc', 'Question number ' + i + ' asks about the density of water at 4 \u00B0C and why ice floats. Sam has $12. ' + 'More words to make this wrap over a couple of lines. '.repeat(2), { options: ['one', 'two', 'three', 'four'], correct: i % 4 }));
    qs.push(mk(100, 'mc', 'Plain with math: what is \\(\\frac{3}{4}+\\frac{1}{4}\\)?', { options: ['\\(1\\)', '\\(\\frac{3}{4}\\)', '\\(\\sqrt{2}\\)', '\\(2\\tfrac{1}{3}\\)'], correct: 0 }));
    qs.push(mk(101, 'tf', 'Water boils at 100 \u00B0C. x \u2264 5 and \u03C0 is irrational \u2713', { correct: true }));
    qs.push(mk(102, 'numeric', 'Density of \\(\\ce{H2O}\\)?', { value: '1.00', units: '\\(\\mathrm{g/cm^{3}}\\)', tolerance: 0.01 }));
    qs.push(mk(103, 'short', 'Explain. ' + 'Very long text. '.repeat(120), { lines: 6, rubric: 'Mention density' }));
    qs.push(mk(104, 'matching', 'Match symbol to element', { pairs: [{ left: 'Na', right: 'Sodium' }, { left: 'K', right: 'Potassium' }] }));
    qs.push(mk(105, 'tf', 'Has stimulus and table', { correct: false }, { stimulusId: 's-1', table: { headers: ['a', 'b'], rows: [['1', '2']], caption: 'Data' }, imageIds: ['img-1'] }));
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const payload = { format: 'prime-questions', schemaVersion: 1, appVersion: '0.1.0', requiredFeatures: [], exportedAt: T, questions: qs,
      stimuli: [{ id: 's-1', title: 'Water data', text: 'Read the data.', imageIds: [], table: null, created: T, updated: T }],
      tests: [{ id: 't-1', title: 'Unit test', course: 'Science 9', questionIds: ['q-001'], seed: 12345, created: T, updated: T }], images: { 'img-1': png } };
    const textOnly = await PQ.buildBankPdf(payload, {});
    const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); };
    let calls = 0;
    const withImages = await PQ.buildBankPdf(payload, { renderBlockImage: (l, w) => { calls++; return PQ.renderBlockImage(l, w); } });
    const back1 = await PQ.readPdfPayload(textOnly.bytes), back2 = await PQ.readPdfPayload(withImages.bytes);
    return { payload, textB64: b64(textOnly.bytes), imgB64: b64(withImages.bytes), textReport: textOnly.report, imgReport: withImages.report, calls,
      rt1: PQ.stable(back1) === PQ.stable(payload), rt2: PQ.stable(back2) === PQ.stable(payload), sizes: [textOnly.bytes.length, withImages.bytes.length] };
  });
  fs.writeFileSync('bank-text.pdf', Buffer.from(built.textB64, 'base64'));
  fs.writeFileSync('bank-img.pdf', Buffer.from(built.imgB64, 'base64'));
  fs.writeFileSync('bank-payload.json', JSON.stringify(built.payload));
  check('text-only PDF reads back identical (in browser)', built.rt1);
  check('image PDF reads back identical (in browser)', built.rt2);
  check('image route used only for math / non-Latin-1 questions', built.imgReport.imageBlocks === 3 && built.imgReport.fallbacks === 0 && built.calls === built.imgReport.imageBlocks, { calls: built.calls, report: built.imgReport });
  check('without a renderer everything falls back to text, nothing lost', built.textReport.imageBlocks === 0 && built.textReport.textBlocks > 0, built.textReport);
  console.log('  sizes (text-only, with images):', built.sizes.join(', '), ' pages:', built.textReport.pages, '/', built.imgReport.pages);

  for (const f of ['bank-text.pdf', 'bank-img.pdf']) {
    const list = execFileSync('pdfdetach', ['-list', f]).toString();
    check(f + ': poppler sees one attachment named prime-questions.pq', /1 embedded files/.test(list) && /prime-questions\.pq/.test(list), list);
    fs.rmSync('extract', { recursive: true, force: true }); fs.mkdirSync('extract');
    execFileSync('pdfdetach', ['-saveall', '-o', 'extract', f]);
    const same = JSON.stringify(JSON.parse(fs.readFileSync('extract/prime-questions.pq', 'utf8'))) === JSON.stringify(built.payload);
    check(f + ': poppler-extracted JSON equals the data', same);
    const info = execFileSync('pdfinfo', [f]).toString();
    check(f + ': pdfinfo valid, Title set, Letter size', /Title:\s+Prime Questions - Question Bank/.test(info) && /612 x 792/.test(info), info.split('\n').slice(0, 12).join(' | '));
    check(f + ': poppler reports no syntax errors', (() => { try { const r = require('child_process').spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' }); return !/Error|Syntax/.test(r.stderr || ''); } catch (e) { return false; } })());
  }
  const txt = execFileSync('pdftotext', ['-layout', 'bank-text.pdf', '-']).toString();
  check('text route: question text is selectable/searchable in the PDF', /Question number 3 asks about the density of water at 4 °C/.test(txt) && /Sam has \$12/.test(txt));
  check('cover says answers are included and import needs the original file', /answers included/.test(txt) && /original file/.test(txt));
  check('page footers numbered', /Page 1 of \d+/.test(txt));
  console.log('  pages per section ok? lines with "Question" headings:', (txt.match(/^\s*Question \d+/gm) || []).length);

  /* ---------- H. reader robustness ---------- */
  console.log('H. reader robustness');
  const readB64 = async (b64) => page.evaluate(async b64 => {
    const u = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    try { const r = await PQ.readPdfPayload(u); return { ok: true, format: r.format }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; }
  }, b64);
  const b64f = f => fs.readFileSync(f).toString('base64');
  // re-saved by another tool
  let resaved = 'skipped';
  try {
    execFileSync('python3', ['-c', `
import pikepdf
for name, mode in (('bank-img-objstm.pdf', pikepdf.ObjectStreamMode.generate), ('bank-img-plain.pdf', pikepdf.ObjectStreamMode.disable)):
    with pikepdf.open('bank-img.pdf') as p:
        p.save(name, object_stream_mode=mode)
`]);
    resaved = 'done';
  } catch (er) { resaved = 'pikepdf unavailable: ' + er.message; }
  if (resaved === 'done') {
    for (const f of ['bank-img-objstm.pdf', 'bank-img-plain.pdf']) {
      const r = await readB64(b64f(f));
      check('re-saved by pikepdf (' + f + ') still imports', r.ok && r.format === 'prime-questions', r);
    }
  } else console.log('  (re-save tests ' + resaved + ')');
  // chromium print-to-PDF (no data)
  const printed = await page.pdf({ format: 'Letter' });
  let r = await readB64(printed.toString('base64'));
  check('a browser-printed PDF gives a clear "no data" message', !r.ok && r.code === 'no-data' && /printed or re-saved/.test(r.msg), r);
  // a PDF whose attachment is JSON of another format (e.g. a Test Parrot package)
  const foreignB64 = await page.evaluate(async () => {
    const payload = await PQ.collectPayload();
    const r = await PQ.buildBankPdf(Object.assign({}, payload, { format: 'test-parrot/package' }), {});
    let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode(...r.bytes.subarray(i, i + 32768)); return btoa(s);
  });
  r = await readB64(foreignB64);
  check('a PDF attaching another format (e.g. Test Parrot) is refused clearly', !r.ok && r.code === 'no-data' && /none of it is a Prime Questions bank/.test(r.msg), r);
  // not a PDF
  r = await readB64(Buffer.from('hello world, definitely not a pdf').toString('base64'));
  check('a non-PDF is refused', !r.ok && r.code === 'not-pdf', r);
  r = await readB64('');
  check('an empty file is refused', !r.ok && r.code === 'not-pdf', r);
  // truncated
  const full = fs.readFileSync('bank-img.pdf');
  r = await readB64(full.subarray(0, Math.floor(full.length * 0.6)).toString('base64'));
  check('a truncated PDF does not crash (clean error or recovery)', r.ok === false ? !!r.msg : true, r);
  // corrupt compressed payload: flip bytes inside the embedded stream
  const tb = Buffer.from(fs.readFileSync('bank-text.pdf'));
  const idx = tb.indexOf('/Type /EmbeddedFile');
  const st = tb.indexOf('stream\n', idx) + 7;
  const corrupt = Buffer.from(tb); for (let i = 0; i < 20; i++) corrupt[st + 10 + i] ^= 0xff;
  r = await readB64(corrupt.toString('base64'));
  check('corrupted data stream is refused, not misread', !r.ok, r);
  // indirect /Length (resolved by endstream search)
  const asStr = tb.toString('latin1');
  const lenMatch = /(\/Type \/EmbeddedFile[\s\S]*?\/Length )(\d+)/.exec(asStr);
  let indirectOk = 'n/a';
  if (lenMatch) {
    const replaced = asStr.replace(lenMatch[0], lenMatch[1] + '999 0 R');
    r = await readB64(Buffer.from(replaced, 'latin1').toString('base64'));
    indirectOk = r.ok;
  }
  check('indirect /Length (e.g. "12 0 R") is handled', indirectOk === true, indirectOk);
  // attachment that is JSON but not ours
  const notOurs = asStr.replace('"format":"prime-questions"', '"format":"something-else-xx"');
  // (same length => offsets stay valid, but stream is compressed so this just checks no crash on wrong content)
  r = await readB64(Buffer.from(notOurs, 'latin1').toString('base64'));
  check('modified file never crashes the reader', typeof r.ok === 'boolean', r);
  // decompression bomb: ~300 MB of zeros, tiny on disk
  const bomb = await page.evaluate(async () => {
    const zeros = new Uint8Array(1024 * 1024); // 1 MB chunk
    const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter();
    const writing = (async () => { for (let i = 0; i < 300; i++) await w.write(zeros); await w.close(); })();
    const z = new Uint8Array(await new Response(cs.readable).arrayBuffer()); await writing;
    const head = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /EmbeddedFile /Filter /FlateDecode /Length ' + z.length + ' >>\nstream\n');
    const tail = new TextEncoder().encode('\nendstream\nendobj\n%%EOF\n');
    const all = new Uint8Array(head.length + z.length + tail.length); all.set(head); all.set(z, head.length); all.set(tail, head.length + z.length);
    const t0 = performance.now();
    try { await PQ.readPdfPayload(all); return { r: 'accepted?!', ms: performance.now() - t0, compressed: z.length }; }
    catch (e) { return { r: e.code + ': ' + e.message, ms: Math.round(performance.now() - t0), compressed: z.length }; }
  });
  check('a decompression bomb (300 MB from ~300 KB) is stopped', /too-big|no-data/.test(bomb.r) , bomb);

  check('no console errors during the whole suite', problems.length === 0, problems);
  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
