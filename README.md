# Prime Questions

A question bank and test builder for the classroom, mostly maths and science.
It is one file, `index.html`, and it works offline: open it by double-clicking,
or use the hosted copy at <https://ethanpullan.github.io/PrimeQuestions/>.

There are no accounts and no server. Your questions are stored in your browser.

## What it does today (v0.2.0)

**Questions**
- Multiple-choice, true/false, numeric, short-answer and matching questions, with
  a live preview.
- Maths is written as LaTeX between `\(` and `\)`, for example `\(\frac{3}{4}\)`,
  and chemistry with `\ce{…}`, for example `\(\ce{2H2 + O2 -> 2H2O}\)`. Insert
  buttons are there for anyone who does not know LaTeX.
- Tables (cells can hold maths) and images (PNG, JPEG or SVG; large photos are
  resized to about 1600 px) on a question.
- **Stimuli**: a passage, data table or picture that several questions share.
- Search and filter by type, course and status.

**Tests**
- Build a test from your bank: pick questions, put them in order.
- **Version A** is the order you chose. **Version B** shuffles the question order
  and each multiple-choice question's options, the same way every time you print
  it (the shuffle is saved with the test). Questions that share a stimulus always
  print together under it.
- A multiple-choice question can be set to keep its options in order in Version B
  (for “All of the above”).
- Print the test or the answer key for either version, on Letter, Legal or A4.
  The page is plain black on white so it copies cleanly, and no question is split
  across pages. There are blank Name and Date lines; nothing about students is
  stored.
- The Version B answer key says which Version A question each one is and shows the
  correct answer as printed on Version B.

**Backup**
- **Export bank** saves the whole bank as one PDF. The PDF is readable (cover
  page, questions, answers) and also carries the full data inside it.
- **Import bank** reads that PDF back in. It shows what is new, what changed and
  what is already there, and nothing is applied until you confirm. Banks saved by
  earlier versions import too.

## Looking after your questions

- Questions live in this browser on this device. Browsers can clear that
  storage, so **export often**. The status bar shows when you last did.
- The exported PDF is the backup. Import works only from the original exported
  file: printing it, scanning it, or saving it again as a PDF removes the data
  Prime Questions reads.
- The file contains the answers, so keep it private.
- The copy you open from a file on your computer and the copy on the website
  are separate stores. If your questions look missing, check which one you are on
  (the status bar says).
- On the exported PDF's readable pages, tables and images appear only as a short
  note. Everything is in the data inside the file, and the app shows it all.

## Files

- `index.html`: the whole app.
- `STYLE_GUIDE.md`: the design system shared with the other Teaching Tools.
- `tests/`: browser tests (see `tests/README.md`).
- `.nojekyll`: tells GitHub Pages to serve files as they are.

Maths rendering uses [Temml](https://temml.org) (MIT) with its mhchem extension
(Apache-2.0), both included inside `index.html`.
