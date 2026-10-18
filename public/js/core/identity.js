// Identity management per room: nickname, random user ID, admin token, and encryption key
import { randomName } from './names.js';
import { randomId } from './crypto.js';
import { safeGet, safeSet } from './storage.js';

export function initIdentity(roomId) {
  // Key string from URL #fragment or browser copy
  let keyStr = location.hash.slice(1);
  if (keyStr) {
    safeSet('key:' + roomId, keyStr);
  } else {
    keyStr = safeGet('key:' + roomId, '');
  }

  // Stable nickname per room
  let myName = safeGet('name:' + roomId, null);
  if (!myName) {
    myName = randomName();
    safeSet('name:' + roomId, myName);
  }

  // Stable user ID per room
  let myUid = safeGet('uid:' + roomId, null);
  if (!myUid) {
    myUid = randomId(4);
    safeSet('uid:' + roomId, myUid);
  }

  // Admin token (present if this user created the room)
  const adminToken = safeGet('admin:' + roomId, null);

  return {
    roomId,
    keyStr,
    getMyName: () => myName,
    setMyName: (name) => {
      myName = (name || '').trim().slice(0, 30);
      safeSet('name:' + roomId, myName);
      return myName;
    },
    myUid,
    adminToken,
  };
}
