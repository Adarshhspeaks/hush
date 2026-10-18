// Socket handlers for room creation, joining, presence, and destruction
import { nanoid } from 'nanoid';
import { MAX_ROOMS, MAX_PER_ROOM } from '../config.js';
import { idOk, fail } from '../utils/validate.js';
import { safeEq } from '../utils/safeEqual.js';
import { checkRoomCreationLimit } from '../utils/rateLimit.js';
import {
  rooms,
  getRoom,
  createRoomRecord,
  deleteRoom,
  getRoomCount,
} from '../store/rooms.js';

export function registerRoomHandlers(socket, io, context) {
  const ip = socket.handshake.address;

  socket.on('room:create', (_, ack) => {
    if (typeof ack !== 'function') return;
    if (!checkRoomCreationLimit(ip)) {
      return ack({ error: 'Too many rooms from your network. Try later.' });
    }
    if (getRoomCount() >= MAX_ROOMS) {
      return ack({ error: 'Server is full. Try later.' });
    }

    const id = nanoid(16);
    const adminToken = nanoid(24);
    createRoomRecord(id, adminToken);
    ack({ id, adminToken });
  });

  socket.on('room:join', (id, ack) => {
    if (typeof ack !== 'function') return;
    const room = idOk(id) && getRoom(id);
    if (!room) return ack({ error: 'This room does not exist or has expired.' });
    if (room.members.size >= MAX_PER_ROOM) return ack({ error: 'Room is full.' });

    context.roomId = id;
    room.members.add(socket.id);
    socket.join(id);
    room.lastActive = Date.now();
    io.to(id).emit('presence', room.members.size);

    const history = room.msgs.map(({ id: mid, iv, ct, ts, miv, mct, gone }) => ({
      id: mid,
      iv,
      ct,
      ts,
      miv,
      mct,
      gone,
    }));
    ack({ ok: true, history, count: room.members.size });
  });

  socket.on('room:destroy', (token, ack) => {
    const roomId = context.roomId;
    const room = roomId && getRoom(roomId);
    if (!room || !safeEq(token, room.adminToken)) {
      return fail(ack, 'Only the room creator can do that.');
    }
    if (typeof ack === 'function') ack({ ok: true }); // ack first, sockets closed right after
    io.to(roomId).emit('destroyed');
    io.in(roomId).disconnectSockets(true);
    deleteRoom(roomId);
  });

  socket.on('disconnect', () => {
    const roomId = context.roomId;
    const room = roomId && getRoom(roomId);
    if (!room) return;
    room.members.delete(socket.id);
    io.to(roomId).emit('presence', room.members.size);
  });
}
