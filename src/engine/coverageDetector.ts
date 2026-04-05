import type { MatchType } from './merchantResolver';

const AMBIGUITY_GAP = 0.5;

export type UpdateType =
  | 'merchant_missing'
  | 'merchant_ambiguous'
  | 'card_ambiguous';

export interface UpdateNeeded {
  readonly needsUpdate: boolean;
  readonly type: UpdateType | '';
  readonly reason: string;
}

const NO_UPDATE: UpdateNeeded = { needsUpdate: false, type: '', reason: '' };

/** Returns the first applicable UpdateNeeded signal (priority order). */
export function detect(
  matchType: MatchType,
  topTwoRates: readonly number[],
): UpdateNeeded {
  if (matchType === 'not_found') {
    return { needsUpdate: true, type: 'merchant_missing', reason: 'Merchant not found in known merchant database.' };
  }

  if (matchType === 'weak_fuzzy') {
    return { needsUpdate: true, type: 'merchant_ambiguous', reason: 'Low-confidence merchant match — may be a different merchant.' };
  }

  if (topTwoRates.length >= 2 && (topTwoRates[0] - topTwoRates[1]) < AMBIGUITY_GAP) {
    return {
      needsUpdate: true,
      type: 'card_ambiguous',
      reason: `Top two cards have similar reward rates (${topTwoRates[0]}% vs ${topTwoRates[1]}%). Consider clarifying card rules.`,
    };
  }

  return NO_UPDATE;
}
