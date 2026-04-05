/**
 * @vitest-environment jsdom
 *
 * Requires jsdom because logEvent/getEventLog use localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  logEvent,
  getEventLog,
  getUpdateQueue,
  getUpdateQueueCount,
  clearEventLog,
} from '../eventLogger';
import type { SpendEvent } from '../eventLogger';

const BASE_EVENT: Omit<SpendEvent, 'id' | 'ts'> = {
  merchant: 'Starbucks',
  amount: 12.5,
  userCards: ['Max Cashback+'],
  recommendedCard: 'Max Cashback+',
  confidence: 'high',
  reasoningMode: 'deterministic',
  rewardRate: 5.0,
  estimatedReward: 0.63,
  updateNeeded: false,
  updateType: '',
  updateReason: '',
};

const UPDATE_EVENT: Omit<SpendEvent, 'id' | 'ts'> = {
  merchant: 'Don Don Donki',
  amount: 45.0,
  userCards: ['Max Cashback+'],
  recommendedCard: 'Max Cashback+',
  confidence: 'low',
  reasoningMode: 'missing_data',
  rewardRate: 4.0,
  estimatedReward: 1.8,
  updateNeeded: true,
  updateType: 'merchant_missing',
  updateReason: 'Merchant not found in known merchant database.',
};

beforeEach(() => clearEventLog());

// ---------------------------------------------------------------------------
// logEvent
// ---------------------------------------------------------------------------

describe('logEvent', () => {
  it('returns the event with id and ts added', () => {
    const result = logEvent(BASE_EVENT);
    expect(result.id).toBeTruthy();
    expect(result.ts).toBeTruthy();
    expect(new Date(result.ts).getTime()).not.toBeNaN();
  });

  it('persists to localStorage', () => {
    logEvent(BASE_EVENT);
    expect(getEventLog().length).toBe(1);
  });

  it('prepends newest event first', () => {
    logEvent({ ...BASE_EVENT, merchant: 'first' });
    logEvent({ ...BASE_EVENT, merchant: 'second' });
    const log = getEventLog();
    expect(log[0].merchant).toBe('second');
    expect(log[1].merchant).toBe('first');
  });

  it('caps log at MAX_EVENTS (500)', () => {
    for (let i = 0; i < 502; i++) {
      logEvent({ ...BASE_EVENT, merchant: `Merchant${i}` });
    }
    expect(getEventLog().length).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// getUpdateQueue
// ---------------------------------------------------------------------------

describe('getUpdateQueue', () => {
  it('returns only events where updateNeeded is true', () => {
    logEvent(BASE_EVENT);        // updateNeeded: false
    logEvent(UPDATE_EVENT);      // updateNeeded: true
    logEvent(BASE_EVENT);        // updateNeeded: false
    expect(getUpdateQueue().length).toBe(1);
    expect(getUpdateQueue()[0].merchant).toBe('Don Don Donki');
  });

  it('returns empty array when no updates needed', () => {
    logEvent(BASE_EVENT);
    logEvent(BASE_EVENT);
    expect(getUpdateQueue()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getUpdateQueueCount
// ---------------------------------------------------------------------------

describe('getUpdateQueueCount', () => {
  it('returns 0 when no events logged', () => {
    expect(getUpdateQueueCount()).toBe(0);
  });

  it('counts only updateNeeded events', () => {
    logEvent(BASE_EVENT);
    logEvent(UPDATE_EVENT);
    logEvent(UPDATE_EVENT);
    expect(getUpdateQueueCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// clearEventLog
// ---------------------------------------------------------------------------

describe('clearEventLog', () => {
  it('wipes all events', () => {
    logEvent(BASE_EVENT);
    logEvent(UPDATE_EVENT);
    clearEventLog();
    expect(getEventLog()).toHaveLength(0);
    expect(getUpdateQueueCount()).toBe(0);
  });
});
