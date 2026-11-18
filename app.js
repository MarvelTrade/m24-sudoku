import { DIFFICULTIES, generatePuzzle } from './sudoku.js';

const STORAGE_STATE = 'm24_sudoku_state_v1';
const STORAGE_STATS = 'm24_sudoku_stats_v1';
const STORAGE_PREFS = 'm24_sudoku_prefs_v1';

const TICKER_MESSAGES = [
  'ПРЯМОЙ ЭФИР: Классическое судоку для тренировки ума в дороге',
  'СОВЕТ: Используйте режим «Заметки», чтобы отмечать возможные цифры в клетке',
  'М24: Нажмите на любую цифру на поле, чтобы подсветить все такие же числа',
  'ЛАЙФХАК: Игра работает даже без интернета — удобно в метро и за городом',
  'ЭФИР: Добавьте страницу на экран «Домой» в браузере телефона, чтобы запускать как приложение',
];

const state = {
  difficulty: 'medium',
  puzzle: [],
  solution: [],
  board: [],
  notes: [], // array of arrays of numbers 1..9
  history: [],
  selectedIndex: null,
  notesMode: false,
  mistakes: 0,
  unlimitedMistakes: false,
  hintsLeft: 3,
  seconds: 0,
  paused: false,
  completed: false,
  lastHintedIndex: null,
};

let prefs = {
  theme: 'light',
  sound: true,
};

let stats = {
  played: 0,
  wins: 0,
  streak: 0,
  bestTimes: {
    easy: null,
    medium: null,
    hard: null,
    expert: null,
  },
};

let timerInterval = null;
let tickerIndex = 0;
let audioCtx = null;

// DOM элементы
const boardEl = document.getElementById('sudoku-board');
const numpadEl = document.getElementById('numpad');
const difficultyLabelEl = document.getElementById('difficulty-label');
const mistakesLabelEl = document.getElementById('mistakes-label');
const timerLabelEl = document.getElementById('timer-label');
const pauseOverlayEl = document.getElementById('pause-overlay');
const iconPauseEl = document.getElementById('icon-pause');
const iconPlayEl = document.getElementById('icon-play');
const btnNotesEl = document.getElementById('btn-notes');
const notesBadgeEl = document.getElementById('notes-badge');
const hintBadgeEl = document.getElementById('hint-badge');
const tickerTextEl = document.getElementById('ticker-text');

const modalDiffEl = document.getElementById('modal-difficulty');
const modalWinEl = document.getElementById('modal-win');
const modalGameOverEl = document.getElementById('modal-gameover');
const modalStatsEl = document.getElementById('modal-stats');

function playTone(type) {
  if (!prefs.sound) return;
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'tap') {
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'error') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.linearRampToValueAtTime(130, now + 0.16);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.setValueAtTime(freq, now + i * 0.09);
        g.gain.setValueAtTime(0.06, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.25);
        o.start(now + i * 0.09);
        o.stop(now + i * 0.09 + 0.25);
      });
    }
  } catch {
    // Игнорируем ошибки аудио на старых браузерах
  }
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFS);
    if (raw) prefs = { ...prefs, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  applyTheme();
  applySoundIcon();
}

function savePrefs() {
  localStorage.setItem(STORAGE_PREFS, JSON.stringify(prefs));
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', prefs.theme);
}

function applySoundIcon() {
  document.getElementById('icon-sound-on').classList.toggle('hidden', !prefs.sound);
  document.getElementById('icon-sound-off').classList.toggle('hidden', prefs.sound);
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_STATS);
    if (raw) {
      const parsed = JSON.parse(raw);
      stats = {
        ...stats,
        ...parsed,
        bestTimes: { ...stats.bestTimes, ...(parsed.bestTimes || {}) },
      };
    }
  } catch {
    // ignore
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_STATS, JSON.stringify(stats));
}

function saveGameState() {
  const payload = {
    difficulty: state.difficulty,
    puzzle: state.puzzle,
    solution: state.solution,
    board: state.board,
    notes: state.notes,
    mistakes: state.mistakes,
    unlimitedMistakes: state.unlimitedMistakes,
    hintsLeft: state.hintsLeft,
    seconds: state.seconds,
    completed: state.completed,
  };
  localStorage.setItem(STORAGE_STATE, JSON.stringify(payload));
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.board) || saved.board.length !== 81) return false;

    state.difficulty = saved.difficulty || 'medium';
    state.puzzle = saved.puzzle;
    state.solution = saved.solution;
    state.board = saved.board;
    state.notes = saved.notes || Array.from({ length: 81 }, () => []);
    state.mistakes = saved.mistakes || 0;
    state.unlimitedMistakes = Boolean(saved.unlimitedMistakes);
    state.hintsLeft = typeof saved.hintsLeft === 'number' ? saved.hintsLeft : 3;
    state.seconds = saved.seconds || 0;
    state.completed = Boolean(saved.completed);
    state.history = [];
    state.selectedIndex = null;
    state.paused = false;
    state.lastHintedIndex = null;
    return true;
  } catch {
    return false;
  }
}

function startNewGame(difficultyKey = state.difficulty) {
  const { puzzle, solution, difficulty } = generatePuzzle(difficultyKey);

  state.difficulty = difficulty;
  state.puzzle = puzzle;
  state.solution = solution;
  state.board = puzzle.slice();
  state.notes = Array.from({ length: 81 }, () => []);
  state.history = [];
  state.selectedIndex = null;
  state.notesMode = false;
  state.mistakes = 0;
  state.unlimitedMistakes = false;
  state.hintsLeft = 3;
  state.seconds = 0;
  state.paused = false;
  state.completed = false;
  state.lastHintedIndex = null;

  stats.played += 1;
  saveStats();
  saveGameState();

  closeAllModals();
  renderAll();
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  if (state.paused || state.completed) return;

  timerInterval = setInterval(() => {
    if (!state.paused && !state.completed) {
      state.seconds += 1;
      timerLabelEl.textContent = formatTime(state.seconds);
      if (state.seconds % 5 === 0) saveGameState();
    }
  }, 1000);
}

function setPaused(paused) {
  if (state.completed) return;
  state.paused = paused;
  pauseOverlayEl.classList.toggle('hidden', !paused);
  pauseOverlayEl.setAttribute('aria-hidden', String(!paused));
  iconPauseEl.classList.toggle('hidden', paused);
  iconPlayEl.classList.toggle('hidden', !paused);
  if (paused) {
    clearInterval(timerInterval);
  } else {
    startTimer();
  }
}

function pushHistory() {
  state.history.push({
    board: state.board.slice(),
    notes: state.notes.map((arr) => arr.slice()),
    selectedIndex: state.selectedIndex,
  });
  if (state.history.length > 60) {
    state.history.shift();
  }
}

function undo() {
  if (state.paused || state.completed || state.history.length === 0) return;
  const prev = state.history.pop();
  state.board = prev.board;
  state.notes = prev.notes;
  state.selectedIndex = prev.selectedIndex;
  state.lastHintedIndex = null;
  playTone('tap');
  saveGameState();
  renderAll();
}

function clearPeerNotes(index, num) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;

  for (let i = 0; i < 9; i++) {
    removeNote(row * 9 + i, num);
    removeNote(i * 9 + col, num);
  }
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      removeNote(r * 9 + c, num);
    }
  }
}

function removeNote(index, num) {
  const idx = state.notes[index].indexOf(num);
  if (idx !== -1) state.notes[index].splice(idx, 1);
}

function handleNumberInput(num) {
  if (state.paused || state.completed) return;
  if (state.selectedIndex === null) return;

  const idx = state.selectedIndex;
  if (state.puzzle[idx] !== 0) return;

  if (state.notesMode) {
    if (state.board[idx] !== 0) return;
    pushHistory();
    const cellNotes = state.notes[idx];
    const pos = cellNotes.indexOf(num);
    if (pos === -1) {
      cellNotes.push(num);
      cellNotes.sort((a, b) => a - b);
    } else {
      cellNotes.splice(pos, 1);
    }
    playTone('tap');
    saveGameState();
    renderAll();
    return;
  }

  if (state.board[idx] === num) return;

  pushHistory();
  state.board[idx] = num;
  state.notes[idx] = [];
  state.lastHintedIndex = null;

  if (num !== state.solution[idx]) {
    state.mistakes += 1;
    playTone('error');
    saveGameState();
    renderAll();

    if (!state.unlimitedMistakes && state.mistakes >= 3) {
      setPaused(true);
      modalGameOverEl.classList.remove('hidden');
    }
    return;
  }

  clearPeerNotes(idx, num);
  playTone('tap');
  saveGameState();
  renderAll();
  checkWin();
}

function handleErase() {
  if (state.paused || state.completed) return;
  if (state.selectedIndex === null) return;
  const idx = state.selectedIndex;
  if (state.puzzle[idx] !== 0) return;
  if (state.board[idx] === 0 && state.notes[idx].length === 0) return;

  pushHistory();
  state.board[idx] = 0;
  state.notes[idx] = [];
  state.lastHintedIndex = null;
  playTone('tap');
  saveGameState();
  renderAll();
}

function handleHint() {
  if (state.paused || state.completed || state.hintsLeft <= 0) return;

  let targetIdx = state.selectedIndex;
  if (
    targetIdx === null ||
    state.puzzle[targetIdx] !== 0 ||
    state.board[targetIdx] === state.solution[targetIdx]
  ) {
    const emptyIndices = [];
    for (let i = 0; i < 81; i++) {
      if (state.board[i] !== state.solution[i]) emptyIndices.push(i);
    }
    if (emptyIndices.length === 0) return;
    targetIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  pushHistory();
  const correctNum = state.solution[targetIdx];
  state.board[targetIdx] = correctNum;
  state.notes[targetIdx] = [];
  state.selectedIndex = targetIdx;
  state.lastHintedIndex = targetIdx;
  state.hintsLeft -= 1;

  clearPeerNotes(targetIdx, correctNum);
  playTone('tap');
  saveGameState();
  renderAll();
  checkWin();
}

function checkWin() {
  for (let i = 0; i < 81; i++) {
    if (state.board[i] !== state.solution[i]) return;
  }

  state.completed = true;
  clearInterval(timerInterval);
  playTone('win');

  stats.wins += 1;
  stats.streak += 1;
  const prevBest = stats.bestTimes[state.difficulty];
  if (prevBest === null || state.seconds < prevBest) {
    stats.bestTimes[state.difficulty] = state.seconds;
  }
  saveStats();
  saveGameState();

  document.getElementById('win-diff').textContent = DIFFICULTIES[state.difficulty].label;
  document.getElementById('win-time').textContent = formatTime(state.seconds);
  document.getElementById('win-mistakes').textContent = String(state.mistakes);
  modalWinEl.classList.remove('hidden');
}

function renderBoard() {
  boardEl.innerHTML = '';

  const sel = state.selectedIndex;
  const selRow = sel !== null ? Math.floor(sel / 9) : -1;
  const selCol = sel !== null ? sel % 9 : -1;
  const selBoxRow = sel !== null ? Math.floor(selRow / 3) * 3 : -1;
  const selBoxCol = sel !== null ? Math.floor(selCol / 3) * 3 : -1;
  const selVal = sel !== null ? state.board[sel] : 0;

  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9);
    const col = i % 9;
    const val = state.board[i];
    const isGiven = state.puzzle[i] !== 0;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.index = String(i);
    cell.dataset.row = String(row);
    cell.dataset.col = String(col);
    cell.setAttribute('role', 'gridcell');

    if (isGiven) {
      cell.classList.add('given');
    } else if (val !== 0) {
      cell.classList.add('user-val');
      if (val !== state.solution[i]) {
        cell.classList.add('error');
      }
    }

    if (i === state.lastHintedIndex) {
      cell.classList.add('hinted');
    }

    if (sel !== null) {
      const sameRow = row === selRow;
      const sameCol = col === selCol;
      const sameBox =
        row >= selBoxRow &&
        row < selBoxRow + 3 &&
        col >= selBoxCol &&
        col < selBoxCol + 3;

      if (i === sel) {
        cell.classList.add('selected');
      } else if (selVal !== 0 && val === selVal) {
        cell.classList.add('same-num');
      } else if (sameRow || sameCol || sameBox) {
        cell.classList.add('peer');
      }
    }

    if (val !== 0) {
      cell.textContent = String(val);
    } else if (state.notes[i].length > 0) {
      const notesGrid = document.createElement('div');
      notesGrid.className = 'notes-grid';
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement('span');
        span.className = 'note-num';
        if (state.notes[i].includes(n)) {
          span.textContent = String(n);
          if (selVal !== 0 && selVal === n) {
            span.classList.add('highlight-note');
          }
        }
        notesGrid.appendChild(span);
      }
      cell.appendChild(notesGrid);
    }

    cell.addEventListener('click', () => {
      if (state.paused) return;
      state.selectedIndex = i;
      renderBoard();
    });

    boardEl.appendChild(cell);
  }
}

function renderNumpad() {
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = state.board[i];
    if (v !== 0 && v === state.solution[i]) {
      counts[v] += 1;
    }
  }

  numpadEl.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const left = Math.max(0, 9 - counts[n]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-btn';
    btn.disabled = left === 0 && !state.notesMode;

    const digit = document.createElement('span');
    digit.className = 'num-digit';
    digit.textContent = String(n);

    const rem = document.createElement('span');
    rem.className = 'num-left';
    rem.textContent = left > 0 ? String(left) : '✓';

    btn.appendChild(digit);
    btn.appendChild(rem);
    btn.addEventListener('click', () => handleNumberInput(n));
    numpadEl.appendChild(btn);
  }
}

function renderStatus() {
  const diffConfig = DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium;
  difficultyLabelEl.textContent = diffConfig.label;
  mistakesLabelEl.textContent = state.unlimitedMistakes
    ? String(state.mistakes)
    : `${state.mistakes} / 3`;
  timerLabelEl.textContent = formatTime(state.seconds);

  btnNotesEl.classList.toggle('active', state.notesMode);
  btnNotesEl.setAttribute('aria-pressed', String(state.notesMode));
  notesBadgeEl.textContent = state.notesMode ? 'ON' : 'OFF';
  hintBadgeEl.textContent = String(state.hintsLeft);
}

function renderAll() {
  renderStatus();
  renderBoard();
  renderNumpad();
}

function renderStatsModal() {
  document.getElementById('stat-wins').textContent = String(stats.wins);
  document.getElementById('stat-streak').textContent = String(stats.streak);
  document.getElementById('stat-played').textContent = String(stats.played);

  const listEl = document.getElementById('stats-best-times');
  listEl.innerHTML = '';
  Object.values(DIFFICULTIES).forEach((diff) => {
    const row = document.createElement('div');
    row.className = 'best-time-row';
    const label = document.createElement('span');
    label.textContent = `Лучшее время (${diff.label})`;
    const val = document.createElement('strong');
    val.className = 'tabular-nums';
    val.textContent =
      stats.bestTimes[diff.id] !== null ? formatTime(stats.bestTimes[diff.id]) : '—';
    row.appendChild(label);
    row.appendChild(val);
    listEl.appendChild(row);
  });
}

function closeAllModals() {
  modalDiffEl.classList.add('hidden');
  modalWinEl.classList.add('hidden');
  modalGameOverEl.classList.add('hidden');
  modalStatsEl.classList.add('hidden');
}

function bindEvents() {
  document.getElementById('btn-theme').addEventListener('click', () => {
    prefs.theme = prefs.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    savePrefs();
  });

  document.getElementById('btn-sound').addEventListener('click', () => {
    prefs.sound = !prefs.sound;
    applySoundIcon();
    savePrefs();
    if (prefs.sound) playTone('tap');
  });

  document.getElementById('btn-new-game').addEventListener('click', () => {
    modalDiffEl.classList.remove('hidden');
  });

  document.getElementById('btn-difficulty').addEventListener('click', () => {
    modalDiffEl.classList.remove('hidden');
  });

  document.getElementById('btn-close-diff').addEventListener('click', () => {
    modalDiffEl.classList.add('hidden');
  });

  document.querySelectorAll('.diff-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.completed && state.seconds > 10) {
        stats.streak = 0;
        saveStats();
      }
      startNewGame(btn.dataset.diff);
    });
  });

  document.getElementById('btn-pause').addEventListener('click', () => {
    setPaused(!state.paused);
  });

  document.getElementById('btn-resume').addEventListener('click', () => {
    setPaused(false);
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-erase').addEventListener('click', handleErase);
  document.getElementById('btn-hint').addEventListener('click', handleHint);

  btnNotesEl.addEventListener('click', () => {
    state.notesMode = !state.notesMode;
    playTone('tap');
    renderStatus();
    renderNumpad();
  });

  document.getElementById('btn-win-new').addEventListener('click', () => {
    modalWinEl.classList.add('hidden');
    modalDiffEl.classList.remove('hidden');
  });

  document.getElementById('btn-win-close').addEventListener('click', () => {
    modalWinEl.classList.add('hidden');
  });

  document.getElementById('btn-go-new').addEventListener('click', () => {
    stats.streak = 0;
    saveStats();
    modalGameOverEl.classList.add('hidden');
    modalDiffEl.classList.remove('hidden');
  });

  document.getElementById('btn-go-continue').addEventListener('click', () => {
    state.unlimitedMistakes = true;
    modalGameOverEl.classList.add('hidden');
    setPaused(false);
    saveGameState();
    renderStatus();
  });

  document.getElementById('btn-stats').addEventListener('click', () => {
    renderStatsModal();
    modalStatsEl.classList.remove('hidden');
  });

  document.getElementById('btn-close-stats').addEventListener('click', () => {
    modalStatsEl.classList.add('hidden');
  });

  document.getElementById('btn-reset-stats').addEventListener('click', () => {
    stats = {
      played: 0,
      wins: 0,
      streak: 0,
      bestTimes: { easy: null, medium: null, hard: null, expert: null },
    };
    saveStats();
    renderStatsModal();
  });

  // Клавиатура для удобства на ПК
  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') {
      handleNumberInput(Number(e.key));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      handleErase();
    } else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') {
      state.notesMode = !state.notesMode;
      renderStatus();
      renderNumpad();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (state.selectedIndex !== null) {
      const r = Math.floor(state.selectedIndex / 9);
      const c = state.selectedIndex % 9;
      if (e.key === 'ArrowUp' && r > 0) state.selectedIndex = (r - 1) * 9 + c;
      else if (e.key === 'ArrowDown' && r < 8) state.selectedIndex = (r + 1) * 9 + c;
      else if (e.key === 'ArrowLeft' && c > 0) state.selectedIndex = r * 9 + (c - 1);
      else if (e.key === 'ArrowRight' && c < 8) state.selectedIndex = r * 9 + (c + 1);
      else return;
      renderBoard();
    }
  });

  // Автопауза при сворачивании вкладки на телефоне
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.completed && !state.paused) {
      saveGameState();
    }
  });
}

function startTicker() {
  setInterval(() => {
    tickerIndex = (tickerIndex + 1) % TICKER_MESSAGES.length;
    tickerTextEl.textContent = TICKER_MESSAGES[tickerIndex];
  }, 7000);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ignore if opened via file://
    });
  }
}

function init() {
  loadPrefs();
  loadStats();
  bindEvents();
  startTicker();
  registerServiceWorker();

  if (loadGameState()) {
    renderAll();
    startTimer();
  } else {
    startNewGame('medium');
  }
}

init();
