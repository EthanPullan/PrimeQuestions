# Prime Questions

A question bank and test builder for the classroom, mostly maths and science.
It is one file, `index.html`, and it works offline: open it by double-clicking,
or use the hosted copy at <https://ethanpullan.github.io/PrimeQuestions/>.

There are no accounts and no server. Your questions are stored in your browser.

## What it does today (v0.1.0)

- Write multiple-choice, true/false, numeric, short-answer and matching
  questions, with a live preview.
- Maths is written as LaTeX between `\(` and `\)`, for example `\(\frac{3}{4}\)`,
  and chemistry with `\ce{…}`, for example `\(\ce{2H2 + O2 -> 2H2O}\)`. Insert
  buttons are there for anyone who does not know LaTeX.
- Search and filter by type, course and status.
- **Export bank** saves the whole bank as one PDF. The PDF is readable (cover
  page, questions, answers) and also carries the full data inside it.
- **Import bank** reads that PDF back in. It shows what is new, what changed and
  what is already there, and nothing is applied until you confirm.

Test building and printing are next.

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

## Files

- `index.html`: the whole app.
- `STYLE_GUIDE.md`: the design system shared with the other Teaching Tools.
- `.nojekyll`: tells GitHub Pages to serve files as they are.

Maths rendering uses [Temml](https://temml.org) (MIT) with its mhchem extension
(Apache-2.0), both included inside `index.html`.
