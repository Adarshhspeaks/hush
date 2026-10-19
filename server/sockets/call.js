// Socket handler for encrypted WebRTC peer-to-peer signaling (offers, answers, ICE candidates)
import { b64ok } from '../utils/validate.js';
import { getRoom } from '../store/rooms.js';
import { MAX_CT } from '../config.js';

export function registerCallHandlers(socket, getRoomId) {
  socket.on('call:signal', (m) => {
    const roomId = getRoomId();
    const room = roomId && getRoom(roomId);
    if (!room || !m || !b64ok(m.iv, 32) || !b64ok(m.ct, MAX_CT)) return;

    socket.to(roomId).emit('call:signal', { iv: m.iv, ct: m.ct });
  });
}
