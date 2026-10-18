// Socket handler for ephemeral typing and recording hints
import { b64ok } from '../utils/validate.js';
import { getRoom } from '../store/rooms.js';
import { MAX_TYPING_CT, TYPING_THROTTLE_MS } from '../config.js';

export function registerTypingHandlers(socket, getRoomId) {
  let lastTyping = 0;

  socket.on('typing', (m) => {
    const roomId = getRoomId();
    const room = roomId && getRoom(roomId);
    if (!room || !m || !b64ok(m.iv, 32) || !b64ok(m.ct, MAX_TYPING_CT)) return;

    const now = Date.now();
    if (now - lastTyping < TYPING_THROTTLE_MS) return;
    lastTyping = now;

    socket.to(roomId).emit('typing', { iv: m.iv, ct: m.ct });
  });
}
