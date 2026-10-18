# Hush Architecture & Extension Guide

This guide details the internal architecture of Hush and provides step-by-step instructions for extending the codebase with new message kinds and socket events.

---

## 1. High-Level Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               Browser (Client)               │
                    │                                              │
                    │  [Web Crypto: AES-256-GCM (Key in #URL)]      │
                    │  Plaintext -> Encrypt -> Ciphertext {iv, ct} │
                    └──────────────────────┬───────────────────────┘
                                           │
                            WebSocket Encrypted Packets
                                           │
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               Server (Express + Socket.io)                       │
│                                                                                  │
│   HTTP Security Middleware: CSP, Referrer-Policy, Cache-Control, Nosniff         │
│                                                                                  │
│   Socket Layer:                                                                  │
│   ├── Token Bucket Rate Limiting (burst 5, refill 2.5/s)                         │
│   ├── Payload Size Validation (idOk, b64ok, MAX_CT: 4KB, MAX_MEDIA: 2.2MB)       │
│   └── Ownership Verification: Timing-Safe Comparison (delToken, adminToken)      │
│                                                                                  │
│   In-Memory Store:                                                               │
│   ├── rooms Map (id -> { adminToken, msgs: [], members: Set, media: bytes })     │
│   ├── Media Storage Accountant & Eviction (ROOM_MEDIA_CAP, GLOBAL_MEDIA_CAP)     │
│   └── Background Sweeper (TTL: 24h, Interval: 5m)                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pluggable Message Registry

Client message rendering is decoupled via `public/js/messages/registry.js`. Instead of modifying a monolithic `if/else` block, each message kind registers its own handler:

```
public/js/messages/
├── registry.js        # Central kind registry
├── render.js          # Bubble shell (author header, quoted reply, reactions, actions)
├── list.js            # Message history array, deduplication, deletion
└── kinds/
    ├── text.js        # Text messages
    ├── image.js       # Photos and image attachments
    ├── voice.js       # Voice notes (Opus audio)
    └── sticker.js     # Built-in SVGs and custom WebP stickers
```

---

## 3. How to Add a New Message Kind

To add a new message kind (e.g., `poll`, `game`, `video`):

### Step 1: Create a Kind Handler in `public/js/messages/kinds/`
Create a new file `public/js/messages/kinds/<your-kind>.js`:

```javascript
import { registerKind } from '../registry.js';

export const myKind = {
  // Returns a short text summary for quoted reply previews
  snippet: (data) => `✨ My Custom Feature: ${data.title || ''}`,

  // Renders the internal DOM contents inside the message bubble body
  render: (body, { msg, data, key, el, meta, stick, toBottom, flashNotice }) => {
    const card = document.createElement('div');
    card.className = 'my-custom-card';
    card.textContent = data.title;
    body.append(card);
  },
};

// Register under your kind identifier (e.g., 'poll')
registerKind('my_kind', myKind);
```

### Step 2: Import the Kind in `public/js/pages/room.js`
Add the import to `public/js/pages/room.js`:

```javascript
import '../messages/kinds/<your-kind>.js';
```

### Step 3: Implement the Sender in `public/js/features/`
Create a feature module that encrypts and transmits the payload:

```javascript
import { encrypt } from '../core/crypto.js';
import { getActiveReply, clearReply } from './reply.js';

export async function sendMyKind(socket, key, myName, myUid, customData) {
  const payload = {
    n: myName,
    u: myUid,
    k: 'my_kind',
    ...customData,
  };

  const activeReply = getActiveReply();
  if (activeReply) {
    payload.reply = activeReply;
    clearReply();
  }

  const packet = await encrypt(key, payload);
  socket.emit('msg:send', packet, (ack) => {
    if (ack?.error) alert(ack.error);
  });
}
```

---

## 4. How to Add a New Socket Event

To add a new socket event group (e.g., `theme`, `poll:vote`):

### Step 1: Create Handler in `server/sockets/`
Create `server/sockets/<your_event>.js`:

```javascript
import { getRoom } from '../store/rooms.js';
import { b64ok, fail } from '../utils/validate.js';

export function registerCustomHandlers(socket, io, context) {
  socket.on('custom:action', (data, ack) => {
    const roomId = context.roomId;
    const room = roomId && getRoom(roomId);
    if (!room || !data) return fail(ack, 'Invalid request.');

    // 1. Validate payload and rate limits
    if (!context.bucket.tryConsume(1)) return fail(ack, 'Slow down.');

    // 2. Broadcast to room peers
    socket.to(roomId).emit('custom:action', data);

    if (typeof ack === 'function') ack({ ok: true });
  });
}
```

### Step 2: Register in `server/sockets/index.js`
In `server/sockets/index.js`, import and call your registration function:

```javascript
import { registerCustomHandlers } from './<your_event>.js';

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // ...
    registerCustomHandlers(socket, io, context);
  });
}
```

### Step 3: Add Characterization Tests
Add test assertions in `tests/<your_event>.test.js` using `tests/helpers.js` to verify:
- Happy path roundtrip
- Authorization / validation checks
- Size and rate limit enforcement
- No plaintext or sensitive tokens leaked
