#!/usr/bin/env python3
"""Turn a Prime Questions draft (JSON) into a bank PDF that the app can import.

Usage:  python3 draft_to_bank_pdf.py questions.json [output.pdf]

Only the Python standard library is used. The PDF has one cover page, and the real data
embedded inside it as prime-questions.pq (that embedded file is all the app reads).
After importing, use "Export everything" in the app if you want a PDF with the questions
printed on its pages. The draft format is described in ai-instructions.md.
Questions are added with the status "review": a person must check every answer.
"""
import json, re, sys, uuid, zlib, datetime

FORMAT, SCHEMA, APP = 'prime-questions', 5, '0.6.1'
TYPES = ['mc', 'tf', 'numeric', 'short', 'matching', 'multipart']
PART_TYPES = TYPES[:-1]
DRAFT_FORMAT = 'prime-questions-draft'


class DraftError(Exception):
    def __init__(self, errors):
        super().__init__('\n'.join(errors))
        self.errors = errors


def load_text(text):
    """JSON from text; tolerates a code fence, text around the JSON, and single backslashes in LaTeX."""
    t = text.lstrip('﻿').strip()
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', t, re.I)
    if m:
        t = m.group(1).strip()

    def attempt(x):
        try:
            return json.loads(x)
        except ValueError:
            pass
        try:
            return json.loads(re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', x))
        except ValueError:
            return None
    r = attempt(t)
    if r is not None:
        return r
    a = min([i for i in (t.find('{'), t.find('[')) if i >= 0] or [-1])
    b = max(t.rfind('}'), t.rfind(']'))
    if a >= 0 and b > a:
        r = attempt(t[a:b + 1])
        if r is not None:
            return r
    raise DraftError(['This is not valid JSON. Return only the JSON, with straight quotes and no comments.'])


def convert(d, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    errors = []

    def err(path, msg):
        if len(errors) < 40:
            errors.append(path + ' ' + msg)

    if isinstance(d, list):
        d = {'questions': d}
    if not isinstance(d, dict):
        raise DraftError(['The draft must be an object with a "questions" list.'])
    if 'format' in d and d['format'] != DRAFT_FORMAT:
        raise DraftError(['"format" must be "%s" (or left out).' % DRAFT_FORMAT])
    if not isinstance(d.get('questions'), list) or not d['questions']:
        raise DraftError(['"questions" must be a list with at least one question.'])
    if len(d['questions']) > 500:
        raise DraftError(['At most 500 questions per draft. Split it into several files.'])

    def scan(v, path):
        if isinstance(v, str):
            if re.search('[\x08\x0c\t\r]', v):
                err(path, 'contains a control character. A LaTeX command such as \\frac was probably written with one backslash. In JSON every backslash must be doubled.')
        elif isinstance(v, list):
            for i, x in enumerate(v):
                scan(x, '%s[%d]' % (path, i))
        elif isinstance(v, dict):
            for k, x in v.items():
                scan(x, path + '.' + k if path else k)
    scan(d, '')
    if errors:
        raise DraftError(errors)

    def num(v):
        return str(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v

    def text(v, path, default, mx=20000):
        if v is None:
            return default
        v = num(v)
        if not isinstance(v, str):
            err(path, 'must be text.')
            return default
        if len(v) > mx:
            err(path, 'is too long.')
            return default
        return v

    def table(t, path):
        if t is None:
            return None
        if not isinstance(t, dict) or not isinstance(t.get('headers'), list) or not isinstance(t.get('rows'), list):
            err(path, 'must be { "headers": [...], "rows": [[...]], "caption": "" }.')
            return None
        headers = [num(x) for x in t['headers']]
        rows = [[num(x) for x in r] if isinstance(r, list) else r for r in t['rows']]
        if not headers or len(headers) > 8 or not all(isinstance(x, str) for x in headers):
            err(path + '.headers', 'must be 1 to 8 pieces of text.')
            return None
        if not rows or len(rows) > 40 or not all(isinstance(r, list) and len(r) == len(headers) and all(isinstance(x, str) for x in r) for r in rows):
            err(path + '.rows', 'must be 1 to 40 rows, each with exactly %d pieces of text (one per header).' % len(headers))
            return None
        return {'headers': headers, 'rows': rows, 'caption': text(t.get('caption'), path + '.caption', '', 500)}

    def answer(typ, a, path):
        if not isinstance(a, dict):
            err(path, 'must be an object for a "%s" question.' % typ)
            return None
        if typ == 'mc':
            opts = a.get('options')
            opts = [num(o) for o in opts] if isinstance(opts, list) else None
            if not opts or not 2 <= len(opts) <= 8 or not all(isinstance(o, str) for o in opts):
                err(path + '.options', 'must be 2 to 8 pieces of text.')
                return None
            c = a.get('correct')
            if isinstance(c, str) and re.fullmatch(r'[A-Za-z]', c.strip()):
                c = ord(c.strip().upper()) - 65
            if isinstance(c, bool) or not isinstance(c, int) or not 0 <= c < len(opts):
                err(path + '.correct', 'must be the letter of the correct option, for example "B".')
                return None
            return {'options': opts, 'correct': c}
        if typ == 'tf':
            c = a.get('correct')
            if isinstance(c, str) and re.fullmatch(r'(?i)true|t|false|f', c.strip()):
                c = c.strip().lower().startswith('t')
            if not isinstance(c, bool):
                err(path + '.correct', 'must be true or false.')
                return None
            return {'correct': c}
        if typ == 'numeric':
            v = text(a.get('value'), path + '.value', None)
            if v is None or not v.strip():
                err(path + '.value', 'is required (the answer, as text such as "9.8").')
                return None
            tol = 0 if a.get('tolerance') is None else a.get('tolerance')
            if isinstance(tol, bool) or not isinstance(tol, (int, float)) or tol < 0:
                err(path + '.tolerance', 'must be a number, 0 or more.')
                return None
            return {'value': v, 'units': text(a.get('units'), path + '.units', '', 500), 'tolerance': tol}
        if typ == 'short':
            n = 4 if a.get('lines') is None else a.get('lines')
            if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= 40:
                err(path + '.lines', 'must be a whole number from 1 to 40.')
                return None
            return {'lines': n, 'rubric': text(a.get('rubric'), path + '.rubric', '', 5000)}
        if typ == 'matching':
            pairs = a.get('pairs')
            if not isinstance(pairs, list) or not 2 <= len(pairs) <= 12:
                err(path + '.pairs', 'must be 2 to 12 pairs, each { "left": "...", "right": "..." }.')
                return None
            out = [{'left': num(p.get('left')) if isinstance(p, dict) else None, 'right': num(p.get('right')) if isinstance(p, dict) else None} for p in pairs]
            if not all(isinstance(p['left'], str) and isinstance(p['right'], str) and p['left'].strip() and p['right'].strip() for p in out):
                err(path + '.pairs', 'each pair needs a non-empty "left" and "right".')
                return None
            return {'pairs': out}
        return None

    bank_name = (text(d.get('bank'), 'bank', '', 200) or '').strip() or 'Imported questions'
    bank = {'id': str(uuid.uuid4()), 'name': bank_name, 'created': now, 'updated': now}
    stim_by_key, stimuli = {}, []
    if d.get('stimuli') is not None and not isinstance(d['stimuli'], list):
        err('stimuli', 'must be a list.')
    for i, s in enumerate(d['stimuli'] if isinstance(d.get('stimuli'), list) else []):
        path = 'stimuli[%d]' % i
        if not isinstance(s, dict):
            err(path, 'must be an object.')
            continue
        key = text(s.get('key'), path + '.key', '', 100).strip()
        title = text(s.get('title'), path + '.title', '', 500).strip()
        if not key:
            err(path + '.key', 'is required.')
        elif key in stim_by_key:
            err(path + '.key', 'is used twice.')
        if not title:
            err(path + '.title', 'is required.')
        rec = {'id': str(uuid.uuid4()), 'bankId': bank['id'], 'title': title, 'text': text(s.get('text'), path + '.text', '').strip(),
               'imageIds': [], 'table': table(s.get('table'), path + '.table'), 'created': now, 'updated': now}
        if key:
            stim_by_key[key] = rec
        stimuli.append(rec)

    questions = []
    for i, q in enumerate(d['questions']):
        path = 'questions[%d]' % (i + 1)
        if not isinstance(q, dict):
            err(path, 'must be an object.')
            continue
        typ = q.get('type').strip().lower() if isinstance(q.get('type'), str) else q.get('type')
        if typ not in TYPES:
            err(path + '.type', 'must be one of ' + ', '.join(TYPES) + '.')
            continue
        prompt = text(q.get('prompt'), path + '.prompt', '').strip()
        if not prompt and typ != 'multipart':
            err(path + '.prompt', 'is required.')
        ans = None
        if typ == 'multipart':
            parts = (q.get('answer') or {}).get('parts') if isinstance(q.get('answer'), dict) else None
            if not isinstance(parts, list) or not 1 <= len(parts) <= 12:
                err(path + '.answer.parts', 'must be 1 to 12 parts.')
            else:
                out = []
                for j, p in enumerate(parts):
                    pp = '%s.answer.parts[%d]' % (path, j + 1)
                    if not isinstance(p, dict):
                        err(pp, 'must be an object.')
                        out.append(None)
                        continue
                    pt = p.get('type').strip().lower() if isinstance(p.get('type'), str) else p.get('type')
                    if pt not in PART_TYPES:
                        err(pp + '.type', 'must be one of ' + ', '.join(PART_TYPES) + ' (a part cannot be a multipart).')
                        out.append(None)
                        continue
                    pprompt = text(p.get('prompt'), pp + '.prompt', '').strip()
                    if not pprompt:
                        err(pp + '.prompt', 'is required.')
                    pa = answer(pt, p.get('answer'), pp + '.answer')
                    part = {'type': pt, 'prompt': pprompt, 'answer': pa}
                    if pt == 'mc' and p.get('keepOrder') is True:
                        part['keepOrder'] = True
                    out.append(part if pa else None)
                if all(out):
                    ans = {'parts': out}
        else:
            ans = answer(typ, q.get('answer'), path + '.answer')
        stim_id = None
        if q.get('stimulus') not in (None, ''):
            st = stim_by_key.get(str(q['stimulus']))
            if st is None:
                err(path + '.stimulus', '"%s" is not the key of any item in "stimuli".' % q['stimulus'])
            else:
                stim_id = st['id']
        diff = 'medium' if q.get('difficulty') is None else str(q['difficulty']).lower()
        if diff not in ('easy', 'medium', 'hard'):
            err(path + '.difficulty', 'must be easy, medium or hard.')
        tags = q.get('tags') or []
        if isinstance(tags, str):
            tags = tags.split(',')
        if not isinstance(tags, list) or not all(isinstance(x, str) for x in tags):
            err(path + '.tags', 'must be a list of text.')
            tags = []
        tags_clean = []
        for x in tags:
            x = x.strip()
            if x and x not in tags_clean:
                tags_clean.append(x)
        rec = {'id': str(uuid.uuid4()), 'bankId': bank['id'], 'type': typ, 'prompt': prompt,
               'course': text(q.get('course'), path + '.course', '', 200).strip(), 'unit': text(q.get('unit'), path + '.unit', '', 200).strip(),
               'tags': tags_clean, 'difficulty': diff, 'status': 'review', 'stimulusId': stim_id, 'imageIds': [],
               'table': table(q.get('table'), path + '.table'), 'answer': ans, 'notes': text(q.get('notes'), path + '.notes', '', 5000).strip(),
               'created': now, 'updated': now}
        if typ == 'mc' and q.get('keepOrder') is True:
            rec['keepOrder'] = True
        questions.append(rec)
    if errors:
        raise DraftError(errors)
    return {'format': FORMAT, 'schemaVersion': SCHEMA, 'appVersion': APP, 'requiredFeatures': [], 'exportedAt': now,
            'banks': [bank], 'questions': questions, 'stimuli': stimuli, 'tests': [], 'images': {}}


def build_pdf(payload):
    data = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    comp = zlib.compress(data)
    lines = ['Prime Questions: draft bank',
             '%d question(s) in "%s". Import this file in Prime Questions (Imports).' % (len(payload['questions']), payload['banks'][0]['name']),
             'The questions are marked "Needs review": check every answer before use.',
             'This page is only a cover. The questions are inside the file.']
    def esc(s):
        return s.encode('cp1252', 'replace').decode('latin-1').replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    content = 'BT /F1 18 Tf 56 740 Td (%s) Tj /F1 11 Tf 0 -28 Td 14 TL ' % esc(lines[0]) + ' '.join('(%s) Tj T*' % esc(l) for l in lines[1:]) + ' ET'
    content = content.encode('latin-1', 'replace')
    objs = {}
    objs[1] = b'<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(prime-questions.pq) 6 0 R] >> >> /AF [6 0 R] >>'
    objs[2] = b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
    objs[3] = b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
    objs[4] = b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream'
    objs[5] = b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objs[6] = b'<< /Type /Filespec /F (prime-questions.pq) /UF (prime-questions.pq) /AFRelationship /Data /EF << /F 7 0 R >> >>'
    objs[7] = (b'<< /Type /EmbeddedFile /Subtype /application#2Fjson /Params << /Size %d >> /Filter /FlateDecode /Length %d >>\nstream\n' % (len(data), len(comp))
               + comp + b'\nendstream')
    objs[8] = b'<< /Title (Prime Questions draft bank) /Producer (draft_to_bank_pdf.py) >>'
    out = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    offs = {}
    for n in sorted(objs):
        offs[n] = len(out)
        out += b'%d 0 obj\n' % n + objs[n] + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)
    for n in sorted(objs):
        out += b'%010d 00000 n \n' % offs[n]
    out += b'trailer\n<< /Size %d /Root 1 0 R /Info 8 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    return bytes(out)


def main(argv):
    if len(argv) < 2 or argv[1] in ('-h', '--help'):
        print(__doc__)
        return 2
    src = argv[1]
    dst = argv[2] if len(argv) > 2 else re.sub(r'\.[^.]*$', '', src) + '-bank.pdf'
    try:
        with open(src, encoding='utf-8') as f:
            payload = convert(load_text(f.read()))
    except DraftError as e:
        print('Cannot make the bank file. Fix these and run again:', file=sys.stderr)
        for m in e.errors:
            print(' - ' + m, file=sys.stderr)
        return 1
    with open(dst, 'wb') as f:
        f.write(build_pdf(payload))
    print('Wrote %s: %d question(s). Import it in Prime Questions (Imports).' % (dst, len(payload['questions'])))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
