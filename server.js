// Hush server: a dumb relay. It only ever sees ciphertext (iv + ct) and metadata.
// Rooms live in memory only, nothing is written to disk, restart = everything gone.
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

const TTL = 24 * 60 * 60 * 1000;            // messages and idle rooms expire after 24h
const MAX_MSGS = 200;                       // history kept per room
const MAX_ROOMS = 2000;
const MAX_PER_ROOM = 50;
const MAX_CT = 4096;                        // max ciphertext chars for the text/meta part
const MAX_MEDIA_CT = 2_200_000;             // max ciphertext chars for one photo/voice note (~1.5 MB raw)
const ROOM_MEDIA_CAP = num(process.env.ROOM_MEDIA_CAP, 12_000_000);     // per room; oldest media is dropped first
const GLOBAL_MEDIA_CAP = num(process.env.GLOBAL_MEDIA_CAP, 120_000_000); // whole server, protects memory
let globalMedia = 0;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// strict headers: no inline scripts, nothing external, no referrer leaks
app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/r/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public/room.html')));

const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 3_000_000 });

const rooms = new Map(); // id -> { adminToken, lastActive, msgs: [], members: Set, media: number }
const createLog = new Map(); // ip -> [timestamps]
const idOk = (id) => typeof id === 'string' && /^[\w-]{16}$/.test(id);
const b64ok = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && /^[\w-]+$/.test(s);
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const fail = (ack, error) => typeof ack === 'function' && ack({ error });

// free a message's media but keep the (encrypted) text part so history stays consistent
function dropMedia(room, msg) {
  if (!msg.mct) return;
  room.media -= msg.mct.length;
  globalMedia -= msg.mct.length;
  delete msg.mct; delete msg.miv;
  msg.gone = true;
}
function deleteRoom(id) {
  const room = rooms.get(id);
  if (!room) return;
  for (const m of room.msgs) dropMedia(room, m);
  rooms.delete(id);
}

io.on('connection', (socket) => {
  const ip = socket.handshake.address;
  let roomId = null;
  let tokens = 5, lastRefill = Date.now(); // bucket: burst 5, refills 2.5/s (media costs 3)
  let lastTyping = 0;

  socket.on('room:create', (_, ack) => {
    if (typeof ack !== 'function') return;
    const now = Date.now();
    const recent = (createLog.get(ip) || []).filter((t) => now - t < 3600e3);
    if (recent.length >= 10) return ack({ error: 'Too many rooms from your network. Try later.' });
    if (rooms.size >= MAX_ROOMS) return ack({ error: 'Server is full. Try later.' });
    recent.push(now); createLog.set(ip, recent);
    const id = nanoid(16), adminToken = nanoid(24);
    rooms.set(id, { adminToken, lastActive: now, msgs: [], members: new Set(), media: 0 });
    ack({ id, adminToken });
  });

  socket.on('room:join', (id, ack) => {
    if (typeof ack !== 'function') return;
    const room = idOk(id) && rooms.get(id);
    if (!room) return ack({ error: 'This room does not exist or has expired.' });
    if (room.members.size >= MAX_PER_ROOM) return ack({ error: 'Room is full.' });
    roomId = id;
    room.members.add(socket.id);
    socket.join(id);
    room.lastActive = Date.now();
    io.to(id).emit('presence', room.members.size);
    const history = room.msgs.map(({ id: mid, iv, ct, ts, miv, mct, gone }) => ({ id: mid, iv, ct, ts, miv, mct, gone }));
    ack({ ok: true, history, count: room.members.size });
  });

  socket.on('msg:send', (m, ack) => {
    const room = roomId && rooms.get(roomId);
    if (!room || !m || !b64ok(m.iv, 32) || !b64ok(m.ct, MAX_CT)) return fail(ack, 'Invalid message.');
    const hasMedia = m.mct !== undefined || m.miv !== undefined;
    if (hasMedia && (!b64ok(m.miv, 32) || !b64ok(m.mct, MAX_MEDIA_CT))) return fail(ack, 'That file is too large (max ~1.5 MB).');

    const now = Date.now();
    tokens = Math.min(5, tokens + ((now - lastRefill) / 1000) * 2.5); lastRefill = now;
    const cost = hasMedia ? 3 : 1;
    if (tokens < cost) return fail(ack, 'Slow down.');

    const size = hasMedia ? m.mct.length : 0;
    if (hasMedia) {
      // make room: drop this room's oldest media first, then check the server-wide budget
      for (const old of room.msgs) {
        if (room.media + size <= ROOM_MEDIA_CAP) break;
        dropMedia(room, old);
      }
      if (globalMedia + size > GLOBAL_MEDIA_CAP) return fail(ack, 'Server media storage is full. Try again later.');
    }
    tokens -= cost;

    const delToken = nanoid(16);
    const msg = { id: nanoid(8), iv: m.iv, ct: m.ct, ts: now, delToken };
    if (hasMedia) { msg.miv = m.miv; msg.mct = m.mct; room.media += size; globalMedia += size; }
    room.msgs.push(msg);
    if (room.msgs.length > MAX_MSGS) dropMedia(room, room.msgs[0]), room.msgs.shift();
    room.lastActive = now;
    const publicMsg = { id: msg.id, iv: msg.iv, ct: msg.ct, ts: msg.ts, miv: msg.miv, mct: msg.mct };
    io.to(roomId).emit('msg', publicMsg);
    if (typeof ack === 'function') ack({ ok: true, id: msg.id, delToken });
  });

  socket.on('msg:delete', (data, ack) => {
    const room = roomId && rooms.get(roomId);
    if (!room || !data || typeof data.id !== 'string') return fail(ack, 'Invalid request.');
    const idx = room.msgs.findIndex((m) => m.id === data.id);
    if (idx === -1) return fail(ack, 'Message not found.');
    const target = room.msgs[idx];
    const isAuthor = Boolean(data.delToken && target.delToken && safeEq(data.delToken, target.delToken));
    const isAdmin = Boolean(data.adminToken && room.adminToken && safeEq(data.adminToken, room.adminToken));
    if (!isAuthor && !isAdmin) return fail(ack, 'Not authorized to delete this message.');

    dropMedia(room, target);
    room.msgs.splice(idx, 1);
    room.lastActive = Date.now();
    io.to(roomId).emit('msg:delete', { id: data.id });
    if (typeof ack === 'function') ack({ ok: true });
  });

  // "typing…" / "recording…" hints: encrypted, relayed to others, never stored
  socket.on('typing', (m) => {
    const room = roomId && rooms.get(roomId);
    if (!room || !m || !b64ok(m.iv, 32) || !b64ok(m.ct, 512)) return;
    const now = Date.now();
    if (now - lastTyping < 1500) return;
    lastTyping = now;
    socket.to(roomId).emit('typing', { iv: m.iv, ct: m.ct });
  });

  socket.on('room:destroy', (token, ack) => {
    const room = roomId && rooms.get(roomId);
    if (!room || !safeEq(token, room.adminToken)) return fail(ack, 'Only the room creator can do that.');
    if (typeof ack === 'function') ack({ ok: true }); // ack first, sockets are closed right after
    io.to(roomId).emit('destroyed');
    io.in(roomId).disconnectSockets(true);
    deleteRoom(roomId);
  });

  socket.on('disconnect', () => {
    const room = roomId && rooms.get(roomId);
    if (!room) return;
    room.members.delete(socket.id);
    io.to(roomId).emit('presence', room.members.size);
  });
});

// sweep: drop expired messages (and their media), delete idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    room.msgs = room.msgs.filter((m) => {
      if (now - m.ts < TTL) return true;
      dropMedia(room, m);
      return false;
    });
    if (room.members.size === 0 && now - room.lastActive > TTL) deleteRoom(id);
  }
}, 5 * 60 * 1000).unref();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Hush on http://localhost:${PORT}`));
