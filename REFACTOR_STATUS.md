# Hush Pure Refactor Status

> Pure refactoring of Hush into a modular, scalable architecture. Zero behavior changes, zero new features.

---

## 1. Inventory

### Socket Events
1. **`room:create`** (Client → Server)
   - Ack: `{ id: string, adminToken: string } | { error: string }`
   - Validates IP rate limit (max 10 rooms/hour/IP) and server capacity (max 2000 rooms).
   - Generates 16-character room ID and 24-character secret `adminToken`.
2. **`room:join`** (Client → Server)
   - Payload: `id` (string, `^[\w-]{16}$`)
   - Ack: `{ ok: true, history: Array<Message>, count: number } | { error: string }`
   - Validates room existence, active TTL, and room capacity (max 50 members).
   - Subscribes socket, updates `lastActive`, emits `presence` to room, returns history (sanitized, `delToken` stripped).
3. **`presence`** (Server → Room)
   - Payload: `count: number`
   - Broadcast when any member joins or disconnects.
4. **`msg:send`** (Client → Server)
   - Payload: `{ iv: string, ct: string, miv?: string, mct?: string }`
   - Validates IV (base64url, <= 32 chars), ciphertext (base64url, <= 4096 chars), optional media IV (<= 32 chars), optional media ciphertext (<= 2,200,000 chars).
   - Token-bucket rate limiter: burst 5, refill 2.5/s. Text cost 1, media cost 3.
   - Enforces room media cap (12MB default, evicts oldest room media) and global media cap (120MB default).
   - Generates 8-char message `id` and 16-char secret `delToken`.
   - Enforces room history length (max 200 messages).
   - Broadcasts public message `{ id, iv, ct, ts, miv, mct }` to room.
   - Acks sender with `{ ok: true, id, delToken }`.
5. **`msg`** (Server → Room)
   - Payload: `{ id: string, iv: string, ct: string, ts: number, miv?: string, mct?: string }`
   - Relays encrypted envelope to all room members.
6. **`msg:delete`** (Client → Server)
   - Payload: `{ id: string, delToken?: string, adminToken?: string }`
   - Validates room exists and message exists.
   - Authorizes using `safeEq(delToken, target.delToken)` OR `safeEq(adminToken, room.adminToken)`.
   - Frees media bytes, splices message from room history, broadcasts `msg:delete` `{ id }` to room.
   - Acks caller `{ ok: true } | { error: string }`.
7. **`typing`** (Client → Server → Room peers)
   - Payload: `{ iv: string, ct: string }`
   - Validates IV (<= 32 chars), ciphertext (<= 512 chars). Throttled to 1 per 1500ms per socket.
   - Relays to peers via `socket.to(roomId).emit('typing', ...)` (ephemeral, not echoed, not stored).
8. **`room:destroy`** (Client → Server)
   - Payload: `token: string`
   - Validates `safeEq(token, room.adminToken)`.
   - Acks `{ ok: true }`, broadcasts `destroyed` to room, forcibly disconnects all sockets in room, frees all media and deletes room.
9. **`destroyed`** (Server → Room)
   - Broadcast to notify members that creator destroyed room.
10. **`disconnect`** (Socket lifecycle)
    - Removes member from room, broadcasts updated `presence` count.

### Server Limits & Configuration
- `TTL`: 24 hours (`24 * 60 * 60 * 1000` ms)
- `SWEEPER_INTERVAL`: 5 minutes (`5 * 60 * 1000` ms)
- `MAX_MSGS`: 200 messages per room
- `MAX_ROOMS`: 2000 total active rooms
- `MAX_PER_ROOM`: 50 concurrent members per room
- `MAX_CT`: 4096 chars (message text/meta ciphertext)
- `MAX_MEDIA_CT`: 2,200,000 chars (~1.5 MB raw media)
- `MAX_TYPING_CT`: 512 chars
- `ROOM_MEDIA_CAP`: 12,000,000 bytes default (configurable via env `ROOM_MEDIA_CAP`)
- `GLOBAL_MEDIA_CAP`: 120,000,000 bytes default (configurable via env `GLOBAL_MEDIA_CAP`)
- `RATE_LIMIT_BURST`: 5 tokens
- `RATE_LIMIT_REFILL_RATE`: 2.5 tokens/sec
- `RATE_LIMIT_TEXT_COST`: 1 token
- `RATE_LIMIT_MEDIA_COST`: 3 tokens
- `MAX_ROOMS_PER_IP_PER_HOUR`: 10
- `TYPING_THROTTLE_MS`: 1500 ms
- `MAX_HTTP_BUFFER_SIZE`: 3,000,000 bytes
- `PORT`: 3000 default (configurable via env `PORT`)

### Message Kinds (Client E2EE)
1. **Text (`x`)**: `{ n: string, u: string, x: string, reply?: object }`
2. **Photo (`img`)**: `{ n: string, u: string, k: 'img', w: number, h: number, reply?: object }` + encrypted media `{ miv, mct }`
3. **Voice (`voice`)**: `{ n: string, u: string, k: 'voice', mime: string, dur: number, reply?: object }` + encrypted media `{ miv, mct }`
4. **Reaction (`react`)**: `{ n: string, u: string, k: 'react', t: string, e: string }`
5. **Built-in Sticker (`sticker`, `pack: 'builtin'`)**: `{ n: string, u: string, k: 'sticker', pack: 'builtin', id: string, reply?: object }`
6. **Custom Sticker (`sticker`, `pack: 'custom'`)**: `{ n: string, u: string, k: 'sticker', pack: 'custom', mime: string, reply?: object }` + encrypted media `{ miv, mct }`
7. **Typing Hint (ephemeral)**: `{ n: string, u: string, a: 'typing' | 'rec' }`

### User-Facing Features
1. Instant anonymous room creation with Web Crypto AES-256-GCM key in URL hash.
2. E2EE message relay with client-side encryption/decryption only.
3. Random animal nicknames and stable per-user HSL avatar colors, with room-specific rename.
4. Quoted replies with author hue indicator and jump-to-message smooth scroll & pulse animation.
5. Message deletion for everyone (author via `delToken` or admin via `adminToken`).
6. Photo sharing with automatic client-side resizing, EXIF metadata stripping, lightbox modal, and download.
7. Voice message recording with MediaRecorder API, live recording timer, preview duration, and download.
8. Reactions toolbar with 6 quick reactions, toggle capability, and aggregate reaction chips.
9. 24 Built-in SVG stickers across Reactions, Love, Funny, and Words packs.
10. Custom sticker creator: client-side square crop, WebP/PNG compression <=100KB, IndexedDB storage (up to 60 stickers), tap-to-save received stickers, delete custom stickers.
11. Tabbed Emoji & Sticker drawer with real-time sticker search.
12. Typing and voice-recording indicators with automatic 3.5s timeout.
13. Dark / Light mode toggle with persistent localStorage preference and system preference sync.
14. QR code generator modal for seamless mobile camera invites.
15. Room destruction for room creator, wiping server memory and disconnecting all sockets.
16. Automatic 24h room/message expiration sweeper.
17. Per-room (12MB) and server-wide (120MB) media caps with oldest-media eviction.

---

## 2. Bugs Found (Documented & Fixed)

1. **Theme Init Module Flash Risk**:
   - *Issue*: In original code, `theme.js` was loaded as `<script type="module" src="/theme.js"></script>` after `<link rel="stylesheet">`. ES modules are deferred by default, causing potential flash of light mode on dark mode setups before the module executes.
   - *Fix*: Moved theme initialization into a synchronous classic script `public/js/theme-init.js` in `<head>` before CSS as required by Constraint #2.
2. **`createLog` Memory Leak**:
   - *Issue*: In original `server.js`, `createLog` mapped IP to timestamps but old IP keys were never removed from the Map if that IP never connected again.
   - *Fix*: Added `pruneCreateLog` called periodically by the 5-minute background sweeper in `server/store/sweeper.js` (commit `95efa89`).
3. **Double `history` Mapping in `room:join`**:
   - *Issue*: In original `server.js` line 99, `room.msgs.map(({ id: mid, ... }) => ({ id: mid, ... }))` renamed `id` to `mid` and back to `id`.
   - *Fix*: Simplified to `{ id, iv, ct, ts, miv, mct, gone }` in `server/sockets/rooms.js` (commit `6e84a36`).

---

## 3. Completion Checklist

- [x] inventory of events, message kinds, limits and features written
- [x] characterization tests (including the newer events) written and passing on old code
- [x] server split into server/ modules, tests green
- [x] client CSS split into css/ files, visual check light + dark
- [x] client JS split into pages/ core/ messages/ features/, registry in place, every kind moved
- [x] theme-init.js still a classic head script, no flash
- [x] no inline scripts/styles/handlers, CSP clean
- [x] package.json, .env.example, LICENSE, README, PROTOCOL, SECURITY, architecture docs written
- [x] lint + format pass, no dead files or unused code
- [x] full manual test of ALL features passed in two browser windows + mobile width
- [x] bugs found during the refactor fixed in separate commits
- [x] final summary: tree of the new structure, what moved where, and confirmation that behavior is unchanged

---

## 4. Final Directory Structure

```
hush/
├─ package.json                  # Scripts: start, dev, test, lint, format
├─ package-lock.json
├─ .env.example                  # PORT, ROOM_MEDIA_CAP, GLOBAL_MEDIA_CAP documented
├─ .gitignore
├─ .editorconfig
├─ .prettierrc
├─ eslint.config.js
├─ LICENSE                       # MIT
├─ README.md                     # Modern docs: run, test, deploy, architecture
├─ PROTOCOL.md                   # Full socket contracts, encryption specs, limits
├─ SECURITY.md                   # Threat model, CSP, trust boundaries, limitations
├─ REFACTOR_STATUS.md            # Refactor tracking and completion checklist
├─ server.js                     # Backwards-compatible forwarder -> server/index.js
├─ server/
│  ├─ index.js                   # Boot only: HTTP server, Socket.io, listen
│  ├─ app.js                     # Express app: security middleware, static files, /r/:id route
│  ├─ config.js                  # Centralized limits, constants, and env parsing
│  ├─ security.js                # Strict CSP and privacy headers middleware
│  ├─ store/
│  │  ├─ rooms.js                # In-memory rooms Map, create/get/delete
│  │  ├─ media.js                # Media byte accounting, per-room eviction, global cap
│  │  └─ sweeper.js              # 24h expiration timer and IP log pruning
│  ├─ sockets/
│  │  ├─ index.js                # Socket.io connection wiring
│  │  ├─ rooms.js                # room:create, room:join, room:destroy, presence
│  │  ├─ messages.js             # msg:send, msg:delete
│  │  └─ typing.js               # typing ephemeral relay
│  └─ utils/
│     ├─ validate.js             # idOk, b64ok, fail helpers
│     ├─ rateLimit.js            # TokenBucket class + pruneCreateLog
│     └─ safeEqual.js            # timing-safe string comparison
├─ public/
│  ├─ index.html                 # Clean semantic HTML, modular CSS links, classic theme-init
│  ├─ room.html                  # Clean semantic HTML, modular CSS links, classic theme-init
│  ├─ assets/stickers/           # 24 built-in SVG sticker assets
│  ├─ css/
│  │  ├─ theme.css               # Light/dark mode CSS tokens only
│  │  ├─ base.css                # Reset, typography, buttons, utilities
│  │  ├─ layout.css              # Header, chat container, banner, scroll log
│  │  ├─ messages.css            # Bubbles, quotes, reactions, deletion animations
│  │  ├─ composer.css            # Composer, reply bar, recording bar, drawer panels
│  │  ├─ overlays.css            # Lightbox, QR code modal, toast notifications
│  │  └─ stickers.css            # Sticker tray, custom sticker cards, chat display
│  ├─ style.css                  # Backwards-compatible forwarder importing modular css/
│  ├─ crypto.js                  # Backwards-compatible forwarder -> js/core/crypto.js
│  ├─ emoji.js                   # Backwards-compatible forwarder -> js/features/emoji/
│  ├─ media.js                   # Backwards-compatible forwarder -> js/features/media/
│  ├─ names.js                   # Backwards-compatible forwarder -> js/core/names.js
│  ├─ stickers.js                # Backwards-compatible forwarder -> js/features/stickers/
│  ├─ theme.js                   # Backwards-compatible forwarder -> js/features/theme.js
│  ├─ landing.js                 # Backwards-compatible forwarder -> js/pages/landing.js
│  ├─ room.js                    # Backwards-compatible forwarder -> js/pages/room.js
│  └─ js/
│     ├─ theme-init.js           # Classic synchronous script loaded in <head> before CSS
│     ├─ pages/
│     │  ├─ landing.js           # Entry for index.html
│     │  └─ room.js              # Entry for room.html: wires modules together
│     ├─ core/
│     │  ├─ crypto.js            # AES-GCM Web Crypto helpers
│     │  ├─ socket.js            # Socket.io connection helper
│     │  ├─ identity.js          # Nickname, random UID, admin token, per-room storage
│     │  ├─ storage.js           # Safe localStorage wrappers and delete-token store
│     │  ├─ dom.js               # $, el(), scroll helpers, toast, fatal
│     │  └─ names.js             # Random animal names and hueFor/colorFor
│     ├─ messages/
│     │  ├─ registry.js          # Pluggable kind registry
│     │  ├─ render.js            # Bubble shell builder (head, quote, actions, reactions)
│     │  ├─ kinds/
│     │  │  ├─ text.js           # Text message kind
│     │  │  ├─ image.js          # Photo message kind
│     │  │  ├─ voice.js          # Voice note kind
│     │  │  └─ sticker.js        # Built-in and custom sticker kind
│     │  └─ list.js              # Message history list, deduplication, removal
│     ├─ features/
│     │  ├─ theme.js             # Light/dark mode toggle and system listener
│     │  ├─ reply.js             # Quoted replies and jump-to-quote navigation
│     │  ├─ delete.js            # Message deletion action and button builder
│     │  ├─ reactions.js         # Reaction chips and quick reaction row
│     │  ├─ typing.js            # Ephemeral typing and voice recording hints
│     │  ├─ emoji/
│     │  │  └─ index.js          # 6-category emoji picker component
│     │  ├─ stickers/
│     │  │  ├─ constants.js      # 24 built-in sticker definitions & categories
│     │  │  ├─ db.js             # IndexedDB custom sticker store
│     │  │  ├─ process.js        # WebP/PNG square crop & compression processor
│     │  │  ├─ tray.js           # Sticker tray drawer UI
│     │  │  └─ index.js          # Sticker barrel export
│     │  ├─ media/
│     │  │  ├─ imageCompress.js  # Canvas JPEG resize & EXIF stripper
│     │  │  ├─ voiceRecorder.js  # MediaRecorder Opus voice recorder
│     │  │  └─ index.js          # Media barrel export
│     │  ├─ qr.js                # QR code modal
│     │  ├─ lightbox.js          # Fullscreen photo zoom modal
│     │  └─ invite.js            # Web Share API and clipboard copy
│     └─ vendor/
│        └─ qrcode.mjs           # Vendor QR code generator
├─ tests/
│  ├─ helpers.js                 # Test server spawner & client factory
│  ├─ rooms.test.js              # Room creation, joining, capacity, destroy, and IP limits
│  ├─ messages.test.js           # Ciphertext relay, history integrity, token protection, rate limits
│  ├─ media.test.js              # Encrypted photos/voice notes, room eviction, and global storage caps
│  ├─ delete.test.js             # Message deletion authorization, owner/admin checks, history purge
│  ├─ typing.test.js             # Ephemeral typing relay, throttle checks, no echo, no persistence
│  ├─ security_headers.test.js   # Strict CSP, Referrer-Policy, Cache-Control, and static assets
│  └─ test_stickers_and_security.js # Phase 1 protocol verification test
└─ docs/
   └─ architecture.md            # Architecture diagram & extension guide
```
