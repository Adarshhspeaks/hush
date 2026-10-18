// All encryption happens here, in the browser. The key never goes to the server.
// AES-256-GCM via the Web Crypto API (needs https or localhost).
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64 = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

export async function newKeyString() {
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64(await crypto.subtle.exportKey('raw', k));
}

export async function importKey(str) {
  const raw = unb64(str);
  if (raw.length !== 32) throw new Error('bad key');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // fresh random IV per message
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decrypt(key, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

export const randomId = (bytes = 4) => b64(crypto.getRandomValues(new Uint8Array(bytes)));

// photos and voice notes: encrypt raw bytes (same key, fresh IV)
export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { miv: b64(iv), mct: b64(ct) };
}

export async function decryptBytes(key, { miv, mct }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(miv) }, key, unb64(mct)));
}
