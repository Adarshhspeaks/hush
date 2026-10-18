// Socket handlers for sending and deleting encrypted messages
import { nanoid } from 'nanoid';
import {
  MAX_CT,
  MAX_MEDIA_CT,
  MAX_MSGS,
  RATE_LIMIT_TEXT_COST,
  RATE_LIMIT_MEDIA_COST,
} from '../config.js';
import { b64ok, fail } from '../utils/validate.js';
import { safeEq } from '../utils/safeEqual.js';
import { getRoom } from '../store/rooms.js';
import {
  dropMedia,
  addMedia,
  evictOldestMedia,
  fitsGlobalCap,
} from '../store/media.js';

export function registerMessageHandlers(socket, io, context) {
  socket.on('msg:send', (m, ack) => {
    const roomId = context.roomId;
    const room = roomId && getRoom(roomId);
    if (!room || !m || !b64ok(m.iv, 32) || !b64ok(m.ct, MAX_CT)) {
      return fail(ack, 'Invalid message.');
    }

    const hasMedia = m.mct !== undefined || m.miv !== undefined;
    if (hasMedia && (!b64ok(m.miv, 32) || !b64ok(m.mct, MAX_MEDIA_CT))) {
      return fail(ack, 'That file is too large (max ~1.5 MB).');
    }

    const cost = hasMedia ? RATE_LIMIT_MEDIA_COST : RATE_LIMIT_TEXT_COST;
    if (!context.bucket.tryConsume(cost)) {
      return fail(ack, 'Slow down.');
    }

    const size = hasMedia ? m.mct.length : 0;
    if (hasMedia) {
      evictOldestMedia(room, size);
      if (!fitsGlobalCap(size)) {
        return fail(ack, 'Server media storage is full. Try again later.');
      }
    }

    const now = Date.now();
    const delToken = nanoid(16);
    const msg = { id: nanoid(8), iv: m.iv, ct: m.ct, ts: now, delToken };

    if (hasMedia) {
      msg.miv = m.miv;
      msg.mct = m.mct;
      addMedia(room, size);
    }

    room.msgs.push(msg);
    if (room.msgs.length > MAX_MSGS) {
      dropMedia(room, room.msgs[0]);
      room.msgs.shift();
    }
    room.lastActive = now;

    const publicMsg = {
      id: msg.id,
      iv: msg.iv,
      ct: msg.ct,
      ts: msg.ts,
      miv: msg.miv,
      mct: msg.mct,
    };
    io.to(roomId).emit('msg', publicMsg);
    if (typeof ack === 'function') ack({ ok: true, id: msg.id, delToken });
  });

  socket.on('msg:delete', (data, ack) => {
    const roomId = context.roomId;
    const room = roomId && getRoom(roomId);
    if (!room || !data || typeof data.id !== 'string') {
      return fail(ack, 'Invalid request.');
    }

    const idx = room.msgs.findIndex((m) => m.id === data.id);
    if (idx === -1) return fail(ack, 'Message not found.');

    const target = room.msgs[idx];
    const isAuthor = Boolean(data.delToken && target.delToken && safeEq(data.delToken, target.delToken));
    const isAdmin = Boolean(data.adminToken && room.adminToken && safeEq(data.adminToken, room.adminToken));
    if (!isAuthor && !isAdmin) {
      return fail(ack, 'Not authorized to delete this message.');
    }

    dropMedia(room, target);
    room.msgs.splice(idx, 1);
    room.lastActive = Date.now();
    io.to(roomId).emit('msg:delete', { id: data.id });
    if (typeof ack === 'function') ack({ ok: true });
  });
}
