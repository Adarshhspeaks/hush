// Game message kind handler: renders interactive turn-based Tic-Tac-Toe cards
import { registerKind } from '../registry.js';
import { getGameState, sendGameAction, checkWinner } from '../../features/games.js';

export const gameKind = {
  snippet: () => '🎮 Mini Game: Tic-Tac-Toe',
  render: (body, { msg, data, key, myUid, getMyName, socket, stick, toBottom }) => {
    const gameId = String(data.gameId || msg.id);
    const state = getGameState(gameId);

    if (data.playerX && !state.playerX) {
      state.playerX = data.playerX;
    }
    if (data.playerO && !state.playerO) {
      state.playerO = data.playerO;
    }

    const card = document.createElement('div');
    card.className = 'game-card';

    // Header
    const head = document.createElement('div');
    head.className = 'game-head';

    const titleEl = document.createElement('div');
    titleEl.className = 'game-title';
    titleEl.textContent = '🎮 Tic-Tac-Toe';

    const badge = document.createElement('span');
    badge.className = 'game-badge';
    badge.textContent = '2 Players';

    head.append(titleEl, badge);

    // Status banner
    const statusBox = document.createElement('div');
    statusBox.className = 'game-status';

    // 3x3 Grid
    const grid = document.createElement('div');
    grid.className = 'ttt-grid';

    card.append(head, statusBox, grid);
    body.append(card);

    function updateView() {
      statusBox.innerHTML = '';
      grid.innerHTML = '';

      const nameX = state.playerX?.name || 'Player X';
      const nameO = state.playerO?.name || 'Waiting...';

      // Status text
      if (state.winner) {
        if (state.winner === 'draw') {
          statusBox.textContent = `🤝 It's a draw between ${nameX} and ${nameO}!`;
        } else {
          const winnerName = state.winner === 'X' ? nameX : nameO;
          statusBox.textContent = `🎉 ${winnerName} (${state.winner}) won!`;
        }
      } else if (!state.playerO) {
        if (state.playerX?.uid === myUid) {
          statusBox.textContent = 'Waiting for someone to join…';
        } else {
          const joinBtn = document.createElement('button');
          joinBtn.className = 'btn pink small';
          joinBtn.type = 'button';
          joinBtn.textContent = '⚔️ Join as Player O';
          joinBtn.onclick = () => {
            sendGameAction({
              socket,
              key,
              myUid,
              getMyName,
              gameId,
              actionData: { action: 'join' },
            });
          };
          statusBox.append(joinBtn);
        }
      } else {
        const isMyTurn = (state.turn === 'X' && state.playerX?.uid === myUid) ||
                         (state.turn === 'O' && state.playerO?.uid === myUid);
        const currentTurnName = state.turn === 'X' ? nameX : nameO;
        statusBox.textContent = isMyTurn ? `👉 Your turn (${state.turn})!` : `${currentTurnName}'s turn (${state.turn})`;
      }

      // Render 9 cells
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ttt-cell';
        const val = state.board[i];

        if (val) {
          cell.textContent = val;
          cell.classList.add(val === 'X' ? 'cell-x' : 'cell-o', 'filled', 'disabled');
        } else {
          const canMove = !state.winner &&
                          Boolean(state.playerO) &&
                          ((state.turn === 'X' && state.playerX?.uid === myUid) ||
                           (state.turn === 'O' && state.playerO?.uid === myUid));

          if (!canMove) {
            cell.classList.add('disabled');
          } else {
            cell.onclick = () => {
              const symbol = state.turn;
              const nextTurn = symbol === 'X' ? 'O' : 'X';
              sendGameAction({
                socket,
                key,
                myUid,
                getMyName,
                gameId,
                actionData: {
                  action: 'move',
                  idx: i,
                  symbol,
                  nextTurn,
                },
              });
            };
          }
        }

        if (state.winLine && state.winLine.includes(i)) {
          cell.classList.add('win-line');
        }

        grid.appendChild(cell);
      }
    }

    state.views.add(updateView);
    updateView();

    if (stick) toBottom();
  },
};

registerKind('game', gameKind);
