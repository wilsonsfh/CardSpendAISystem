/**
 * Recommendation Engine — orchestrates merchant resolution, coverage detection,
 * card scoring, and event logging.
 *
 * Design principle — three tiers of inference:
 *
 *   deterministic  Exact merchant match, category confirmed from DB, unambiguous
 *                  card winner (rate gap ≥ 1%). The system is certain.
 *
 *   inferred       Fuzzy merchant match OR cards are close (gap 0.5–1%).
 *                  Reasonable guess, but state it clearly.
 *
 *   missing_data   Merchant not found. Falling back to general rule.
 *                  System is guessing; flag for the update queue.
 */

import { cards, merchants } from './data';
import type { Card } from './data';
import { resolve } from './engine/merchantResolver';
import type { MatchType } from './engine/merchantResolver';
import { detect } from './engine/coverageDetector';
import type { UpdateNeeded } from './engine/coverageDetector';
import { logEvent } from './engine/eventLogger';

export type { UpdateNeeded };
export type ReasoningMode = 'deterministic' | 'inferred' | 'missing_data';

// ---------------------------------------------------------------------------
// Types — camelCase throughout (TypeScript convention)
// ---------------------------------------------------------------------------

export interface RecommendationResult {
  recommendedCard: Card | null;
  estimatedReward: number;
  rewardRate: number;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;  // 0–100, rate gap between top two cards
  reasoningMode: ReasoningMode;
  updateNeeded?: UpdateNeeded;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const HIGH_GAP   = 1.0;   // rate gap ≥ this → high confidence
const MEDIUM_GAP = 0.5;   // rate gap ≥ this → medium confidence

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getRateForCategory(card: Card, category: string): { rate: number; ruleCategory: string } {
  const specific = card.earn_rules.find(r => r.category === category);
  if (specific) return { rate: specific.reward_rate, ruleCategory: category };
  const general  = card.earn_rules.find(r => r.category === 'general');
  return { rate: general?.reward_rate ?? 1.0, ruleCategory: 'general' };
}

function determineConfidence(matchType: MatchType, topTwoRates: number[]): 'high' | 'medium' | 'low' {
  if (matchType === 'not_found') return 'low';
  const gap = topTwoRates.length >= 2 ? topTwoRates[0] - topTwoRates[1] : Infinity;
  if (gap < MEDIUM_GAP) return 'low';
  if (matchType === 'fuzzy' || matchType === 'weak_fuzzy' || gap < HIGH_GAP) return 'medium';
  return 'high';
}

/**
 * determineReasoningMode — the key design distinction between three confidence tiers.
 *
 *   missing_data    Merchant is not in our database at all (matchType === 'not_found').
 *                   The category and card recommendation are both guesses. Always triggers
 *                   an update queue signal (merchant_missing) so the product team can add it.
 *
 *   deterministic   We are certain. ALL three conditions must hold simultaneously:
 *                     1. Exact merchant match — matched by normalized name, not fuzzy
 *                     2. Card used a specific earn rule for this category — not the 'general' fallback
 *                     3. High confidence — rate gap between top two cards is ≥ 1.0%
 *                   If any condition fails, we can't call the output certain.
 *
 *   inferred        Everything in between — reasonable but not certain:
 *                     - Fuzzy or weak_fuzzy match (merchant identity is uncertain)
 *                     - Card won on the general fallback rate (no specific rule for this category)
 *                     - Two cards were close in rate (gap < 1.0%) — a different card could be optimal
 *                   The system makes a best-guess recommendation and says so explicitly.
 */
function determineReasoningMode(
  matchType: MatchType,
  usedGeneralFallback: boolean,
  confidence: 'high' | 'medium' | 'low',
): ReasoningMode {
  if (matchType === 'not_found')                                              return 'missing_data';
  if (matchType === 'exact' && !usedGeneralFallback && confidence === 'high') return 'deterministic';
  return 'inferred';
}

function buildExplanation(
  cardName: string,
  ruleCategory: string,
  rate: number,
  amount: number,
  matchType: MatchType,
  matchedMerchantName: string | null,
  ranked: Array<{ card: Card; rate: number }>,
): string {
  const categoryLabel = ruleCategory.replace(/_/g, ' ');
  const matchNote =
    matchType === 'fuzzy'      ? ' (merchant matched via fuzzy search)' :
    matchType === 'weak_fuzzy' ? ' (low-confidence match — verify merchant)' :
    matchType === 'not_found'  ? ' (merchant unknown — using general fallback)' : '';

  const runnerUp = ranked[1];
  const vsNote = runnerUp && runnerUp.rate < rate ? ` vs ${runnerUp.card.card_name} at ${runnerUp.rate}%` : '';
  const resolvedAs = matchedMerchantName ? ` → ${matchedMerchantName}` : '';

  return `${cardName} earns ${rate}% on ${categoryLabel}${vsNote}${matchNote}. Spend $${amount.toFixed(2)}${resolvedAs} → est. return: $${((rate / 100) * amount).toFixed(2)} SGD.`;
}

// ---------------------------------------------------------------------------
// Public API — signature is stable; App.tsx calls this directly
// ---------------------------------------------------------------------------

export function recommend(
  merchantName: string,
  amount: number,
  userCards: string[],
  categoryOverride?: string,   // LLM-provided canonical category; only used when merchant is not in DB
): RecommendationResult {
  // 1. Merchant resolution — deterministic exact match first, fuzzy fallback
  const { merchant, matchType } = resolve(merchantName, merchants);

  // 2. Effective category: DB record → LLM override → general fallback
  const category = merchant?.category ?? categoryOverride ?? 'general';

  // 3. Eligible cards (user's subset, or all if unspecified)
  const eligible = userCards.length > 0 ? cards.filter(c => userCards.includes(c.card_name)) : cards;

  if (eligible.length === 0) {
    return {
      recommendedCard: null,
      estimatedReward: 0,
      rewardRate: 0,
      explanation: 'None of the specified cards were found in our system.',
      confidence: 'low',
      confidenceScore: 0,
      reasoningMode: 'missing_data',
      updateNeeded: { needsUpdate: true, type: 'merchant_missing', reason: 'No matching cards found in the card database.' },
    };
  }

  // 4. Score each card for this category, sort best-first
  const ranked      = eligible.map(card => ({ card, ...getRateForCategory(card, category) })).sort((a, b) => b.rate - a.rate);
  const best        = ranked[0];
  const topTwoRates = ranked.slice(0, 2).map(r => r.rate);
  const usedGeneral = best.ruleCategory === 'general';

  // 5. Confidence + reasoning mode
  const confidence    = determineConfidence(matchType, topTwoRates);
  const reasoningMode = determineReasoningMode(matchType, usedGeneral, confidence);

  // 6. Coverage signal — feeds the update queue
  const updateSignal = detect(matchType, topTwoRates);

  // Compute numeric confidence score (rate gap between top two cards, capped at 100)
  const gap = topTwoRates.length >= 2 ? topTwoRates[0] - topTwoRates[1] : Infinity;
  const confidenceScore = Math.min(100, Math.round(gap * 10)); // 0.5% gap → 5 points, 1.5% gap → 15 points, etc.

  const result: RecommendationResult = {
    recommendedCard:  best.card,
    rewardRate:       best.rate,
    estimatedReward:  parseFloat(((amount * best.rate) / 100).toFixed(2)),
    explanation:      buildExplanation(best.card.card_name, best.ruleCategory, best.rate, amount, matchType, merchant?.merchant_name ?? null, ranked),
    confidence,
    confidenceScore,
    reasoningMode,
    updateNeeded:     updateSignal.needsUpdate ? updateSignal : undefined,
  };

  // 7. Log the event — this IS the feedback loop
  logEvent({
    merchant:         merchantName,
    matchedMerchant:  matchType === 'weak_fuzzy' ? merchant?.merchant_name : undefined,
    amount,
    userCards,
    recommendedCard:  best.card.card_name,
    confidence,
    reasoningMode,
    rewardRate:       best.rate,
    estimatedReward:  result.estimatedReward,
    updateNeeded:     updateSignal.needsUpdate,
    updateType:       updateSignal.type,
    updateReason:     updateSignal.reason,
  });

  return result;
}
