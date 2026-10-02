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
node tests/run.js unit     # one script (smoke, unit or ui)
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
  confirmation, other apps' storage left alone, and the phone layout.

These run in headless Chromium only. Firefox, Safari and iPad are not covered.
