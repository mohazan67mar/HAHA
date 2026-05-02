// ── Firebase Setup ──────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, remove, off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// 🔥 YOUR FIREBASE CONFIG — replace with yours from Firebase Console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── State ──────────────────────────────────────────────────────────────
let mySymbol = null;
let currentTurn = null;
let roomCode = null;
let currentBoard = Array(9).fill(null);
let wasLosingLastTurn = false;
let roomRef = null;
let roomListener = null;

// ── Audio Engine ────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playClick() {
  const ctx = getAudio();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(520, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.08);
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  o.start(); o.stop(ctx.currentTime + 0.1);
}

function playOpponentMove() {
  const ctx = getAudio();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(320, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  o.start(); o.stop(ctx.currentTime + 0.1);
}

function playWin() {
  const ctx = getAudio();
  [523, 659, 784, 1047].forEach((freq, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
    g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);
    o.start(ctx.currentTime + i * 0.12);
    o.stop(ctx.currentTime + i * 0.12 + 0.25);
  });
}

function playLose() {
  const ctx = getAudio();
  [400, 320, 240].forEach((freq, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
    g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
    o.start(ctx.currentTime + i * 0.15);
    o.stop(ctx.currentTime + i * 0.15 + 0.2);
  });
}

function playDraw() {
  const ctx = getAudio();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(440, ctx.currentTime);
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.setValueAtTime(0.0, ctx.currentTime + 0.1);
  g.gain.setValueAtTime(0.2, ctx.currentTime + 0.18);
  g.gain.setValueAtTime(0.0, ctx.currentTime + 0.28);
  g.gain.setValueAtTime(0.2, ctx.currentTime + 0.36);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  o.start(); o.stop(ctx.currentTime + 0.5);
}

function playTrashTalk() {
  const ctx = getAudio();
  [0, 0.12].forEach(t => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'square';
    o.frequency.setValueAtTime(160, ctx.currentTime + t);
    g.gain.setValueAtTime(0.15, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.1);
    o.start(ctx.currentTime + t);
    o.stop(ctx.currentTime + t + 0.1);
  });
}

// ── Jersey HTML builders ────────────────────────────────────────────────
function curryJerseyHTML(extraClass = '') {
  return `<div class="bj-shirt curry-shirt ${extraClass}">
    <div class="bj-collar"></div>
    <div class="bj-num">30</div>
    <div class="bj-name">CURRY</div>
  </div>`;
}

function ronaldoJerseyHTML(extraClass = '') {
  return `<div class="bj-shirt ronaldo-shirt ${extraClass}">
    <div class="bj-collar"></div>
    <div class="bj-num">7</div>
    <div class="bj-name">RONALDO</div>
  </div>`;
}

// ── Screen Helper ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── DOM References ──────────────────────────────────────────────────────
const createBtn     = document.getElementById('createBtn');
const joinBtn       = document.getElementById('joinBtn');
const joinInput     = document.getElementById('joinInput');
const menuError     = document.getElementById('menuError');
const roomCodeDisp  = document.getElementById('roomCodeDisplay');
const mySymbolEl    = document.getElementById('mySymbol');
const myJerseyTag   = document.getElementById('myJerseyTag');
const statusMsg     = document.getElementById('statusMsg');
const gameRoomCode  = document.getElementById('gameRoomCode');
const cells         = document.querySelectorAll('.cell');
const playAgainBtn  = document.getElementById('playAgainBtn');
const resultText    = document.getElementById('resultText');
const resultIcon    = document.getElementById('resultIcon');
const winnerDisplay = document.getElementById('winnerDisplay');

// ── Room Code Generator ─────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Cleanup listener ────────────────────────────────────────────────────
function detachListener() {
  if (roomRef && roomListener) {
    off(roomRef, 'value', roomListener);
    roomListener = null;
  }
}

// ── Win Detection ────────────────────────────────────────────────────────
const COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function checkWinner(board) {
  for (const [a, b, c] of COMBOS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function isBoardFull(board) {
  return board.every(cell => cell !== null);
}

// ── Create Room ──────────────────────────────────────────────────────────
createBtn.addEventListener('click', async () => {
  menuError.textContent = '';
  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  let code = generateCode();
  // Make sure code doesn't already exist
  let snap = await get(ref(db, `rooms/${code}`));
  while (snap.exists()) {
    code = generateCode();
    snap = await get(ref(db, `rooms/${code}`));
  }

  roomCode = code;
  mySymbol = 'X';

  await set(ref(db, `rooms/${code}`), {
    board: Array(9).fill(null),
    turn: 'X',
    players: { X: true },
    status: 'waiting',
    gameOver: false
  });

  roomCodeDisp.textContent = code;
  showScreen('waiting');
  createBtn.disabled = false;
  createBtn.textContent = 'Create Room';

  // Listen for player 2 joining
  roomRef = ref(db, `rooms/${code}`);
  roomListener = onValue(roomRef, (snap) => {
    const data = snap.val();
    if (!data) return;

    if (data.status === 'playing' && data.players?.O) {
      detachListener();
      startGame(code, 'X', data);
    }

    if (data.status === 'playerLeft') {
      detachListener();
      handlePlayerLeft();
    }
  });
});

// ── Join Room ────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', async () => {
  const code = joinInput.value.trim().toUpperCase();
  if (!code) { menuError.textContent = 'Please enter a room code.'; return; }

  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining...';
  menuError.textContent = '';

  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) {
    menuError.textContent = 'Room not found. Check the code!';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Room';
    return;
  }

  const data = snap.val();
  if (data.status !== 'waiting') {
    menuError.textContent = 'Room is full or game already started.';
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Room';
    return;
  }

  roomCode = code;
  mySymbol = 'O';

  await update(ref(db, `rooms/${code}`), {
    'players/O': true,
    status: 'playing'
  });

  joinBtn.disabled = false;
  joinBtn.textContent = 'Join Room';

  // Get fresh data and start
  const freshSnap = await get(ref(db, `rooms/${code}`));
  startGame(code, 'O', freshSnap.val());
});

joinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ── Start Game ───────────────────────────────────────────────────────────
function startGame(code, symbol, data) {
  mySymbol = symbol;
  currentTurn = data.turn || 'X';
  roomCode = code;
  currentBoard = data.board || Array(9).fill(null);
  wasLosingLastTurn = false;

  mySymbolEl.textContent = symbol;
  mySymbolEl.style.color = symbol === 'X' ? '#ffc72c' : '#1a1a1a';

  if (symbol === 'X') {
    myJerseyTag.textContent = '#30 CURRY';
    myJerseyTag.style.background = '#1d428a';
    myJerseyTag.style.color = '#ffc72c';
    myJerseyTag.style.border = '1px solid #ffc72c';
  } else {
    myJerseyTag.textContent = '#7 RONALDO';
    myJerseyTag.style.background = '#f0f0f0';
    myJerseyTag.style.color = '#1a1a1a';
    myJerseyTag.style.border = '1px solid #d4af37';
  }

  gameRoomCode.textContent = roomCode;
  resetBoard();
  updateStatus();
  showScreen('game');

  // Attach live listener
  detachListener();
  roomRef = ref(db, `rooms/${code}`);
  roomListener = onValue(roomRef, (snap) => {
    const d = snap.val();
    if (!d) return;

    if (d.status === 'playerLeft') {
      detachListener();
      handlePlayerLeft();
      return;
    }

    const prevTurn = currentTurn;
    currentBoard = d.board || Array(9).fill(null);
    currentTurn = d.turn;

    // Play sound if opponent just moved
    if (prevTurn === mySymbol && currentTurn !== mySymbol) {
      playOpponentMove();
    }

    renderBoard(currentBoard);
    updateStatus();

    if (d.gameOver) {
      detachListener();
      setTimeout(() => showResult(d.result, d.winner), 700);
    }
  });
}

// ── Cell Click ───────────────────────────────────────────────────────────
cells.forEach(cell => {
  cell.addEventListener('click', async () => {
    const index = parseInt(cell.dataset.index);
    if (currentTurn !== mySymbol) return;
    if (currentBoard[index]) return;

    playClick();

    const newBoard = [...currentBoard];
    newBoard[index] = mySymbol;

    const winner = checkWinner(newBoard);
    const full = isBoardFull(newBoard);
    const nextTurn = mySymbol === 'X' ? 'O' : 'X';

    const updates = {
      board: newBoard,
      turn: nextTurn
    };

    if (winner) {
      updates.gameOver = true;
      updates.result = 'win';
      updates.winner = winner;
    } else if (full) {
      updates.gameOver = true;
      updates.result = 'draw';
      updates.winner = null;
    }

    await update(ref(db, `rooms/${roomCode}`), updates);
  });
});

// ── Show Result ──────────────────────────────────────────────────────────
function showResult(result, winner) {
  winnerDisplay.innerHTML = '';

  if (result === 'draw') {
    playDraw();
    resultIcon.textContent = '🤝';
    resultText.textContent = "It's a Draw!";
    winnerDisplay.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center;justify-content:center;">
        ${curryJerseyHTML('result-jersey')}
        <span style="color:var(--muted);font-weight:800;">VS</span>
        ${ronaldoJerseyHTML('result-jersey')}
      </div>
      <p class="winner-name-label">Nobody wins today</p>
    `;
  } else if (winner === 'X') {
    winner === mySymbol ? playWin() : playLose();
    resultIcon.textContent = winner === mySymbol ? '🏆' : '😞';
    resultText.textContent = winner === mySymbol ? 'Lets goooo brevvv!' : 'Night Night bihh!';
    winnerDisplay.innerHTML = `
      ${curryJerseyHTML('result-jersey')}
      <p class="winner-name-label">Steph Curry #30 🏀</p>
    `;
  } else {
    winner === mySymbol ? playWin() : playLose();
    resultIcon.textContent = winner === mySymbol ? '🏆' : '😞';
    resultText.textContent = winner === mySymbol ? 'lets goo brev' : 'Siuuuuu bihh';
    winnerDisplay.innerHTML = `
      ${ronaldoJerseyHTML('result-jersey')}
      <p class="winner-name-label">Cristiano Ronaldo #7 ⚽</p>
    `;
  }

  showScreen('result');
}

// ── Player Left ──────────────────────────────────────────────────────────
function handlePlayerLeft() {
  resultIcon.textContent = '👋';
  resultText.textContent = 'Opponent left the game!';
  winnerDisplay.innerHTML = '';
  showScreen('result');
}

// ── Play Again ───────────────────────────────────────────────────────────
playAgainBtn.addEventListener('click', async () => {
  detachListener();
  // Clean up old room
  if (roomCode) {
    try { await remove(ref(db, `rooms/${roomCode}`)); } catch(e) {}
  }
  roomCode = null;
  mySymbol = null;
  currentTurn = null;
  showScreen('menu');
  joinInput.value = '';
  menuError.textContent = '';
  resetBoard();
});

// Handle tab close — mark room as playerLeft
window.addEventListener('beforeunload', () => {
  if (roomCode) {
    navigator.sendBeacon
      ? navigator.sendBeacon('', '')  // fallback
      : null;
    // Best effort update
    update(ref(db, `rooms/${roomCode}`), { status: 'playerLeft' });
  }
});

// ── Losing Detection ─────────────────────────────────────────────────────
function isAboutToLose(board, symbol) {
  const opponent = symbol === 'X' ? 'O' : 'X';
  return COMBOS.some(([a, b, c]) => {
    const line = [board[a], board[b], board[c]];
    return line.filter(v => v === opponent).length === 2 && line.includes(null);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────
function renderBoard(board) {
  cells.forEach((cell, i) => {
    const prev = cell.className;
    const val = board[i];
    cell.className = 'cell';
    cell.textContent = '';
    if (val) {
      cell.classList.add('taken', val.toLowerCase());
      if (!prev.includes(val.toLowerCase())) cell.classList.add('pop');
    }
  });
}

function resetBoard() {
  currentBoard = Array(9).fill(null);
  wasLosingLastTurn = false;
  cells.forEach(cell => {
    cell.textContent = '';
    cell.className = 'cell';
  });
}

function updateStatus() {
  if (!currentTurn) return;
  if (currentTurn === mySymbol) {
    const losing = isAboutToLose(currentBoard, mySymbol);
    if (losing && !wasLosingLastTurn) playTrashTalk();
    wasLosingLastTurn = losing;
    statusMsg.textContent = losing
      ? "Your turn 💀 lock dude u ain't shihh"
      : 'Your turn';
    statusMsg.style.color = mySymbol === 'X' ? '#ffc72c' : '#d4af37';
  } else {
    wasLosingLastTurn = false;
    statusMsg.textContent = "Opponent's turn...";
    statusMsg.style.color = 'var(--muted)';
  }
}
