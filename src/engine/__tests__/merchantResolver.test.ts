import { describe, it, expect } from 'vitest';
import { resolve } from '../merchantResolver';
import type { Merchant } from '../../data';

const MERCHANTS: Merchant[] = [
  { merchant_name: 'Amazon',            normalized_name: 'amazon',            category: 'online_shopping' },
  { merchant_name: 'Shopee',            normalized_name: 'shopee',            category: 'online_shopping' },
  { merchant_name: 'NTUC FairPrice',    normalized_name: 'ntuc fairprice',    category: 'groceries' },
  { merchant_name: 'Starbucks',         normalized_name: 'starbucks',         category: 'dining' },
  { merchant_name: 'Singapore Airlines',normalized_name: 'singapore airlines',category: 'airlines' },
  { merchant_name: 'Grab',              normalized_name: 'grab',              category: 'transport' },
  { merchant_name: 'Agoda',             normalized_name: 'agoda',             category: 'hotels' },
];

// ---------------------------------------------------------------------------
// Exact match
// ---------------------------------------------------------------------------

describe('exact match', () => {
  it('matches Starbucks exactly', () => {
    const r = resolve('Starbucks', MERCHANTS);
    expect(r.matchType).toBe('exact');
    expect(r.merchant?.category).toBe('dining');
    expect(r.score).toBe(100);
  });

  it('is case-insensitive', () => {
    const r = resolve('starbucks', MERCHANTS);
    expect(r.matchType).toBe('exact');
  });

  it('trims surrounding whitespace', () => {
    const r = resolve('  Agoda  ', MERCHANTS);
    expect(r.matchType).toBe('exact');
    expect(r.merchant?.category).toBe('hotels');
  });

  it('matches multi-word merchants', () => {
    const r = resolve('NTUC FairPrice', MERCHANTS);
    expect(r.matchType).toBe('exact');
  });
});

// ---------------------------------------------------------------------------
// Fuzzy match (score >= 85, not exact string)
// ---------------------------------------------------------------------------

describe('fuzzy match', () => {
  it('matches "Amazon SG" → Amazon via tokenSetRatio', () => {
    const r = resolve('Amazon SG', MERCHANTS);
    expect(r.matchType).toBe('fuzzy');
    expect(r.merchant?.normalized_name).toBe('amazon');
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it('matches "NTUC" → NTUC FairPrice via tokenSetRatio', () => {
    const r = resolve('NTUC', MERCHANTS);
    expect(r.matchType).toBe('fuzzy');
    expect(r.merchant?.normalized_name).toBe('ntuc fairprice');
  });
});

// ---------------------------------------------------------------------------
// Weak fuzzy (score 60–84)
// ---------------------------------------------------------------------------

describe('weak_fuzzy match', () => {
  it('"SG Airlines" scores between 60 and 84', () => {
    const r = resolve('SG Airlines', MERCHANTS);
    expect(r.matchType).toBe('weak_fuzzy');
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.score).toBeLessThan(85);
  });
});

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe('not_found', () => {
  it('returns not_found for Don Don Donki', () => {
    const r = resolve('Don Don Donki', MERCHANTS);
    expect(r.matchType).toBe('not_found');
    expect(r.merchant).toBeNull();
  });

  it('returns not_found for completely unknown input', () => {
    const r = resolve('XYZ123 Unknown', MERCHANTS);
    expect(r.matchType).toBe('not_found');
    expect(r.merchant).toBeNull();
  });
});
