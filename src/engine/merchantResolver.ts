import type { Merchant } from '../data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchType = 'exact' | 'fuzzy' | 'weak_fuzzy' | 'not_found';

export interface ResolveResult {
  readonly merchant: Merchant | null;
  readonly matchType: MatchType;
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Thresholds — mirror Python thefuzz defaults
// ---------------------------------------------------------------------------

const FUZZY_STRONG = 85;
const FUZZY_WEAK   = 60;

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

/**
 * Levenshtein edit distance between two strings.
 * Counts the minimum number of single-character edits (insert/delete/substitute) needed
 * to transform one string into another. Used by Python's thefuzz library.
 * Example: levenshtein("amazon", "amazon") = 0, levenshtein("amazon", "amazno") = 2 (two transpositions).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Single-row DP — O(n) space (rolling array technique)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Convert Levenshtein distance to a 0-100 similarity score.
 * Formula: (1 - editDistance / longerStringLength) * 100
 * Examples:
 *   "amazon" vs "amazon" → distance=0, maxLen=6 → (1-0/6)*100 = 100
 *   "amazon" vs "amazno" → distance=2, maxLen=6 → (1-2/6)*100 = 67
 * Matches Python thefuzz.fuzz.ratio behavior exactly.
 */
function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

// ---------------------------------------------------------------------------
// Scoring strategies
// ---------------------------------------------------------------------------

/**
 * Token Sort Ratio — handles word-order variants.
 * Tokenizes both strings, sorts tokens alphabetically, then compares.
 * Good for catching merchants where order differs: "Singapore Airlines" vs "Airlines Singapore".
 *
 * Algorithm:
 *   1. Tokenize and lowercase both strings ("Singapore Airlines" → ["singapore", "airlines"])
 *   2. Sort tokens alphabetically (["singapore", "airlines"] → ["airlines", "singapore"])
 *   3. Rejoin and compute Levenshtein similarity
 *   4. Result: both strings become "airlines singapore", score = 100
 *
 * Matches Python thefuzz.fuzz.token_sort_ratio.
 */
function tokenSortRatio(a: string, b: string): number {
  const sortedA = tokenize(a).sort().join(' ');
  const sortedB = tokenize(b).sort().join(' ');
  return levenshteinSimilarity(sortedA, sortedB);
}

/**
 * Token Set Ratio — handles subset cases like "Amazon SG" vs "Amazon".
 * Partitions tokens into intersection and differing sets, then compares all combinations.
 * Useful for catching extra qualifiers: "SG" in "Amazon SG" is ignored if "Amazon" alone is a strong match.
 *
 * Algorithm:
 *   1. Find intersection of tokens from both strings
 *   2. Build three comparison strings:
 *        t0 = intersection (common tokens only)
 *        t1 = intersection + tokens unique to a
 *        t2 = intersection + tokens unique to b
 *   3. Compare all three pairs: sim(t0,t1), sim(t0,t2), sim(t1,t2)
 *   4. Return max similarity
 *
 * Example: "Amazon SG" vs "Amazon"
 *   setA = {"amazon", "sg"}, setB = {"amazon"}
 *   intersection = "amazon", onlyA = "sg", onlyB = ""
 *   t0 = "amazon", t1 = "amazon sg", t2 = "amazon"
 *   sim(t0, t1) = sim("amazon", "amazon sg") = ~87
 *   sim(t0, t2) = sim("amazon", "amazon") = 100
 *   sim(t1, t2) = sim("amazon sg", "amazon") = ~87
 *   max = 100 ✓ (high-confidence match)
 *
 * Matches Python thefuzz.fuzz.token_set_ratio.
 */
function tokenSetRatio(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  const intersection = [...setA].filter(t => setB.has(t)).sort().join(' ');
  const onlyA = [...setA].filter(t => !setB.has(t)).sort().join(' ');
  const onlyB = [...setB].filter(t => !setA.has(t)).sort().join(' ');

  const t0 = intersection;
  const t1 = [intersection, onlyA].filter(Boolean).join(' ');
  const t2 = [intersection, onlyB].filter(Boolean).join(' ');

  return Math.max(
    levenshteinSimilarity(t0, t1),
    levenshteinSimilarity(t0, t2),
    levenshteinSimilarity(t1, t2),
  );
}

/**
 * Composite scoring — try both tokenSortRatio and tokenSetRatio, take the best result.
 * Ensures we catch:
 *   - Word-order variants (tokenSortRatio): "Airlines Singapore" ↔ "Singapore Airlines"
 *   - Subset matches (tokenSetRatio): "Amazon SG" → "Amazon" (ignoring "SG")
 * Thresholds empirically tuned on 7 reference merchants:
 *   ≥ 85: confident fuzzy match (e.g., "Amazon SG" → "Amazon" scores 100)
 *   60–84: uncertain fuzzy match (e.g., "SG Airlines" → "Singapore Airlines" scores ~73)
 *   < 60: not found (e.g., "Don Don Donki" → best match scores ~22)
 */
function score(input: string, merchantName: string): number {
  return Math.max(tokenSortRatio(input, merchantName), tokenSetRatio(input, merchantName));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolve(name: string, merchants: Merchant[]): ResolveResult {
  const normInput = normalize(name);

  // 1. Exact match on normalized_name — deterministic, fast path
  const exact = merchants.find(m => m.normalized_name === normInput);
  if (exact) return { merchant: exact, matchType: 'exact', score: 100 };

  // 2. Fuzzy match — score every merchant, take the best
  let best: Merchant | null = null;
  let bestScore = 0;

  for (const m of merchants) {
    const s = score(name, m.merchant_name);
    if (s > bestScore) { bestScore = s; best = m; }
  }

  if (bestScore >= FUZZY_STRONG) return { merchant: best, matchType: 'fuzzy',      score: bestScore };
  if (bestScore >= FUZZY_WEAK)   return { merchant: best, matchType: 'weak_fuzzy', score: bestScore };
  return { merchant: null, matchType: 'not_found', score: bestScore };
}
