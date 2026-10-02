# Tests

Browser tests for `index.html`. There is no `package.json` and nothing to install
inside the repo.

## What you need
- Node 18 or newer.
- [Playwright](https://playwright.dev) with a Chromium build. It is found
  automatically if it is installed globally or in `/opt/pw-browsers`; otherwise set
  `PLAYWRIGHT_PATH` (the playwright package folder) and/or `CHROMIUM_PATH`.
- poppler-utils (`pdfdetach`, `pdfinfo`, `pdftotext`, `pdftoppm`). They are the
  independent check that exported PDFs are valid and carry the right data.
- Optional: Python 3 with `pikepdf`, which adds the "re-saved by another PDF
  tool" checks. They are skipped if it is missing.

## Run
```
node tests/run.js          # everything
node tests/run.js unit     # one script (smoke, unit, ui, phase2, phase3 or format)
```
Output files (exported PDFs, screenshots) go to a temporary folder. Set
`PQ_TEST_OUT` to choose where, for example to look at the rendered pages. They are
never written into the repo.

## What each script covers
- `smoke.js`: the page loads over `file://`, no console errors, no network
  requests, Temml and mhchem work.
- `unit.js`: the pure logic on `window.PQ`: maths checking and the required notation
  list, readiness rules, payload validation against hostile input, migrations,
  merge planning, the PDF text/image rule, text widths, the PDF writer and reader
  (checked with poppler and, if present, `pikepdf` re-saves), and the reader's
  refusal of printed, foreign, truncated, corrupted and decompression-bomb files.
- `ui.js`: the app end to end with the network off: create and edit questions of
  every type, insert buttons, the unsaved-changes guard, export, wipe the
  database, import (the round trip), conflicts, refused files, delete
  confirmation, and other apps' storage left alone.

- `phase2.js`: stimuli (text, tables, images), image resizing and refusal of bad
  files, the question editor's stimulus/table/keep-order controls, the test builder,
  Version A/B previews and keys, and printing. Printing is checked by turning the
  paper into PDFs at Letter, Legal and A4 and reading them with poppler: page sizes,
  greyscale only, and a property test over many layouts asserting that no question,
  and no stimulus group that fits on a page, is ever split across pages. It also
  checks that deletes keep tests and questions in step, imports the real schema-1
  bank in `fixtures/` (written by app v0.1.0), and runs a full round trip. These
checks were written for the Phase 2 interface and now drive the Phase 3 one.

- `phase3.js`: question banks (create, rename, move a question, delete), the Home,
  Tests, Question Banks and Imports pages, per-bank export and importing a bank
  written by app v0.2.0, the Multipart question type, the equation dialog and typing
  between backticks, and the test editor: building the paper by button and by drag
  and drop (including joining a stimulus group), moving blocks, undo and redo,
  editing the title, instructions, Name/Class/Date lines and paper size on the paper,
  printing those options, version history (including the 50-save cap), the Check
  list, editing a question from the paper and the unsaved-changes guard.

- `format.js`: the Format menu (submenus, values, checks), schema 4 settings stored on
  the test only when changed, undo, history and the bank file, and what each setting
  does to the printed paper, measured with poppler: margins move the text, heading and
  text sizes scale, Classic and Condensed layouts, an untouched test printing exactly
  as before, plain black only, and a property test that no question or stimulus group
  splits across pages in any style, size and paper.

`fixtures/bank-schema1-v0.1.0.pdf` (app v0.1.0), `fixtures/bank-schema2-v0.2.0.pdf`
(app v0.2.0) and `fixtures/bank-schema3-v0.3.0.pdf` (app v0.3.0) were produced by those versions before the schema moved on. Do not
regenerate them with a newer app: their job is to be old files.

These run in headless Chromium only. Firefox, Safari and iPad are not covered.
