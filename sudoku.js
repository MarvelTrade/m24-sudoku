/**
 * Модуль генерации и проверки судоку для «Москва 24 | Судоку».
 */

export const DIFFICULTIES = {
  easy: { id: 'easy', label: 'Лёгкий', clues: 42 },
  medium: { id: 'medium', label: 'Средний', clues: 34 },
  hard: { id: 'hard', label: 'Сложный', clues: 28 },
  expert: { id: 'expert', label: 'Эксперт', clues: 23 },
};

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isValidPlacement(board, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (board[row * 9 + i] === num && i !== col) return false;
    if (board[i * 9 + col] === num && i !== row) return false;
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r * 9 + c] === num && (r !== row || c !== col)) {
        return false;
      }
    }
  }
  return true;
}

function getCandidates(board, index) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const used = new Uint8Array(10);

  for (let i = 0; i < 9; i++) {
    used[board[row * 9 + i]] = 1;
    used[board[i * 9 + col]] = 1;
  }

  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      used[board[r * 9 + c]] = 1;
    }
  }

  const candidates = [];
  for (let n = 1; n <= 9; n++) {
    if (!used[n]) candidates.push(n);
  }
  return candidates;
}

/**
 * Находит пустую клетку с минимальным числом кандидатов (MRV-эвристика).
 */
function findBestEmptyCell(board) {
  let bestIdx = -1;
  let bestCandidates = null;

  for (let i = 0; i < 81; i++) {
    if (board[i] !== 0) continue;
    const candidates = getCandidates(board, i);
    if (candidates.length === 0) return { index: i, candidates: [] };
    if (!bestCandidates || candidates.length < bestCandidates.length) {
      bestIdx = i;
      bestCandidates = candidates;
      if (candidates.length === 1) break;
    }
  }

  return bestIdx === -1 ? null : { index: bestIdx, candidates: bestCandidates };
}

function solveRandom(board) {
  const next = findBestEmptyCell(board);
  if (!next) return true;
  if (next.candidates.length === 0) return false;

  const candidates = shuffle(next.candidates);
  for (const num of candidates) {
    board[next.index] = num;
    if (solveRandom(board)) return true;
    board[next.index] = 0;
  }
  return false;
}

/**
 * Подсчитывает количество решений до указанного лимита (обычно 2 для проверки единственности).
 */
export function countSolutions(board, limit = 2) {
  let count = 0;

  function backtrack() {
    if (count >= limit) return;
    const next = findBestEmptyCell(board);
    if (!next) {
      count++;
      return;
    }
    if (next.candidates.length === 0) return;

    for (const num of next.candidates) {
      board[next.index] = num;
      backtrack();
      board[next.index] = 0;
      if (count >= limit) return;
    }
  }

  backtrack();
  return count;
}

/**
 * Генерирует полностью заполненное валидное поле 9x9.
 */
export function generateSolvedBoard() {
  const board = new Array(81).fill(0);

  // Диагональные блоки 3x3 независимы — заполняем их случайно для скорости
  for (let box = 0; box < 3; box++) {
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const startRow = box * 3;
    const startCol = box * 3;
    let idx = 0;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        board[r * 9 + c] = nums[idx++];
      }
    }
  }

  solveRandom(board);
  return board;
}

/**
 * Генерирует головоломку судоку с единственным решением для выбранной сложности.
 */
export function generatePuzzle(difficultyKey = 'medium') {
  const config = DIFFICULTIES[difficultyKey] || DIFFICULTIES.medium;
  const solution = generateSolvedBoard();
  const puzzle = solution.slice();

  const indices = shuffle(Array.from({ length: 81 }, (_, i) => i));
  let clues = 81;

  for (const idx of indices) {
    if (clues <= config.clues) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;

    const testBoard = puzzle.slice();
    if (countSolutions(testBoard, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      clues--;
    }
  }

  return {
    puzzle,
    solution,
    difficulty: config.id,
    clues,
  };
}
