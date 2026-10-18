// Typing and audio recording indicator controller
import { $ } from '../core/dom.js';
import { encrypt, decrypt } from '../core/crypto.js';

export function setupTyping({ socket, key, getMyName, myUid }) {
  const typers = new Map();
  let lastHint = 0;

  function refreshTyping() {
    const typingEl = $('typing');
    if (!typingEl) return;
    const now = Date.now();
    for (const [u, v] of typers) {
      if (v.until < now) typers.delete(u);
    }
    const list = [...typers.values()];
    typingEl.textContent = !list.length
      ? ''
      : `${list.slice(0, 2).map((v) => v.name).join(', ')} ${list.length > 1 ? 'are' : 'is'} ${
          list.some((v) => v.act === 'rec') ? 'recording…' : 'typing…'
        }`;
  }

  const interval = setInterval(refreshTyping, 1000);

  async function hint(act) {
    const now = Date.now();
    if (now - lastHint < 2000) return;
    lastHint = now;
    const packet = await encrypt(key, { n: getMyName(), u: myUid, a: act });
    socket.emit('typing', packet);
  }

  socket.on('typing', async (pkt) => {
    try {
      const d = await decrypt(key, pkt);
      if (d.u === myUid || typeof d.n !== 'string') return;
      typers.set(String(d.u), {
        name: d.n.slice(0, 30),
        act: d.a === 'rec' ? 'rec' : 'typing',
        until: Date.now() + 3500,
      });
      refreshTyping();
    } catch {}
  });

  return {
    hint,
    stop: () => clearInterval(interval),
  };
}
