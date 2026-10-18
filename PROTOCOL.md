# Hush Protocol Specification

This document defines the socket event schemas, client-side encryption envelope formats, message payloads, and server constraints of Hush.

---

## 1. Cryptographic Architecture

1. **Algorithm**: `AES-256-GCM` via the browser's native Web Crypto API (`window.crypto.subtle`).
2. **Key Derivation & Handling**:
   - The 256-bit symmetric room key is generated via `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])`.
   - The key is exported as 32 raw bytes and encoded as a URL-safe Base64 string.
   - The key resides exclusively in the browser URL `#` fragment (`/r/<roomId>#<key>`). Browsers never transmit URL fragments over HTTP or WebSockets.
3. **Initialization Vectors (IVs)**:
   - Every message and media payload generates a fresh 12-byte cryptographically secure random IV via `crypto.getRandomValues(new Uint8Array(12))`.
   - IVs are never reused.
4. **Ciphertext Separation**:
   - **Text & Metadata Envelope**: Relayed as Base64url strings `{ iv, ct }`. `ct` contains the stringified JSON payload encrypted with `AES-256-GCM`.
   - **Media Bytes**: When an image, audio note, or custom sticker is attached, the binary file is encrypted independently with a fresh 12-byte IV and relayed as `{ miv, mct }`.
5. **Zero Plaintext on the Server**: The server only ever observes random packet IDs, timestamps, Base64url string lengths, and cryptographic tokens. Nicknames, message text, user IDs, media, reactions, stickers, and reply references remain encrypted end-to-end.

---

## 2. Server Limits & Constants

| Constant | Value | Description |
|---|---|---|
| `TTL` | 24 hours (`86,400,000` ms) | Expiration time for message history and idle empty rooms |
| `SWEEPER_INTERVAL` | 5 minutes (`300,000` ms) | Periodic sweep interval for expired records |
| `MAX_MSGS` | 200 | Maximum message history preserved in memory per room |
| `MAX_ROOMS` | 2,000 | Maximum total active rooms on the server |
| `MAX_PER_ROOM` | 50 | Maximum concurrent active sockets connected to a single room |
| `MAX_CT` | 4,096 chars | Maximum length of Base64url ciphertext for message envelope |
| `MAX_MEDIA_CT` | 2,200,000 chars | Maximum length of Base64url ciphertext for media (~1.5 MB raw) |
| `MAX_TYPING_CT` | 512 chars | Maximum length of Base64url ciphertext for typing hints |
| `ROOM_MEDIA_CAP` | 12,000,000 bytes | Per-room media storage budget (configurable via `ROOM_MEDIA_CAP`) |
| `GLOBAL_MEDIA_CAP` | 120,000,000 bytes | Global media storage budget across entire server (via `GLOBAL_MEDIA_CAP`) |
| `RATE_LIMIT_BURST` | 5 tokens | Token bucket capacity per socket connection |
| `RATE_LIMIT_REFILL_RATE` | 2.5 tokens/sec | Token bucket refill speed |
| `RATE_LIMIT_TEXT_COST` | 1 token | Cost to send a text or sticker-id message |
| `RATE_LIMIT_MEDIA_COST` | 3 tokens | Cost to send an encrypted media message |
| `MAX_ROOMS_PER_IP` | 10 rooms/hour | Room creation rate limit per IP |
| `TYPING_THROTTLE_MS` | 1,500 ms | Minimum cooldown between typing hint broadcasts |

---

## 3. Socket Events Specification

### `room:create`
- **Direction**: Client → Server
- **Payload**: `null`
- **Response (`ack`)**: `{ id: string, adminToken: string } | { error: string }`
- **Behavior**:
  - Enforces IP rate limit (`10/hr`) and server capacity (`MAX_ROOMS`).
  - Generates a 16-character room ID (`nanoid(16)`) and a 24-character secret `adminToken` (`nanoid(24)`).
  - Returns `adminToken` solely to the room creator to authorize administrative destruction.

### `room:join`
- **Direction**: Client → Server
- **Payload**: `roomId: string` (Must match `^[\w-]{16}$`)
- **Response (`ack`)**: `{ ok: true, history: Array<PublicMessage>, count: number } | { error: string }`
- **Behavior**:
  - Subscribes socket to the room channel.
  - Updates `room.lastActive`.
  - Broadcasts `presence` with updated member count to all peers in the room.
  - Sanitizes history: internal server tokens like `delToken` are omitted.

### `presence`
- **Direction**: Server → Room Channel
- **Payload**: `count: number`
- **Behavior**: Emitted whenever a client joins or disconnects.

### `msg:send`
- **Direction**: Client → Server
- **Payload**:
  - `iv: string` (Base64url 12-byte IV, length <= 32)
  - `ct: string` (Base64url ciphertext, length <= 4096)
  - `miv?: string` (Optional: Base64url 12-byte IV for media, length <= 32)
  - `mct?: string` (Optional: Base64url ciphertext for media, length <= 2,200,000)
- **Response (`ack`)**: `{ ok: true, id: string, delToken: string } | { error: string }`
- **Behavior**:
  - Validates Base64url encoding and maximum lengths.
  - Consumes token bucket tokens (1 for text, 3 for media).
  - If media is present: evicts oldest media in the room until `room.media + size <= ROOM_MEDIA_CAP`; rejects with error if `globalMedia + size > GLOBAL_MEDIA_CAP`.
  - Generates 8-character public message ID (`id`) and 16-character private deletion token (`delToken`).
  - Broadcasts `{ id, iv, ct, ts, miv, mct }` to all members in the room (without `delToken`).
  - Returns `delToken` strictly to the sender in the socket acknowledgment.

### `msg:delete`
- **Direction**: Client → Server
- **Payload**: `{ id: string, delToken?: string, adminToken?: string }`
- **Response (`ack`)**: `{ ok: true } | { error: string }`
- **Behavior**:
  - Authorizes using constant-time timing-safe comparison (`crypto.timingSafeEqual`) against the message's `delToken` OR the room's `adminToken`.
  - If valid: frees media byte counters, splices message from history, and broadcasts `msg:delete` with `{ id }` to room peers.

### `typing`
- **Direction**: Client → Server → Room Peers
- **Payload**: `{ iv: string, ct: string }`
- **Behavior**:
  - Validates `iv` (<= 32 chars) and `ct` (<= 512 chars).
  - Enforces minimum 1,500ms cooldown per socket.
  - Relays to peers via `socket.to(roomId).emit('typing', ...)` (never echoed back to sender, never saved in history).

### `room:destroy`
- **Direction**: Client → Server
- **Payload**: `adminToken: string`
- **Response (`ack`)**: `{ ok: true } | { error: string }`
- **Behavior**:
  - Authorizes using timing-safe comparison against `room.adminToken`.
  - Broadcasts `destroyed` event to all room members.
  - Forcibly disconnects all active sockets in the room.
  - Frees all media bytes and deletes the room from server memory.

---

## 4. Encrypted Payload Schemas

All payloads are serialized as JSON and encrypted with AES-256-GCM.

### 1. Plain Text Message
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "x": "Hello world!",
  "reply": {
    "id": "msg_1234",
    "name": "Sleepy Panda",
    "uid": "c3d4",
    "text": "Prior message snippet"
  }
}
```

### 2. Photo Message
- **Envelope (`ct`)**:
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
- **Media (`mct`)**: Raw JPEG bytes re-encoded on client canvas (EXIF stripped), encrypted with random IV.

### 3. Voice Message
- **Envelope (`ct`)**:
  ```json
  {
    "n": "Sneaky Fox",
    "u": "a1b2",
    "k": "voice",
    "mime": "audio/webm",
    "dur": 12,
    "reply": null
  }
  ```
- **Media (`mct`)**: Opus-encoded audio bytes (WebM, MP4, or OGG), encrypted with random IV.

### 4. Emoji Reaction
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "k": "react",
  "t": "target_msg_id",
  "e": "👍"
}
```
*(Sending with empty string `e: ""` removes the reaction).*

### 5. Built-in Sticker
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
*(Validated against `ALLOWED_STICKER_IDS` allowlist).*

### 6. Custom Sticker
- **Envelope (`ct`)**:
  ```json
  {
    "n": "Sneaky Fox",
    "u": "a1b2",
    "k": "sticker",
    "pack": "custom",
    "mime": "image/webp",
    "reply": null
  }
  ```
- **Media (`mct`)**: Compressed WebP/PNG bytes under 100 KB with transparency preserved.

### 7. Typing & Recording Hint
```json
{
  "n": "Sneaky Fox",
  "u": "a1b2",
  "a": "typing"
}
```
*(`a` is either `"typing"` or `"rec"`).*
