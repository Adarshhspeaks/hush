// Polls feature: manages anonymous poll states, vote aggregation, and encrypted voting
import { encrypt } from '../core/crypto.js';

// Global registry of poll states: pollId -> { q, opts, votes: Map(uid -> optIdx), views: Set(fn) }
const polls = new Map();

export function getPollState(pollId) {
  let state = polls.get(pollId);
  if (!state) {
    state = {
      votes: new Map(), // uid -> optIdx
      views: new Set(),
    };
    polls.set(pollId, state);
  }
  return state;
}

export function registerVote(pollId, uid, optIdx) {
  const state = getPollState(pollId);
  state.votes.set(String(uid), Number(optIdx));
  for (const updateFn of state.views) {
    try {
      updateFn();
    } catch {}
  }
}

export async function castVote({ socket, key, myUid, getMyName, pollId, optIdx }) {
  registerVote(pollId, myUid, optIdx);

  const payload = {
    n: getMyName(),
    u: myUid,
    k: 'vote',
    pollId,
    optIdx,
  };

  const packet = await encrypt(key, payload);
  socket.emit('msg:send', packet);
}
