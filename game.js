'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - steel gray
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca) 3x3 con hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [100, 800, 1200, 1600]; // [mini, single, double, triple]
const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];
const COMBO_BONUS = 50;
const B2B_MULTIPLIER = 1.5;
const T_PIECE_TYPE = 3;

const POWERUP_CHANCE = 0.5; //0.06;
const POWERUP_SCORE = 150;
const FREEZE_MS = 5000;
const POWERUPS = {
  bomb:    { label: 'BOMBA',    icon: '💣', color: '#ff5252' },
  ray:     { label: 'RAYO',     icon: '⚡', color: '#ffee58' },
  tint:    { label: 'TINTE',    icon: '🎨', color: '#4dd0e1' },
  gravity: { label: 'GRAVEDAD', icon: '🌀', color: '#ab47bc' },
  freeze:  { label: 'CONGELAR', icon: '❄️', color: '#64b5f6' },
};
const POWERUP_IDS = Object.keys(POWERUPS);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const soundToggle = document.getElementById('sound-toggle');
const comboEl = document.getElementById('combo');
const comboPopup = document.getElementById('combo-popup');
const boardWrap = document.querySelector('.board-wrap');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let comboCount, b2b, lastMoveWasRotate;
let frozenUntil;
let audioCtx, soundEnabled;
let themeColors = { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' };

const THEME_STORAGE_KEY = 'tetris-theme';
const SOUND_STORAGE_KEY = 'tetris-sound';

function refreshThemeColors() {
  const styles = getComputedStyle(document.body);
  themeColors.grid = styles.getPropertyValue('--grid-line').trim();
  themeColors.highlight = styles.getPropertyValue('--block-highlight').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeToggle.checked = theme === 'light';
  refreshThemeColors();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

const PIECE_WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 0.2]; // Nut aparece con menor frecuencia

function randomPowerUp() {
  const powerup = POWERUP_IDS[Math.floor(Math.random() * POWERUP_IDS.length)];
  const shape = [[1]];
  return { type: 'powerup', powerup, shape, x: Math.floor(COLS / 2), y: 0 };
}

function randomPiece() {
  if (Math.random() < POWERUP_CHANCE) return randomPowerUp();

  const totalWeight = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  let type = 0;
  for (; type < PIECE_WEIGHTS.length; type++) {
    r -= PIECE_WEIGHTS[type];
    if (r < 0) break;
  }
  type += 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0, powerup: null };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveWasRotate = true;
      return;
    }
  }
}

function isTSpin() {
  if (current.type !== T_PIECE_TYPE || !lastMoveWasRotate) return false;
  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]];
  let filled = 0;
  for (const [dx, dy] of corners) {
    const x = current.x + dx;
    const y = current.y + dy;
    if (x < 0 || x >= COLS || y >= ROWS) { filled++; continue; }
    if (y >= 0 && board[y][x]) filled++;
  }
  return filled >= 3;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines(tspin) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }

  if (cleared === 0) {
    comboCount = -1;
    if (tspin) {
      score += Math.round(TSPIN_SCORES[0] * level);
      updateHUD();
      triggerEffects({ cleared: 0, tspin: true, b2bHit: false, combo: -1, perfectClear: false });
    }
    return;
  }

  comboCount++;
  const isHardClear = tspin || cleared === 4;
  let base = (tspin ? TSPIN_SCORES[cleared] : LINE_SCORES[cleared]) * level;
  const b2bHit = isHardClear && b2b;
  if (b2bHit) base *= B2B_MULTIPLIER;
  b2b = isHardClear;

  let gained = Math.round(base);
  if (comboCount > 0) gained += COMBO_BONUS * comboCount * level;
  score += gained;

  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);

  const perfectClear = board.every(row => row.every(v => v === 0));
  if (perfectClear) {
    score += Math.round(PERFECT_CLEAR_SCORES[cleared] * level);
  }

  updateHUD();
  triggerEffects({ cleared, tspin, b2bHit, combo: comboCount, perfectClear });
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  if (gy > current.y) lastMoveWasRotate = false;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    lastMoveWasRotate = false;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.powerup) {
    applyPowerUp(current);
    spawn();
    return;
  }
  const tspin = isTSpin();
  merge();
  clearLines(tspin);
  spawn();
}

function applyPowerUp(piece) {
  const { powerup, x, y } = piece;

  switch (powerup) {
    case 'bomb':
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case 'ray':
      for (let c = 0; c < COLS; c++) board[y][c] = 0;
      for (let r = 0; r < ROWS; r++) board[r][x] = 0;
      break;
    case 'tint': {
      // Elimina, por cada bloque inmediatamente adyacente (arriba/abajo/izq/der)
      // al bloque de tinte, todo el grupo de bloques del mismo color conectados
      // a él (4-direcciones). Si no hay bloques adyacentes, no hace nada.
      const visited = new Set();
      let removed = 0;
      const neighbors = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const colorVal = board[ny][nx];
        if (!colorVal || visited.has(ny * COLS + nx)) continue;
        const stack = [[nx, ny]];
        while (stack.length) {
          const [cx, cy] = stack.pop();
          if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) continue;
          const key = cy * COLS + cx;
          if (visited.has(key) || board[cy][cx] !== colorVal) continue;
          visited.add(key);
          board[cy][cx] = 0;
          removed++;
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      }
      if (removed === 0) return; // sin bloques adyacentes: no hace nada
      break;
    }
    case 'gravity':
      for (let c = 0; c < COLS; c++) {
        const vals = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) vals.push(board[r][c]);
        const pad = ROWS - vals.length;
        for (let r = 0; r < ROWS; r++) board[r][c] = r < pad ? 0 : vals[r - pad];
      }
      break;
    case 'freeze':
      frozenUntil = performance.now() + FREEZE_MS;
      break;
  }

  if (powerup !== 'freeze') {
    score += POWERUP_SCORE;
    // Only gravity can create new full rows (it repositions blocks within a
    // column); bomb/ray/tint only remove blocks, so a clear check there would
    // just risk resetting an active combo via clearLines(0)'s side effect.
    if (powerup === 'gravity') clearLines(false);
  }

  updateHUD();
  showComboPopup(`${POWERUPS[powerup].icon} ${POWERUPS[powerup].label}`, 'powerup');
  playTone(330, 0, 0.12, 'square', 0.15);
  playTone(494, 0.08, 0.16, 'square', 0.15);
}

function spawn() {
  current = next;
  next = randomPiece();
  lastMoveWasRotate = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = comboCount > 0 ? `x${comboCount + 1}` : '-';
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, start, duration, type, gain) {
  if (!soundEnabled) return;
  const ctxA = getAudioCtx();
  const osc = ctxA.createOscillator();
  const gainNode = ctxA.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const t0 = ctxA.currentTime + start;
  gainNode.gain.setValueAtTime(gain ?? 0.15, t0);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gainNode).connect(ctxA.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playSfx({ cleared, tspin, b2bHit, combo, perfectClear }) {
  if (!soundEnabled) return;
  if (perfectClear) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, i * 0.09, 0.25, 'triangle', 0.18));
    return;
  }
  if (tspin) playTone(220, 0, 0.14, 'sawtooth', 0.15);
  if (b2bHit) {
    playTone(392, 0.05, 0.15, 'square', 0.12);
    playTone(523.25, 0.15, 0.18, 'square', 0.12);
  }
  const base = tspin ? 440 : (cleared === 4 ? 349.23 : 261.63);
  const step = Math.max(combo, 0);
  const freq = base * Math.pow(1.12, Math.min(step, 8));
  playTone(freq, tspin || b2bHit ? 0.2 : 0, 0.15, 'sine', 0.15);
}

function showComboPopup(text, type) {
  comboPopup.textContent = text;
  comboPopup.className = 'combo-popup' + (type ? ' ' + type : '');
  void comboPopup.offsetWidth; // reflow to restart animation
  comboPopup.classList.add('show');
}

function flashBoard() {
  boardWrap.classList.add('flash');
  setTimeout(() => boardWrap.classList.remove('flash'), 500);
}

function triggerEffects({ cleared, tspin, b2bHit, combo, perfectClear }) {
  const parts = [];
  let type = 'combo';

  if (tspin) { parts.push('T-SPIN'); type = 'tspin'; }
  if (cleared === 4) parts.push('TETRIS');
  if (b2bHit) { parts.push('BACK-TO-BACK'); type = 'b2b'; }
  if (combo > 0) parts.push(`COMBO x${combo + 1}`);
  if (perfectClear) { parts.push('PERFECT CLEAR!'); type = 'perfect'; }

  if (parts.length === 0) parts.push(cleared === 1 ? 'LINE!' : `${cleared} LINES!`);

  showComboPopup(parts.join(' '), type);
  playSfx({ cleared, tspin, b2bHit, combo, perfectClear });
  if (perfectClear) flashBoard();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

const RAINBOW_STOPS = ['#ff5252', '#ff9800', '#ffee58', '#66bb6a', '#42a5f5', '#ab47bc'];

function drawPowerUpBlock(context, x, y, powerup, size, alpha) {
  const { icon } = POWERUPS[powerup];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;
  const grad = context.createLinearGradient(px, py, px + s, py + s);
  RAINBOW_STOPS.forEach((c, i) => grad.addColorStop(i / (RAINBOW_STOPS.length - 1), c));
  context.fillStyle = grad;
  context.fillRect(px, py, s, s);
  context.fillStyle = themeColors.highlight;
  context.fillRect(px, py, s, 4);
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  // icono siempre 100% opaco para que sea legible (incluso sobre el ghost)
  context.globalAlpha = 1;
  // disco oscuro detrás del icono para que contraste sobre el arcoíris
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.beginPath();
  context.arc(cx, cy, size * 0.34, 0, Math.PI * 2);
  context.fill();
  context.font = `${Math.floor(size * 0.5)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0, 0, 0, 0.8)';
  context.shadowBlur = 3;
  context.fillText(icon, cx, cy + 1);
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        if (current.powerup) drawPowerUpBlock(ctx, current.x + c, gy + r, current.powerup, BLOCK, 0.2);
        else drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
      }

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++) {
      if (!current.shape[r][c]) continue;
      if (current.powerup) drawPowerUpBlock(ctx, current.x + c, current.y + r, current.powerup, BLOCK);
      else drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
    }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      if (next.powerup) drawPowerUpBlock(nextCtx, offX + c, offY + r, next.powerup, NB);
      else drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
    }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = performance.now() < frozenUntil;
  if (!frozen) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
        lastMoveWasRotate = false;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  comboCount = -1;
  b2b = false;
  lastMoveWasRotate = false;
  frozenUntil = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastMoveWasRotate = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastMoveWasRotate = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  draw();
  drawNext();
});

soundToggle.addEventListener('change', () => {
  soundEnabled = soundToggle.checked;
  localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? 'on' : 'off');
});

soundEnabled = localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
soundToggle.checked = soundEnabled;

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
init();
