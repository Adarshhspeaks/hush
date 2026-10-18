# Hush 🤫 — Anonymous End-to-End Encrypted Chat Rooms

Anonymous, disposable, end-to-end encrypted chat rooms. No accounts, no phone numbers, no tracking cookies, and no database. Create a room, share the link, chat securely.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Adarshhspeaks/hush)

---

## How It Works

1. **Client-Side Cryptography**: When you create a room, the browser generates an `AES-256-GCM` key using Web Crypto.
2. **Key in Fragment**: The key resides solely in the URL hash fragment (`/r/<roomId>#<key>`). Browsers never transmit URL fragments over HTTP or WebSockets to the server.
3. **Zero Plaintext on the Server**: All messages, media, stickers, nicknames, user IDs, replies, and reactions are encrypted in the browser with fresh 12-byte IVs before transmission.
4. **Ephemeral In-Memory Relay**: The server is a dumb relay. Rooms, messages, and media exist in server memory only—nothing is written to disk. Restarting the server wipes everything immediately.

---

## Project Structure

```
hush/
├─ server/
│  ├─ index.js               # Boot script: creates HTTP server, attaches Socket.io, listens
│  ├─ app.js                 # Express application: security headers, static files, /r/:id route
│  ├─ config.js              # Centralized limits, constants, and environment variable parsing
│  ├─ security.js            # Strict Content-Security-Policy and privacy headers middleware
│  ├─ store/
│  │  ├─ rooms.js            # In-memory rooms Map, create/get/delete operations
│  │  ├─ media.js            # Media byte accounting, per-room eviction, and global storage cap
│  │  └─ sweeper.js          # Background 24h expiration timer
│  ├─ sockets/
│  │  ├─ index.js            # Socket.io connection wiring and per-socket context
│  │  ├─ rooms.js            # room:create, room:join, room:destroy, presence, disconnect
│  │  ├─ messages.js         # msg:send, msg:delete
│  │  └─ typing.js           # typing & recording ephemeral relay
│  └─ utils/
│     ├─ validate.js         # ID format and Base64 size validation helpers
│     ├─ rateLimit.js        # Token-bucket message rate limiter & per-IP room creation tracker
│     └─ safeEqual.js        # Constant-time timing-safe string comparison
├─ public/
│  ├─ index.html             # Landing page
│  ├─ room.html              # Chat room page
│  ├─ assets/stickers/       # 24 built-in SVG sticker assets
│  ├─ css/
│  │  ├─ theme.css           # Light and dark mode CSS variables
│  │  ├─ base.css            # CSS reset, typography, buttons, utilities
│  │  ├─ layout.css          # Chat container, header bar, banner, and message log
│  │  ├─ messages.css        # Message bubbles, quotes, reactions, deletion animations
│  │  ├─ composer.css        # Composer form, reply bar, recording bar, drawer panels
│  │  ├─ overlays.css        # Lightbox modal, QR code card, toast notifications
│  │  └─ stickers.css        # Sticker tray, custom sticker cards, and chat sticker display
│  └─ js/
│     ├─ theme-init.js       # Synchronous classic script in <head> to prevent dark-mode flash
│     ├─ pages/
│     │  ├─ landing.js       # Landing page controller
│     │  └─ room.js          # Room orchestrator: wires modules and features together
│     ├─ core/
│     │  ├─ crypto.js        # Web Crypto AES-256-GCM helpers
│     │  ├─ socket.js        # Socket.io connection loader
│     │  ├─ identity.js      # Nickname, random UID, admin token, and key management
│     │  ├─ storage.js       # Safe localStorage/sessionStorage wrappers and delete-token store
│     │  ├─ dom.js           # DOM query, element builder, scroll, and notification helpers
│     │  └─ names.js         # Random anonymous animal names and stable HSL avatar colors
│     ├─ messages/
│     │  ├─ registry.js      # Pluggable kind registry for message types
│     │  ├─ render.js        # Message bubble shell builder (metadata, actions, reactions)
│     │  ├─ kinds/           # Individual kind handlers: text, image, voice, sticker
│     │  └─ list.js          # Message list state, history deduplication, and removal
│     ├─ features/
│     │  ├─ theme.js         # Light/dark mode switcher and OS preference listener
│     │  ├─ reply.js         # Quoted replies and jump-to-quote navigation
│     │  ├─ delete.js        # Message deletion for everyone (author and admin)
│     │  ├─ reactions.js     # Emoji reactions and quick reaction bar
│     │  ├─ typing.js        # Ephemeral typing and voice recording hints
│     │  ├─ emoji/           # Categorized emoji picker component
│     │  ├─ stickers/        # Built-in SVG tray, IndexedDB custom sticker store, WebP processor
│     │  ├─ media/           # Client-side JPEG compression and Opus voice recorder
│     │  ├─ qr.js            # QR code invite modal
│     │  ├─ lightbox.js      # Fullscreen photo zoom modal
│     │  └─ invite.js        # Web Share API and invite link clipboard copy
│     └─ vendor/qrcode.mjs   # Pure JS QR code generator
├─ tests/
│  ├─ helpers.js             # Test runner helpers: ephemeral port server spawner and client factory
│  ├─ rooms.test.js          # Room creation, joining, capacity, destroy, and IP limits
│  ├─ messages.test.js       # Ciphertext relay, history integrity, token protection, rate limits
│  ├─ media.test.js          # Encrypted photos/voice notes, room eviction, and global storage caps
│  ├─ delete.test.js         # Message deletion authorization, owner/admin checks, history purge
│  ├─ typing.test.js         # Ephemeral typing relay, throttle checks, no echo, no persistence
│  └─ security_headers.test.js # Strict CSP, Referrer-Policy, Cache-Control, and static assets
└─ docs/
   └─ architecture.md        # Architecture overview and guide to adding new message kinds & socket events
```

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js 20, 22)

### Installation
```bash
git clone https://github.com/Adarshhspeaks/hush.git
cd hush
npm install
```

### Running Locally
```bash
# Start production server on port 3000
npm start

# Start development server with file watching
npm run dev
```

Open `http://localhost:3000` in your browser.

> [!NOTE]
> Web Crypto requires a secure context (`localhost` or `https`). Accessing the server across a local area network (LAN) IP via unencrypted `http://` will disable Web Crypto in modern browsers.

---

## Running Tests

Hush includes a characterization test suite using Node's native test runner (`node:test`) and real Web Crypto:

```bash
npm test
```

This verifies:
- End-to-end encryption roundtrips (text, photos, voice notes, stickers)
- Room creation, capacity, and IP rate limits
- Token bucket rate limiting on messages and typing hints
- Owner-only and admin-only message deletion (`delToken`, `adminToken`)
- Per-room media eviction and global server media caps
- Strict CSP and privacy headers

---

## Deployment (Render)

1. Click the **Deploy to Render** button above or link your GitHub fork to [Render](https://render.com).
2. **Environment**: Node
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Render automatically provisions free HTTPS, enabling Web Crypto and microphone permissions on mobile browsers.

### Environment Variables
Configure these in Render or your `.env` file:
- `PORT`: Port to listen on (default: `3000`).
- `ROOM_MEDIA_CAP`: Max media bytes stored per room before oldest media is dropped (default: `12000000` / 12MB).
- `GLOBAL_MEDIA_CAP`: Max media bytes stored across the whole server (default: `120000000` / 120MB).

---

## Features

- **Text & Nicknames**: Client-side encrypted text messages (up to 1000 characters), random animal names with customizable nicknames.
- **Quoted Replies**: Quote any message with author hue and click-to-jump with pulse highlight animation.
- **Delete for Everyone**: Securely remove your own messages in real-time across all clients and server memory using secret single-use tokens (`delToken`).
- **Original Stickers**: 24 vector SVG stickers across Reactions, Love, Funny, and Words packs.
- **Custom Stickers**: Make-your-own sticker tool with square crop, transparent WebP/PNG compression under 100 KB, stored locally in IndexedDB (max 60, SHA-256 deduplicated).
- **Photos**: Client-side canvas resizing to JPEG (stripping EXIF/GPS metadata), fullscreen lightbox viewer, and direct download.
- **Voice Notes**: Browser MediaRecorder API with Opus audio (WebM/MP4/OGG), live recording timer, preview duration, and download link.
- **Emoji & Reactions**: 6-category emoji picker and instant emoji reaction chips on any message.
- **Live Hints**: Real-time "typing…" and "recording…" indicators (encrypted, never stored in history).
- **QR Code Invites**: Built-in QR generator for mobile invites and Web Share API support.
- **24-Hour Expiration**: In-memory sweeper purges messages older than 24h and deletes idle rooms.
- **Creator Room Destruction**: Room creator can wipe room memory and disconnect all sockets with one click.

---

## Security & Specifications

For comprehensive security audits and protocol implementation details, see:
- [PROTOCOL.md](PROTOCOL.md) — Socket events, payload shapes, and encryption schemas.
- [SECURITY.md](SECURITY.md) — Threat model, security boundaries, and honest architectural limitations.
- [docs/architecture.md](docs/architecture.md) — Architectural overview and extension guides.

---

## License

[MIT](LICENSE)
