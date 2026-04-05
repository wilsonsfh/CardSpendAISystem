/**
 * Event Logger — lightweight feedback loop for improving the recommendation system.
 *
 * Every recommendation is logged as a SpendEvent. Events where updateNeeded=true
 * form the "update queue": a prioritised list of merchant/card gaps that the
 * product team should act on.
 */

import type { ReasoningMode } from '../recommend';

export interface SpendEvent {
  readonly id: string;
  readonly ts: string;
  readonly merchant: string;
  readonly matchedMerchant?: string;  // populated for merchant_ambiguous — what the fuzzy match resolved to
  readonly amount: number;
  readonly userCards: string[];
  readonly recommendedCard: string | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reasoningMode: ReasoningMode;
  readonly rewardRate: number;
  readonly estimatedReward: number;
  readonly updateNeeded: boolean;
  readonly updateType: string;
  readonly updateReason: string;
}

const STORAGE_KEY = 'cardspendai_event_log';
const MAX_EVENTS  = 500;

function readLog(): SpendEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpendEvent[]) : [];
  } catch {
    return [];
  }
}

function writeLog(events: SpendEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // localStorage full or unavailable — silently degrade
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function logEvent(event: Omit<SpendEvent, 'id' | 'ts'>): SpendEvent {
  const full: SpendEvent = { ...event, id: generateId(), ts: new Date().toISOString() };
  const trimmed = [full, ...readLog()].slice(0, MAX_EVENTS);
  writeLog(trimmed);
  return full;
}

export function getEventLog(): SpendEvent[] { return readLog(); }

export function getUpdateQueue(): SpendEvent[] { return readLog().filter(e => e.updateNeeded); }

export function getUpdateQueueCount(): number { return getUpdateQueue().length; }

export function clearEventLog(): void { writeLog([]); }
