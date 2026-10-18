// Media byte accounting and eviction logic for per-room and global limits
import { ROOM_MEDIA_CAP, GLOBAL_MEDIA_CAP } from '../config.js';

let globalMedia = 0;

export const getGlobalMedia = () => globalMedia;

// Free a message's media but keep the encrypted text part so history stays consistent
export function dropMedia(room, msg) {
  if (!msg.mct) return;
  const size = msg.mct.length;
  room.media -= size;
  globalMedia -= size;
  delete msg.mct;
  delete msg.miv;
  msg.gone = true;
}

export function addMedia(room, size) {
  room.media += size;
  globalMedia += size;
}

// Make room for incoming media: drop this room's oldest media first
export function evictOldestMedia(room, incomingSize) {
  for (const old of room.msgs) {
    if (room.media + incomingSize <= ROOM_MEDIA_CAP) break;
    dropMedia(room, old);
  }
}

export function fitsGlobalCap(incomingSize) {
  return globalMedia + incomingSize <= GLOBAL_MEDIA_CAP;
}
