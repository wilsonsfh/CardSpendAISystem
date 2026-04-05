/**
 * LLM Suggester — Groq-powered merchant category suggestions.
 *
 * Called automatically when the rule-based engine returns missing_data.
 * The API key is held server-side in vite.config.ts — never sent to the browser.
 *
 * Receives rich context (category descriptions + card rules) so the model
 * can map any real-world merchant to a category the engine can score.
 */

import type { Card } from '../data'

const PROXY_URL = '/api/llm-suggest'
const MODEL     = 'llama-3.1-8b-instant'

/** Human-readable descriptions for each reward category. */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  dining:          'restaurants, cafes, coffee shops, food courts, hawker centres, fast food, food delivery',
  groceries:       'supermarkets, grocery stores, wet markets, bulk food retail',
  online_shopping: 'e-commerce platforms, online retail, digital storefronts',
  airlines:        'commercial flights, airline tickets, in-flight purchases',
  hotels:          'hotels, serviced apartments, resorts, lodging and accommodation',
  transport:       'ride-hailing (Grab, Gojek), taxis, MRT, bus, EZ-Link top-ups',
  travel_portal:   'travel booking platforms (Agoda, Booking.com, Expedia), holiday packages',
  general:         'all other spending not covered by specific categories',
}

export interface LLMSuggestion {
  readonly category: string
  readonly confidence: number   // 0–100
  readonly reasoning: string
  readonly source: 'llm' | 'error'
}

/** Build context string from live card data so the model knows what categories matter. */
const buildCardContext = (cards: Card[]): string =>
  cards.map(c => {
    const rules = c.earn_rules
      .filter(r => r.category !== 'general')
      .map(r => `${r.category} (${r.reward_rate}%)`)
      .join(', ')
    return `  - ${c.card_name}: ${rules}`
  }).join('\n')

export const buildPrompt = (merchantName: string, cards: Card[], knownCategories: readonly string[]): string => {
  const categoryList = knownCategories
    .filter(c => c !== 'general')
    .map(c => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c] ?? c}`)
    .join('\n')

  const cardContext = buildCardContext(cards)

  return `You are a merchant categorization engine for a Singapore credit card rewards system.

Your job: given a merchant name, return the single best reward category from the list below.

## Available categories
${categoryList}

## Card reward rules (for context — these are the categories the system can score)
${cardContext}

## Merchant to categorize
"${merchantName}"

Think about what type of business this merchant is. Match it to the most specific category above.
If it sells groceries or operates as a supermarket, use "groceries".
If it is a cafe or restaurant, use "dining".

Respond with JSON only — no markdown, no extra text:
{"category": "<exact category name from the list>", "confidence": <0-100>, "reasoning": "<one sentence explaining why>"}`
}

export const suggestCategory = async (
  merchantName: string,
  cards: Card[],
  knownCategories: readonly string[],
): Promise<LLMSuggestion> => {
  const prompt = buildPrompt(merchantName, cards, knownCategories)

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 150,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      return { category: '', confidence: 0, reasoning: `Proxy error: ${err.error ?? res.status}`, source: 'error' }
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as { category: string; confidence: number; reasoning: string }
    const validCategory = knownCategories.includes(parsed.category) ? parsed.category : ''

    return {
      category: validCategory,
      confidence: Math.min(100, Math.max(0, parsed.confidence ?? 0)),
      reasoning: parsed.reasoning ?? '',
      source: 'llm',
    }
  } catch (err) {
    const msg = err instanceof SyntaxError ? 'LLM returned non-JSON response' : String(err)
    return { category: '', confidence: 0, reasoning: msg, source: 'error' }
  }
}
