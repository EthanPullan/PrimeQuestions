# Teaching Tools — Design & Style Guide

> The single source of truth for the look, feel, and structure of every tool in
> this suite. Derived from the Seating Chart Generator reference build.
>
> **Aesthetic in one line:** a calm, professional educator's toolkit — a warm
> amber accent against a deep forest-green primary, set on cool light-grey
> panels, with monospace for data and crisp uppercase tracked labels.

---

## 0. How to use this guide

Every tool is a **self-contained single HTML file** (works offline, opens by
double-click, downloadable on its own). That means there is **no shared
stylesheet to import** — instead, each tool **inlines the token block and base
components** from this guide into its own `<style>`. This document is the
canonical copy; when it changes, propagate the token block to each tool.

- Start every new tool from the **boilerplate in §13**.
- Never hardcode a hex value that already has a token (§2). Reach for the token.
- Keep the component patterns in §7 visually identical across tools so the suite
  feels like one product.

---

## 1. Design principles (the vibe)

1. **Quiet, not flashy.** Surfaces are white/light-grey; color is used
   sparingly and meaningfully. The amber accent is a highlight, not a fill.
2. **Forest-green is the "brand/primary".** Primary actions, active states, and
   the "front of room"/header furniture use the deep green (`--board`).
3. **Amber means "focus / selection / live".** Selection rings, the brand mark,
   focus outlines, slider tracks, toast accents.
4. **Data is monospace.** Counts, dates, IDs, timestamps, slider values — render
   in `--mono` so numbers feel precise.
5. **Labels are small, uppercase, and tracked.** Section titles and field
   labels use ~11px, `font-weight:700`, `letter-spacing:.08–.14em`, uppercase,
   in `--muted`.
6. **Soft elevation, soft corners.** 12px radius on big surfaces, 8–9px on
   controls; shadows are low-opacity green-tinted, never harsh black.
7. **Everything degrades gracefully.** Responsive down to phone width, respects
   reduced-motion, and prints cleanly.

---

## 2. Design tokens — copy-paste `:root`

This is the canonical token block. Paste it verbatim into every tool's
`<style>`. (The only addition to the reference is `--ok`, formalizing the
success green that appeared inline.)

```css
:root{
  /* Surfaces */
  --app-bg:#e9edf0;      /* page background (cool light grey-blue) */
  --panel:#ffffff;       /* cards, toolbars, primary surfaces */
  --panel-2:#f4f6f8;     /* inputs, secondary fills, hover */
  --room-bg:#f7f8f6;     /* large canvas / work surface */

  /* Text */
  --ink:#16241f;         /* primary text (near-black green) */
  --muted:#67756f;       /* secondary text, labels, hints */

  /* Lines */
  --line:#d8dee2;        /* borders, dividers */
  --grid-line:rgba(31,61,53,.07); /* faint canvas grid */

  /* Brand / primary (forest green) */
  --board:#1f3d35;       /* primary buttons, active states, header furniture */
  --board-2:#173029;     /* primary hover (darker) */
  --board-line:#2c5247;  /* green-on-green detail line */

  /* Accent (amber) */
  --accent:#e0982e;      /* selection, focus, highlights, brand mark */
  --accent-soft:#fbe6c8; /* tinted backgrounds */
  --accent-deep:#b9781f; /* pressed / strong amber */

  /* Status */
  --danger:#c43d35;      --danger-soft:#f7e0de;
  --together:#2f6f9f;    --together-soft:#dde9f3;  /* informational blue */
  --ok:#3f9e6b;          /* success green (added) */

  /* Elevation */
  --shadow:0 1px 2px rgba(20,40,33,.06),0 6px 18px rgba(20,40,33,.06);
  --shadow-sm:0 1px 2px rgba(20,40,33,.10);

  /* Shape */
  --radius:12px;

  /* Type */
  --sans:ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono:ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
}
```

**Global base** (also paste into every tool):

```css
*{box-sizing:border-box;}
html,body{height:100%;}
body{
  margin:0;font-family:var(--sans);color:var(--ink);background:var(--app-bg);
  -webkit-font-smoothing:antialiased;font-size:14px;line-height:1.45;
}
button{font-family:inherit;}
input,select,textarea{font-family:inherit;font-size:14px;color:var(--ink);}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}
```

---

## 3. Color system

| Role | Token | Hex | Where |
|---|---|---|---|
| Page background | `--app-bg` | `#e9edf0` | `body`, canvas area |
| Panel / card | `--panel` | `#ffffff` | toolbar, side panel, status bar |
| Secondary fill | `--panel-2` | `#f4f6f8` | inputs, textarea, hover, pills |
| Work surface | `--room-bg` | `#f7f8f6` | large editing canvas |
| Primary text | `--ink` | `#16241f` | body copy, headings |
| Secondary text | `--muted` | `#67756f` | labels, hints, captions |
| Border | `--line` | `#d8dee2` | all 1px borders & dividers |
| **Primary (brand)** | `--board` | `#1f3d35` | primary buttons, active tabs/toggles, headers |
| Primary hover | `--board-2` | `#173029` | hover for primary |
| **Accent** | `--accent` | `#e0982e` | selection ring, focus, brand mark, sliders, toast bar |
| Accent soft | `--accent-soft` | `#fbe6c8` | tinted highlight backgrounds |
| Accent deep | `--accent-deep` | `#b9781f` | pressed amber |
| Danger | `--danger` / soft | `#c43d35` / `#f7e0de` | destructive actions, errors, conflicts |
| Info (blue) | `--together` / soft | `#2f6f9f` / `#dde9f3` | informational / secondary category |
| Success | `--ok` | `#3f9e6b` | success toasts, positive confirms |

**Usage rules**
- **One accent per screen state.** Amber marks the *currently focused/selected*
  thing. Don't use amber for primary buttons — those are green.
- **Primary = green, destructive = red, info = blue, success = green-teal.**
- **Soft variants are backgrounds only**, paired with their strong variant for
  text/icon (e.g. red text on `--danger-soft` hover).
- Status colors should also carry a non-color signal (icon, label, position) for
  accessibility — never rely on hue alone.

**Decorative / illustrative palette** (used only for skeuomorphic "furniture" in
the seating tool — *not* part of the core system; introduce per-tool as needed):
whiteboard `#c4cac6`, window blues `#dcebf5→#cbe0ef`, wood `#e8d8bd→#dcc6a2`,
door browns `#bd9163 / #8a5f36`.

---

## 4. Typography

**Font stacks** — `--sans` for everything; `--mono` for data/numbers.
No web fonts (keeps tools offline & single-file).

| Style | Size | Weight | Tracking | Transform | Color |
|---|---|---|---|---|---|
| Body / base | 14px | 400 | — | — | `--ink` |
| Brand wordmark | 13px | 700 | `.14em` | uppercase | `--ink` |
| Brand descriptor (`small`) | 11px | 500 | `.02em` | none | `--muted` |
| Section title | 11px | 700 | `.09em` | uppercase | `--muted` |
| Field label | 11px | 400–600 | `.08em` | uppercase | `--muted` |
| Tab | 12.5px | 600 | `.02em` | — | `--muted` → `--board` active |
| Button | 13px | 600 | — | — | contextual |
| Hint / helper | 12px | 400 | — | — | `--muted`, line-height 1.5 |
| Data / mono | 10.5–12px | 600 | — | — | `--ink` or `--board` |

Base `line-height:1.45`; hints/empty states use `1.5–1.55`.

---

## 5. Spacing, radius, elevation

**Radius scale**
- `--radius` **12px** — large surfaces (canvas, modals, big cards), 14px for the
  very largest canvas is acceptable.
- **9px** — buttons, textareas.
- **8px** — inputs, selects, list rows, segmented controls.
- **7px** — small buttons.
- **20px** — pills/badges (fully rounded).
- **50%** — dots/markers.

**Elevation**
- `--shadow` — resting elevation for floating surfaces (canvas, cards).
- `--shadow-sm` — controls, desks, list items.
- Hover lift: `0 2px 4px rgba(20,40,33,.14),0 8px 16px rgba(20,40,33,.08)`.
- Drag/active overlay: `0 8px 24px rgba(20,40,33,.25)`.
- Shadows are **always green-tinted** (`rgba(20,40,33,…)`), never pure black.

**Spacing rhythm** (observed, use as defaults)
- Toolbar / bar padding: `8–9px 16px`.
- Panel/tab content padding: `16px`.
- Control padding: buttons `8px 13px` (small `5px 9px`), inputs `7px 9px`,
  textarea `9px 10px`.
- Gaps: `7–10px` within a row, `14–18px` between sections (`.stack{margin-top:18px}`).

---

## 6. Layout patterns

The reference uses a classic **three-zone app frame**. Reuse where it fits; tools
that are single-canvas can drop the side panel.

```
┌──────────────────────────────────────────────┐
│  TOOLBAR  brand · context field · ⟶ · actions │  --panel, border-bottom
├──────────┬───────────────────────────────────┤
│  PANEL   │  STAGE                             │
│  (tabs + │   stage-bar (modes / view)         │
│  scroll) │   canvas-scroll (--app-bg)         │
│  344px   │   ┌ work surface (--room-bg) ┐     │
│  --panel │   └──────────────────────────┘     │
│          ├───────────────────────────────────┤
│          │  STATUS BAR  stats · timestamp     │  --panel, border-top
└──────────┴───────────────────────────────────┘
```

Key recipe:
```css
.app{display:flex;flex-direction:column;height:100vh;height:100dvh;}
.main{flex:1;display:flex;min-height:0;}
.panel{width:344px;flex:none;background:var(--panel);border-right:1px solid var(--line);
  display:flex;flex-direction:column;min-height:0;}
.stage{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--app-bg);}
```

**Brand lockup** (put in every toolbar so the suite feels unified):
```html
<div class="brand"><span class="mark"></span>Tool Name <small>descriptor</small></div>
```
```css
.brand{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;font-size:13px;color:var(--ink);white-space:nowrap;}
.brand .mark{width:16px;height:16px;border-radius:4px;background:var(--accent);
  box-shadow:inset 0 0 0 2px rgba(0,0,0,.06);flex:none;}
.brand small{font-weight:500;letter-spacing:.02em;text-transform:none;color:var(--muted);font-size:11px;}
```

---

## 7. Component library

### Buttons
```css
.btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);
  padding:8px 13px;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;
  display:inline-flex;align-items:center;gap:7px;transition:background .12s,border-color .12s,transform .05s;}
.btn:hover{background:var(--panel-2);}
.btn:active{transform:translateY(1px);}
.btn.primary{background:var(--board);border-color:var(--board);color:#fff;}
.btn.primary:hover{background:var(--board-2);}
.btn.danger{color:var(--danger);border-color:var(--danger-soft);background:#fff;}
.btn.danger:hover{background:var(--danger-soft);}
.btn.small{padding:5px 9px;font-size:12px;border-radius:7px;}
.btn[disabled]{opacity:.45;cursor:not-allowed;}
.btn .ic{font-size:15px;line-height:1;}  /* leading glyph/icon */
```
Variants: default (white), `.primary` (green), `.danger` (red), `.small`. Active
state nudges down 1px. Optional leading `.ic` glyph.

### Inputs / selects / textarea
```css
textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 10px;
  resize:vertical;min-height:78px;background:var(--panel-2);line-height:1.5;}
select,input[type=number],input[type=text].in{
  border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--panel-2);}
input[type=number]{width:62px;}
```
Inputs sit on `--panel-2` to read as "editable wells" against white panels.

### Tabs
```css
.tab{flex:1;border:none;background:none;padding:11px 6px;cursor:pointer;font-weight:600;
  font-size:12.5px;color:var(--muted);border-bottom:2px solid transparent;letter-spacing:.02em;}
.tab:hover{color:var(--ink);}
.tab.active{color:var(--board);border-bottom-color:var(--accent);}  /* amber underline */
```

### Segmented toggle (mode switch)
```css
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;}
.seg button{border:none;background:#fff;padding:6px 12px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted);}
.seg button.active{background:var(--board);color:#fff;}  /* green selected segment */
```

### Section title
```css
.section-title{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--muted);margin:0 0 9px;}
```

### Pill / count badge
```css
.count-pill{font-family:var(--mono);font-size:11px;background:var(--panel-2);
  border:1px solid var(--line);border-radius:20px;padding:2px 9px;color:var(--muted);}
```

### Hint text & empty state
```css
.hint{font-size:12px;color:var(--muted);line-height:1.5;}
.empty{border:1px dashed var(--line);border-radius:10px;padding:16px;color:var(--muted);
  font-size:12.5px;line-height:1.55;background:var(--panel-2);}
```

### List row (roster / items)
```css
.list li{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;
  border:1px solid var(--line);border-radius:8px;background:#fff;}
.xbtn{border:none;background:none;cursor:pointer;color:var(--muted);font-size:16px;
  line-height:1;padding:2px 4px;border-radius:6px;}
.xbtn:hover{color:var(--danger);background:var(--danger-soft);}  /* delete affordance */
```

### Slider
```css
.slider-row .lab{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;}
.slider-row .lab b{font-family:var(--mono);font-weight:600;color:var(--board);} /* live value */
input[type=range]{width:100%;accent-color:var(--accent);}
```

### Checkbox row
```css
.check{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;
  margin-bottom:12px;user-select:none;}
.check input{width:16px;height:16px;accent-color:var(--board);}
```

### Status bar
```css
.statusbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:0 16px;height:42px;
  border-top:1px solid var(--line);background:var(--panel);font-size:13px;color:var(--muted);}
.statusbar .stat b{font-family:var(--mono);font-weight:600;color:var(--ink);}
.statusbar .stat.warn b,.statusbar .stat.warn{color:var(--danger);}
.statusbar .dotline{width:1px;height:18px;background:var(--line);}   /* separator */
.statusbar .stamp{margin-left:auto;font-family:var(--mono);font-size:11.5px;} /* timestamp */
```

### Toast (transient feedback)
```css
.toast-wrap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1000;
  display:flex;flex-direction:column;gap:8px;align-items:center;}
.toast{background:var(--ink);color:#fff;padding:10px 15px;border-radius:10px;font-size:13px;
  box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:min(92vw,560px);
  border-left:3px solid var(--accent);animation:tin .2s ease both;}
.toast.warn{border-left-color:var(--accent);}
.toast.err{border-left-color:var(--danger);}
.toast.ok{border-left-color:var(--ok);}
@keyframes tin{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
```
Dark `--ink` chip, white text, colored left border = severity. Auto-dismiss ~3.6s.

---

## 8. Motion & interaction

- **Transitions:** `.12s` for color/background/border; `.05–.08s` for transform.
- **Press feedback:** buttons `translateY(1px)` on `:active`.
- **Entrance:** stagger items with a small pop:
  ```css
  @keyframes pop{from{opacity:0;transform:translateY(5px) scale(.95);}to{opacity:1;transform:none;}}
  .pop{animation:pop .26s cubic-bezier(.2,.7,.3,1) both;animation-delay:var(--d,0ms);}
  ```
- **Selection ring:** `box-shadow:0 0 0 2px var(--accent)` (danger uses `--danger`).
- **Drag ghost:** white chip, amber border, `0 8px 24px` shadow, `opacity:.95`.

---

## 9. Accessibility

- **Focus:** global `:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}` — never remove it.
- **Reduced motion:** always include —
  ```css
  @media (prefers-reduced-motion:reduce){
    .pop{animation:none;} .btn:active{transform:none;} *{scroll-behavior:auto;}
  }
  ```
- **Don't rely on color alone:** pair status colors with icon/label/position.
- **Hit targets:** keep interactive controls ≥ ~28px tall (small buttons are the floor).
- **Contrast:** `--ink` on white and white on `--board` both pass; avoid `--muted` for essential text on `--panel-2`.

---

## 10. Responsive

Single breakpoint pattern — stack the panel above the stage on narrow screens:
```css
@media (max-width:880px){
  .main{flex-direction:column;}
  .panel{width:100%;max-height:46vh;border-right:none;border-bottom:1px solid var(--line);}
  .stage{min-height:54vh;}
}
```
Use `100dvh` (with `100vh` fallback) for full-height app frames so mobile browser
chrome doesn't clip the layout.

---

## 11. Print

Tools that produce printable output should hide chrome and lay the content flat:
```css
@media print{
  @page{size:landscape;margin:12mm;}
  body{background:#fff;}
  .toolbar,.panel,.stage-bar,.statusbar,.toast-wrap{display:none !important;}
  .app,.main,.stage{display:block;height:auto;}
  /* reveal a print-only header, strip shadows, keep semantic borders */
  #printHeader{display:block;}
}
```
Keep a hidden `#printHeader` (title + mono meta line) that only appears in print.

---

## 12. Repo & file conventions

**Structure** (monorepo, GitHub Pages from root):
```
/
├── index.html              ← landing page: links to every tool
├── STYLE_GUIDE.md          ← this file
├── assets/                 ← shared OPTIONAL extras (icons, favicon) — keep tiny
└── tools/
    ├── seating-chart/
    │   └── index.html       ← fully self-contained, offline, downloadable
    ├── <next-tool>/
    │   └── index.html
    └── ...
```

**Rules**
- **One folder per tool, each with its own `index.html`.** A user can download
  that single file and run it by double-clicking — so **inline everything**
  (CSS, JS, no external requests, no CDN, no web fonts).
- **GitHub Pages** serves the repo root; `tools/<name>/` URLs are clean and
  shareable (`…/tools/seating-chart/`).
- **Landing page** (`/index.html`) is itself a tool-styled page: brand lockup +
  a grid of cards, one per tool, each a `.btn`/card linking into its folder.
- **Tokens are copied, not linked.** When this guide's `:root` changes, update
  each tool's inlined block. (Optional: a build step could inject a shared
  partial later, but never at the cost of single-file portability.)
- **Naming:** folders `kebab-case`; tool titles in Title Case; brand descriptor
  lowercase.

---

## 13. New-tool starter (boilerplate)

Copy this to `tools/<name>/index.html` and build inside `<!-- app -->`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tool Name</title>
<style>
  :root{
    --app-bg:#e9edf0; --panel:#fff; --panel-2:#f4f6f8; --room-bg:#f7f8f6;
    --ink:#16241f; --muted:#67756f; --line:#d8dee2; --grid-line:rgba(31,61,53,.07);
    --board:#1f3d35; --board-2:#173029; --board-line:#2c5247;
    --accent:#e0982e; --accent-soft:#fbe6c8; --accent-deep:#b9781f;
    --danger:#c43d35; --danger-soft:#f7e0de; --together:#2f6f9f; --together-soft:#dde9f3;
    --ok:#3f9e6b;
    --shadow:0 1px 2px rgba(20,40,33,.06),0 6px 18px rgba(20,40,33,.06);
    --shadow-sm:0 1px 2px rgba(20,40,33,.10); --radius:12px;
    --sans:ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mono:ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  *{box-sizing:border-box;} html,body{height:100%;}
  body{margin:0;font-family:var(--sans);color:var(--ink);background:var(--app-bg);
    -webkit-font-smoothing:antialiased;font-size:14px;line-height:1.45;}
  button{font-family:inherit;}
  input,select,textarea{font-family:inherit;font-size:14px;color:var(--ink);}
  :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px;}

  .toolbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:9px 16px;
    background:var(--panel);border-bottom:1px solid var(--line);}
  .brand{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.14em;
    text-transform:uppercase;font-size:13px;white-space:nowrap;}
  .brand .mark{width:16px;height:16px;border-radius:4px;background:var(--accent);
    box-shadow:inset 0 0 0 2px rgba(0,0,0,.06);}
  .brand small{font-weight:500;letter-spacing:.02em;text-transform:none;color:var(--muted);font-size:11px;}
  .spacer{flex:1;}

  .btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);padding:8px 13px;
    border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;
    align-items:center;gap:7px;transition:background .12s,border-color .12s,transform .05s;}
  .btn:hover{background:var(--panel-2);} .btn:active{transform:translateY(1px);}
  .btn.primary{background:var(--board);border-color:var(--board);color:#fff;}
  .btn.primary:hover{background:var(--board-2);}
  .btn.danger{color:var(--danger);border-color:var(--danger-soft);background:#fff;}
  .btn.danger:hover{background:var(--danger-soft);}
  .btn.small{padding:5px 9px;font-size:12px;border-radius:7px;}
  .btn[disabled]{opacity:.45;cursor:not-allowed;}

  .section-title{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    color:var(--muted);margin:0 0 9px;}
  .hint{font-size:12px;color:var(--muted);line-height:1.5;}

  @media (prefers-reduced-motion:reduce){ .btn:active{transform:none;} *{scroll-behavior:auto;} }
</style>
</head>
<body>
  <!-- app -->
  <header class="toolbar">
    <div class="brand"><span class="mark"></span>Tool Name <small>descriptor</small></div>
    <div class="spacer"></div>
    <button class="btn primary">Primary action</button>
  </header>

  <main style="padding:16px;">
    <h3 class="section-title">Section</h3>
    <p class="hint">Build the tool here.</p>
  </main>

  <script>
    // Self-contained logic. No external requests — keep it offline & downloadable.
  </script>
</body>
</html>
```

---

### Changelog
- **v1.0** — Initial guide derived from the Seating Chart Generator reference.
  Formalized the `--ok` success token; codified brand lockup, component library,
  and the single-file monorepo conventions.
</content>
</invoke>
