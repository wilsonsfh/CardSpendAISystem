# HeyMaxTA Project — Claude Instructions

## Project Overview

**CardSpendAI** — HeyMax Card Spend AI take-home assessment.
- **Stack**: React 19 + TypeScript + Vite + Vanilla CSS
- **No backend** — all logic is client-side TypeScript
- **No Python** — tech pivot complete

## Architecture

```
src/
  data.ts                    → Card, Merchant, CardRule types + static data arrays
  recommend.ts               → public API: recommend(merchantName, categoryHint, amount, userCards)
  engine/
    merchantResolver.ts      → resolve(): exact + fuzzy matching (pure TS Levenshtein)
    coverageDetector.ts      → detect(): UpdateNeeded signals, HINT_MAP
  App.tsx                    → UI — DO NOT MODIFY (Gemini-generated)
  index.css                  → styles — DO NOT MODIFY (Gemini-generated)
```

## Key Design Decisions

- `tokenSortRatio()` sorts tokens before Levenshtein comparison (mirrors Python thefuzz)
- Confidence thresholds: HIGH = exact + gap ≥ 1.0; MEDIUM = fuzzy/weak_fuzzy or gap 0.5–1.0; LOW = not_found or gap < 0.5
- HINT_MAP maps colloquial terms → canonical categories ("coffee" → "dining", "travel" → "hotels")
- `update_needed` is `undefined` (not returned) when no update is needed — App.tsx checks truthiness
- `recommend()` signature must stay stable — App.tsx calls it directly

## Running

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
```

## Iteration Strategy

**One part per prompt:**
1. Part 1 (engine) — done
2. Part 2 (coverage detection) — on user command
3. Part 3 (product note + README) — on user command

## Skill Triggers (project-scoped)

| Keyword | Skill | When |
|---------|-------|------|
| "typescript" / "type" / "interface" / "generic" | `coding-standards` | TypeScript code authoring |
| "react component" / "tsx" / "hooks" / "useState" | `ui-ux-pro-max` | React UI work |
