const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, openApp, check, summary } = require('./lib');

const PQ_DEFAULT = () => '00000000-0000-4000-8000-000000000001|My Questions';
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
    r.newer = PQ.parsePayload(Object.assign(base(), { schemaVersion: 6 }));
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


  /* ---------- I. test planning: versions, shuffle, keys ---------- */
  console.log('I. test planning (Version A / B)');
  const I = await page.evaluate(() => {
    const T = '2026-10-01T10:00:00.000Z';
    const base = (id, type, answer, extra) => Object.assign({ id, type, prompt: 'Prompt ' + id, course: '', unit: '', tags: [], difficulty: 'easy', status: 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: T, updated: T }, extra || {});
    const mc = (id, n, extra) => base(id, 'mc', { options: ['opt0-' + id, 'opt1-' + id, 'opt2-' + id, 'opt3-' + id], correct: n }, extra);
    const qs = [];
    for (let i = 0; i < 12; i++) qs.push(mc('q' + i, i % 4));
    qs.push(mc('qa', 1, { stimulusId: 's1' })); qs.push(mc('qb', 2, { stimulusId: 's1' }));
    qs.push(mc('qk', 3, { keepOrder: true, answer: { options: ['A first', 'B second', 'C third', 'All of the above'], correct: 3 } }));
    qs.push(mc('qblank', 2, { answer: { options: ['x', '', 'z', ''], correct: 2 } }));
    qs.push(mc('qghost', 0, { stimulusId: 'no-such-stimulus' }));
    qs.push(base('qtf', 'tf', { correct: false }));
    qs.push(base('qnum', 'numeric', { value: '1.00', units: 'g', tolerance: 0.01 }));
    qs.push(base('qshort', 'short', { lines: 5, rubric: 'Mention density' }));
    qs.push(base('qm', 'matching', { pairs: [{ left: 'Na', right: 'Sodium' }, { left: 'K', right: 'Potassium' }, { left: 'Fe', right: 'Iron' }, { left: 'Cu', right: 'Copper' }] }));
    const stimuli = [{ id: 's1', title: 'Passage', text: 'x', imageIds: [], table: null, created: T, updated: T }];
    const ids = ['q0', 'qa', 'q1', 'qk', 'q2', 'qb', 'qblank', 'qghost', 'qtf', 'q3', 'qnum', 'qshort', 'qm', 'q4', 'q5', 'q6', 'q7', 'q8', 'DELETED-ID'];
    const test = { id: 't', title: 'T', course: 'C', questionIds: ids, seed: 12345, created: T, updated: T };
    const A = PQ.planTest(test, qs, stimuli, 'A'), B = PQ.planTest(test, qs, stimuli, 'B');
    const flat = p => p.blocks.flatMap(b => b.items);
    const r = {};
    r.aOrder = flat(A).map(i => i.q.id);
    r.bOrder = flat(B).map(i => i.q.id);
    r.aNums = flat(A).map(i => i.number); r.bNums = flat(B).map(i => i.number);
    r.aNumsEqual = flat(A).every(i => i.number === i.aNumber);
    r.bMap = flat(B).map(i => i.aNumber).sort((x, y) => x - y);
    r.missing = A.missing;
    r.total = [A.total, B.total];
    r.aOptsPlain = flat(A).filter(i => i.q.type === 'mc').every(i => i.view.options.every((o, k) => k === 0 || true) && i.view.options.map(o => o.orig).join() === i.view.options.map(o => o.orig).slice().sort().join());
    // grouping: qa and qb together (A and B), qghost standalone (stimulus not in bank)
    const grpA = A.blocks.find(b => b.stimulus), grpB = B.blocks.find(b => b.stimulus);
    r.grpA = grpA.items.map(i => i.q.id); r.grpB = grpB.items.map(i => i.q.id);
    r.ghostStandalone = A.blocks.some(b => !b.stimulus && b.items.length === 1 && b.items[0].q.id === 'qghost');
    // B really shuffles order (this seed) and is not identical to A
    r.bDiffers = r.aOrder.join() !== r.bOrder.join();
    // MC views: correct points at the right text; shuffled flag; keepOrder respected; blanks dropped
    const bMc = flat(B).filter(i => i.q.type === 'mc');
    r.bCorrectOk = bMc.every(i => i.view.correct < 0 || (i.view.options[i.view.correct].orig === i.q.answer.correct && i.view.options[i.view.correct].text === i.q.answer.options[i.q.answer.correct]));
    r.someShuffled = bMc.filter(i => i.q.id !== 'qk').some(i => i.view.options.map(o => o.orig).join() !== [0, 1, 2, 3].join());
    r.qkB = flat(B).find(i => i.q.id === 'qk').view.options.map(o => o.text);
    r.qkA = flat(A).find(i => i.q.id === 'qk').view.options.map(o => o.text);
    r.qkKeyB = PQ.keyText(flat(B).find(i => i.q.id === 'qk'));
    const blankA = flat(A).find(i => i.q.id === 'qblank').view, blankB = flat(B).find(i => i.q.id === 'qblank').view;
    r.blank = [blankA.options.map(o => o.text).join('|'), blankA.correct, blankB.options.length, blankB.options[blankB.correct].text];
    // matching: key lines up; right column is never left in true order
    const mA = flat(A).find(i => i.q.id === 'qm').view, mB = flat(B).find(i => i.q.id === 'qm').view;
    const pairs = qs.find(q => q.id === 'qm').answer.pairs;
    r.matchOk = [mA, mB].every(v => v.left.every((l, i) => pairs.find(p => p.left === l).right === v.right[v.key[i]]));
    r.matchShuffled = [mA, mB].every(v => v.right.join() !== pairs.map(p => p.right).join());
    // determinism
    r.same = JSON.stringify(PQ.planTest(test, qs, stimuli, 'B')) === JSON.stringify(B);
    r.diffSeed = JSON.stringify(flat(PQ.planTest(Object.assign({}, test, { seed: 999 }), qs, stimuli, 'B')).map(i => i.q.id)) !== JSON.stringify(r.bOrder);
    // independence: editing/removing other questions does not change a question's option order
    const q5 = flat(B).find(i => i.q.id === 'q5').view.options.map(o => o.orig).join();
    const qs2 = qs.map(q => q.id === 'q3' ? Object.assign({}, q, { prompt: 'edited' }) : q);
    const test2 = Object.assign({}, test, { questionIds: ids.filter(x => x !== 'q3' && x !== 'q0') });
    r.indep = flat(PQ.planTest(test2, qs2, stimuli, 'B')).find(i => i.q.id === 'q5').view.options.map(o => o.orig).join() === q5;
    // keys
    const kA = PQ.keyEntries(A), kB = PQ.keyEntries(B);
    r.keyCount = [kA.length, kB.length];
    const itemQ3B = flat(B).find(i => i.q.id === 'q3'), entQ3B = kB.find(e => e.item.q.id === 'q3');
    r.keyBletter = entQ3B.text.startsWith(String.fromCharCode(65 + itemQ3B.view.correct) + '. opt' + 0 + '-q3') || entQ3B.text.startsWith(String.fromCharCode(65 + itemQ3B.view.correct) + '. ');
    r.keyBcorrectText = entQ3B.text.endsWith(qs.find(q => q.id === 'q3').answer.options[qs.find(q => q.id === 'q3').answer.correct]);
    r.keyTypes = [PQ.keyText(flat(A).find(i => i.q.id === 'qtf')), PQ.keyText(flat(A).find(i => i.q.id === 'qnum')), PQ.keyText(flat(A).find(i => i.q.id === 'qshort')), PQ.keyText(flat(A).find(i => i.q.id === 'qm'))];
    // prng sanity
    const rnd = PQ.mulberry32(PQ.hashSeed(1, 'x')); let sum = 0, min = 1, max = 0; for (let i = 0; i < 20000; i++) { const v = rnd(); sum += v; min = Math.min(min, v); max = Math.max(max, v); }
    r.prng = [sum / 20000, min, max];
    // an empty test
    const empty = PQ.planTest({ id: 'e', title: 'E', course: '', questionIds: [], seed: 1 }, qs, stimuli, 'B');
    r.empty = [empty.total, empty.blocks.length];
    return r;
  });
  check('A: your order, stimulus questions pulled together, unknown stimulus stays standalone', I.aOrder.slice(0, 8).join() === 'q0,qa,qb,q1,qk,q2,qblank,qghost', I.aOrder.slice(0, 8));
  check('A: numbered 1..N continuously and A number = number', I.aNums.join() === I.aNums.map((_, i) => i + 1).join() && I.aNumsEqual, I.aNums);
  check('a deleted question id is skipped and reported', I.missing.join() === 'DELETED-ID' && I.total[0] === 18, { missing: I.missing, total: I.total });
  check('B: same questions, different order, numbered 1..N', I.bDiffers && [...I.bOrder].sort().join() === [...I.aOrder].sort().join() && I.bNums.join() === I.bNums.map((_, i) => i + 1).join(), { a: I.aOrder, b: I.bOrder });
  check('B -> A numbers are a complete one-to-one mapping', I.bMap.join() === I.bMap.map((_, i) => i + 1).join(), I.bMap);
  check('stimulus questions stay together as one block in A and in B', I.grpA.join() === 'qa,qb' && I.grpB.join() === 'qa,qb', { a: I.grpA, b: I.grpB });
  check('A options keep their order', I.aOptsPlain);
  check('B shuffles MC options, and the correct pointer follows the right option text', I.someShuffled && I.bCorrectOk);
  check('keepOrder question is NOT shuffled in B (e.g. "All of the above")', I.qkB.join('|') === I.qkA.join('|') && I.qkB[3] === 'All of the above', { a: I.qkA, b: I.qkB });
  check('keepOrder question key is still right', /^D\. All of the above$/.test(I.qkKeyB), I.qkKeyB);
  check('blank options are not printed and the correct pointer still works', I.blank[0] === 'x|z' && I.blank[1] === 1 && I.blank[2] === 2 && I.blank[3] === 'z', I.blank);
  check('matching: every left item lines up with its true partner via the key (A and B)', I.matchOk);
  check('matching: right column is never printed in true order', I.matchShuffled);
  check('same inputs always give the identical test (reprints identically)', I.same);
  check('a different seed gives a different Version B', I.diffSeed);
  check('editing or removing OTHER questions does not change how a question\'s options shuffle', I.indep);
  check('answer keys have one entry per question, per version', I.keyCount.join() === '18,18', I.keyCount);
  check('B key shows the letter from B\'s own shuffled options and the true answer text', I.keyBletter && I.keyBcorrectText, I.keyBletter);
  check('keys for tf / numeric / short / matching', I.keyTypes[0] === 'False' && /^1\.00 g\s+\(±0\.01\)$/.test(I.keyTypes[1]) && I.keyTypes[2] === 'Mention density' && /^1-[A-D]\s+2-[A-D]\s+3-[A-D]\s+4-[A-D]$/.test(I.keyTypes[3]), I.keyTypes);
  check('PRNG output is in [0,1) with a sane mean', I.prng[0] > 0.48 && I.prng[0] < 0.52 && I.prng[1] >= 0 && I.prng[2] < 1, I.prng);
  check('an empty test plans to nothing without error', I.empty.join() === '0,0');

  /* ---------- J. schema 2 and the previous version's bank ---------- */
  console.log('J. schema 2 and importing a bank from the previous version');
  const fx = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'bank-schema1-v0.1.0.pdf')).toString('base64');
  const J = await page.evaluate(async fx => {
    const u = Uint8Array.from(atob(fx), c => c.charCodeAt(0));
    const raw = await PQ.readPdfPayload(u);
    const parsed = PQ.parsePayload(raw);
    const T = '2026-10-01T15:00:00Z';
    const q = Object.assign({ id: 'a', type: 'tf', prompt: 'p', course: '', unit: '', tags: [], difficulty: 'easy', status: 'ready', stimulusId: null, imageIds: [], table: null, answer: { correct: true }, notes: '', created: T, updated: T });
    const p2 = (extra) => ({ format: 'prime-questions', schemaVersion: 3, appVersion: '9', requiredFeatures: [], exportedAt: T, banks: [{ id: 'b1', name: 'B', created: T, updated: T }], questions: [Object.assign({}, q, { bankId: 'b1' }, extra)], stimuli: [], tests: [], images: {} });
    return {
      rawSchema: raw.schemaVersion, rawApp: raw.appVersion, ok: parsed.ok, errors: parsed.errors,
      migratedSchema: parsed.ok && parsed.payload.schemaVersion, counts: parsed.ok && [parsed.payload.questions.length, parsed.payload.stimuli.length, parsed.payload.tests.length, Object.keys(parsed.payload.images).length],
      untouched: parsed.ok && JSON.stringify(parsed.payload.questions.map(q => { const c = Object.assign({}, q); delete c.bankId; return c; })) === JSON.stringify(raw.questions),
      allInDefaultBank: parsed.ok && parsed.payload.questions.every(q => q.bankId === PQ.DEFAULT_BANK_ID) && parsed.payload.stimuli.every(x => x.bankId === PQ.DEFAULT_BANK_ID) && parsed.payload.banks.length === 1,
      keepTrue: PQ.parsePayload(p2({ keepOrder: true })).ok, keepFalse: PQ.parsePayload(p2({ keepOrder: false })).ok, keepAbsent: PQ.parsePayload(p2({})).ok,
      keepBad: PQ.parsePayload(p2({ keepOrder: 'yes' })).ok, v4: PQ.parsePayload(Object.assign(p2({}), { schemaVersion: 6 })).code,
      appSchema: PQ.SCHEMA_VERSION, migrations: Object.keys(PQ.MIGRATIONS).join()
    };
  }, fx);
  check('fixture really is a schema 1 bank written by v0.1.0', J.rawSchema === 1 && J.rawApp === '0.1.0', J);
  check('the v0.1.0 bank imports (migrated 1 -> 2 -> 3 -> 4 -> 5), keeps every record untouched and files them in the default bank', J.ok && J.migratedSchema === 5 && J.untouched && J.allInDefaultBank, J);
  check('fixture content: 7 questions, 1 stimulus, 1 test, 1 image', JSON.stringify(J.counts) === '[7,1,1,1]', J.counts);
  check('schema is 5 with migrations 1->2, 2->3, 3->4 and 4->5', J.appSchema === 5 && J.migrations === '1,2,3,4', J);
  check('keepOrder true/false/absent accepted; non-boolean refused', J.keepTrue && J.keepFalse && J.keepAbsent && !J.keepBad);
  check('a schema 6 bank is refused as newer', J.v4 === 'newer', J.v4);


  /* ---------- K. schema 3: banks, migration from a real v0.2.0 file ---------- */
  console.log('K. schema 3: banks and migration');
  const fx2 = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'bank-schema2-v0.2.0.pdf')).toString('base64');
  const K = await page.evaluate(async fx2 => {
    const u = Uint8Array.from(atob(fx2), c => c.charCodeAt(0));
    const raw = await PQ.readPdfPayload(u);
    const parsed = PQ.parsePayload(raw);
    const T = '2026-10-01T10:00:00.000Z';
    const bank = (id, name) => ({ id, name: name || 'Bank ' + id, created: T, updated: T });
    const q = (id, bankId, extra) => Object.assign({ id, bankId, type: 'tf', prompt: 'p', course: '', unit: '', tags: [], difficulty: 'easy', status: 'ready', stimulusId: null, imageIds: [], table: null, answer: { correct: true }, notes: '', created: T, updated: T }, extra || {});
    const stim = (id, bankId) => ({ id, bankId, title: 't', text: '', imageIds: [], table: null, created: T, updated: T });
    const base = () => ({ format: 'prime-questions', schemaVersion: 3, appVersion: '9', requiredFeatures: [], exportedAt: T, banks: [bank('b1'), bank('b2')], questions: [q('a', 'b1'), q('b', 'b2')], stimuli: [stim('s1', 'b1')], tests: [], images: {} });
    const t = (m) => { const p = base(); m(p); return PQ.parsePayload(p); };
    const test0 = { id: 't1', title: 'T', course: '', questionIds: [], seed: 1, created: T, updated: T };
    const r = {};
    r.v2 = { rawSchema: raw.schemaVersion, ok: parsed.ok, errors: parsed.errors, schema: parsed.payload && parsed.payload.schemaVersion, banks: parsed.payload && parsed.payload.banks,
      allDefault: parsed.payload && parsed.payload.questions.every(x => x.bankId === PQ.DEFAULT_BANK_ID) && parsed.payload.stimuli.every(x => x.bankId === PQ.DEFAULT_BANK_ID),
      keep: parsed.payload && parsed.payload.questions[0].keepOrder === true,
      untouched: parsed.payload && JSON.stringify(parsed.payload.tests) === JSON.stringify(raw.tests) && JSON.stringify(parsed.payload.images) === JSON.stringify(raw.images) };
    r.defaultStable = parsed.payload && PQ.stable(parsed.payload.banks[0]) === PQ.stable(PQ.defaultBank());
    const empty = PQ.parsePayload({ format: 'prime-questions', schemaVersion: 2, requiredFeatures: [], questions: [], stimuli: [], tests: [], images: {} });
    r.emptyV2 = empty.ok && empty.payload.banks.length === 0;
    r.valid = PQ.parsePayload(base()).ok;
    r.noBanksList = t(p => { delete p.banks; }).ok;
    r.noBankId = t(p => { delete p.questions[0].bankId; }).ok;
    r.badBankRef = t(p => { p.questions[0].bankId = 'nope'; });
    r.badStimRef = t(p => { p.stimuli[0].bankId = 'nope'; }).ok;
    r.noName = t(p => { p.banks[0].name = '  '; }).ok;
    r.longName = t(p => { p.banks[0].name = 'x'.repeat(201); }).ok;
    r.dupBank = t(p => { p.banks.push(bank('b1')); }).ok;
    // tests: optional page options
    const withTest = extra => t(p => { p.tests = [Object.assign({}, test0, extra)]; }).ok;
    r.testOpts = [withTest({}), withTest({ header: { name: true, class: true, date: false }, paper: 'a4', instructions: 'Answer all questions.' }), withTest({ header: { name: true } }), withTest({ paper: 'tabloid' }), withTest({ instructions: 42 }), withTest({ header: 'yes' })];
    // merge with banks
    const local = { banks: [bank('b1', 'Mine')], questions: [], stimuli: [], tests: [], imageIds: new Set() };
    const incoming = { banks: [bank('b1', 'Theirs'), bank('b2')], questions: [], stimuli: [], tests: [], images: {} };
    const plan = PQ.planMerge(local, incoming);
    r.mergeBanks = { newIds: plan.collections.banks.new.map(x => x.id), changed: plan.collections.banks.changed.map(x => x.id + ':' + x.winner), noop: PQ.planIsNoop(plan), write: PQ.recordsToWrite(plan).banks.map(x => x.id) };
    // buildPayload: full and per bank
    const imgs = { i1: 'data:image/png;base64,AAAA', i2: 'data:image/png;base64,BBBB', i3: 'data:image/png;base64,CCCC' };
    const data = { banks: [bank('b1'), bank('b2')], questions: [q('a', 'b1', { imageIds: ['i1'] }), q('b', 'b2', { imageIds: ['i2'] })], stimuli: [stim('s1', 'b1'), Object.assign(stim('s2', 'b2'), { imageIds: ['i3'] })], tests: [test0], images: imgs };
    const full = PQ.buildPayload(data, { exportedAt: T }), one = PQ.buildPayload(data, { bankId: 'b2', exportedAt: T });
    r.full = [full.banks.length, full.questions.length, full.stimuli.length, full.tests.length, Object.keys(full.images).join(), PQ.parsePayload(full).ok];
    r.one = [one.banks.map(b => b.id).join(), one.questions.map(x => x.id).join(), one.stimuli.map(x => x.id).join(), one.tests.length, Object.keys(one.images).join(), PQ.parsePayload(one).ok, one.schemaVersion];
    return r;
  }, fx2);
  check('fixture really is a schema 2 bank written by v0.2.0', K.v2.rawSchema === 2, K.v2.rawSchema);
  check('the v0.2.0 bank imports (migrated 2 -> 3 -> 4 -> 5): one default bank, every question and stimulus filed in it', K.v2.ok && K.v2.schema === 5 && K.v2.allDefault && K.v2.banks.length === 1 && K.v2.banks[0].name === 'My Questions', K.v2.errors || K.v2);
  check('migration keeps keepOrder, tests and images exactly', K.v2.keep && K.v2.untouched);
  check('the migrated default bank is identical to the one a local database gets (so a re-import is "unchanged")', K.defaultStable);
  check('a v2 file with no questions or stimuli gets no default bank', K.emptyV2);
  check('a valid schema 3 payload is accepted', K.valid);
  check('a schema 3 file must list its banks, and every question needs a bank', !K.noBanksList && !K.noBankId);
  check('a question whose bank is not in the file is refused with a clear message', !K.badBankRef.ok && K.badBankRef.errors.some(e => /belongs to a question bank that is not in the file/.test(e)), K.badBankRef.errors);
  check('a stimulus whose bank is not in the file is refused', !K.badStimRef);
  check('bank names must be non-empty and at most 200 characters; duplicate bank ids refused', !K.noName && !K.longName && !K.dupBank);
  check('test page options: valid ones accepted; bad header / paper / instructions refused', K.testOpts[0] && K.testOpts[1] && !K.testOpts[2] && !K.testOpts[3] && !K.testOpts[4] && !K.testOpts[5], K.testOpts);
  check('merge treats banks like other records (new, newer wins, written)', JSON.stringify(K.mergeBanks.newIds) === '["b2"]' && K.mergeBanks.write.join() === 'b2' && !K.mergeBanks.noop && K.mergeBanks.changed.join() === 'b1:local', K.mergeBanks);
  check('export of everything: all banks, questions, stimuli, tests and images, and it validates', K.full[0] === 2 && K.full[1] === 2 && K.full[2] === 2 && K.full[3] === 1 && K.full[4] === 'i1,i2,i3' && K.full[5] === true, K.full);
  check('export of one bank: only that bank, its questions/stimuli and the images they use, no tests, and it validates', K.one[0] === 'b2' && K.one[1] === 'b' && K.one[2] === 's2' && K.one[3] === 0 && K.one[4] === 'i2,i3' && K.one[5] === true && K.one[6] === 5, K.one);

  /* ---------- L. multipart questions ---------- */
  console.log('L. multipart questions');
  const Lr = await page.evaluate(() => {
    const T = '2026-10-01T10:00:00.000Z';
    const part = (type, prompt, answer, extra) => Object.assign({ type, prompt, answer }, extra || {});
    const mkq = (id, parts, extra) => Object.assign({ id, bankId: PQ.DEFAULT_BANK_ID, type: 'multipart', prompt: 'Read the situation.', course: '', unit: '', tags: [], difficulty: 'medium', status: 'ready', stimulusId: null, imageIds: [], table: null, answer: { parts }, notes: '', created: T, updated: T }, extra || {});
    const good = [part('mc', 'Pick one', { options: ['alpha', 'beta', 'gamma', 'delta'], correct: 2 }), part('tf', 'True?', { correct: false }), part('numeric', 'Value?', { value: '3.5', units: 'm', tolerance: 0.1 }), part('short', 'Explain', { lines: 3, rubric: 'Any reason' }), part('matching', 'Match', { pairs: [{ left: 'a', right: 'A' }, { left: 'b', right: 'B' }, { left: 'c', right: 'C' }] })];
    const payload = q => ({ format: 'prime-questions', schemaVersion: 3, appVersion: '9', requiredFeatures: [], exportedAt: T, banks: [PQ.defaultBank()], questions: [q], stimuli: [], tests: [], images: {} });
    const r = {};
    const q = mkq('m1', good);
    r.valid = PQ.parsePayload(payload(q)).ok;
    r.nested = PQ.parsePayload(payload(mkq('m2', [part('multipart', 'x', { parts: [] })]))).ok;
    r.noParts = PQ.parsePayload(payload(mkq('m3', []))).ok;
    r.tooMany = PQ.parsePayload(payload(mkq('m4', Array.from({ length: 13 }, () => part('tf', 'x', { correct: true }))))).ok;
    r.badPart = PQ.parsePayload(payload(mkq('m5', [part('tf', 'x', { correct: 'yes' })]))).ok;
    r.noPartPrompt = PQ.parsePayload(payload(mkq('m6', [{ type: 'tf', answer: { correct: true } }]))).ok;
    r.badKeep = PQ.parsePayload(payload(mkq('m7', [part('mc', 'x', { options: ['a', 'b'], correct: 0 }, { keepOrder: 'no' })]))).ok;
    r.okKeep = PQ.parsePayload(payload(mkq('m8', [part('mc', 'x', { options: ['a', 'b'], correct: 0 }, { keepOrder: true })]))).ok;
    r.defaultAnswer = PQ.defaultAnswer('multipart').parts.length === 2 && PQ.emptyQuestion('multipart').type === 'multipart';
    // readiness
    r.complete = PQ.checkQuestion(q);
    const bad = mkq('m9', [part('mc', '', { options: ['a', '', '', ''], correct: 0 }), part('mc', 'ok', { options: ['\\(\\frac{1}{\\)', 'b', '', ''], correct: 0 })], { prompt: '' });
    r.problems = PQ.checkQuestion(bad).map(p => p.kind + ':' + p.field);
    r.fields = PQ.textFields(q).map(f => f.field).filter(f => /^Part/.test(f));
    // views and keys
    const test = { id: 't', title: 'T', course: '', questionIds: ['m1'], seed: 99, created: T, updated: T };
    const A = PQ.planTest(test, [q], [], 'A'), B = PQ.planTest(test, [q], [], 'B');
    const vA = A.blocks[0].items[0].view, vB = B.blocks[0].items[0].view;
    r.partsOrder = [vA.parts.map(p => p.type).join(), vB.parts.map(p => p.type).join()];
    r.prompts = vB.parts.map(p => p.prompt).join('|');
    r.aOpts = vA.parts[0].options.map(o => o.text).join();
    r.bOptsShuffled = vB.parts[0].options.map(o => o.text).join() !== r.aOpts;
    r.bCorrect = vB.parts[0].options[vB.parts[0].correct].text;
    r.keyA = PQ.keyEntries(A)[0].text;
    r.keyB = PQ.keyEntries(B)[0].text;
    const kq = mkq('m10', [part('mc', 'x', { options: ['one', 'two', 'All of the above'], correct: 2 }, { keepOrder: true }), part('mc', 'y', { options: ['one', 'two', 'three', 'four'], correct: 0 })]);
    const KB = PQ.planTest(Object.assign({}, test, { questionIds: ['m10'] }), [kq], [], 'B').blocks[0].items[0].view;
    r.partKeep = KB.parts[0].options.map(o => o.text).join();
    r.same = JSON.stringify(PQ.planTest(test, [q], [], 'B')) === JSON.stringify(B);
    // test page options reach the plan
    r.optsDefault = [JSON.stringify(A.header), A.instructions, A.paper];
    const opt = PQ.planTest(Object.assign({}, test, { header: { name: false, class: true, date: true }, instructions: 'Answer all.', paper: 'legal' }), [q], [], 'A');
    r.optsSet = [JSON.stringify(opt.header), opt.instructions, opt.paper];
    // bank-PDF lines for a multipart question
    const lines = PQ.blockLines(q, 1, {});
    r.lines = lines.filter(l => l.label && /^\([a-e]\)$/.test(l.label)).map(l => l.label + ' ' + l.text).join(' | ');
    r.indented = lines.filter(l => l.ind).length;
    return r;
  });
  check('a multipart question with one part of each type is valid', Lr.valid);
  check('multipart: parts cannot be nested, at least one part, at most 12, parts must be well-formed', !Lr.nested && !Lr.noParts && !Lr.tooMany && !Lr.badPart && !Lr.noPartPrompt);
  check('a part may carry keepOrder (boolean only)', Lr.okKeep && !Lr.badKeep);
  check('multipart defaults', Lr.defaultAnswer);
  check('a complete multipart question has no problems', Lr.complete.length === 0, Lr.complete);
  check('problems name the part: empty prompt, missing option, broken maths (the empty shared introduction is fine)', Lr.problems.includes('incomplete:Part (a) Question text') && Lr.problems.includes('incomplete:Part (a) Options') && Lr.problems.includes('math:Part (b) Option A') && !Lr.problems.some(x => x === 'incomplete:Question text'), Lr.problems);
  check('maths fields are labelled per part', Lr.fields[0] === 'Part (a) Question text' && Lr.fields.includes('Part (a) Option C') && Lr.fields.includes('Part (c) Units'), Lr.fields);
  check('parts keep their order in Version B, with their prompts', Lr.partsOrder[0] === 'mc,tf,numeric,short,matching' && Lr.partsOrder[0] === Lr.partsOrder[1] && Lr.prompts === 'Pick one|True?|Value?|Explain|Match', Lr.partsOrder);
  check('Version B shuffles a part\'s options (A does not) and the key follows the shuffle', Lr.aOpts === 'alpha,beta,gamma,delta' && Lr.bOptsShuffled && Lr.bCorrect === 'gamma', Lr);
  check('a part with keepOrder is not shuffled in B; other parts still are', Lr.partKeep === 'one,two,All of the above', Lr.partKeep);
  check('multipart key: one line per part, "(a) ... (b) ..."', /^\(a\) C\. gamma\n\(b\) False\n\(c\) 3\.5 m/.test(Lr.keyA) && /^\(a\) [A-D]\. gamma\n\(b\) False\n\(c\) 3\.5 m/.test(Lr.keyB), [Lr.keyA, Lr.keyB]);
  check('multipart plan is deterministic', Lr.same);
  check('the plan carries header options (defaults: Name and Date, no Class), instructions and paper', Lr.optsDefault[0] === '{"name":true,"class":false,"date":true}' && Lr.optsDefault[1] === '' && Lr.optsDefault[2] === null && Lr.optsSet[0] === '{"name":false,"class":true,"date":true}' && Lr.optsSet[1] === 'Answer all.' && Lr.optsSet[2] === 'legal', [Lr.optsDefault, Lr.optsSet]);
  check('bank-PDF lines for a multipart question: (a)..(e) with indented answers', /\(a\) Pick one \| \(b\) True\? \| \(c\) Value\? \| \(d\) Explain \| \(e\) Match/.test(Lr.lines) && Lr.indented >= 8, [Lr.lines, Lr.indented]);

  /* ---------- M. bank PDF with several banks ---------- */
  console.log('M. bank PDF grouped by bank');
  const Mr = await page.evaluate(async () => {
    const T = '2026-10-01T10:00:00.000Z';
    const bank = (id, name) => ({ id, name, created: T, updated: T });
    const q = (id, bankId, type, prompt, answer) => ({ id, bankId, type, prompt, course: 'C', unit: 'U', tags: [], difficulty: 'easy', status: 'ready', stimulusId: null, imageIds: [], table: null, answer, notes: '', created: T, updated: T });
    const payload = PQ.buildPayload({ banks: [bank('b1', 'Science 9 Matter'), bank('b2', 'Math 8 Fractions')],
      questions: [q('q1', 'b1', 'tf', 'ONE the sky is blue', { correct: true }), q('q2', 'b2', 'multipart', 'TWO intro', { parts: [{ type: 'tf', prompt: 'PARTA first', answer: { correct: true } }, { type: 'numeric', prompt: 'PARTB second', answer: { value: '4.5', units: 'cm', tolerance: 0 } }] }), q('q3', 'b2', 'mc', 'THREE pick', { options: ['a', 'b', 'c', 'd'], correct: 1 })],
      stimuli: [], tests: [], images: {} }, { exportedAt: T });
    const one = PQ.buildPayload({ banks: payload.banks, questions: payload.questions, stimuli: [], tests: [], images: {} }, { bankId: 'b2', exportedAt: T });
    const mk = async p => { const r = await PQ.buildBankPdf(p, {}); let s = ''; for (let i = 0; i < r.bytes.length; i += 32768) s += String.fromCharCode(...r.bytes.subarray(i, i + 32768)); const back = await PQ.readPdfPayload(r.bytes); return { b64: btoa(s), rt: PQ.stable(back) === PQ.stable(p) }; };
    return { all: await mk(payload), one: await mk(one) };
  });
  fs.writeFileSync('banks-all.pdf', Buffer.from(Mr.all.b64, 'base64')); fs.writeFileSync('banks-one.pdf', Buffer.from(Mr.one.b64, 'base64'));
  const tAll = execFileSync('pdftotext', ['-layout', 'banks-all.pdf', '-']).toString(), tOne = execFileSync('pdftotext', ['-layout', 'banks-one.pdf', '-']).toString();
  check('both PDFs read back identical (all banks, and one bank)', Mr.all.rt && Mr.one.rt);
  check('cover of the whole export lists each bank with its question count', /Question Banks/.test(tAll) && /Math 8 Fractions\s*\.+\s*2/.test(tAll) && /Science 9 Matter\s*\.+\s*1/.test(tAll), tAll.slice(0, 500));
  check('sections are per bank then type, headed with the bank name', /Math 8 Fractions\s+·\s+1 item/.test(tAll) && /Science 9 Matter\s+·\s+1 item/.test(tAll) && /Multipart/.test(tAll), tAll.slice(500, 1200));
  check('a single-bank export is titled with the bank name', /Math 8 Fractions/.test(tOne.split('\n').slice(0, 12).join('\n')) && !/Science 9 Matter/.test(tOne) && !/ONE the sky/.test(tOne), tOne.slice(0, 300));
  check('multipart parts and their answers are readable on the page', /\(a\) PARTA first/.test(tAll) && /\(b\) PARTB second/.test(tAll) && /4\.5 cm/.test(tAll));
  check('poppler agrees the data is intact in the multi-bank PDF', (() => { fs.rmSync('mb', { recursive: true, force: true }); fs.mkdirSync('mb'); execFileSync('pdfdetach', ['-saveall', '-o', 'mb', 'banks-all.pdf']); const d = JSON.parse(fs.readFileSync('mb/prime-questions.pq', 'utf8')); return d.schemaVersion === 5 && d.banks.length === 2 && d.questions.length === 3; })());

  /* ---------- N. IndexedDB upgrade from a real v0.2.0-layout database ---------- */
  console.log('N. IndexedDB upgrade (version 1 -> 2) keeps existing data');
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.evaluate(async () => {
    // exactly what app v0.2.0 created: database version 1, four stores, records without bankId
    await new Promise((res, rej) => {
      const r = indexedDB.open('prime-questions', 1);
      r.onupgradeneeded = () => { const d = r.result; for (const s of ['questions', 'stimuli', 'tests']) d.createObjectStore(s, { keyPath: 'id' }); d.createObjectStore('images'); };
      r.onsuccess = () => {
        const d = r.result, tx = d.transaction(['questions', 'stimuli', 'tests', 'images'], 'readwrite');
        const T = '2026-09-01T10:00:00.000Z';
        tx.objectStore('questions').put({ id: 'old-q1', type: 'tf', prompt: 'old question 1', course: 'Old', unit: '', tags: [], difficulty: 'easy', status: 'ready', stimulusId: 'old-s1', imageIds: ['old-img'], table: null, answer: { correct: true }, notes: '', created: T, updated: T });
        tx.objectStore('questions').put({ id: 'old-q2', type: 'mc', prompt: 'old question 2', course: 'Old', unit: '', tags: [], difficulty: 'easy', status: 'review', stimulusId: null, imageIds: [], table: null, keepOrder: true, answer: { options: ['a', 'b', 'All of the above'], correct: 2 }, notes: '', created: T, updated: T });
        tx.objectStore('stimuli').put({ id: 'old-s1', title: 'Old stimulus', text: 't', imageIds: [], table: null, created: T, updated: T });
        tx.objectStore('tests').put({ id: 'old-t1', title: 'Old test', course: 'Old', questionIds: ['old-q1', 'old-q2'], seed: 5, created: T, updated: T });
        tx.objectStore('images').put(new Blob(['PNGDATA'], { type: 'image/png' }), 'old-img');
        tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
  });
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready === true);
  const Nr = await page.evaluate(async () => {
    const [banks, qs, ss, ts, ids] = await Promise.all([PQ.db.getAll('banks'), PQ.db.getAll('questions'), PQ.db.getAll('stimuli'), PQ.db.getAll('tests'), PQ.db.getImageIds()]);
    const img = await PQ.db.getImage('old-img');
    const open = await new Promise(res => { const r = indexedDB.open('prime-questions'); r.onsuccess = () => { const v = r.result.version, names = Array.from(r.result.objectStoreNames).sort().join(); r.result.close(); res([v, names]); }; });
    return {
      version: open[0], stores: open[1], banks: banks.map(b => b.id + '|' + b.name), qBank: qs.map(q => q.bankId), sBank: ss.map(s => s.bankId),
      updatedKept: qs.every(q => q.updated === '2026-09-01T10:00:00.000Z') && ss.every(s => s.updated === '2026-09-01T10:00:00.000Z'),
      keep: qs.find(q => q.id === 'old-q2').keepOrder === true, tests: ts.map(t => t.id + ':' + t.questionIds.length + ':' + t.seed), imgs: ids.join(), imgText: await img.text(),
      defaultMatches: PQ.stable(banks[0]) === PQ.stable(PQ.defaultBank())
    };
  });
  check('database is now version 2 with banks and testVersions stores', Nr.version === 2 && /banks/.test(Nr.stores) && /testVersions/.test(Nr.stores), [Nr.version, Nr.stores]);
  check('the default bank was created, identical to the one files are migrated to', Nr.banks.join() === PQ_DEFAULT() && Nr.defaultMatches, Nr.banks);
  check('every existing question and stimulus was moved into the default bank', Nr.qBank.every(b => b === '00000000-0000-4000-8000-000000000001') && Nr.sBank.every(b => b === '00000000-0000-4000-8000-000000000001') && Nr.qBank.length === 2 && Nr.sBank.length === 1, Nr);
  check('nothing else changed: updated dates, keepOrder, tests, image bytes', Nr.updatedKept && Nr.keep && Nr.tests.join() === 'old-t1:2:5' && Nr.imgs === 'old-img' && Nr.imgText === 'PNGDATA', Nr);
  // a second reload must not migrate again or duplicate anything
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready === true);
  check('reloading again changes nothing (one bank, same data)', await page.evaluate(async () => (await PQ.db.getAll('banks')).length === 1 && (await PQ.db.getAll('questions')).length === 2));
  // a brand-new database gets the default bank too
  await page.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('prime-questions'); r.onsuccess = r.onerror = r.onblocked = () => res(1); }));
  await page.reload(); await page.waitForFunction(() => window.PQ && PQ.ready === true);
  check('a fresh database starts with the default bank "My Questions"', await page.evaluate(async () => { const b = await PQ.db.getAll('banks'); return b.length === 1 && b[0].name === 'My Questions' && b[0].id === PQ.DEFAULT_BANK_ID; }));


  /* ---------- O. natural equation typing ---------- */
  console.log('O. natural typing -> LaTeX');
  const cases = [
    ['1/2', '\\frac{1}{2}'], ['3/4+1/4', '\\frac{3}{4}+\\frac{1}{4}'], ['x^2', 'x^{2}'], ['x^2+3x-4=0', 'x^{2}+3x-4=0'],
    ['(x+1)/(x-2)', '\\frac{x+1}{x-2}'], ['1/(x+1)', '\\frac{1}{x+1}'], ['a/b/c', '\\frac{\\frac{a}{b}}{c}'], ['x^2/3', '\\frac{x^{2}}{3}'], ['1/2x', '\\frac{1}{2}x'],
    ['(1/2)^2', '\\left(\\frac{1}{2}\\right)^{2}'], ['x_1/x_2', '\\frac{x_{1}}{x_{2}}'], ['a_(n+1)', 'a_{n+1}'], ['x^2^3', '{x^{2}}^{3}'],
    ['sqrt(x)', '\\sqrt{x}'], ['sqrt(x+1)', '\\sqrt{x+1}'], ['sqrt[3](27)', '\\sqrt[3]{27}'], ['cbrt(8)', '\\sqrt[3]{8}'], ['root(4)(16)', '\\sqrt[4]{16}'], ['sqrt 2/3', '\\frac{\\sqrt{2}}{3}'],
    ['x = (-b +- sqrt(b^2 - 4ac))/(2a)', 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'],
    ['pi r^2', '\\pi r^{2}'], ['2pir', '2\\pi r'], ['alpha + beta', '\\alpha+\\beta'], ['theta = 30 deg', '\\theta=30^{\\circ}'], ['Delta x', '\\Delta x'], ['oo', '\\infty'],
    ['6.02 xx 10^23', '6.02\\times10^{23}'], ['10^-3', '10^{-3}'], ['3 -: 4', '3\\div4'], ['2*3', '2\\cdot3'], ['1.5', '1.5'], ['.5', '.5'],
    ['x <= 5', 'x\\le5'], ['a >= b', 'a\\ge b'], ['a != b', 'a\\ne b'], ['x -> 3', 'x\\to3'], ['x<-3', 'x<-3'], ['a ~= b', 'a\\approx b'], ['5 // 2', '5/2'],
    ['90 deg', '90^{\\circ}'], ['30 degC', '30^{\\circ}\\mathrm{C}'], ['50%', '50\\%'],
    ['sin(x)/cos(x)', '\\frac{\\sin(x)}{\\cos(x)}'], ['sin^2(x)+cos^2(x)=1', '\\sin^{2}(x)+\\cos^{2}(x)=1'], ['sin x', '\\sin x'], ['log_2 8 = 3', '\\log_{2}8=3'], ['f(x) = 2x + 1', 'f(x)=2x+1'], ['f(x)/2', '\\frac{f(x)}{2}'],
    ['lim_(x->0) sin(x)/x', '\\lim_{x\\to0}\\frac{\\sin(x)}{x}'], ['sum_(i=1)^n i', '\\sum_{i=1}^{n}i'], ['int_0^1 x dx', '\\int_{0}^{1}xdx'],
    ['2 1/3', '2\\tfrac{1}{3}'], ['x = 3 1/2', 'x=3\\tfrac{1}{2}'],
    ['60 km/h', '60\\,\\mathrm{km/h}'], ['9.8 m/s^2', '9.8\\,\\mathrm{m/s^{2}}'], ['2 mol/L', '2\\,\\mathrm{mol/L}'], ['5 kg', '5\\,\\mathrm{kg}'], ['120 km / 2 h', '\\frac{120\\,\\mathrm{km}}{2}h'], ['(120 km)/(2 h)', '\\frac{120\\,\\mathrm{km}}{2h}'],
    ['2m + 3', '2m+3'], ['3 g', '3g'], ['2x', '2x'], ['5 min(a,b)', '5\\min(a,b)'], ['3kg + 2m', '3\\,\\mathrm{kg}+2m'],
    ['|x-2| < 3', '\\left|x-2\\right|<3'], ['abs(x)', '\\left|x\\right|'], ['e^(-x^2/2)', 'e^{-\\frac{x^{2}}{2}}'], ['{1,2,3}', '\\{1,2,3\\}'], ['[a,b]', '[a,b]'], ['3(x+1)', '3(x+1)'],
    ['angle ABC = 90 deg', '\\angle ABC=90^{\\circ}'], ['AB || CD', 'AB\\parallel CD'], ['AB _|_ CD', 'AB\\perp CD'], ['vec(AB)', '\\vec{AB}'], ['bar(x)', '\\overline{x}'],
    ['"speed" = d/t', '\\text{speed}=\\frac{d}{t}'], ['x in RR', 'x\\in\\mathbb{R}'], ["f'(x)", 'f^{\\prime}(x)'], ["f''(x)", 'f^{\\prime\\prime}(x)'], ["x'^2", "{x^{\\prime}}^{2}"],
    ['ce(H2O)', '\\ce{H2O}'], ['ce(2H2 + O2 -> 2H2O)', '\\ce{2H2 + O2 -> 2H2O}'], ['ce(SO4^2-)', '\\ce{SO4^2-}'],
    ['\\frac{a}{b}', '\\frac{a}{b}'], ['\\sqrt[3]{x}', '\\sqrt[3]{x}'], ['x^{n+1}', 'x^{n+1}'], ['\\alpha/2', '\\frac{\\alpha}{2}'], ['\\left( x \\right)', '\\left(x\\right)'], ['a \\\\ b', 'a\\\\b'],
    ['\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}', '\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}'],
    ['', ''], ['   ', '']
  ];
  const Or = await page.evaluate(cs => cs.map(([src, want]) => { let got, err = null, renders = true; try { got = PQ.asciiToTex(src); } catch (e) { err = String(e); }
    if (got) { try { temml.renderToString(got, { throwOnError: true }); } catch (e) { renders = String(e.message).slice(0, 80); } }
    return { src, want, got, err, renders }; }), cases);
  const wrong = Or.filter(r => r.err || r.got !== r.want);
  check('natural typing: ' + cases.length + ' conversions give the expected LaTeX', wrong.length === 0, wrong.slice(0, 5));
  const notRender = Or.filter(r => r.renders !== true);
  check('every converted result renders in Temml without error', notRender.length === 0, notRender.slice(0, 5));
  const fuzz = await page.evaluate(() => {
    const run = (alpha, validate, count, seed0) => {
      const out = { n: 0, threw: 0, slowest: 0, invalid: 0, sample: [] };
      let seed = seed0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let k = 0; k < count; k++) {
        let str = ''; const len = 1 + Math.floor(rnd() * 40);
        for (let j = 0; j < len; j++) str += alpha[Math.floor(rnd() * alpha.length)];
        const t0 = performance.now(); let tex = null;
        try { tex = PQ.asciiToTex(str); } catch (e) { out.threw++; }
        out.slowest = Math.max(out.slowest, performance.now() - t0); out.n++;
        if (validate && tex) { try { temml.renderToString(tex, { throwOnError: true }); } catch (e) { out.invalid++; if (out.sample.length < 3) out.sample.push([str, tex, String(e.message).slice(0, 60)]); } }
      }
      return out;
    };
    const natural = run('abx12+-*/^_()[]{}|<>=!.,"%$# `~&:;?\'sqrtpiceal', true, 6000, 12345);
    const withBackslash = run('abx12+-*/^_()[]{}|<>=!.,\\"%$# \n`~&:;?\'sqrtpiceal', false, 4000, 777);   // random backslash commands are usually not real commands, so only "no crash"
    // pathological sizes: each must finish quickly
    const time = s => { const t0 = performance.now(); try { PQ.asciiToTex(s); } catch (e) { return 'threw ' + e; } return Math.round(performance.now() - t0); };
    const path = { deep: time('('.repeat(5000) + 'x' + ')'.repeat(5000)), long: time('a/b+'.repeat(20000)), carets: time('^'.repeat(5000)), slashes: time('/'.repeat(5000)), backslashes: time('\\'.repeat(3001)), braces: time('{'.repeat(4000)), letters: time('a'.repeat(20000)), quotes: time('"'.repeat(5000)), primes: time("'".repeat(5000)) };
    return { natural, withBackslash, path };
  });
  check('fuzz: 6000 random natural-typing strings and 4000 with backslashes never throw', fuzz.natural.threw === 0 && fuzz.withBackslash.threw === 0 && fuzz.natural.n === 6000, [fuzz.natural.threw, fuzz.withBackslash.threw]);
  check('fuzz: at least 99.5% of random natural-typing garbage still gives LaTeX that renders', fuzz.natural.invalid <= 30, { invalid: fuzz.natural.invalid, sample: fuzz.natural.sample });
  check('pathological input (5000 nested brackets, 80 KB, 20000 letters, 5000 carets/slashes/quotes/primes) is fast and never throws', Object.values(fuzz.path).every(v => typeof v === 'number' && v < 1500), fuzz.path);
  const bt = await page.evaluate(() => {
    const at = (t) => PQ.convertBackticksAt(t, t.length);
    return {
      basic: at('Half is `1/2`'), none: at('no backtick'), open: at('`only open'), empty: at('a `` b'),
      mid: PQ.convertBackticksAt('Solve `x^2+1` now', 'Solve `x^2+1`'.length),
      insideMath: at('\\(a `x^2`'), bad: at('`\\frac{1`'), newline: at('`a\nb`'), two: at('`1/2` and `3/4`'), fraction: at('`(x+1)/(x-2)`')
    };
  });
  check('backticks: `1/2` becomes \\(\\frac{1}{2}\\) and the caret lands after it', bt.basic && bt.basic.text === 'Half is \\(\\frac{1}{2}\\)' && bt.basic.caret === bt.basic.text.length, bt.basic);
  check('backticks: converts in the middle of text and keeps the rest', bt.mid && bt.mid.text === 'Solve \\(x^{2}+1\\) now' && bt.mid.caret === 'Solve \\(x^{2}+1\\)'.length, bt.mid);
  check('backticks: only the span just closed is converted (an earlier pair stays as typed? no: it is already converted)', bt.two && bt.two.text === '`1/2` and \\(\\frac{3}{4}\\)', bt.two);
  check('backticks: nothing to do without a closing backtick, for empty spans, newlines, inside \\( \\), or invalid maths', !bt.none && !bt.open && !bt.empty && !bt.newline && !bt.insideMath && !bt.bad, bt);
  check('backticks: a fraction of groups', bt.fraction && bt.fraction.text === '\\(\\frac{x+1}{x-2}\\)', bt.fraction);

  /* ---------- P. schema 4: the look of the printed paper ---------- */
  console.log('P. schema 4 (format settings) and a bank from the previous version');
  const fx3 = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'bank-schema3-v0.3.0.pdf')).toString('base64');
  const P = await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const raw = await PQ.readPdfPayload(u.buffer), parsed = PQ.parsePayload(raw);
    const T = '2026-10-01T15:00:00Z';
    const withTest = extra => ({ format: 'prime-questions', schemaVersion: 5, appVersion: '9', requiredFeatures: [], exportedAt: T, banks: [PQ.defaultBank()], questions: [], stimuli: [],
      tests: [Object.assign({ id: 't1', title: 'T', course: '', questionIds: [], seed: 1, created: T, updated: T }, extra)], images: {} });
    const ok = extra => PQ.parsePayload(withTest(extra)).ok;
    const m = (o) => Object.assign({}, PQ.MARGIN_DEFAULT, o);
    return {
      rawSchema: raw.schemaVersion, rawApp: raw.appVersion, ok: parsed.ok, errors: parsed.errors, schema: parsed.ok && parsed.payload.schemaVersion,
      sameTest: parsed.ok && JSON.stringify(parsed.payload.tests[0]) === JSON.stringify(raw.tests[0]),
      noInvented: parsed.ok && parsed.payload.tests.every(t => !('headingSize' in t) && !('textSize' in t) && !('questionStyle' in t) && !('margins' in t)),
      counts: parsed.ok && [parsed.payload.banks.length, parsed.payload.questions.length, parsed.payload.tests.length],
      good: ok({ headingSize: 'large', textSize: 'small', questionStyle: 'condensed', margins: m({ top: 10 }) }), none: ok({}),
      badHeading: ok({ headingSize: 'huge' }), badText: ok({ textSize: 12 }), badStyle: ok({ questionStyle: 'fancy' }),
      badMargins: [ok({ margins: { top: 10 } }), ok({ margins: m({ top: 2 }) }), ok({ margins: m({ left: 99 }) }), ok({ margins: m({ right: '10' }) }), ok({ margins: m({ bottom: NaN }) }), ok({ margins: 'wide' }), ok({ margins: null })],
      defaults: PQ.testFormat({}), partial: PQ.testFormat({ textSize: 'large', margins: { top: 20 } }), junk: PQ.testFormat({ headingSize: 'x', questionStyle: 7 }),
      planFmt: PQ.planTest({ id: 't', title: '', course: '', questionIds: [], seed: 1, questionStyle: 'classic' }, [], [], 'A').format,
      across: [PQ.acrossOk([{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]), PQ.acrossOk([{ text: 'x'.repeat(23) }, { text: 'b' }]), PQ.acrossOk(Array.from({ length: 7 }, () => ({ text: 'a' }))), PQ.acrossOk(Array.from({ length: 5 }, () => ({ text: 'y'.repeat(20) })))]
    };
  }, fx3);
  check('fixture is a schema 3 bank written by v0.3.0, with a test that has page options', P.rawSchema === 3 && P.rawApp === '0.3.0', P);
  check('the v0.3.0 bank imports (3 -> 4 -> 5): 2 banks, 4 questions, 1 test, the test exactly as written, no format fields invented', P.ok && P.schema === 5 && P.sameTest && P.noInvented && P.counts.join() === '2,4,1', P);
  check('schema 4 fields are accepted when valid, and a test without them is fine', P.good && P.none, P);
  check('invalid heading size, text size, question style and margins are each refused', !P.badHeading && !P.badText && !P.badStyle && P.badMargins.every(v => v === false), P);
  check('testFormat fills in the defaults (medium, medium, standard, 16/14/18/14 mm), partial margins and junk values', JSON.stringify(P.defaults) === JSON.stringify({ font: '', headingSize: 'medium', textSize: 'medium', questionStyle: 'standard', margins: { top: 16, right: 14, bottom: 18, left: 14 } }) && P.partial.textSize === 'large' && P.partial.margins.top === 20 && P.partial.margins.left === 14 && P.junk.headingSize === 'medium' && P.junk.questionStyle === 'standard', [P.defaults, P.partial, P.junk]);
  check('planTest carries the format to the sheet builder', P.planFmt.questionStyle === 'classic' && P.planFmt.textSize === 'medium');
  check('Condensed puts options across only when they are short and few', P.across.join() === 'true,false,false,false', P.across);

  /* ---------- Q. schema 5: sections, per-question answer area and writing space, fonts ---------- */
  console.log('Q. schema 5 (sections, question options, font) and a bank from the previous version');
  const fx4 = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'bank-schema4-v0.5.0.pdf')).toString('base64');
  const Q = await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const raw = await PQ.readPdfPayload(u.buffer), parsed = PQ.parsePayload(raw);
    const T = '2026-10-01T15:00:00Z';
    const q = (id, extra) => Object.assign({ id, bankId: PQ.DEFAULT_BANK_ID, type: 'tf', prompt: id, course: '', unit: '', tags: [], difficulty: 'medium', status: 'ready', stimulusId: null, imageIds: [], table: null, answer: { correct: true }, notes: '', created: T, updated: T }, extra || {});
    const qs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => q(id)); qs.push(q('s1', { stimulusId: 'st', type: 'numeric', answer: { value: '1', units: '', tolerance: 0 } }), q('s2', { stimulusId: 'st' }));
    const stim = [{ id: 'st', bankId: PQ.DEFAULT_BANK_ID, title: 'T', text: 'x', imageIds: [], table: null, created: T, updated: T }];
    const mc = q('m', { type: 'multipart', answer: { parts: [{ type: 'numeric', prompt: 'n', answer: { value: '1', units: '', tolerance: 0 } }, { type: 'short', prompt: 's', answer: { lines: 3, rubric: '' } }] } });
    qs.push(mc);
    const test = extra => Object.assign({ id: 't', title: 'T', course: '', questionIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], seed: 4242, created: T, updated: T }, extra || {});
    const plan = (t, v) => PQ.planTest(t, qs, stim, v);
    const order = p => p.blocks.flatMap(b => b.items.map(i => i.q.id)).join('');
    const secs = [{ id: 'X', startId: 'c', title: 'Part 1', instructions: 'i' }, { id: 'Y', startId: 'f', title: 'Part 2', instructions: '' }];
    const noSecA = plan(test(), 'A'), noSecB = plan(test(), 'B');
    const withA = plan(test({ sections: secs }), 'A'), withB = plan(test({ sections: secs }), 'B');
    const inSeg = (p, ids) => { const o = order(p); return ids.every(i => o.indexOf(i) >= 0); };
    // shuffles inside the sections only: positions 0-1 hold a,b; 2-4 hold c,d,e; 5-7 hold f,g,h
    const bO = order(withB);
    const segs = [bO.slice(0, 2).split('').sort().join(''), bO.slice(2, 5).split('').sort().join(''), bO.slice(5).split('').sort().join('')];
    const moved = [withB.blocks[0].sections.length, withB.blocks[2].sections.map(x => x.id).join(), withB.blocks[5].sections.map(x => x.id).join()];
    // an old test shuffles exactly as it did before sections existed: re-derive with the old formula
    const oldB = (() => { const blocks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => [id]); return PQ.shuffled(blocks, PQ.mulberry32(PQ.hashSeed(4242, 'blocks'))).flat().join(''); })();
    // stimulus group: its questions stay together and the section starts at the group
    const g = plan(test({ questionIds: ['a', 's1', 'b', 's2', 'c'], sections: [{ id: 'G', startId: 's2', title: 'G', instructions: '' }] }), 'A');
    const orphan = plan(test({ sections: [{ id: 'Z', startId: 'nope', title: 'z', instructions: '' }] }), 'A');
    const two = plan(test({ sections: [{ id: 'P', startId: 'c', title: 'p', instructions: '' }, { id: 'Q', startId: 'c', title: 'q', instructions: '' }] }), 'A');
    const first = plan(test({ sections: [{ id: 'F', startId: 'a', title: 'f', instructions: '' }] }), 'B');
    const opt = plan(test({ questionIds: ['a', 's1', 'm'], questionOptions: { s1: { answerStyle: 'blank', space: 40 }, a: { space: 'rest' }, 'm#1': { answerStyle: 'none' }, 'm#0': { answerStyle: 'blank' } } }), 'A');
    const items = opt.blocks.flatMap(b => b.items);
    const withTest = extra => ({ format: 'prime-questions', schemaVersion: 5, appVersion: '9', requiredFeatures: [], exportedAt: T, banks: [PQ.defaultBank()], questions: [], stimuli: [], tests: [Object.assign({ id: 't1', title: 'T', course: '', questionIds: [], seed: 1, created: T, updated: T }, extra)], images: {} });
    const ok = extra => PQ.parsePayload(withTest(extra)).ok;
    const sec = x => Object.assign({ id: 's', startId: 'a', title: 't', instructions: '' }, x);
    return {
      fixture: { schema: raw.schemaVersion, app: raw.appVersion, ok: parsed.ok, schemaNow: parsed.ok && parsed.payload.schemaVersion, same: parsed.ok && JSON.stringify(parsed.payload.tests[0]) === JSON.stringify(raw.tests[0]), keys: parsed.ok && Object.keys(parsed.payload.tests[0]).filter(k => ['font', 'sections', 'questionOptions'].includes(k)), kept: parsed.ok && [parsed.payload.tests[0].questionStyle, parsed.payload.tests[0].headingSize] },
      noSec: [order(noSecA), order(noSecB), noSecA.blocks.every(b => b.sections.length === 0)], oldB,
      withA: order(withA), a: withA.blocks.map(b => b.sections.map(x => x.id).join()).join('|'), segs, moved, numbers: withB.blocks.flatMap(b => b.items.map(i => i.number)).join(),
      bKeyLen: PQ.keyEntries(withB).length, aNums: PQ.keyEntries(withB).map(e => e.aNumber).sort((x, y) => x - y).join(''), sameSeedSameB: order(withB) === order(plan(test({ sections: secs }), 'B')),
      other: order(plan(test({ sections: secs, seed: 99 }), 'B')) !== bO,
      streams: (() => { let differ = 0; for (let seed = 1; seed <= 30; seed++) { const t = { id: 't', title: 'T', course: '', questionIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], seed, created: T, updated: T, sections: [{ id: 'X', startId: 'a', title: '', instructions: '' }, { id: 'Y', startId: 'e', title: '', instructions: '' }] };
        const o = order(plan(t, 'B')); const p1 = o.slice(0, 4).split('').map(c => c.charCodeAt(0) - 97).join(''), p2 = o.slice(4).split('').map(c => c.charCodeAt(0) - 101).join(''); if (p1 !== p2) differ++; } return differ; })(),
      grp: [g.blocks.map(b => b.items.map(i => i.q.id).join('+')).join('|'), g.blocks.map(b => b.sections.length).join()],
      orphan: [orphan.orphanSections.join(), order(orphan) === order(noSecA), orphan.blocks.every(b => b.sections.length === 0)],
      two: two.blocks[2].sections.map(x => x.id).join(), first: [first.blocks[0].sections.map(x => x.id).join(), first.blocks.length],
      opts: [items[0].space, items[1].view.style, items[1].space, items[2].view.parts.map(p => p.style || '').join(), items[2].space, items[0].view.style || ''],
      valid: { sections: ok({ sections: [sec()] }), none: ok({}), opts: ok({ questionOptions: { a: { answerStyle: 'blank', space: 30 }, b: { space: 'rest' } } }), font: ok({ font: 'Georgia' }), font2: ok({ font: 'DejaVu Sans Mono' }), font3: ok({ font: "Noto Sans (Display)" }) },
      bad: [ok({ sections: 'x' }), ok({ sections: [sec({ id: '' })] }), ok({ sections: [sec({ startId: 3 })] }), ok({ sections: [sec({ title: 'x'.repeat(201) })] }), ok({ sections: [sec({ instructions: 'x'.repeat(1001) })] }), ok({ sections: Array.from({ length: 51 }, (_, i) => sec({ id: 's' + i })) }),
        ok({ questionOptions: [] }), ok({ questionOptions: { a: 'x' } }), ok({ questionOptions: { a: { answerStyle: 'ruled' } } }), ok({ questionOptions: { a: { space: 3 } } }), ok({ questionOptions: { a: { space: 500 } } }), ok({ questionOptions: { a: { space: '40' } } }), ok({ questionOptions: { a: { other: 1 } } }),
        ok({ font: '' }), ok({ font: 'a"b' }), ok({ font: 'x;y' }), ok({ font: 'a{b}' }), ok({ font: 'x'.repeat(101) }), ok({ font: 7 }), ok({ font: '</style>' }), ok({ font: 'a\nb' })],
      fmt: [PQ.testFormat({ font: 'Georgia' }).font, PQ.testFormat({ font: 'bad;font' }).font, PQ.testFormat({}).font],
      stack: [PQ.fontStack('Georgia'), PQ.fontStack(''), PQ.fontStack('a"b'), PQ.fontStack('x}')]
    };
  }, fx4);
  check('fixture is a schema 4 bank written by v0.5.0, with format settings on its test', Q.fixture.schema === 4 && Q.fixture.app === '0.5.0' && Q.fixture.kept.join() === 'condensed,large', Q.fixture);
  check('the v0.5.0 bank imports (4 -> 5), the test exactly as written, no sections / font / question options invented', Q.fixture.ok && Q.fixture.schemaNow === 5 && Q.fixture.same && Q.fixture.keys.length === 0, Q.fixture);
  check('a test with no sections plans exactly as before (same Version B order as the old formula, no headings)', Q.noSec[2] && Q.noSec[0] === 'abcdefgh' && Q.noSec[1] === Q.oldB, Q.noSec);
  check('sections: Version A keeps the order and puts each heading on the block where its question starts', Q.withA === 'abcdefgh' && Q.a === '||X|||Y||', [Q.withA, Q.a]);
  check('Version B shuffles only inside each section: the same questions stay in the same stretch', Q.segs.join('|') === 'ab|cde|fgh', Q.segs);
  check('and each heading moves to the top of its (shuffled) stretch, numbers carry on, every A number appears once', Q.moved.join('|') === '0|X|Y' && Q.numbers === '1,2,3,4,5,6,7,8' && Q.aNums === '12345678', [Q.moved, Q.numbers]);
  check('every section has its own shuffle stream: two sections of the same size do not shuffle identically (differ for most of 30 seeds)', Q.streams >= 15, Q.streams);
  check('Version B with sections is repeatable for a seed and changes with another seed', Q.sameSeedSameB && Q.other);
  check('a stimulus group is one block (its questions stay together) and a section can start at any of its questions', Q.grp[0] === 'a|s1+s2|b|c' && Q.grp[1] === '0,1,0,0', Q.grp);
  check('a section whose question is not on the paper is skipped and reported, and changes nothing else', Q.orphan[0] === 'Z' && Q.orphan[1] && Q.orphan[2], Q.orphan);
  check('two sections on the same question both print, in order; a section on the first question is allowed', Q.two === 'P,Q' && Q.first[0] === 'F' && Q.first[1] === 8, [Q.two, Q.first]);
  check('question options reach the plan: writing space, answer style (numeric), and per-part styles for a multipart question', Q.opts[0] === 'rest' && Q.opts[1] === 'blank' && Q.opts[2] === 40 && Q.opts[3] === 'blank,none' && Q.opts[4] === null && Q.opts[5] === '', Q.opts);
  check('valid sections, question options and font names are accepted; a test without them is fine', Object.values(Q.valid).every(Boolean), Q.valid);
  check('each invalid section, question option and font name is refused (bad types, lengths, range, quotes, braces, semicolons, newline)', Q.bad.every(v => v === false), Q.bad);
  check('testFormat and fontStack only ever use safe font names', Q.fmt.join('|') === 'Georgia||' && Q.stack[0] === '"Georgia",Helvetica,Arial,"Liberation Sans",sans-serif' && Q.stack.slice(1).every(x => x === 'Helvetica,Arial,"Liberation Sans",sans-serif'), Q.stack);

  check('no console errors during the whole suite', problems.length === 0, problems);
  const fails = summary();
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
