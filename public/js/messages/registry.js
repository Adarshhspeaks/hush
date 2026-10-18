// Message kind registry: allows kinds (text, image, voice, sticker, etc.) to plug in modularly
const kinds = new Map();

export function registerKind(kindName, handler) {
  kinds.set(kindName, handler);
}

export function getKind(kindName) {
  return kinds.get(kindName);
}

export function getSnippet(data) {
  if (!data) return 'Message';
  const handler = kinds.get(data.k || 'text');
  if (handler && typeof handler.snippet === 'function') {
    return handler.snippet(data);
  }
  if (typeof data.x === 'string') return data.x.slice(0, 120);
  return 'Message';
}
