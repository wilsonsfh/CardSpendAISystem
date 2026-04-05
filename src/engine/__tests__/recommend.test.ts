/**
 * @vitest-environment jsdom
 *
 * Requires jsdom so recommend() can call logEvent() which uses localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recommend } from '../../recommend';
import { clearEventLog, getUpdateQueue } from '../eventLogger';

beforeEach(() => clearEventLog());

// ---------------------------------------------------------------------------
// 4 sample queries from the assessment — these are the acceptance criteria
// ---------------------------------------------------------------------------

describe('sample query 1: Starbucks', () => {
  it('recommends Max Cashback+ with high confidence', () => {
    const r = recommend('Starbucks', 12.5, ['Max Cashback+', 'Max Travel Visa']);
    expect(r.recommendedCard?.card_name).toBe('Max Cashback+');
    expect(r.rewardRate).toBe(5.0);
    expect(r.confidence).toBe('high');
    expect(r.reasoningMode).toBe('deterministic');
    expect(r.updateNeeded).toBeUndefined();
  });

  it('estimates reward correctly', () => {
    const r = recommend('Starbucks', 12.5, ['Max Cashback+', 'Max Travel Visa']);
    expect(r.estimatedReward).toBe(0.63);  // 12.5 * 5% = 0.625, rounded to 2 d.p. → 0.63
  });
});

describe('sample query 2: Amazon SG', () => {
  it('recommends Max Online Rewards with medium confidence (fuzzy match)', () => {
    const r = recommend('Amazon SG', 84.2, ['Max Online Rewards', 'Max Everyday Mastercard']);
    expect(r.recommendedCard?.card_name).toBe('Max Online Rewards');
    expect(r.rewardRate).toBe(6.0);
    expect(r.confidence).toBe('medium');
    expect(r.reasoningMode).toBe('inferred');  // fuzzy match → inferred
    expect(r.updateNeeded).toBeUndefined();
  });
});

describe('sample query 3: Don Don Donki', () => {
  it('recommends Max Cashback+ with low confidence and merchant_missing signal', () => {
    const r = recommend('Don Don Donki', 45.0, ['Max Cashback+', 'Max Everyday Mastercard']);
    expect(r.recommendedCard?.card_name).toBe('Max Cashback+');
    expect(r.rewardRate).toBe(4.0);
    expect(r.confidence).toBe('low');
    expect(r.reasoningMode).toBe('missing_data');
    expect(r.updateNeeded?.needsUpdate).toBe(true);
    expect(r.updateNeeded?.type).toBe('merchant_missing');
  });

  it('queues the event for the update queue', () => {
    recommend('Don Don Donki', 45.0, ['Max Cashback+', 'Max Everyday Mastercard']);
    expect(getUpdateQueue().length).toBe(1);
    expect(getUpdateQueue()[0].merchant).toBe('Don Don Donki');
  });
});

describe('sample query 4: Agoda', () => {
  it('recommends Max Travel Visa with high confidence', () => {
    const r = recommend('Agoda', 220.0, ['Max Travel Visa', 'Max Cashback+']);
    expect(r.recommendedCard?.card_name).toBe('Max Travel Visa');
    expect(r.rewardRate).toBe(4.0);
    expect(r.confidence).toBe('high');
    expect(r.reasoningMode).toBe('deterministic');
    expect(r.updateNeeded).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('uses all cards when user_cards is empty', () => {
    const r = recommend('Starbucks', 50.0, []);
    expect(r.recommendedCard).not.toBeNull();
  });

  it('falls back to general rate for unknown category', () => {
    const r = recommend('Totally Unknown Place', 100.0, ['Max Everyday Mastercard']);
    expect(r.recommendedCard?.card_name).toBe('Max Everyday Mastercard');
    expect(r.reasoningMode).toBe('missing_data');
  });

  it('explanation is a non-empty string', () => {
    const r = recommend('Starbucks', 12.5, ['Max Cashback+']);
    expect(typeof r.explanation).toBe('string');
    expect(r.explanation.length).toBeGreaterThan(10);
  });
});
