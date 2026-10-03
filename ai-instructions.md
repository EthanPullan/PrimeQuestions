# Prime Questions: instructions for an AI that formats a teacher's questions

Give these instructions to an AI together with the teacher's questions. The AI turns the questions into one block of JSON that
the teacher pastes into **Prime Questions** (Imports page, "Questions written by an AI"). Nothing else is needed.

Live copy of this file: <https://ethanpullan.github.io/PrimeQuestions/ai-instructions.md>

---

## For the AI: your task

The teacher has given you questions (typed, pasted, or from a document). Convert **every** question into the JSON format below.

1. Keep the teacher's wording. Fix only obvious typos. Do not invent, merge, drop or reorder questions.
2. Choose the question type that fits (see "Choosing a type").
3. Write maths and chemistry the way this file says (see "Maths and chemistry").
4. If the teacher gave the answer, use it. If not, work it out and put `"Answer not given; solved by the AI, please check."`
   in that question's `"notes"`. Never leave an answer blank. If you are unsure, say so in `"notes"`.
5. Reply with **only** the JSON in one code block. No comments inside the JSON, no trailing commas, straight quotes only.
   After the code block you may add one or two plain sentences for the teacher, for example anything you were unsure about.

Prime Questions marks every imported question **"Needs review"**, so a person checks each one before it is used.

## The JSON

The top level is an object. Only `questions` is required.

```
{
  "format": "prime-questions-draft",
  "bank": "Science 9: Matter",
  "stimuli": [ ... ],
  "questions": [ ... ]
}
```

| Field | Meaning |
|---|---|
| `format` | Optional. If present it must be exactly `prime-questions-draft`. |
| `bank` | Optional name of the question bank to add them to. If a bank with that name exists the questions join it, otherwise a new bank is made. Default `Imported questions`. |
| `stimuli` | Optional list of shared passages, data tables or descriptions that several questions refer to (see "Shared stimuli"). |
| `questions` | Required. 1 to 500 questions, in the teacher's order. |

### Every question

```
{
  "type": "mc",
  "prompt": "The question text.",
  "answer": { ... },
  "course": "Science 9",
  "unit": "Matter",
  "tags": ["density", "calculations"],
  "difficulty": "medium",
  "notes": "Anything the teacher should know. Not printed on the assessment.",
  "stimulus": "s1",
  "table": { "headers": ["A", "B"], "rows": [["1", "2"]], "caption": "" },
  "keepOrder": true
}
```

| Field | Required | Meaning |
|---|---|---|
| `type` | yes | `mc`, `tf`, `numeric`, `short`, `matching` or `multipart`. |
| `prompt` | yes (not for `multipart`) | The question text. |
| `answer` | yes | Its shape depends on `type` (below). |
| `course`, `unit` | no | Short text, for example `"Math 8"` and `"Fractions"`. Use them if the teacher said or the source shows them. |
| `tags` | no | A few topic words. |
| `difficulty` | no | `easy`, `medium` (default) or `hard`. Only set it if it is clear. |
| `notes` | no | Marking guidance, source, or doubts. Not printed for students. |
| `stimulus` | no | The `key` of an item in `stimuli`. |
| `table` | no | A data table that belongs to this question (see "Tables"). |
| `keepOrder` | no | Only for `mc`. `true` stops the options being shuffled on Version B. **Set it to `true` whenever an option says "All of the above", "None of the above", "Both A and B" or otherwise refers to other options.** |

## Choosing a type

| If the question is... | Use |
|---|---|
| Choose one of several lettered options (A, B, C, D) | `mc` |
| True or false | `tf` |
| Has one numerical answer (a calculation, a measurement) | `numeric` |
| Needs a written answer: explain, describe, define, show working, draw a conclusion | `short` |
| Two columns to pair up | `matching` |
| One question with parts (a), (b), (c)... that each need their own answer | `multipart` |

Fill-in-the-blank with one word or number: use `numeric` for a number, otherwise `short` (put the expected word in `rubric`).
"Select all that apply": do not use `mc`, because `mc` has exactly one correct option. Use `short`, list the correct options in
`rubric`, and say so in `notes`.

## The `answer` for each type

**`mc`** (multiple choice): 2 to 8 options. Write the option text without the letter. `correct` is the **letter** of the right option.

```
"answer": { "options": ["0.75", "0.34", "1.33", "All of the above"], "correct": "A" }
```

**`tf`** (true or false): `correct` is `true` or `false` (no quotes).

```
"answer": { "correct": true }
```

**`numeric`**: `value` is the answer **as text**, exactly as the teacher wants it (keep significant figures: `"1.00"`, not `1`).
`units` is optional text. `tolerance` is optional, a number, how far off a student may be (default 0).

```
"answer": { "value": "9.8", "units": "\\(\\mathrm{m/s^{2}}\\)", "tolerance": 0.1 }
```

**`short`** (written answer): `lines` is how many answer lines to print (1 to 40, default 4; use 2 for a sentence, 6 or more for a paragraph).
`rubric` is the model answer or marking guide, as text.

```
"answer": { "lines": 4, "rubric": "Ice is less dense than liquid water, so it floats." }
```

**`matching`**: 2 to 12 pairs. Each pair is the **correct** match. Prime Questions shuffles the right-hand column when it prints. Keep the left items in the teacher's order.

```
"answer": { "pairs": [ { "left": "Na", "right": "Sodium" }, { "left": "K", "right": "Potassium" } ] }
```

**`multipart`**: leave `prompt` as the shared introduction (or `""` if there is none). Put the parts, in order, in `answer.parts`.
Each part has its own `type` (`mc`, `tf`, `numeric`, `short` or `matching`, never `multipart`), its own `prompt`, its own `answer`, and optionally `keepOrder`.
Do not write the "(a)" label yourself; the parts are lettered automatically. 1 to 12 parts.

```
{
  "type": "multipart",
  "prompt": "A car travels 120 km in 2 h.",
  "answer": { "parts": [
    { "type": "numeric", "prompt": "Find its average speed.", "answer": { "value": "60", "units": "km/h" } },
    { "type": "short", "prompt": "Explain why this is an average.", "answer": { "lines": 3, "rubric": "The speed may have varied during the trip." } }
  ] }
}
```

## Maths and chemistry

Write maths as LaTeX between `\(` and `\)`. **In JSON every backslash must be doubled**, so you actually write `\\(` and `\\)`.

| You mean | Write in the JSON text |
|---|---|
| three quarters | `\\(\\frac{3}{4}\\)` |
| a mixed number, 2 1/3 | `\\(2\\tfrac{1}{3}\\)` |
| square root of x+1 | `\\(\\sqrt{x+1}\\)` |
| x squared, a subscript | `\\(x^{2}\\)`, `\\(x_{1}\\)` |
| 6.02 times 10 to the 23 | `\\(6.02 \\times 10^{23}\\)` |
| 90 degrees, angle ABC | `\\(90^{\\circ}\\)`, `\\(\\angle ABC\\)` |
| less or equal, not equal, plus or minus | `\\(\\le\\)`, `\\(\\ne\\)`, `\\(\\pm\\)` |
| a unit such as g/cm³ | `\\(\\mathrm{g/cm^{3}}\\)` |
| a chemical formula | `\\(\\ce{H2O}\\)` |
| a chemical equation | `\\(\\ce{2H2 + O2 -> 2H2O}\\)` |
| an ion, a state | `\\(\\ce{SO4^2-}\\)`, `\\(\\ce{NaCl(aq)}\\)` |

Rules:

- Put **every** piece of maths between `\\(` and `\\)`, including a lone number with an exponent. Plain numbers and words stay outside.
- **Never use `$` to mean maths.** A dollar sign is just money ("Sam has $12") and is left as it is.
- Plain symbols such as °, ×, ÷, ±, π, ≤, ≥ may be typed directly in ordinary text. Use LaTeX when the symbol is part of a formula.
- Do not write HTML, Markdown or images in any text. Plain text only; a line break inside a text is `\n`.
- Do not put option letters ("A.", "B)") or question numbers ("1.", "Q2") inside the text. The letters and numbers are added automatically.
- Every `\\(` needs a matching `\\)`. Check each one.

## Shared stimuli

When several questions use the same passage, data table or description ("Use the information below to answer questions 3 to 5"),
put it in `stimuli` once and point to it from each question. Do not copy it into each question.

```
"stimuli": [
  { "key": "s1", "title": "Circuit data", "text": "A circuit has a 12 V battery and two resistors.",
    "table": { "headers": ["Resistor", "Ohms"], "rows": [["R1", "4"], ["R2", "8"]], "caption": "Values" } }
],
"questions": [ { "type": "numeric", "stimulus": "s1", "prompt": "What is the total resistance in series?", "answer": { "value": "12", "units": "ohms" } } ]
```

- `key`: a short name you invent (`s1`, `s2`...). Each key is used once.
- `title`: required, so the teacher can find it. `text` and `table` are optional.
- Questions that share a stimulus are printed together under it.

## Tables

A table is `{ "headers": [...], "rows": [[...], ...], "caption": "" }`. Every row must have **exactly** as many cells as there are headers
(at most 8 columns and 40 rows). All cells are text (write numbers in quotes). Maths in a cell uses `\\( \\)` like any other text.
Use a table only for real rows and columns of data, never to lay out a question.

## What you cannot do

- **Images and graphs cannot be imported this way.** If a question depends on a picture or graph, still include the question, describe
  what is needed in `notes` (for example `"Needs the diagram of the circuit from page 2."`), and tell the teacher in your closing sentence.
  The teacher adds the image afterwards in Prime Questions.
- There are no marks or points. Every question counts as one. Do not add a `points` field.
- Do not add any field that is not listed here. Unknown fields are ignored.

## Check before you reply

- The reply is one code block of valid JSON and nothing inside it is a comment.
- Every question from the teacher is there, in order, with its original wording.
- Every `mc` has a `correct` **letter** that exists, and `keepOrder` is `true` where an option refers to other options.
- Every `numeric` `value` is text. Every `short` has a `rubric`.
- Every backslash in LaTeX is doubled, every `\\(` has its `\\)`, and no `$` is used for maths.
- Every table row has as many cells as there are headers. Every `stimulus` names an existing `key`.
- Anything you solved or guessed is said so in `notes`.

## Complete example

```json
{
  "format": "prime-questions-draft",
  "bank": "Science 9: Matter",
  "stimuli": [
    {
      "key": "s1",
      "title": "Densities of four samples",
      "text": "Four samples were measured. Use \\(\\rho = \\frac{m}{V}\\).",
      "table": {
        "headers": ["Sample", "Mass (g)", "Volume (cm3)"],
        "rows": [["A", "10", "5"], ["B", "12", "4"], ["C", "9", "9"]],
        "caption": "Measurements"
      }
    }
  ],
  "questions": [
    {
      "type": "mc",
      "prompt": "What is \\(\\frac{1}{2} + \\frac{1}{4}\\)?",
      "answer": { "options": ["\\(\\frac{3}{4}\\)", "\\(\\frac{2}{6}\\)", "\\(\\frac{1}{4}\\)", "All of the above"], "correct": "A" },
      "course": "Math 8", "unit": "Fractions", "tags": ["adding fractions"], "difficulty": "easy", "keepOrder": true
    },
    {
      "type": "tf",
      "prompt": "Water boils at 100 °C at sea level.",
      "answer": { "correct": true }
    },
    {
      "type": "numeric",
      "prompt": "What is the density of sample A?",
      "stimulus": "s1",
      "answer": { "value": "2", "units": "\\(\\mathrm{g/cm^{3}}\\)", "tolerance": 0.05 }
    },
    {
      "type": "mc",
      "prompt": "Which sample is the densest?",
      "stimulus": "s1",
      "answer": { "options": ["A", "B", "C"], "correct": "B" },
      "notes": "Answer not given; solved by the AI, please check."
    },
    {
      "type": "short",
      "prompt": "Explain why ice floats on water.",
      "answer": { "lines": 4, "rubric": "Ice is less dense than liquid water." }
    },
    {
      "type": "matching",
      "prompt": "Match each symbol to its element.",
      "answer": { "pairs": [ { "left": "Na", "right": "Sodium" }, { "left": "K", "right": "Potassium" }, { "left": "Fe", "right": "Iron" } ] }
    },
    {
      "type": "multipart",
      "prompt": "A car travels 120 km in 2 h.",
      "answer": { "parts": [
        { "type": "numeric", "prompt": "Find its average speed.", "answer": { "value": "60", "units": "km/h" } },
        { "type": "tf", "prompt": "The car must have kept the same speed the whole time.", "answer": { "correct": false } }
      ] }
    },
    {
      "type": "short",
      "prompt": "Balance this equation: \\(\\ce{H2 + O2 -> H2O}\\)",
      "answer": { "lines": 2, "rubric": "\\(\\ce{2H2 + O2 -> 2H2O}\\)" }
    }
  ]
}
```

## For the teacher: how to use this

1. Give your AI this file (paste its text, or give it the link above) **and** your questions, and ask it to follow the instructions.
2. Copy the JSON block it replies with.
3. In Prime Questions open **Imports**, paste it under "Questions written by an AI" and choose **Import pasted text**
   (or save it as a file ending `.json` and drop it on the page).
4. You see a summary first and nothing changes until you confirm. If something is wrong the app lists exactly what; paste that list back to the AI and ask it to fix the JSON.
5. Open the bank and check every question. They all arrive marked "Needs review". Mark one "Ready" when you are happy with it.

Importing the same JSON twice adds the questions twice (each import makes new questions), so delete the copy if that happens.

## Optional: make a bank PDF file instead

If you are an AI that can run Python and the teacher specifically wants a PDF file: save the JSON as `questions.json`, download
<https://ethanpullan.github.io/PrimeQuestions/tools/draft_to_bank_pdf.py> and run `python3 draft_to_bank_pdf.py questions.json`.
It writes a bank PDF that Prime Questions imports. It needs only Python 3, no extra packages. The JSON route above is simpler and works everywhere, so prefer it.
