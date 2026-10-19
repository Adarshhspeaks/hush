// Message list controller: history tracking, deduplication, reactions dispatch, and deletion transitions
import { decrypt } from '../core/crypto.js';
import { atBottom, toBottom } from '../core/dom.js';
import { renderReacts } from '../features/reactions.js';
import { registerVote } from '../features/polls.js';
import { applyGameAction } from '../features/games.js';
import { renderMessageBubble } from './render.js';

export function createMessageList({
  logEl,
  key,
  myUid,
  getMyName,
  adminToken,
  getDelToken,
  socket,
  flashNotice,
  stickerTray,
}) {
  const seen = new Set();
  const refs = new Map(); // id -> { reactBox, actions, snippet, authorName, authorUid }
  const reacts = new Map(); // id -> Map(uid -> emoji)

  async function show(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);

    let data = null;
    try {
      data = await decrypt(key, m);
    } catch {}

    // Reactions are tiny encrypted messages pointing at a target message
    if (data && data.k === 'react') {
      if (typeof data.t === 'string' && typeof data.e === 'string' && data.e.length <= 8) {
        const map = reacts.get(data.t) || new Map();
        if (data.e) {
          map.set(String(data.u), data.e);
        } else {
          map.delete(String(data.u));
        }
        reacts.set(data.t, map);
        renderReacts(data.t, refs, reacts);
      }
      return;
    }

    // Poll votes are encrypted messages updating an existing poll
    if (data && data.k === 'vote') {
      if (typeof data.pollId === 'string' && typeof data.optIdx === 'number') {
        registerVote(data.pollId, data.u, data.optIdx);
      }
      return;
    }

    // Mini-game moves/actions are encrypted messages updating a game
    if (data && data.k === 'game_move') {
      if (typeof data.gameId === 'string') {
        applyGameAction(data.gameId, data);
      }
      return;
    }

    const stick = atBottom(logEl) || data?.u === myUid;

    const { el } = renderMessageBubble({
      msg: m,
      data,
      key,
      myUid,
      getMyName,
      adminToken,
      getDelToken,
      refs,
      reacts,
      socket,
      stick,
      toBottom: () => toBottom(logEl),
      flashNotice,
      stickerTray,
    });

    logEl.append(el);
    if (stick) toBottom(logEl);
  }

  function remove(id) {
    const target = document.getElementById('msg-' + id);
    if (target) {
      target.classList.add('deleting');
      setTimeout(() => {
        target.remove();
        refs.delete(id);
        reacts.delete(id);
      }, 250);
    }
  }

  return {
    show,
    remove,
    refs,
    reacts,
  };
}
