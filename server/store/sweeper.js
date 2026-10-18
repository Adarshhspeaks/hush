// Background sweeper: periodically drops expired messages and idle rooms
import { TTL, SWEEPER_INTERVAL } from '../config.js';
import { rooms, deleteRoom } from './rooms.js';
import { dropMedia } from './media.js';

export function sweep() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    room.msgs = room.msgs.filter((m) => {
      if (now - m.ts < TTL) return true;
      dropMedia(room, m);
      return false;
    });
    if (room.members.size === 0 && now - room.lastActive > TTL) {
      deleteRoom(id);
    }
  }
}

export function startSweeper(interval = SWEEPER_INTERVAL) {
  const timer = setInterval(sweep, interval);
  timer.unref();
  return timer;
}
