# Hush Protocol & Security Specification

This document details the socket events, encryption schemas, message payloads, and threat model of Hush so that anyone can audit the system.

---

## 1. Core Principles

1. **Zero Plaintext on the Server**: The server is a dumb relay. It only ever inspects identifiers, timestamps, ciphertext lengths, and rate-limit buckets. Message text, nicknames, media, reactions, stickers, and reply targets are encrypted in the client browser with Web Crypto (`AES-256-GCM`).
2. **Key Derivation & Storage**:
   - The 256-bit AES-GCM room key is generated in the browser via `crypto.subtle.generateKey`.
   - The key lives solely in the URL `#` fragment (`/r/<roomId>#<key>`).
   - Browsers never transmit URL fragments over HTTP or WebSockets to the server.
3. **Owner-Only Actions**: Because all room members share one encryption key, any member could theoretically spoof `u` (user ID) in a decrypted packet. Therefore, owner-only actions (message deletion, room destruction) are enforced on the server via cryptographically random tokens (`delToken`, `adminToken`) held in private browser storage.

---

## 2. Socket Events

### `room:create`
- **Direction**: Client → Server
- **Payload**: None
- **Response (`ack`)**: `{ id: string, adminToken: string } | { error: string }`
- **Description**: Generates a 16-character room ID and a 24-character secret `adminToken`.

### `room:join`
- **Direction**: Client → Server
- **Payload**: `roomId: string`
- **Response (`ack`)**: `{ ok: true, history: Array<Message>, count: number } | { error: string }`
- **Description**: Subscribes the socket to the room channel and sends in-memory message history (omitting any internal server tokens like `delToken`).

### `presence`
- **Direction**: Server → Room
- **Payload**: `count: number`
- **Description**: Emitted whenever a client connects or disconnects from the room.

### `msg:send`
- **Direction**: Client → Server
- **Payload**:
  - `iv: string` (Base64url 12-byte IV for message metadata/text)
  - `ct: string` (Base64url ciphertext, max 4096 chars)
  - `miv?: string` (Optional: Base64url 12-byte IV for encrypted media bytes)
  - `mct?: string` (Optional: Base64url ciphertext for media, max 2.2M chars / ~1.5 MB)
- **Response (`ack`)**: `{ ok: true, id: string, delToken: string } | { error: string }`
- **Description**: Validates rate limits and media caps, appends to room history, generates a unique `delToken` returned strictly to the sender, and broadcasts the public message.

### `msg:delete`
- **Direction**: Client → Server
- **Payload**: `{ id: string, delToken?: string, adminToken?: string }`
- **Response (`ack`)**: `{ ok: true } | { error: string }`
- **Description**: Verifies that the caller possesses either the message's `delToken` or the room's `adminToken` using timing-safe comparison. If valid, frees media bytes, removes the message from memory, and broadcasts `msg:delete`.

### `msg`
- **Direction**: Server → Room
- **Payload**: `{ id: string, iv: string, ct: string, ts: number, miv?: string, mct?: string }`
- **Description**: Relays the encrypted packet to all room participants.

### `typing`
- **Direction**: Client → Server → Other Room Members
- **Payload**: `{ iv: string, ct: string }` (Ephemeral, throttled, never stored in history)
- **Description**: Broadcasts encrypted typing or recording hints to peers.

### `room:destroy`
- **Direction**: Client → Server
- **Payload**: `adminToken: string`
- **Response (`ack`)**: `{ ok: true } | { error: string }`
- **Description**: Destroys room memory, drops all media, and closes all member sockets.

---

## 3. Encrypted Payload Formats

All payloads below are JSON-stringified and encrypted with AES-256-GCM using a fresh 12-byte IV before transmission.

### 1. Plain Text Message
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "x": "Hello world!",
  "reply": {
    "id": "msg_xyz",
    "name": "Sleepy Panda",
    "uid": "c3d4",
    "text": "Hey there"
  }
}
```

### 2. Photo Message
- Encrypted Header (`ct`):
  ```json
  {
    "n": "Sneaky Fox",
    "u": "a1b2",
    "k": "img",
    "w": 1024,
    "h": 768,
    "reply": null
  }
  ```
- Encrypted Media (`mct`): Raw JPEG bytes encrypted with a fresh random IV. Client re-encodes photos as JPEG to strip EXIF/GPS metadata.

### 3. Voice Message
- Encrypted Header (`ct`):
  ```json
  {
    "n": "Sneaky Fox",
    "u": "a1b2",
    "k": "voice",
    "mime": "audio/webm",
    "dur": 12
  }
  ```
- Encrypted Media (`mct`): Raw WebM/MP4/OGG Opus audio bytes encrypted with a fresh random IV (max 2 minutes, <= 1.5 MB).

### 4. Reaction
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "k": "react",
  "t": "msg_xyz",
  "e": "👍"
}
```

### 5. Stickers

#### Built-in SVG Stickers (Zero Upload)
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "k": "sticker",
  "pack": "builtin",
  "id": "react_fire",
  "reply": null
}
```
*Validation*: The recipient client strictly validates `id` against a hardcoded whitelist (`ALLOWED_STICKER_IDS`). Only approved static SVGs from `/stickers/${id}.svg` are rendered.

#### Custom Stickers (Make-Your-Own)
- Encrypted Header (`ct`):
  ```json
  {
    "n": "Sneaky Fox",
    "u": "a1b2",
    "k": "sticker",
    "pack": "custom",
    "mime": "image/webp"
  }
  ```
- Encrypted Media (`mct`): Raw WebP (or PNG fallback) bytes under 100 KB, maintaining transparency.
- *Validation*: Recipient client allows only `image/webp` and `image/png` MIME types. Custom stickers are stored locally in IndexedDB (max 60 stickers, deduplicated by SHA-256).

---

## 4. Security & Content Security Policy (CSP)

Hush enforces strict security headers on every request:
```http
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Cache-Control: no-store
Permissions-Policy: camera=(), geolocation=(), microphone=(self)
```

- **No Inline Scripts or Styles**: Prevents XSS script execution.
- **No Third-Party CDNs or Fonts**: Guarantees zero tracking and IP leakage to external entities.
- **Untrusted Content Safety**: All user text is rendered via `textContent` or DOM elements created dynamically. User-supplied SVG is never rendered.
