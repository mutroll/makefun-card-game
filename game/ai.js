// ai.js — Vex, the Tidecaller: the rival's brain.
// Vex plays by readable rules, and announces an intent before acting, so the
// player can read the plan and counter it (Ward blocks the attack, Quench
// strips the shield, guards soak the damage).

import { SURGE_BONUS } from './cards.js';

// How much damage a hand can deal right now, counting a same-suit surge.
export function handDamage(hand, energy) {
  let damage = 0;
  let left = energy;
  const seen = new Set();
  const attacks = hand
    .filter((c) => c.kind === 'attack' || (c.kind === 'trick' && c.trick === 'siphon'))
    .sort((a, b) => (b.power / b.cost) - (a.power / a.cost));
  for (const card of attacks) {
    if (card.cost > left) continue;
    left -= card.cost;
    let power = card.power;
    if (seen.has(card.suit)) power += SURGE_BONUS;
    seen.add(card.suit);
    damage += power;
  }
  return damage;
}

// Pick the rival's whole turn: a list of card uids to play, in order.
// Greedy but legible: lethal first, then Quench vs a big shield, then guards
// when hurt, then the best damage per energy, then tricks that help.
export function chooseRivalPlays(hand, energy, self, foe) {
  const plays = [];
  let left = energy;
  const remaining = hand.slice();
  const seenSuits = new Set();

  const take = (card) => {
    plays.push(card.uid);
    left -= card.cost;
    remaining.splice(remaining.indexOf(card), 1);
    seenSuits.add(card.suit);
  };
  const affordable = (list) => list.filter((c) => c.cost <= left);

  // 1. Lethal: any attack sequence that ends the player this turn.
  const lethal = affordable(remaining.filter((c) => c.kind === 'attack'))
    .sort((a, b) => b.power - a.power);
  let testLeft = left;
  let testDamage = 0;
  const testSeen = new Set();
  for (const card of lethal) {
    if (card.cost > testLeft) continue;
    testLeft -= card.cost;
    let power = card.power + (testSeen.has(card.suit) ? SURGE_BONUS : 0);
    testSeen.add(card.suit);
    testDamage += power;
  }
  if (testDamage >= foe.life + foe.shield && testDamage > 0) {
    for (const card of lethal) {
      if (card.cost <= left) take(card);
    }
    return plays;
  }

  // 2. Quench a shield worth breaking.
  const quench = affordable(remaining.filter((c) => c.kind === 'trick' && c.trick === 'quench'));
  if (quench.length && foe.shield >= 5) take(quench[0]);

  // 3. Guard when hurt and the player can hit hard next.
  if (self.life <= 9) {
    const guards = affordable(remaining.filter((c) => c.kind === 'guard'))
      .sort((a, b) => b.power - a.power);
    if (guards.length) take(guards[0]);
  }

  // 4. Best damage per energy, biggest first.
  const attacks = affordable(remaining.filter((c) => c.kind === 'attack'))
    .sort((a, b) => (b.power / b.cost) - (a.power / a.cost));
  for (const card of attacks) {
    if (card.cost <= left) take(card);
  }

  // 5. Siphon when it heals a wound, Kindle when the hand is thin.
  const siphon = affordable(remaining.filter((c) => c.kind === 'trick' && c.trick === 'siphon'));
  if (siphon.length && self.life <= 14) take(siphon[0]);
  const kindle = affordable(remaining.filter((c) => c.kind === 'trick' && c.trick === 'kindle'));
  if (kindle.length && remaining.length <= 3) take(kindle[0]);

  // 6. A spare guard is better than idle energy.
  const spareGuard = affordable(remaining.filter((c) => c.kind === 'guard'))
    .sort((a, b) => b.power - a.power);
  if (spareGuard.length && left >= spareGuard[0].cost) take(spareGuard[0]);

  return plays;
}

// The intent Vex shows before acting: what the player can read and counter.
export function rivalIntent(hand, energy, self, foe) {
  const plays = chooseRivalPlays(hand, energy, self, foe);
  if (!plays.length) return { label: 'gathering strength', icon: 'hourglass', damage: 0, plays };
  const byUid = new Map(hand.map((c) => [c.uid, c]));
  const played = plays.map((uid) => byUid.get(uid));
  const damage = played.reduce((n, c) => {
    if (c.kind === 'attack') return n + c.power;
    if (c.kind === 'trick' && c.trick === 'siphon') return n + c.power;
    return n;
  }, 0);
  if (damage >= foe.life + foe.shield) return { label: `going for the kill — ${damage} damage`, icon: 'skull', damage, plays };
  if (damage > 0) return { label: `attacking for ${damage} damage`, icon: 'sword', damage, plays };
  if (played.some((c) => c.kind === 'guard')) return { label: 'raising a guard', icon: 'shield', damage: 0, plays };
  return { label: 'playing a trick', icon: 'spark', damage: 0, plays };
}
