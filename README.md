# CardSpendAI

Card recommendation engine: given a merchant and spend amount, picks the best card from your wallet (hardcoded options available in UI), explains why, and flags gaps in its own knowledge for review.

## How to Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests
```

**LLM fallback (optional)** — only triggered for unknown merchants:

```bash
# .env.local at project root
GROQ_API_KEY=your_key_here
```

The key is proxied server-side via `vite.config.ts` — never exposed to the browser. Without it, the engine still works for all known merchants.

## Architecture

```
src/
  data.ts                  → Card + Merchant types, static sample data (4 cards, 7 merchants)
  recommend.ts             → Public API: recommend(merchant, amount, cards, categoryOverride?)
  engine/
    merchantResolver.ts    → Exact + fuzzy merchant matching (Levenshtein, thefuzz-inspired)
    coverageDetector.ts    → Emits 3 update signals: merchant_missing, merchant_ambiguous, card_ambiguous
    eventLogger.ts         → Logs every recommendation to localStorage; exposes update queue
    llmSuggester.ts        → Groq LLM fallback; only called on missing_data, passes categoryOverride back
```

**Request flow:**
```
recommend(merchant, amount, cards)
  │
  ├─ merchantResolver.resolve()     exact → fuzzy → weak_fuzzy → not_found
  │       │
  │  merchant.category ?? 'general'
  │       │
  ├─ score each eligible card       getRateForCategory() → ranked by rate
  │       │
  ├─ determineConfidence()          rate gap between top two cards → high / medium / low
  ├─ determineReasoningMode()       exact+specific rule+high gap → deterministic; else inferred / missing_data
  ├─ coverageDetector.detect()      → UpdateNeeded signal if applicable
  └─ eventLogger.logEvent()         → appended to localStorage

  if missing_data:
    llmSuggester.suggestCategory()  → categoryOverride
    recommend(..., categoryOverride) re-run with LLM-provided category
```

## Assumptions

- Reward rates do not have additional constraints: no caps, tiers, or promotional rates involved
- No auth or card linking: cards are selected manually in the UI
- Update queue is in-memory — resets on page refresh (no backend)
- Fuzzy match thresholds (≥85 confident, 60–84 uncertain), inspired by thefuzz python library, idiomatically implemented in TypeScript.

**Why TypeScript:** UI is React (requires JavaScript). Keeping engine logic in the same language (TypeScript) eliminates context-switching overhead in a 2-hour prototype. Client-side-only design avoids backend infrastructure entirely.

## Tradeoffs of features

| Skipped/Minimised | Impact |
|---|---|
| Backend persistence | Queue resets on refresh |
| Reward caps/tiers | Reward estimates are approximate |
| Auth / card linking | Cards selected manually |
| Confidence scoring | Card-difference heuristic, not trained on real data |
