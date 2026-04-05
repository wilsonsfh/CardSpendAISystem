import { describe, it, expect } from 'vitest';
import { detect } from '../coverageDetector';

describe('detect: merchant_missing', () => {
  it('triggers when matchType is not_found', () => {
    const r = detect('not_found', [4.0, 2.0]);
    expect(r.needsUpdate).toBe(true);
    expect(r.type).toBe('merchant_missing');
  });
});

describe('detect: merchant_ambiguous', () => {
  it('triggers when matchType is weak_fuzzy', () => {
    const r = detect('weak_fuzzy', [5.0, 2.0]);
    expect(r.needsUpdate).toBe(true);
    expect(r.type).toBe('merchant_ambiguous');
  });
});

describe('detect: card_ambiguous', () => {
  it('triggers when top-two rate gap < 0.5', () => {
    const r = detect('exact', [5.0, 4.7]);
    expect(r.needsUpdate).toBe(true);
    expect(r.type).toBe('card_ambiguous');
  });

  it('does not trigger when gap >= 0.5', () => {
    const r = detect('exact', [5.0, 4.4]);
    expect(r.needsUpdate).toBe(false);
    expect(r.type).toBe('');
  });
});

describe('detect: no update', () => {
  it('returns needsUpdate=false for a clean exact match with clear winner', () => {
    const r = detect('exact', [5.0, 2.0]);
    expect(r.needsUpdate).toBe(false);
    expect(r.type).toBe('');
  });
});
