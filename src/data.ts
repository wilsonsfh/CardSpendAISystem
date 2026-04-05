export interface CardRule {
  category: string;
  reward_rate: number;
}

export interface Card {
  card_id: string;
  card_name: string;
  earn_rules: CardRule[];
}

export interface Merchant {
  merchant_name: string;
  normalized_name: string;
  category: string;
}

export const cards: Card[] = [
  {
    card_id: "card_1",
    card_name: "Max Travel Visa",
    earn_rules: [
      { category: "airlines", reward_rate: 4.0 },
      { category: "hotels", reward_rate: 4.0 },
      { category: "dining", reward_rate: 2.0 },
      { category: "general", reward_rate: 1.2 }
    ]
  },
  {
    card_id: "card_2",
    card_name: "Max Cashback+",
    earn_rules: [
      { category: "dining", reward_rate: 5.0 },
      { category: "groceries", reward_rate: 4.0 },
      { category: "online_shopping", reward_rate: 3.0 },
      { category: "general", reward_rate: 1.0 }
    ]
  },
  {
    card_id: "card_3",
    card_name: "Max Everyday Mastercard",
    earn_rules: [
      { category: "transport", reward_rate: 3.0 },
      { category: "groceries", reward_rate: 2.0 },
      { category: "general", reward_rate: 1.5 }
    ]
  },
  {
    card_id: "card_4",
    card_name: "Max Online Rewards",
    earn_rules: [
      { category: "online_shopping", reward_rate: 6.0 },
      { category: "travel_portal", reward_rate: 5.0 },
      { category: "general", reward_rate: 0.8 }
    ]
  }
];

export const merchants: Merchant[] = [
  { merchant_name: "Amazon", normalized_name: "amazon", category: "online_shopping" },
  { merchant_name: "Shopee", normalized_name: "shopee", category: "online_shopping" },
  { merchant_name: "NTUC FairPrice", normalized_name: "ntuc fairprice", category: "groceries" },
  { merchant_name: "Starbucks", normalized_name: "starbucks", category: "dining" },
  { merchant_name: "Singapore Airlines", normalized_name: "singapore airlines", category: "airlines" },
  { merchant_name: "Grab", normalized_name: "grab", category: "transport" },
  { merchant_name: "Agoda", normalized_name: "agoda", category: "hotels" }
];

/** Union of all categories present in card rules and merchant data — single source of truth. */
export const KNOWN_CATEGORIES: ReadonlySet<string> = new Set([
  ...merchants.map(m => m.category),
  ...cards.flatMap(c => c.earn_rules.map(r => r.category)),
]);

export const queries = [
  { merchant: "Starbucks",      amount: 12.5,  user_cards: ["Max Cashback+", "Max Travel Visa"] },
  { merchant: "Amazon SG",      amount: 84.2,  user_cards: ["Max Online Rewards", "Max Everyday Mastercard"] },
  { merchant: "Don Don Donki",  amount: 45.0,  user_cards: ["Max Cashback+", "Max Everyday Mastercard"] },
  { merchant: "Agoda",          amount: 220.0, user_cards: ["Max Travel Visa", "Max Cashback+"] },
];
