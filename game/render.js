// render.js — everything the player sees: the table, the hands, the cards,
// the life totals, the intent banner, and the animations (slide, flip, snap,
// win flourish). Cards are DOM, so they stay crisp and legible at any size.

import { SUITS } from './cards.js';

export function suitGlyph(suit, size = 44) {
  const s = SUITS[suit];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="${s.name}">
    <path d="${s.glyph}" fill="${s.color}" stroke="${s.dark}" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;
}

function powerLabel(card) {
  if (card.kind === 'attack') return { big: String(card.power), small: 'DMG' };
  if (card.kind === 'guard') return { big: `+${card.power}`, small: 'SHIELD' };
  if (card.trick === 'siphon') return { big: String(card.power), small: 'DRAIN' };
  return { big: '✦', small: 'TRICK' };
}

// Build one card element. `faceDown` renders the rival's hidden card back.
export function cardElement(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (opts.faceDown ? ' face-down' : '') + (opts.selected ? ' selected' : '');
  el.dataset.uid = String(card.uid);
  if (opts.faceDown) {
    el.innerHTML = `<div class="card-back"><div class="card-back-mark">E&amp;T</div></div>`;
    return el;
  }
  const suit = SUITS[card.suit];
  const power = powerLabel(card);
  el.style.setProperty('--suit', suit.color);
  el.style.setProperty('--suit-dark', suit.dark);
  el.style.setProperty('--suit-light', suit.light);
  el.innerHTML = `
    <div class="card-cost" title="Energy cost">${card.cost}</div>
    <div class="card-suit-top">${suitGlyph(card.suit, 24)}<span>${suit.name}</span></div>
    <div class="card-glyph">${suitGlyph(card.suit, 44)}</div>
    <div class="card-power"><span class="power-num">${power.big}</span><span class="power-word">${power.small}</span></div>
    <div class="card-name">${card.name}</div>
    <div class="card-text">${card.text}</div>
    ${opts.surge ? '<div class="card-surge">SURGE +2</div>' : ''}`;
  return el;
}

// Fan a hand of cards across its row: slight rotation + overlap, and a
// raised, snapped position for the selected card.
export function renderHand(container, hand, opts = {}) {
  const alreadyThere = new Set(
    [...container.querySelectorAll('.card')].map((el) => el.dataset.uid));
  container.innerHTML = '';
  const n = hand.length;
  hand.forEach((card, i) => {
    const el = cardElement(card, { faceDown: opts.faceDown, selected: opts.selectedUid === card.uid });
    const spread = Math.min(630, (n - 1) * 105);
    const x = n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0;
    const rot = n > 1 ? -5 + (10 * i) / (n - 1) : 0;
    const lift = opts.selectedUid === card.uid ? -34 : Math.abs(i - (n - 1) / 2) * -3;
    el.style.setProperty('--fan-x', `${x}px`);
    el.style.setProperty('--fan-rot', `${rot}deg`);
    el.style.setProperty('--fan-y', `${lift}px`);
    el.style.zIndex = String(10 + i + (opts.selectedUid === card.uid ? 50 : 0));
    if (!opts.faceDown) {
      el.addEventListener('click', () => opts.onCardClick && opts.onCardClick(card));
    }
    container.appendChild(el);
    // Deal-in: only cards new to this row slide up from the deck and snap in;
    // cards already on the table stay put instead of re-dealing every render.
    if (alreadyThere.has(String(card.uid))) el.classList.add('dealt');
    else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('dealt')));
  });
}

export function renderLife(el, life, shield, label) {
  const pct = Math.max(0, Math.min(100, (life / 20) * 100));
  el.innerHTML = `
    <div class="life-label">${label}</div>
    <div class="life-row"><span class="life-num">${life}<span class="life-max"> / 20</span></span>
      ${shield > 0 ? `<span class="shield-num">🛡 ${shield}</span>` : ''}
    </div>
    <div class="life-bar"><div class="life-fill" style="width:${pct}%"></div></div>`;
  el.classList.toggle('low', life <= 6);
}

export function renderEnergy(el, energy) {
  el.innerHTML = `<span class="energy-label">ENERGY</span>` +
    [0, 1, 2].map((i) => `<span class="energy-pip${i < energy ? ' on' : ''}">●</span>`).join('');
}

export function showLog(el, text) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = text;
  el.prepend(line);
  while (el.children.length > 5) el.removeChild(el.lastChild);
}

export function showBanner(el, text, kind = '') {
  el.textContent = text;
  el.className = `banner show ${kind}`;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { el.className = 'banner'; }, 2600);
}

// Fly a played card from the hand to the table, then settle it face-up.
export function flyCardToTable(card, fromEl, tableEl) {
  if (!fromEl) return;
  const r = fromEl.getBoundingClientRect();
  const ghost = cardElement(card);
  ghost.classList.add('ghost');
  ghost.style.left = `${r.left}px`;
  ghost.style.top = `${r.top}px`;
  ghost.style.transform = 'translate(0px, 0px)';
  document.body.appendChild(ghost);
  const t = tableEl.getBoundingClientRect();
  const dx = t.left + t.width / 2 - (r.left + r.width / 2);
  const dy = t.top + t.height / 2 - (r.top + r.height / 2);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(360deg) scale(0.92)`;
    ghost.style.opacity = '0.25';
  });
  setTimeout(() => ghost.remove(), 550);
}

// Win flourish: coloured confetti falling over the table.
export function launchConfetti(layer) {
  layer.innerHTML = '';
  const colors = ['#e5484d', '#2f81f7', '#2da44e', '#d29922', '#f6e05e', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(piece);
  }
  setTimeout(() => { layer.innerHTML = ''; }, 4500);
}
