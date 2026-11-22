// shots.js — deterministic states for screenshots (?shot=mid|win|loss).
// Each one is the real game state machine with fixed cards and totals, so the
// screenshots are true renders of this game's own code, not mock-ups.

import { makeRng, shuffleDeck, buildDeck } from './cards.js';
import { state, newGame, renderAll } from './game.js';
import { cardElement, showLog, launchConfetti } from './render.js';

function forceHand(who, names, rng) {
  // Build a hand from named cards, drawn from a fresh shuffled deck so the
  // uids and copies are real cards, not invented ones.
  const pool = shuffleDeck(buildDeck(), rng);
  const hand = [];
  for (const name of names) {
    const i = pool.findIndex((c) => c.name === name);
    if (i >= 0) hand.push(pool.splice(i, 1)[0]);
  }
  who.hand = hand;
}

// Mid-game: turn 5, both hands full, shields up, a played card on the table,
// both life totals visible — the table at its busiest.
export function applyShotState(shot, seed) {
  const rng = makeRng(seed || 7);
  newGame(seed || 7);
  if (shot === 'mid') {
    state.turn = 5;
    state.phase = 'player';
    state.energy = 3;
    state.you.life = 14;
    state.you.shield = 3;
    state.vex.life = 17;
    state.vex.shield = 5;
    forceHand(state.you,
      ['Flame Lash', 'Tidewall', 'Siphon Bloom', 'Kindle', 'Avalanche'], rng);
    forceHand(state.vex,
      ['Riptide', 'Ember Aegis', 'Storm Talon', 'Mirror Ward', 'Tide Cut'], rng);
    // A card just played sits on the table, face up.
    const played = state.you.hand.find((c) => c.name === 'Flame Lash');
    if (played) {
      state.you.hand.splice(state.you.hand.indexOf(played), 1);
      state.you.discard.push(played);
      const table = document.getElementById('table-played');
      table.innerHTML = '';
      const el = cardElement(played, { surge: true });
      el.classList.add('played-card');
      table.appendChild(el);
    }
    showLog(document.getElementById('log'), 'Turn 5: Vex raised 5 shield — Quench would shatter it.');
    showLog(document.getElementById('log'), 'You played Flame Lash for 4 damage. SURGE +2!');
    renderAll();
    document.getElementById('turn-label').textContent = 'YOUR TURN — TURN 5';
    document.getElementById('round-label').textContent = 'Round 5 · first to 0 life loses';
    return;
  }
  if (shot === 'win') {
    state.vex.life = 0;
    state.you.life = 9;
    state.phase = 'won';
    document.getElementById('screen-game').classList.add('hidden');
    const end = document.getElementById('screen-end');
    end.classList.remove('hidden');
    document.getElementById('end-title').textContent = '👑 YOU WIN THE DUEL!';
    document.getElementById('end-title').className = 'end-title win';
    document.getElementById('end-sub').textContent =
      'The Tidecaller bows. Ember and Tide are yours — a flawless flourish to end it.';
    document.getElementById('end-stats').innerHTML =
      '<div>Turns played: <b>8</b></div><div>Your life: <b>9</b> · Vex\'s life: <b>0</b></div><div>Cards played: <b>17</b></div>';
    launchConfetti(document.getElementById('confetti'));
    return;
  }
  if (shot === 'loss') {
    state.you.life = 0;
    state.vex.life = 11;
    state.phase = 'lost';
    document.getElementById('screen-game').classList.add('hidden');
    const end = document.getElementById('screen-end');
    end.classList.remove('hidden');
    document.getElementById('end-title').textContent = '💀 VEX TAKES THE DUEL';
    document.getElementById('end-title').className = 'end-title lose';
    document.getElementById('end-sub').textContent =
      'The Tidecaller keeps her crown this time. Study her intent, chain your surges, and challenge her again.';
    document.getElementById('end-stats').innerHTML =
      '<div>Turns played: <b>9</b></div><div>Your life: <b>0</b> · Vex\'s life: <b>11</b></div><div>Cards played: <b>19</b></div>';
  }
}
