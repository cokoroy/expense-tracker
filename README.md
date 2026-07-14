# Daily Expense Tracker

A mobile-responsive expense tracker built for the SRKK technical assignment.

**Live demo:** _(add your Vercel URL here)_

## Requirements coverage

| Requirement | Status |
|---|---|
| 1. HTML, CSS, JavaScript | ✅ Plain HTML/CSS/JS — no framework, no build step |
| 2. Bootstrap responsive design | ✅ Bootstrap 5 grid + custom styles, tested down to 360px |
| 3. Monthly totals diagram (bonus) | ✅ Custom-built animated bar chart — no chart library |
| 4. jQuery (bonus) | ✅ Used for DOM manipulation, events, and animations |
| 5. Creative extra features (bonus) | ✅ See below |

### Core features
- Add expense with **Title, Amount, Date** — empty/invalid submissions are blocked with inline validation messages
- **Filter by year**; shows **"Found no expenses."** when the selected year is empty
- **Monthly totals diagram** for the selected year, with animated bars and hover tooltips

### Extra features
- 📷 **AI receipt scanning** — upload/photograph a receipt and the form fills itself (title, amount, date)
- ✨ **AI yearly insights** — one tap generates a natural-language summary of the year's spending
- 💾 **localStorage persistence** — expenses survive page refresh
- ✏️ **Edit & delete** expenses (with delete confirmation)
- 🏷️ **Auto-categorization** — rule-based keyword tags (Food, Transport, Bills…), works fully offline
- 📊 **Yearly total** strip and per-month values on the chart
- 🇲🇾 **RM currency formatting**

## Architecture

```
Browser (static HTML/CSS/JS + jQuery + Bootstrap)
   │
   │  fetch POST /api/ai        ← only for the two AI features
   ▼
Vercel Serverless Function (api/ai.js)
   │  attaches GEMINI_API_KEY from environment variable
   ▼
Google Gemini API (gemini-2.0-flash)
```

**Why a serverless proxy?** Calling an LLM API directly from the browser would
expose the API key in the page source. The proxy keeps the key server-side,
exposes only two narrow actions (`receipt`, `summary`), validates/bounds all
inputs, and applies a simple rate limit to prevent abuse of the public URL.

**Graceful degradation:** if the page is opened as a local file (no server),
the AI buttons show a friendly notice and every other feature keeps working.
The auto-categorization tags are deliberately rule-based so the app still
feels "smart" offline.

## Running locally

Just open `index.html` in a browser — everything except the two AI buttons
works with zero setup.

## Deploying (for the AI features)

1. Push this folder to a GitHub repo
2. Import the repo at [vercel.com](https://vercel.com) (zero config needed —
   Vercel auto-detects `api/ai.js` as a serverless function)
3. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. In Vercel → Project → Settings → Environment Variables, add
   `GEMINI_API_KEY` = your key
5. Redeploy — done

## Notes

- On first run the app seeds the three sample expenses from the assignment
  screenshots so the UI is immediately populated. Delete them freely; the app
  won't re-seed.
- The bar chart is hand-built (flexbox + CSS transitions) to demonstrate the
  logic rather than importing a chart library.
