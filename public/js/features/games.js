// Games feature: manages turn-based mini game states and encrypted game moves (Tic-Tac-Toe)
import { encrypt } from '../core/crypto.js';

const games = new Map(); // gameId -> { gameId, board, turn, playerX, playerO, winner, views: Set(fn) }

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every((cell) => cell !== null && cell !== undefined)) {
    return { winner: 'draw', line: [] };
  }
  return null;
}

export function getGameState(gameId) {
  let state = games.get(gameId);
  if (!state) {
    state = {
      gameId,
      board: Array(9).fill(null),
      turn: 'X',
      playerX: null,
      playerO: null,
      winner: null,
      winLine: [],
      views: new Set(),
    };
    games.set(gameId, state);
  }
  return state;
}

export function applyGameAction(gameId, actionData) {
  const state = getGameState(gameId);

  if (actionData.action === 'join') {
    if (!state.playerO && actionData.u !== state.playerX?.uid) {
      state.playerO = { uid: actionData.u, name: actionData.n };
    }
  } else if (actionData.action === 'move') {
    const idx = Number(actionData.idx);
    if (idx >= 0 && idx < 9 && !state.board[idx]) {
      state.board[idx] = actionData.symbol;
      state.turn = actionData.nextTurn;

      const res = checkWinner(state.board);
      if (res) {
        state.winner = res.winner;
        state.winLine = res.line || [];
      }
    }
  }

  for (const updateFn of state.views) {
    try {
      updateFn();
    } catch {}
  }
}

export async function sendGameAction({ socket, key, myUid, getMyName, gameId, actionData }) {
  applyGameAction(gameId, { ...actionData, u: myUid, n: getMyName() });

  const payload = {
    n: getMyName(),
    u: myUid,
    k: 'game_move',
    gameId,
    ...actionData,
  };

  const packet = await encrypt(key, payload);
  socket.emit('msg:send', packet);
}
