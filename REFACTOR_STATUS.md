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

## 2. Bugs Found (Documented for Step 7 Fixes)

1. **Theme Init Module Flash Risk**: In `public/index.html` and `public/room.html`, theme script is loaded as `<script type="module" src="/theme.js"></script>` after `<link rel="stylesheet">`. ES modules are deferred by default, causing a flash of light mode on dark mode setups before the module executes. (Target: move to classic script `theme-init.js` in `<head>` before CSS as required by Constraint #2).
2. **`createLog` Memory Leak**: In `server.js`, `createLog` maps IP to timestamps but old IP keys are never pruned if that IP never connects again.
3. **Double `history` Mapping in `room:join`**: In `server.js` line 99, `room.msgs.map(({ id: mid, ... }) => ({ id: mid, ... }))` renames `id` to `mid` and back to `id`.

---

## 3. Completion Checklist

- [x] inventory of events, message kinds, limits and features written
- [x] characterization tests (including the newer events) written and passing on old code
- [x] server split into server/ modules, tests green
- [ ] client CSS split into css/ files, visual check light + dark
- [ ] client JS split into pages/ core/ messages/ features/, registry in place, every kind moved
- [ ] theme-init.js still a classic head script, no flash
- [ ] no inline scripts/styles/handlers, CSP clean
- [ ] package.json, .env.example, LICENSE, README, PROTOCOL, SECURITY, architecture docs written
- [ ] lint + format pass, no dead files or unused code
- [ ] full manual test of ALL features passed in two browser windows + mobile width
- [ ] bugs found during the refactor fixed in separate commits
- [ ] final summary: tree of the new structure, what moved where, and confirmation that behavior is unchanged

---

## 4. Current State & Exact Next Step
- **Current Step**: STEP 2 Complete (Server modularized into `server/`, 100% green tests).
- **Exact Next Step**: STEP 3 — Client refactor:
  1. Move built-in SVG sticker assets from `public/stickers/` to `public/assets/stickers/` and update paths without breaking.
  2. Split `public/style.css` into `public/css/`:
     - `theme.css` (variables only)
     - `base.css` (reset, typography, buttons, forms, utilities)
     - `layout.css` (chat page layout, header, banner)
     - `messages.css` (bubbles, quotes, reactions, tombstones, media)
     - `composer.css` (composer, emoji/sticker panel, reply bar, recording bar)
     - `overlays.css` (lightbox, QR modal)
     - `stickers.css` (sticker tray, custom sticker cards, etc.)
  3. Split client JavaScript into `public/js/`:
     - `theme-init.js` (classic script in `<head>` before CSS to prevent dark-mode flash)
     - `pages/landing.js`
     - `pages/room.js` (entry only wiring modules)
     - `core/crypto.js`
     - `core/socket.js`
     - `core/identity.js`
     - `core/storage.js`
     - `core/dom.js`
     - `core/names.js`
     - `messages/registry.js`
     - `messages/render.js`
     - `messages/list.js`
     - `messages/kinds/` (text, img, voice, react, sticker)
     - `features/` (stickers, emoji, media, reply, reactions, delete, qr, lightbox, etc.)
  4. Update HTML `<link>` and `<script>` paths. Keep CSP strict.
  5. Manual verification in two browser windows (light/dark/mobile). Commit.
