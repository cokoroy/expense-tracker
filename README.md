# Daily Expense Tracker

A mobile-responsive expense tracker built with HTML, CSS, JavaScript, Bootstrap 5, and jQuery, with AI-assisted features served through a serverless proxy.

**Live demo:** https://expense-tracker-six-xi-24.vercel.app/

## Requirements coverage

| # | Requirement | Status |
|---|---|---|
| 1 | HTML, CSS, and JavaScript | Done — plain HTML/CSS/JS, no framework, no build step |
| 2 | Bootstrap mobile-responsive design | Done — Bootstrap 5 grid with custom styles, tested on real devices down to 360px |
| 3 | Monthly totals diagram (bonus) | Done — custom-built animated bar chart, no chart library |
| 4 | jQuery (bonus) | Done — DOM manipulation, event handling, and animations throughout |
| 5 | Creative additional features (bonus) | Done — see below |

## Core features

- Add expenses with Title, Amount, and Date; empty or invalid submissions are blocked with inline validation messages
- Expense list filtered by selected year; an empty year shows "Found no expenses." as specified
- Monthly totals for the selected year displayed as an animated bar chart with per-month values and hover tooltips

## Additional features

**AI receipt scanning.** Upload or photograph a receipt and the form auto-fills with the extracted title, amount, and date. The user reviews before adding — the app never inserts data silently.

**AI yearly insights.** One click renders a category pie chart (computed locally) and generates a one-paragraph analysis of the year's spending with a practical financial suggestion.

**Hybrid expense categorization.** Keyword rules tuned for Malaysian context (mamak, TNB, Touch 'n Go, telco prepaid, etc.) tag each expense instantly and offline. A single batched AI call then refines any uncategorized titles in the background, and results are cached permanently in the expense data. If the AI is unreachable, the keyword tags simply remain.

**Quality-of-life.** localStorage persistence across sessions, edit and delete with confirmation, yearly total summary, Bootstrap Icons for a consistent professional UI, RM currency formatting, and realistic seeded demo data covering 2022–2026 and all categories on first visit.

## Architecture

```
Browser (static HTML/CSS/JS + Bootstrap + jQuery)
   |
   |  fetch POST /api/ai      (AI features only)
   v
Vercel Serverless Function (api/ai.js)
   |  attaches GEMINI_API_KEY from an environment variable
   v
Google Gemini API
```

Calling an LLM API directly from the browser would expose the API key in the page source. The serverless proxy keeps the key server-side, exposes only three narrow actions (receipt, summary, categorize), validates and bounds all inputs, checks model output against an allowed category list before trusting it, and applies a simple rate limit against abuse of the public URL.

Design decisions worth noting:

- **Math in code, language in the model.** Charts, totals, and percentages are computed in JavaScript; the LLM only writes the natural-language analysis. LLMs are slow, metered, and unreliable at arithmetic — pre-computing the statistics produces faster, cheaper, and more accurate results.
- **Batched classification.** Categorization sends all pending titles in one API call rather than one call per expense, respecting free-tier rate limits.
- **Graceful degradation.** Opened as a local file with no server, the AI buttons show a friendly notice and every other feature keeps working. The pie chart works offline because it never depended on the AI in the first place.

## Running locally

Open `index.html` in a browser. Everything except the AI features works with zero setup. For a local server, the VS Code Live Server extension also works.


## Project structure

```
expense-tracker/
├── api/
│   └── ai.js        Serverless AI proxy (receipt, summary, categorize)
├── index.html       Page structure
├── style.css        Styling (custom design over Bootstrap)
├── script.js        Application logic
└── README.md
```

## Notes

- On first visit the app seeds demo expenses spanning 2022–2026 across all categories, so the chart, filter, and insights are immediately demonstrable. Seeded data can be freely edited or deleted and will not re-seed.
- The bar chart and pie chart are hand-built (flexbox, CSS transitions, and conic-gradient) to demonstrate the underlying logic rather than importing a chart library.
