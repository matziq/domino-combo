/* =========================================================
   DOMINO COMBO – a match-3 dice placement game (DOM glue)
   ========================================================= */

import {
  COLORS,
  DOTS,
  createBoard,
  hsKey,
  cellsFor,
  smartPlace,
  canPlaceDouble,
  canPlaceAnywhere,
  visualVals,
  findGroups,
  pickMergeTarget,
  triggersCollapse,
  collapseColumns,
  CHAOS_MATCH_THRESHOLD,
  computeScore,
  sanitizeName,
  randVal,
  randValExcluding,
} from './logic.js';

// ── State ──────────────────────────────────────────────────
let gridSize = 5;
let matchCount = 3;
let gameMode = 'classic'; // 'classic' | 'chaos' | 'ultra'
let soundOn = true;

let board = [];
let score = 0;
// Per-config high scores: keyed by "gridSize_matchCount".
// Each entry: { score: number, name: string }
let allHighScores = JSON.parse(localStorage.getItem('dcHighScores') || '{}');
// Clear legacy single high score
localStorage.removeItem('dcHighScore');

function getHighScore() {
  const entry = allHighScores[hsKey(gridSize, matchCount, gameMode)];
  return entry ? entry.score : 0;
}
function getHighScoreName() {
  const entry = allHighScores[hsKey(gridSize, matchCount, gameMode)];
  return entry ? entry.name : '';
}
function setHighScore(s, name) {
  allHighScores[hsKey(gridSize, matchCount, gameMode)] = { score: s, name: name || '' };
  localStorage.setItem('dcHighScores', JSON.stringify(allHighScores));
}

let highScore = 0;
let piece = null; // current piece to place
let drag = null; // active drag state
let processing = false; // lock while clearing matches
let lastPlacedCells = []; // track where pieces were placed for merge targeting
let maxSpawnVal = 1; // highest value that can appear in spawned pieces
let chainDepth = 0; // tracks successive chain reactions
let hasCollapsedInChain = false; // Ultra Chaos: true once a collapse has fired
// during the current placement's chain, lowering the bar for further ones

// ── Audio (Web Audio API – no files needed) ────────────────
let _actx = null;
function actx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

function sfx(type) {
  if (!soundOn) return;
  try {
    const c = actx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    switch (type) {
      case 'place':
        o.type = 'sine';
        o.frequency.setValueAtTime(330, t);
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.start(t);
        o.stop(t + 0.06);
        break;
      case 'match':
        o.type = 'sine';
        o.frequency.setValueAtTime(659, t);
        o.frequency.linearRampToValueAtTime(880, t + 0.18);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t);
        o.stop(t + 0.22);
        break;
      case 'combo':
        o.type = 'triangle';
        o.frequency.setValueAtTime(523, t);
        o.frequency.setValueAtTime(659, t + 0.08);
        o.frequency.setValueAtTime(784, t + 0.16);
        o.frequency.setValueAtTime(1047, t + 0.24);
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t);
        o.stop(t + 0.35);
        break;
      case 'flip':
        o.type = 'sine';
        o.frequency.setValueAtTime(800, t);
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.start(t);
        o.stop(t + 0.04);
        break;
      case 'chain':
        o.type = 'triangle';
        o.frequency.setValueAtTime(659, t);
        o.frequency.linearRampToValueAtTime(1047, t + 0.12);
        o.frequency.setValueAtTime(1175, t + 0.18);
        o.frequency.linearRampToValueAtTime(1397, t + 0.3);
        g.gain.setValueAtTime(0.13, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t);
        o.stop(t + 0.4);
        break;
      case 'explode6':
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(880, t);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.4);
        g.gain.setValueAtTime(0.12, t);
        g.gain.linearRampToValueAtTime(0.08, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.start(t);
        o.stop(t + 0.45);
        // Add a second oscillator for shimmer
        {
          const o2 = c.createOscillator();
          const g2 = c.createGain();
          o2.connect(g2);
          g2.connect(c.destination);
          o2.type = 'sine';
          o2.frequency.setValueAtTime(1760, t);
          o2.frequency.exponentialRampToValueAtTime(440, t + 0.35);
          g2.gain.setValueAtTime(0.06, t);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          o2.start(t);
          o2.stop(t + 0.35);
        }
        break;
      case 'collapse':
        o.type = 'sine';
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.3);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.start(t);
        o.stop(t + 0.32);
        break;
      case 'over':
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(440, t);
        o.frequency.linearRampToValueAtTime(220, t + 0.5);
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t);
        o.stop(t + 0.5);
        break;
      default:
        break;
    }
  } catch {
    /* silent */
  }
}

// ── Init ───────────────────────────────────────────────────
function init() {
  score = 0;
  processing = false;
  maxSpawnVal = 3;
  highScore = getHighScore();
  board = createBoard(gridSize);
  updateScore();
  updateModeDisplay();
  renderBoard();
  spawnPiece();
}

// ── Rendering ──────────────────────────────────────────────
function renderBoard(placed, mergeTargets) {
  const el = document.getElementById('board');
  el.innerHTML = '';
  el.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      if (board[r][c] !== null) {
        cell.appendChild(makeDie(board[r][c]));
      }
      if (placed && placed.some((p) => p.r === r && p.c === c)) {
        cell.classList.add('just-placed');
      }
      if (mergeTargets && mergeTargets.some((p) => p.r === r && p.c === c)) {
        cell.classList.add('merge-result');
      }
      el.appendChild(cell);
    }
  }
}

function makeDie(val, cls) {
  const d = document.createElement('div');
  d.className = cls || 'die';
  d.style.background = COLORS[val];
  const dots = DOTS[val];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const s = document.createElement('div');
      if (dots.some(([dr, dc]) => dr === r && dc === c)) s.className = 'dot';
      d.appendChild(s);
    }
  }
  return d;
}

function updateScore() {
  document.getElementById('score-display').textContent = score;
  const hsName = getHighScoreName();
  document.getElementById('high-score').textContent = 'Best: ' + highScore;
  document.getElementById('high-score-name').textContent = hsName || '';
}

function updateModeDisplay() {
  const el = document.getElementById('mode-display');
  if (!el) return;
  el.textContent =
    gameMode === 'chaos'
      ? '\u{1F300} Chaos'
      : gameMode === 'ultra'
        ? '\u{1F300} Ultra Chaos'
        : '';
}

// ── Piece ──────────────────────────────────────────────────
function spawnPiece() {
  // Check if any double (2-cell) placement is possible
  const canFitDouble = canPlaceDouble(board, gridSize);
  // Only allow doubles when there are at least 2 distinct values available
  const dbl = canFitDouble && maxSpawnVal >= 2 && Math.random() < 6 / 7;
  const firstVal = randVal(maxSpawnVal);
  piece = {
    type: dbl ? 'double' : 'single',
    vals: dbl ? [firstVal, randValExcluding(maxSpawnVal, firstVal)] : [firstVal],
    ori: 'h', // 'h' = horizontal, 'v' = vertical
    rot: 0, // rotation angle in degrees (increments of 90)
  };
  renderPiece();

  if (!canPlaceAnywhere(board, gridSize, piece)) {
    processing = true;
    setTimeout(gameOver, 350);
  }
}

function renderPiece(skipAnimation) {
  const area = document.getElementById('piece-area');
  area.innerHTML = '';
  const hint = document.getElementById('flip-hint');
  hint.textContent = '\u00A0';
  if (!piece) return;

  const box = document.createElement('div');
  box.id = 'current-piece';
  // Always render horizontally; CSS rotation handles visual orientation.
  // Apply accumulated rotation immediately (no transition on rebuild).
  if (piece.rot) {
    box.style.transition = 'none';
    box.style.transform = `rotate(${piece.rot}deg)`;
    // Re-enable transition after layout
    requestAnimationFrame(() => {
      box.style.transition = 'transform 0.25s ease';
    });
  }

  const dieClass = skipAnimation ? 'piece-die no-anim' : 'piece-die';
  piece.vals.forEach((v) => box.appendChild(makeDie(v, dieClass)));
  box.addEventListener('pointerdown', ptrDown);
  area.appendChild(box);

  if (piece.type === 'double') {
    hint.textContent = 'Tap to flip';
  }
}

// ── Board metric helpers ───────────────────────────────────
const BOARD_BORDER = 3;
const BOARD_PAD = 8;
const CELL_GAP = 5;

function boardMetrics() {
  const el = document.getElementById('board');
  const rc = el.getBoundingClientRect();
  const inner = rc.width - 2 * BOARD_BORDER - 2 * BOARD_PAD;
  const csz = (inner - CELL_GAP * (gridSize - 1)) / gridSize;
  return { rect: rc, csz, step: csz + CELL_GAP };
}

function targetCell(x, y) {
  const { rect, step } = boardMetrics();
  const rx = x - rect.left - BOARD_BORDER - BOARD_PAD;
  const ry = y - rect.top - BOARD_BORDER - BOARD_PAD;
  const c = Math.floor(rx / step);
  const r = Math.floor(ry / step);
  return r >= 0 && r < gridSize && c >= 0 && c < gridSize ? { r, c } : null;
}

function cellEl(r, c) {
  return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

// ── Pointer / Drag ─────────────────────────────────────────
function ptrDown(e) {
  if (processing) return;
  e.preventDefault();
  const el = document.getElementById('current-piece');
  if (!el) return;
  const rc = el.getBoundingClientRect();
  drag = {
    sx: e.clientX,
    sy: e.clientY,
    st: Date.now(),
    ox: e.clientX - rc.left,
    oy: e.clientY - rc.top,
    ghost: null,
    active: false,
  };
  document.addEventListener('pointermove', ptrMove);
  document.addEventListener('pointerup', ptrUp);
  document.addEventListener('pointercancel', ptrUp);
}

function ptrMove(e) {
  if (!drag) return;
  e.preventDefault();
  const dx = e.clientX - drag.sx;
  const dy = e.clientY - drag.sy;

  if (!drag.active && (Math.abs(dx) > 7 || Math.abs(dy) > 7)) {
    drag.active = true;
    buildGhost(e);
  }
  if (drag.active && drag.ghost) {
    drag.ghost.style.left = e.clientX - drag.ox + 'px';
    drag.ghost.style.top = e.clientY - drag.oy + 'px';
    showHighlight(e);
  }
}

function buildGhost(e) {
  const el = document.getElementById('current-piece');
  if (el) el.style.opacity = '0.2';

  const { csz } = boardMetrics();
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  if (piece.type === 'double' && piece.ori === 'v') g.style.flexDirection = 'column';

  const vv = visualVals(piece);
  vv.forEach((v) => {
    const d = makeDie(v, 'die');
    d.style.width = csz + 'px';
    d.style.height = csz + 'px';
    g.appendChild(d);
  });

  document.body.appendChild(g);
  drag.ghost = g;
  drag.ox = csz / 2;
  drag.oy = csz / 2;
  g.style.left = e.clientX - drag.ox + 'px';
  g.style.top = e.clientY - drag.oy + 'px';
}

function ptrUp(e) {
  document.removeEventListener('pointermove', ptrMove);
  document.removeEventListener('pointerup', ptrUp);
  document.removeEventListener('pointercancel', ptrUp);
  if (!drag) return;

  if (!drag.active) {
    // TAP → flip (rotate 90° each tap with CSS transition)
    if (piece && piece.type === 'double') {
      piece.rot += 90;
      piece.ori = piece.ori === 'h' ? 'v' : 'h';
      sfx('flip');
      const el = document.getElementById('current-piece');
      if (el) el.style.transform = `rotate(${piece.rot}deg)`;
    }
    drag = null;
    return;
  }

  // Attempt drop
  const tgt = targetCell(e.clientX, e.clientY);
  let placed = false;
  let placedCells = null;

  if (tgt) {
    placedCells = smartPlace(board, gridSize, piece, tgt);
    if (placedCells) {
      const vv = visualVals(piece);
      placedCells.forEach((p, i) => {
        board[p.r][p.c] = vv[i];
      });
      placed = true;
      sfx('place');
      renderBoard(placedCells);
    }
  }

  if (drag.ghost) drag.ghost.remove();
  clearHL();
  drag = null;

  if (placed) {
    lastPlacedCells = placedCells.map((p) => ({ r: p.r, c: p.c }));
    piece = null;
    renderPiece();
    processing = true;
    chainDepth = 0;
    hasCollapsedInChain = false;
    setTimeout(processMatches, 120);
  } else {
    renderPiece(true);
  }
}

// ── Highlight ──────────────────────────────────────────────
function showHighlight(e) {
  clearHL();
  const tgt = targetCell(e.clientX, e.clientY);
  if (!tgt) return;

  const cells = smartPlace(board, gridSize, piece, tgt);
  if (cells) {
    cells.forEach(({ r, c }) => {
      const el = cellEl(r, c);
      if (el) el.classList.add('hl-valid');
    });
  } else {
    const raw = cellsFor(tgt.r, tgt.c, piece);
    raw.forEach(({ r, c }) => {
      if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
        const el = cellEl(r, c);
        if (el) el.classList.add('hl-invalid');
      }
    });
  }
}

function clearHL() {
  document
    .querySelectorAll('.hl-valid,.hl-invalid')
    .forEach((e) => e.classList.remove('hl-valid', 'hl-invalid'));
}

// Spawn particle burst from a cell element (for 6s explosion)
function spawnParticles(el) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ['#FF5252', '#FF8A80', '#FFAB40', '#FFD600', '#FF6D00', '#FFFFFF'];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'explosion-particle';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    const angle = ((Math.PI * 2) / count) * i + (Math.random() - 0.5) * 0.5;
    const dist = 30 + Math.random() * 40;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const size = 3 + Math.random() * 5;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    p.style.animation = 'none'; // reset
    document.body.appendChild(p);
    // Use custom translate for each particle
    requestAnimationFrame(() => {
      p.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
      p.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
      p.style.opacity = '0';
    });
    setTimeout(() => p.remove(), 600);
  }
}

function processMatches() {
  const groups = findGroups(board, gridSize, matchCount);

  if (groups.length === 0) {
    processing = false;
    hasCollapsedInChain = false;
    spawnPiece();
    return;
  }

  chainDepth++;
  const { numSets, isChain, isCombo, basePts, chainBonus, totalPts } = computeScore(
    groups,
    chainDepth,
  );

  const allClear = new Set(); // cells to animate clearing
  const mergeResults = []; // {r, c, newVal} for upgrades

  for (const grp of groups) {
    grp.cells.forEach(({ r, c }) => {
      allClear.add(r + ',' + c);
    });

    // If value < 6 → merge into next value at trigger cell
    if (grp.val < 6) {
      const target = pickMergeTarget(grp, lastPlacedCells);
      mergeResults.push({ r: target.r, c: target.c, newVal: grp.val + 1 });
      // Unlock the new value for spawning
      if (grp.val + 1 > maxSpawnVal && grp.val + 1 <= 6) {
        maxSpawnVal = grp.val + 1;
      }
    }
    // If value === 6 (red) → they just disappear
  }

  score += totalPts;
  if (score > highScore) {
    highScore = score;
  }
  updateScore();

  sfx(isChain ? 'chain' : isCombo ? 'combo' : 'match');
  // Show base tile points
  showPopup(basePts, isCombo ? numSets : 0, false);
  // Show chain bonus as separate floating number
  if (chainBonus > 0) {
    setTimeout(() => showPopup(chainBonus, chainDepth, true, 40), 350);
  }

  // Track which groups are 6s for special effect
  const sixCells = new Set();
  for (const grp of groups) {
    if (grp.val === 6) {
      grp.cells.forEach(({ r, c }) => sixCells.add(r + ',' + c));
    }
  }

  // Animate clearing
  allClear.forEach((k) => {
    const [r, c] = k.split(',').map(Number);
    const el = cellEl(r, c);
    if (el) {
      if (sixCells.has(k)) {
        el.classList.add('clearing-6');
        spawnParticles(el);
      } else {
        el.classList.add('clearing');
      }
    }
  });

  if (sixCells.size > 0) sfx('explode6');

  setTimeout(() => {
    // Clear all matched cells
    allClear.forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      board[r][c] = null;
    });

    // Place merged results (upgraded tiles)
    const newPlaced = [];
    for (const m of mergeResults) {
      board[m.r][m.c] = m.newVal;
      newPlaced.push({ r: m.r, c: m.c });
    }

    // Update trigger cells for next chain reaction
    lastPlacedCells = newPlaced;

    // Chaos mode: a big enough match (4+ tiles) collapses the whole board,
    // letting remaining tiles fall and fill the gaps. This can shuffle
    // previously-separated tiles into adjacency, cascading into more combos
    // on the next chain-reaction pass below.
    //
    // Ultra Chaos: same idea, but once the first 4+ collapse has fired for
    // this placement, the bar drops to the normal match size (matchCount)
    // for every subsequent collapse — so the cascade keeps collapsing the
    // board as long as ANY match keeps forming, not just big ones.
    const collapseThreshold =
      gameMode === 'ultra' && hasCollapsedInChain ? matchCount : CHAOS_MATCH_THRESHOLD;
    const shouldCollapse =
      (gameMode === 'chaos' || gameMode === 'ultra') &&
      triggersCollapse(groups, collapseThreshold);

    if (shouldCollapse) {
      const { board: collapsed, moved } = collapseColumns(board, gridSize);
      board = collapsed;
      lastPlacedCells = []; // no player-placed cell to prefer after a collapse
      hasCollapsedInChain = true;
      sfx('collapse');
      screenShake();
      renderBoard(null, moved.map((m) => ({ r: m.r1, c: m.c1 })));
    } else {
      renderBoard(null, newPlaced);
    }

    setTimeout(processMatches, 250); // chain reaction
  }, 420);
}

// Brief screen shake, used when a Chaos-mode collapse happens.
function screenShake() {
  const el = document.getElementById('game');
  if (!el) return;
  el.classList.remove('shake');
  // Force reflow so the animation restarts if triggered again quickly
  // (e.g. back-to-back chain-reaction collapses).
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}

function showPopup(pts, comboN, isChain, offsetY) {
  const brd = document.getElementById('board').getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'score-popup' + (comboN ? ' combo' : '') + (isChain ? ' chain' : '');
  let label = '+' + pts;
  if (isChain) label += '  CHAIN ×' + comboN;
  else if (comboN) label += '  COMBO ×' + comboN;
  p.textContent = label;
  p.style.left = brd.left + brd.width / 2 - 50 + 'px';
  p.style.top = brd.top + brd.height / 2 + (offsetY || 0) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 950);
}

// ── Game Over ──────────────────────────────────────────────
function gameOver() {
  sfx('over');
  document.getElementById('final-score').textContent = score;
  const hs = document.getElementById('go-hs');
  const isNewHigh = score > 0 && score >= highScore && score > getHighScore();
  const nameEntry = document.getElementById('name-entry');
  const nameInput = document.getElementById('hs-name');
  if (isNewHigh) {
    hs.textContent = '\u{1F3C6} New High Score!';
    nameEntry.style.display = 'block';
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 100);
  } else {
    hs.textContent =
      'Best: ' +
      getHighScore() +
      (getHighScoreName() ? ' (' + getHighScoreName() + ')' : '');
    nameEntry.style.display = 'none';
  }
  document.getElementById('game-over').classList.add('show');
  processing = false;
}

function submitHighScore() {
  const nameEntry = document.getElementById('name-entry');
  const nameInput = document.getElementById('hs-name');
  if (nameEntry.style.display !== 'none') {
    const name = sanitizeName(nameInput.value);
    if (score > getHighScore()) {
      setHighScore(score, name);
      highScore = score;
    }
  }
  newGame();
}

// ── Controls ───────────────────────────────────────────────
function newGame() {
  document.getElementById('game-over').classList.remove('show');
  document.getElementById('settings-modal').classList.remove('show');
  document.getElementById('name-entry').style.display = 'none';
  init();
}

function toggleHelp() {
  document.getElementById('help-modal').classList.toggle('show');
}

function toggleSettings() {
  const m = document.getElementById('settings-modal');
  m.classList.toggle('show');
  document.getElementById('opt-size').value = String(gridSize);
  document.getElementById('opt-match').value = String(matchCount);
  document.getElementById('opt-mode').value = gameMode;
  document.getElementById('opt-sound').value = soundOn ? '1' : '0';
}

function applySettings() {
  gridSize = parseInt(document.getElementById('opt-size').value, 10);
  matchCount = parseInt(document.getElementById('opt-match').value, 10);
  gameMode = document.getElementById('opt-mode').value;
  soundOn = document.getElementById('opt-sound').value === '1';
  document.getElementById('settings-modal').classList.remove('show');
  init();
}

// ── Immersive mode (full screen + portrait lock) ────────────
// Both the Fullscreen API and Screen Orientation API require an active
// user gesture on most browsers (notably Chrome for Android), so we
// request them on tap/click rather than on page load.
function requestImmersiveMode() {
  const root = document.documentElement;
  if (root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().catch(() => {
      /* ignored: not user-initiated, unsupported, or already denied */
    });
  }
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {
      /* ignored: only Chrome for Android grants this, and only while
         the page is fullscreen; other browsers fall back to the
         #rotate-overlay CSS prompt defined in index.html */
    });
  }
}

function enableImmersiveMode() {
  const armListener = () => {
    document.addEventListener('pointerdown', requestImmersiveMode, { once: true });
  };

  // Attempt on the very first user interaction (required for the
  // Fullscreen/Orientation APIs to be allowed).
  armListener();

  // Android exits fullscreen when the tab is backgrounded; re-arm so the
  // next tap re-requests it once the game becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.fullscreenElement) {
      armListener();
    }
  });
}

// ── Event wiring (unobtrusive, replaces inline onclick) ────
function wireControls() {
  document.getElementById('btn-new-game').addEventListener('click', newGame);
  document.getElementById('btn-help').addEventListener('click', toggleHelp);
  document.getElementById('btn-settings').addEventListener('click', toggleSettings);
  document.getElementById('btn-help-close').addEventListener('click', toggleHelp);
  document.getElementById('btn-apply-settings').addEventListener('click', applySettings);
  document.getElementById('btn-play-again').addEventListener('click', submitHighScore);

  // Global guards
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('settings-modal').classList.remove('show');
      document.getElementById('help-modal').classList.remove('show');
    }
  });
}

// ── Start ──────────────────────────────────────────────────
wireControls();
enableImmersiveMode();
init();
