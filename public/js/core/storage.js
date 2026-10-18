// Safe localStorage and sessionStorage helpers and delete-token store
export function safeGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Store per-message deletion tokens in local storage
export function saveDelToken(roomId, msgId, token) {
  safeSet(`del:${roomId}:${msgId}`, token);
}

export function getDelToken(roomId, msgId) {
  return safeGet(`del:${roomId}:${msgId}`, null);
}
