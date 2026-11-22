// game.js — Ember & Tide: state machine, turns, input, win/loss.
// The duel: you and Vex each hold 20 life. Play cards with energy (3 a turn),
// chain two cards of one suit for a Surge (+2), and read Vex's intent before
// she acts — Ward blocks her next attack, Quench shatters her shield.

import {
  SUITS, START_LIFE, START_HAND, DRAW_PER_TURN, MAX_HAND,
  ENERGY_PER_TURN, SURGE_BONUS, makeRng, shuffleDeck, buildDeck,
} from './cards.js';
import { chooseRivalPlays, rivalIntent } from './ai.js';
import {
  soundClick, soundDeal, soundPlayCard, soundHit, soundGuard,
  soundHeal, soundSurge, soundError, soundTurn, soundWin, soundLose,
  toggleMute, isMuted,
} from './audio.js';
import {
  cardElement, renderHand, renderLife, renderEnergy,
  showLog, showBanner, flyCardToTable, launchConfetti, suitGlyph,
} from './render.js';
import { applyShotState } from './shots.js';

const $ = (id) => document.getElementById(id);
const els = {};
[
  'screen-title', 'screen-game', 'screen-end', 'title-cards', 'btn-start',
  'btn-how', 'how-panel', 'rival-hand', 'rival-life', 'rival-intent',
  'player-hand', 'player-life', 'player-energy', 'table-played',
  'turn-label', 'log', 'banner', 'btn-end-turn', 'btn-mute', 'btn-restart',
  'end-title', 'end-sub', 'end-stats', 'btn-again', 'confetti', 'deck-count',
  'rival-deck-count', 'round-label',
].forEach((id) => { els[id] = $(id); });

export const state = {
  phase: 'title', // title | player | ai | won | lost
  seed: 20261123,
  rng: makeRng(20261123),
  turn: 1,
  energy: ENERGY_PER_TURN,
  selectedUid: null,
  suitsPlayed: new Set(),
  you: null,
  vex: null,
  muted: false,
};

function freshDuelist(deck) {
  return { life: START_LIFE, shield: 0, ward: false, deck, hand: [], discard: [] };
}

function drawCards(who, n) {
  for (let i = 0; i < n; i++) {
    if (!who.deck.length) {
      who.deck = shuffleDeck(who.discard, state.rng);
      who.discard = [];
      if (!who.deck.length) return;
    }
    if (who.hand.length >= MAX_HAND) return;
    who.hand.push(who.deck.shift());
  }
}

export function newGame(seed = 20261123) {
  state.seed = seed;
  state.rng = makeRng(seed);
  state.turn = 1;
  state.energy = ENERGY_PER_TURN;
  state.selectedUid = null;
  state.suitsPlayed = new Set();
  state.phase = 'player';
  state.you = freshDuelist(shuffleDeck(buildDeck(), state.rng));
  state.vex = freshDuelist(shuffleDeck(buildDeck(), state.rng));
  drawCards(state.you, START_HAND);
  drawCards(state.vex, START_HAND);
  els['log'].innerHTML = '';
  els['rival-intent'].classList.remove('show');
  els['table-played'].innerHTML = '<div class="table-hint">Your move — play a card, then end the turn.</div>';
  showLog(els.log, 'The duel begins. You hold the first turn — spend 3 energy wisely.');
  soundDeal();
  renderAll();
  updateTurnLabel();
}

function surgeBonusFor(card) {
  return state.suitsPlayed.has(card.suit) ? SURGE_BONUS : 0;
}

function applyCardEffects(card, me, foe, surge) {
  const suit = SUITS[card.suit];
  let note = '';
  if (card.kind === 'attack') {
    let dmg = card.power + surge;
    if (foe.ward && card.kind === 'attack') {
      foe.ward = false;
      showBanner(els.banner, 'MIRROR WARD — the attack shatters on the ward!', 'ward');
      showLog(els.log, `${card.name} was blocked by Mirror Ward.`);
      soundGuard();
      return 'blocked';
    }
    const absorbed = Math.min(foe.shield, dmg);
    foe.shield -= absorbed;
    foe.life = Math.max(0, foe.life - (dmg - absorbed));
    note = `${card.name} hits for ${dmg}${absorbed ? ` (${absorbed} soaked by shield)` : ''}.`;
    soundHit();
  } else if (card.kind === 'guard') {
    me.shield += card.power + surge;
    note = `${card.name}: +${card.power + surge} shield.`;
    soundGuard();
  } else if (card.trick === 'siphon') {
    let dmg = card.power + surge;
    const absorbed = Math.min(foe.shield, dmg);
    foe.shield -= absorbed;
    foe.life = Math.max(0, foe.life - (dmg - absorbed));
    me.life = Math.min(START_LIFE, me.life + card.power + surge);
    note = `Siphon Bloom drains ${dmg} and heals ${card.power + surge}.`;
    soundHeal();
  } else if (card.trick === 'quench') {
    foe.shield = 0;
    note = 'Quench shatters all of the rival shield!';
    soundHit();
  } else if (card.trick === 'kindle') {
    drawCards(me, 2);
    note = 'Kindle draws 2 cards.';
    soundDeal();
  } else if (card.trick === 'ward') {
    me.ward = true;
    note = 'Mirror Ward raised — the next attack is blocked.';
    soundGuard();
  }
  // Same-suit surge side effects (Tide heals, Gale draws, Stone shields).
  if (surge > 0) {
    if (card.suit === 'tide') { me.life = Math.min(START_LIFE, me.life + 2); note += ' Tide surge heals 2.'; }
    if (card.suit === 'gale') { drawCards(me, 1); note += ' Gale surge draws 1.'; }
    if (card.suit === 'stone' && card.kind !== 'guard') { me.shield += 2; note += ' Stone surge adds 2 shield.'; }
    if (card.suit === 'ember' && card.kind !== 'attack') note += ' Ember surge crackles.';
    soundSurge();
  }
  showLog(els.log, note);
  return 'played';
}

function checkEnd() {
  if (state.vex.life <= 0) { endGame(true); return true; }
  if (state.you.life <= 0) { endGame(false); return true; }
  return false;
}

export function playCard(card, byRival = false) {
  if (state.phase !== 'player' && !byRival) return false;
  const me = byRival ? state.vex : state.you;
  const foe = byRival ? state.you : state.vex;
  const idx = me.hand.findIndex((c) => c.uid === card.uid);
  if (idx < 0) return false;
  if (!byRival && card.cost > state.energy) {
    soundError();
    showBanner(els.banner, `Not enough energy — ${card.name} costs ${card.cost}.`, 'error');
    return false;
  }
  const surge = byRival ? 0 : surgeBonusFor(card);
  if (!byRival) {
    state.energy -= card.cost;
    state.selectedUid = null;
  }
  const fromEl = document.querySelector(`.card[data-uid="${card.uid}"]`);
  me.hand.splice(idx, 1);
  me.discard.push(card);
  if (!byRival) state.suitsPlayed.add(card.suit);
  flyCardToTable(card, fromEl, els['table-played']);
  const playedEl = cardElement(card, { surge: surge > 0 });
  playedEl.classList.add('played-card');
  els['table-played'].innerHTML = '';
  els['table-played'].appendChild(playedEl);
  if (surge > 0) showBanner(els.banner, `SURGE! ${SUITS[card.suit].name} strikes twice — +${surge} power.`, 'surge');
  soundPlayCard();
  applyCardEffects(card, me, foe, surge);
  renderAll();
  return !checkEnd();
}

export function endPlayerTurn() {
  if (state.phase !== 'player') return;
  state.phase = 'ai';
  state.selectedUid = null;
  renderAll();
  updateTurnLabel();
  const intent = rivalIntent(state.vex.hand, ENERGY_PER_TURN, state.vex, state.you);
  const icon = { sword: '⚔️', shield: '🛡️', skull: '💀', spark: '✦', hourglass: '⏳' }[intent.icon] || '✦';
  els['rival-intent'].innerHTML = `<span class="intent-icon">${icon}</span> VEX PLANS: ${intent.label.toUpperCase()}`;
  els['rival-intent'].classList.add('show');
  showLog(els.log, `Vex plans: ${intent.label}.`);
  setTimeout(() => runRivalTurn(intent.plays), 1400);
}

function runRivalTurn(plays) {
  if (state.phase !== 'ai') return;
  const byUid = new Map(state.vex.hand.map((c) => [c.uid, c]));
  let step = 0;
  const stepFn = () => {
    if (state.phase !== 'ai') return;
    if (step >= plays.length) {
      els['rival-intent'].classList.remove('show');
      startPlayerTurn();
      return;
    }
    const card = byUid.get(plays[step]);
    step++;
    if (card) playCard(card, true);
    setTimeout(stepFn, 750);
  };
  stepFn();
}

function startPlayerTurn() {
  state.turn++;
  state.phase = 'player';
  state.energy = ENERGY_PER_TURN;
  state.suitsPlayed = new Set();
  drawCards(state.you, DRAW_PER_TURN);
  drawCards(state.vex, DRAW_PER_TURN);
  els['table-played'].innerHTML = '<div class="table-hint">Your move — play a card, then end the turn.</div>';
  soundTurn();
  showLog(els.log, `Turn ${state.turn}: you draw ${DRAW_PER_TURN} and regain ${ENERGY_PER_TURN} energy.`);
  renderAll();
  updateTurnLabel();
}

function updateTurnLabel() {
  const labels = {
    title: 'TITLE',
    player: `YOUR TURN — TURN ${state.turn}`,
    ai: `VEX IS PLAYING — TURN ${state.turn}`,
    won: 'VICTORY',
    lost: 'DEFEAT',
  };
  els['turn-label'].textContent = labels[state.phase] || '';
  els['round-label'].textContent = `Round ${state.turn} · first to 0 life loses`;
}

function endGame(won) {
  state.phase = won ? 'won' : 'lost';
  els['screen-game'].classList.add('hidden');
  els['screen-end'].classList.remove('hidden');
  els['end-title'].textContent = won ? '👑 YOU WIN THE DUEL!' : '💀 VEX TAKES THE DUEL';
  els['end-title'].className = won ? 'end-title win' : 'end-title lose';
  els['end-sub'].textContent = won
    ? 'The Tidecaller bows. Ember and Tide are yours — a flawless flourish to end it.'
    : 'The Tidecaller keeps her crown this time. Study her intent, chain your surges, and challenge her again.';
  els['end-stats'].innerHTML =
    `<div>Turns played: <b>${state.turn}</b></div>` +
    `<div>Your life: <b>${state.you.life}</b> · Vex's life: <b>${state.vex.life}</b></div>` +
    `<div>Cards played: <b>${state.you.discard.length + state.vex.discard.length}</b></div>`;
  if (won) { launchConfetti(els.confetti); soundWin(); }
  else soundLose();
  updateTurnLabel();
}

export function renderAll() {
  renderLife(els['player-life'], state.you.life, state.you.shield, 'YOU');
  renderLife(els['rival-life'], state.vex.life, state.vex.shield, 'VEX · THE TIDECALLER');
  renderEnergy(els['player-energy'], state.energy);
  els['deck-count'].textContent = `Deck ${state.you.deck.length}`;
  els['rival-deck-count'].textContent = `Deck ${state.vex.deck.length}`;
  renderHand(els['player-hand'], state.you.hand, {
    selectedUid: state.selectedUid,
    onCardClick: (card) => {
      if (state.phase !== 'player') return;
      if (state.selectedUid === card.uid) { playCard(card); return; }
      state.selectedUid = card.uid;
      soundClick();
      renderAll();
    },
  });
  renderHand(els['rival-hand'], state.vex.hand, { faceDown: true });
  els['btn-end-turn'].disabled = state.phase !== 'player';
}

// --- Title screen: a fanned sample hand over the table, behind the title. ---
function renderTitlePreview() {
  const rng = makeRng(7);
  const sample = shuffleDeck(buildDeck(), rng).slice(0, 5);
  els['title-cards'].innerHTML = '';
  sample.forEach((card, i) => {
    const el = cardElement(card);
    el.style.setProperty('--fan-x', `${(i - 2) * 120}px`);
    el.style.setProperty('--fan-rot', `${(i - 2) * 5}deg`);
    el.style.setProperty('--fan-y', `${Math.abs(i - 2) * -6}px`);
    el.classList.add('dealt');
    els['title-cards'].appendChild(el);
  });
}

// --- Keyboard: arrows pick a card, Enter plays it, E ends the turn. ---
function onKey(e) {
  if (state.phase === 'title') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startFromTitle(); }
    return;
  }
  if (state.phase === 'won' || state.phase === 'lost') {
    if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') restart();
    return;
  }
  if (state.phase !== 'player') return;
  const hand = state.you.hand;
  if (!hand.length) return;
  const idx = hand.findIndex((c) => c.uid === state.selectedUid);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = idx < 0 ? (dir > 0 ? 0 : hand.length - 1) : (idx + dir + hand.length) % hand.length;
    state.selectedUid = hand[next].uid;
    soundClick();
    renderAll();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const card = hand.find((c) => c.uid === state.selectedUid) || hand[0];
    playCard(card);
  } else if (e.key === 'e' || e.key === 'E') {
    endPlayerTurn();
  }
}

function startFromTitle() {
  soundClick();
  els['screen-title'].classList.add('hidden');
  els['screen-game'].classList.remove('hidden');
  newGame(state.seed);
}

function restart() {
  els['screen-end'].classList.add('hidden');
  els['screen-game'].classList.remove('hidden');
  newGame((state.seed + 1) >>> 0);
}

function init() {
  renderTitlePreview();
  els['btn-start'].addEventListener('click', startFromTitle);
  els['btn-how'].addEventListener('click', () => {
    els['how-panel'].classList.toggle('open');
    soundClick();
  });
  els['btn-end-turn'].addEventListener('click', endPlayerTurn);
  els['btn-restart'].addEventListener('click', () => {
    if (state.phase === 'player' || state.phase === 'ai') { newGame((state.seed + 1) >>> 0); }
  });
  els['btn-again'].addEventListener('click', restart);
  els['btn-mute'].addEventListener('click', () => {
    const m = toggleMute();
    els['btn-mute'].textContent = m ? '🔇 Muted' : '🔊 Sound';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      const m = toggleMute();
      els['btn-mute'].textContent = m ? '🔇 Muted' : '🔊 Sound';
      return;
    }
    onKey(e);
  });
  // Deterministic screenshot states (?shot=title|mid|win|loss) — real renders
  // of this game's own code, driven by the same state machine as play.
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || 20261123);
  if (shot) {
    state.seed = seed;
    els['screen-title'].classList.add('hidden');
    els['screen-game'].classList.remove('hidden');
    if (shot === 'title') {
      els['screen-game'].classList.add('hidden');
      els['screen-title'].classList.remove('hidden');
    } else {
      applyShotState(shot, seed);
    }
  }
  // Test/debug hook used by play-tests (never by the game itself).
  window.__emberTide = { state, newGame, playCard, endPlayerTurn, startFromTitle, restart };
}

init();
