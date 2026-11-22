// cards.js — the cards of Ember & Tide: suits, card definitions, decks, seeded shuffle.
// Every card is an original design. Suits are told apart by colour AND shape:
//   Ember  = red flame, Tide = blue droplet, Gale = green diamond, Stone = amber mountain.

export const SUITS = {
  ember: { name: 'Ember', color: '#e5484d', dark: '#7f1d1d', light: '#fecaca',
           glyph: 'M12 2c2 4 6 5 6 10a6 6 0 1 1-12 0c0-3 2-4 3-6 .5 1.5 1.5 2 2 2C10.5 5 11 3 12 2z',
           surge: 'Ember surge: +2 damage on every later Ember card this turn.' },
  tide:  { name: 'Tide', color: '#2f81f7', dark: '#123a6e', light: '#bfdbfe',
           glyph: 'M12 2s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11z',
           surge: 'Tide surge: heal 2 life on every later Tide card this turn.' },
  gale:  { name: 'Gale', color: '#2da44e', dark: '#14532d', light: '#bbf7d0',
           glyph: 'M12 2l8 10-8 10-8-10z',
           surge: 'Gale surge: draw 1 card on every later Gale card this turn.' },
  stone: { name: 'Stone', color: '#d29922', dark: '#713f12', light: '#fde68a',
           glyph: 'M2 20l6-12 4 7 3-5 7 10z',
           surge: 'Stone surge: +2 shield on every later Stone card this turn.' },
};

export const SUIT_ORDER = ['ember', 'tide', 'gale', 'stone'];

// kind: 'attack' (power = damage), 'guard' (power = shield gained),
// 'trick' (power = effect strength, trick names the effect).
export const CARD_DEFS = [
  // --- Ember attacks ---
  { name: 'Cinder Fang',  suit: 'ember', cost: 1, power: 2, kind: 'attack', copies: 2, text: 'Deal 2 damage.' },
  { name: 'Flame Lash',   suit: 'ember', cost: 2, power: 4, kind: 'attack', copies: 2, text: 'Deal 4 damage.' },
  { name: 'Inferno Roar', suit: 'ember', cost: 3, power: 6, kind: 'attack', copies: 1, text: 'Deal 6 damage.' },
  // --- Tide attacks ---
  { name: 'Tide Cut',  suit: 'tide', cost: 1, power: 2, kind: 'attack', copies: 2, text: 'Deal 2 damage.' },
  { name: 'Riptide',   suit: 'tide', cost: 2, power: 4, kind: 'attack', copies: 2, text: 'Deal 4 damage.' },
  { name: 'Drownmaw',  suit: 'tide', cost: 3, power: 6, kind: 'attack', copies: 1, text: 'Deal 6 damage.' },
  // --- Gale attacks ---
  { name: 'Thorn Dart',  suit: 'gale', cost: 1, power: 2, kind: 'attack', copies: 2, text: 'Deal 2 damage.' },
  { name: 'Gale Rush',   suit: 'gale', cost: 2, power: 4, kind: 'attack', copies: 2, text: 'Deal 4 damage.' },
  { name: 'Storm Talon', suit: 'gale', cost: 3, power: 6, kind: 'attack', copies: 1, text: 'Deal 6 damage.' },
  // --- Stone attacks ---
  { name: 'Pebble Shot',  suit: 'stone', cost: 1, power: 2, kind: 'attack', copies: 2, text: 'Deal 2 damage.' },
  { name: 'Boulder Slam', suit: 'stone', cost: 2, power: 4, kind: 'attack', copies: 2, text: 'Deal 4 damage.' },
  { name: 'Avalanche',    suit: 'stone', cost: 3, power: 6, kind: 'attack', copies: 1, text: 'Deal 6 damage.' },
  // --- Guards ---
  { name: 'Ember Aegis',   suit: 'ember', cost: 1, power: 3, kind: 'guard', copies: 2, text: 'Gain 3 shield.' },
  { name: 'Tidewall',      suit: 'tide',  cost: 2, power: 5, kind: 'guard', copies: 2, text: 'Gain 5 shield.' },
  { name: 'Stone Bulwark', suit: 'stone', cost: 2, power: 6, kind: 'guard', copies: 2, text: 'Gain 6 shield.' },
  // --- Tricks ---
  { name: 'Siphon Bloom', suit: 'gale',  cost: 2, power: 3, kind: 'trick', trick: 'siphon', copies: 2, text: 'Deal 3 damage and heal 3 life.' },
  { name: 'Quench',       suit: 'tide',  cost: 1, power: 0, kind: 'trick', trick: 'quench', copies: 1, text: 'Shatter all of the rival shield.' },
  { name: 'Kindle',       suit: 'ember', cost: 1, power: 0, kind: 'trick', trick: 'kindle', copies: 2, text: 'Draw 2 cards.' },
  { name: 'Mirror Ward',  suit: 'stone', cost: 2, power: 0, kind: 'trick', trick: 'ward',   copies: 2, text: 'Block the rival\'s next attack.' },
];

export const START_LIFE = 20;
export const START_HAND = 4;
export const DRAW_PER_TURN = 2;
export const MAX_HAND = 7;
export const ENERGY_PER_TURN = 3;
export const SURGE_BONUS = 2;

// mulberry32 — small deterministic RNG so ?shot= states and play-tests repeat.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeck(cards, rng) {
  const deck = cards.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

let nextCardId = 1;

export function buildDeck() {
  const deck = [];
  for (const def of CARD_DEFS) {
    for (let i = 0; i < def.copies; i++) {
      deck.push({ ...def, uid: nextCardId++ });
    }
  }
  return deck;
}

export function deckSize() {
  return CARD_DEFS.reduce((n, d) => n + d.copies, 0);
}

export function describeCard(card) {
  const suit = SUITS[card.suit];
  if (card.kind === 'attack') return `${card.name} — ${suit.name} attack, ${card.power} damage, costs ${card.cost} energy.`;
  if (card.kind === 'guard') return `${card.name} — ${suit.name} guard, +${card.power} shield, costs ${card.cost} energy.`;
  return `${card.name} — ${suit.name} trick, costs ${card.cost} energy. ${card.text}`;
}
