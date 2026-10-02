# Prime Questions

A question bank and test builder for the classroom, mostly maths and science.
It is one file, `index.html`, and it works offline: open it by double-clicking,
or use the hosted copy at <https://ethanpullan.github.io/PrimeQuestions/>.

There are no accounts and no server. Your questions are stored in your browser.

## What it does today (v0.6.0)

The sidebar has four places, like Test Parrot: **Home**, **Tests**,
**Question Banks** and **Imports**.

**Question banks**
- A bank is a named collection of questions and stimuli, for example
  “Science 9 Matter”. Make as many as you like; open one to write and organise its
  questions. Your earlier questions are in a bank called “My Questions”.
- Multiple-choice, true/false, numeric, short-answer, matching and **multipart**
  questions (one question with parts (a), (b), (c), each with its own answer type).
- **Equations are easy to type.** Press *Σ Equation* and type it the way you would
  say it (`(x+1)/(x-2) = sqrt(3)`, `x^2`, `pi r^2`, `x <= 5`, `60 km/h`) and see it
  drawn as you type, with a palette of symbols. Or type between backticks in any
  text box: `1/2` becomes a fraction when you type the closing backtick. LaTeX
  (`\(\frac{3}{4}\)`) and chemistry (`\(\ce{2H2 + O2 -> 2H2O}\)`) still work.
- Tables (cells can hold maths) and images (PNG, JPEG or SVG; large photos are
  resized to about 1600 px) on a question.
- **Stimuli**: a passage, data table or picture that several questions share.
- Search by text, type and status.

**Tests**
- The test editor is the paper itself, with your question banks beside it. Drag
  questions from the bank onto the paper (or press *Add*), drag blocks to reorder
  them, and click the title, course, instructions and the Name / Class / Date lines
  to edit them where they are. Questions that share a stimulus always print
  together under it. Undo and redo, a *Check* list of things to look at before
  printing, and **History**: every save is kept (the latest 50) and can be
  restored.
- **Version A** is the order you chose. **Version B** shuffles the question order
  and each multiple-choice question's options, the same way every time you print
  it (the shuffle is saved with the test). A multiple-choice question can be set
  to keep its options in order in Version B (for “All of the above”).
- **Right-click a question** on the paper (or use its ⋯ button) to change just that
  question for this test: **Answer area** (for numeric and short-answer questions, and
  for each part of a multipart question: the normal answer line or ruled lines, plain
  **blank space** with no “Answer:” label, or nothing), **Work space** (extra writing
  space after the question: Small, Medium, Large, or your own size in millimetres),
  **Fill rest of page** (the space grows to the bottom of the page), and **Start new
  section here**. Your bank questions are not changed.
- **Sections**: a heading with an optional line of instructions (for example “Short
  Answer: Show all work”) above the question where you start it. Edit it directly on
  the paper. Question numbers keep counting across sections, and Version B shuffles
  the questions only inside each section, so the sections stay in your order.
- The **Format** menu sets how the paper looks, per test: paper size (Letter, Legal,
  A4), **font** (choose from your computer's fonts where the browser allows it, or
  type a font name; if it is not installed where you print, Helvetica is used),
  heading size and text size (Small, Medium, Large), margins (Narrow, Normal,
  Wide or your own in millimetres), and the question style: **Standard** (circle
  the letter or T/F), **Classic** (a blank before each multiple-choice and
  true/false number, ruled lines for written answers) or **Condensed** (tighter
  spacing, short options across the page, closer-ruled lines to save paper).
  A test you have not changed prints exactly as before.
- Print the test or the answer key for either version. The page is plain black on
  white so it copies cleanly, and no question is split across pages. Nothing about
  students is stored.
- The Version B answer key says which Version A question each one is and shows the
  correct answer as printed on Version B.

**Questions from an AI**
- Give an AI the file [`ai-instructions.md`](ai-instructions.md) (live copy:
  <https://ethanpullan.github.io/PrimeQuestions/ai-instructions.md>) together with your
  questions. It replies with a block of JSON in a simple format (no ids, dates or marks to
  get right). On the **Imports** page paste it under “Questions written by an AI” (or
  drop a `.json` file). You see a summary first, and every question arrives marked
  “Needs review”, so you check each one before using it.
- Images and graphs cannot come in this way; add them in the editor afterwards.
- For an AI that can run Python and a teacher who wants a PDF file,
  `tools/draft_to_bank_pdf.py` turns the same JSON into a bank PDF (standard library only).

**Backup**
- **Export everything** (bottom of the sidebar) saves all banks, stimuli, images
  and tests as one PDF. A bank page also has **Export this bank**. The PDF is
  readable (cover page, questions, answers) and also carries the full data inside
  it.
- **Import** reads that PDF back in (use the Import button on Home, the Imports
  page, or drop the file anywhere on the page). It shows what is new, what changed
  and what is already there, and nothing is applied until you confirm. Files saved
  by earlier versions import too.

## Looking after your questions

- Questions live in this browser on this device. Browsers can clear that
  storage, so **export often**. The status bar shows when you last did.
- The exported PDF is the backup. Import works only from the original exported
  file: printing it, scanning it, or saving it again as a PDF removes the data
  Prime Questions reads.
- The file contains the answers, so keep it private.
- Version history stays in this browser. It is not part of the exported file.
- The copy you open from a file on your computer and the copy on the website
  are separate stores. If your questions look missing, check which one you are on
  (the status bar says).
- On the exported PDF's readable pages, tables and images appear only as a short
  note. Everything is in the data inside the file, and the app shows it all.
- Prime Questions is built for a computer with a mouse or trackpad.

## Files

- `index.html`: the whole app.
- `ai-instructions.md`: instructions for an AI that formats a teacher's questions for import.
- `tools/draft_to_bank_pdf.py`: optional script that turns that JSON into a bank PDF.
- `STYLE_GUIDE.md`: the design system shared with the other Teaching Tools.
- `tests/`: browser tests (see `tests/README.md`).
- `.nojekyll`: tells GitHub Pages to serve files as they are.

Maths rendering uses [Temml](https://temml.org) (MIT) with its mhchem extension
(Apache-2.0), both included inside `index.html`.
