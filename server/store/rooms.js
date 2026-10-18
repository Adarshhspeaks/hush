// In-memory room store: keeps active rooms, message history, and member sets
// Nothing is ever persisted to disk. Restarting server clears all rooms.
import { dropMedia } from './media.js';

export const rooms = new Map(); // id -> { adminToken, lastActive, msgs: [], members: Set, media: number }

export function createRoomRecord(id, adminToken, now = Date.now()) {
  const room = {
    adminToken,
    lastActive: now,
    msgs: [],
    members: new Set(),
    media: 0,
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id) {
  return rooms.get(id);
}

export function deleteRoom(id) {
  const room = rooms.get(id);
  if (!room) return;
  for (const m of room.msgs) {
    dropMedia(room, m);
  }
  rooms.delete(id);
}

export function getRoomCount() {
  return rooms.size;
}
