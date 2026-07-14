/**
 * /api/ai — serverless AI proxy (Vercel)
 *
 * Why this exists: calling an LLM API directly from the browser would expose
 * the API key in the page source. This function keeps the key in a server-side
 * environment variable (GEMINI_API_KEY) and exposes only two narrow actions:
 *
 *   POST { action: "receipt", image: <base64>, mimeType: "image/jpeg" }
 *     -> { title, amount, date }        (extracted from a receipt photo)
 *
 *   POST { action: "summary", year: 2021, expenses: [...] }
 *     -> { summary: "..." }             (short natural-language insights)
 *
 * Setup: add GEMINI_API_KEY in Vercel -> Project -> Settings -> Environment Variables.
 * Get a free key at https://aistudio.google.com/apikey
 */

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  GEMINI_MODEL +
  ":generateContent?key=";

/* --- Very simple in-memory rate limit (per warm instance) --- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxHits = 10;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > maxHits;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests, slow down." });
  }

  const { action } = req.body || {};

  try {
    if (action === "receipt") {
      const { image, mimeType } = req.body;
      if (!image) return res.status(400).json({ error: "Missing image" });

      const prompt =
        "You are reading a photo of a purchase receipt. Extract:\n" +
        '- "title": short human-friendly description (merchant name or main item), max 40 chars\n' +
        '- "amount": the final total paid, as a number (no currency symbol)\n' +
        '- "date": the receipt date in YYYY-MM-DD format (use null if not visible)\n' +
        "Respond with ONLY a JSON object, no markdown fences, no explanation.";

      const result = await callGemini(apiKey, [
        {
          parts: [
            { inline_data: { mime_type: mimeType || "image/jpeg", data: image } },
            { text: prompt },
          ],
        },
      ]);

      const parsed = extractJSON(result);
      if (!parsed) return res.status(502).json({ error: "Could not parse receipt" });

      return res.status(200).json({
        title: typeof parsed.title === "string" ? parsed.title.slice(0, 60) : null,
        amount: Number.isFinite(Number(parsed.amount)) ? Number(parsed.amount) : null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "") ? parsed.date : null,
      });
    }

    if (action === "summary") {
      const { year, expenses } = req.body;
      if (!Array.isArray(expenses) || expenses.length === 0) {
        return res.status(400).json({ error: "Missing expenses" });
      }
      // Keep the payload bounded
      const safeExpenses = expenses.slice(0, 200).map((e) => ({
        title: String(e.title || "").slice(0, 60),
        amount: Number(e.amount) || 0,
        date: String(e.date || "").slice(0, 10),
        category: String(e.category || "").slice(0, 30),
      }));

      // Pre-compute stats in code (LLMs are unreliable at arithmetic)
      const total = safeExpenses.reduce((s, e) => s + e.amount, 0);
      const byMonth = {};
      const byCategory = {};
      for (const e of safeExpenses) {
        const m = new Date(e.date).toLocaleString("en", { month: "long" });
        byMonth[m] = Math.round(((byMonth[m] || 0) + e.amount) * 100) / 100;
        byCategory[e.category] =
          Math.round(((byCategory[e.category] || 0) + e.amount) * 100) / 100;
      }
      const biggest = safeExpenses.reduce((a, b) => (b.amount > a.amount ? b : a));

      const prompt =
        `You are a personal finance assistant analysing a user's ${Number(year) || ""} expenses in Malaysian Ringgit (RM).\n\n` +
        `Pre-computed stats:\n` +
        `- Total spent: RM${total.toFixed(2)}\n` +
        `- Totals by month: ${JSON.stringify(byMonth)}\n` +
        `- Totals by category: ${JSON.stringify(byCategory)}\n` +
        `- Largest single expense: ${biggest.title} (RM${biggest.amount})\n\n` +
        `Full expense list: ${JSON.stringify(safeExpenses)}\n\n` +
        `Write EXACTLY ONE paragraph (4-6 sentences) that analyses this spending: ` +
        `the overall total and how it was distributed across the year, the peak month and what drove it, ` +
        `and the dominant category with its share of total spending. ` +
        `Then end the paragraph with one specific, actionable financial suggestion based on the actual data ` +
        `(for example a recurring cost worth reviewing, a category to set a budget for, or a savings habit). ` +
        `Be specific with RM amounts and percentages. Do NOT show any calculations or working — state final numbers only. Plain text only, no markdown, no bullet points, no headings.`;;

      const result = await callGemini(apiKey, [{ parts: [{ text: prompt }] }]);
      return res.status(200).json({ summary: result.trim() });
    }

    if (action === "categorize") {
      const { items } = req.body; // [{ id, title }]
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing items" });
      }
      // One batch call for up to 50 titles — never one API call per expense
      const safeItems = items.slice(0, 50).map((it) => ({
        id: String(it.id).slice(0, 20),
        title: String(it.title || "").slice(0, 60),
      }));

      const prompt =
        "Classify each expense title into EXACTLY one of these categories:\n" +
        '"Food & Drinks", "Transport", "Bills & Utilities", "Shopping", ' +
        '"Health & Fitness", "Entertainment", "Other"\n\n' +
        "These are from a Malaysian user — local terms are common " +
        "(mamak and warung are eateries, Touch 'n Go is transport payments, " +
        "Celcom/Maxis/Digi/U Mobile are telcos, Mr DIY is a hardware store, " +
        "GSC/TGV are cinemas).\n\n" +
        "Expenses:\n" +
        JSON.stringify(safeItems) +
        '\n\nRespond with ONLY a JSON object mapping id to category, ' +
        'like {"abc123": "Transport", "def456": "Food & Drinks"}. ' +
        "No markdown fences, no explanation.";

      const result = await callGemini(apiKey, [{ parts: [{ text: prompt }] }]);
      const parsed = extractJSON(result);
      if (!parsed) return res.status(502).json({ error: "Could not parse categories" });

      // Only pass through valid category names
      const VALID = new Set([
        "Food & Drinks", "Transport", "Bills & Utilities",
        "Shopping", "Health & Fitness", "Entertainment", "Other",
      ]);
      const categories = {};
      for (const [id, cat] of Object.entries(parsed)) {
        if (VALID.has(cat)) categories[id] = cat;
      }
      return res.status(200).json({ categories });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("AI proxy error:", err);
    return res.status(502).json({ error: "AI request failed" });
  }
}

/* ---------- helpers ---------- */

async function callGemini(apiKey, contents) {
  const response = await fetch(GEMINI_URL + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000, // thinking tokens count against this budget on newer Gemini models
        thinkingConfig: { thinkingLevel: "low" }, // we pre-compute the stats, so deep reasoning is wasted
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}