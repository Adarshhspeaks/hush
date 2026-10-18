// Emoji reactions controller: reaction chips rendering, toggle state, and floating quick picker
import { encrypt } from '../core/crypto.js';
import { QUICK } from './emoji/index.js';

export function renderReacts(id, refs, reacts) {
  const r = refs.get(id);
  if (!r) return;
  r.reactBox.replaceChildren();
  const counts = new Map();
  for (const e of (reacts.get(id) || new Map()).values()) {
    counts.set(e, (counts.get(e) || 0) + 1);
  }
  for (const [e, n] of counts) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = n > 1 ? `${e} ${n}` : e;
    r.reactBox.append(chip);
  }
}

export async function sendReaction(socket, key, myName, myUid, targetId, emoji, reacts) {
  const had = reacts.get(targetId)?.get(myUid) === emoji; // same emoji again toggles off
  const packet = await encrypt(key, {
    n: myName,
    u: myUid,
    k: 'react',
    t: targetId,
    e: had ? '' : emoji,
  });
  socket.emit('msg:send', packet);
}

export function showQuickRow(msgEl, msgId, onSelect) {
  const old = msgEl.querySelector('.quick');
  if (old) return old.remove();

  const row = document.createElement('div');
  row.className = 'quick';
  for (const e of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.onclick = (ev) => {
      ev.stopPropagation();
      row.remove();
      onSelect(msgId, e);
    };
    row.append(b);
  }
  msgEl.append(row);
}
