# Product Note — CardSpendAI
## Vibecode Usage
- Build README.md on the architectural and request flow as described in prompt
- Used to make and improve UI with iterations on base UI created, including adding drag-and-drop functionality for legend and bottom panel
- Used to improve the prompt for LLM categorization
- Used to improve the logic for merchant matching and confidence scoring

## Failure Modes

**Ambiguous merchant matching**: fuzzy match on substrings pass for different reward categories. e.g. "Grab" match "GrabPay" or "Grab Food".

**LLM overconfidence on ambiguous merchants**: the LLM self-reports a confidence score, but it may be misleading. For merchants with no clear category signal (e.g. "Moonbucks", "MeTube"), the model pattern-matches on the name and returns a plausible-sounding category at high confidence.

## Logging recommendations

Log everything, explicitly: merchant, amount, card chosen, confidence, reasoning mode, and whether an update was flagged. 
Events with `updateNeeded = true` will be exposed in the update queue display with as one of 3 signal types:

| Signal | Trigger | Action |
|---|---|---|
| `merchant_missing` | Merchant not in DB | Add to DB |
| `merchant_ambiguous` | Fuzzy match score 60–84 | Confirm or reject as alias |
| `card_ambiguous` | Top two card rates within 0.5% | Clarify card rules |

## Coverage
- Route `merchant_ambiguous` events to output as "Did you mean?" prompt, where user can confirm responses and build a self-healing alias table.
- Merchant-override rules (card × merchant → rate) for promotion-specific rates. Full ranked card list showing all rates, not just the winner.
- Confidence scoring is heuristic-based (not ML-trained):
  - **Limitation**: Treats all merchants equally; doesn't account for frequency, category volatility, or switching costs
  - **Real problem**: 0.5% gap on Starbucks (daily) ≠ 0.5% gap on flights (yearly), but both get "medium" confidence. 


## 2-Week Roadmap

**Week 1

*Priority 1: Persist Queue State*
- Track which update signals user has resolved; persist across page refreshes
- Load on init and hide resolved items from queue (blocks all Week 2)

*Priority 2: Merchant Aliases*
- Store user confirmations when they accept fuzzy matches (e.g., "Grab" → "GrabPay")
- Auto-apply aliases on future searches (no more fuzzy matching needed)

*Priority 3: Merchant Staging*
- Let users manually pick the correct category for unknown merchants when reviewing queue
- Store their choices so product team can prioritize adding them to database

**Week 2 — Override Rules & UI (Built on Week 1 Foundation)**

*Priority 4: Promotion Overrides*
- Store temporary rate adjustments for merchant-card combos (e.g., "2x bonus on Grab this month")
- Use these overrides when scoring cards instead of base rates

*Priority 5: Display & History*
- Show all eligible cards ranked by reward rate (not just the winner)
- Add history view to see past decisions and resolutions