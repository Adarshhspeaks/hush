# Hush — anonymous end-to-end encrypted chat rooms

No accounts, no phone numbers. Create a room, share the link, chat.

## How the encryption works
- The browser generates a random AES-256-GCM key when you create a room.
- The key lives in the `#` part of the invite link (`/r/<roomId>#<key>`). Browsers never send the `#` part to the server.
- Every message (text, nickname, id) is encrypted in the browser before sending. The server only relays `{iv, ct}`.
- Each message uses a fresh random IV.

## Honest limits
- Anyone with the full link can read the room. Share it only where you trust people.
- The server operator serves the JavaScript. If they changed it maliciously, they could steal keys. Keep the code open source and small so people can audit it.
- The server still sees metadata: IP addresses, timing, message sizes, number of people online.
- Any member can fake any nickname (they all share one key). Nicknames are for fun, not proof of identity.
- No forward secrecy. Removing a person is not possible, make a new room instead.

## Run
    npm install
    npm start        # http://localhost:3000

Encryption needs a secure context: `localhost` or `https`. Opening it by LAN IP over plain http will not work, deploy it (Render gives https) to test with phones.

## Deploy to Render (Free HTTPS)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Adarshhspeaks/hush)

1. Click the **Deploy to Render** button above (or open [dashboard.render.com](https://dashboard.render.com), click **New +** → **Web Service**, and connect `Adarshhspeaks/hush`).
2. Build command: `npm install`
3. Start command: `npm start`
4. Render automatically provisions free HTTPS, which enables Web Crypto (`AES-256-GCM`) and microphone access on mobile browsers.
5. Rooms live in memory, so restarting wipes them clean.

## Features
- Text chat, random nicknames (changeable), online count, history for late joiners (last 200 messages)
- ↩ Reply-to-message: quote any message with jump-to and highlight animation (encrypted)
- 🗑 Delete-for-everyone: securely remove your own messages in real-time across all clients and server memory
- 🌙 Dark mode & ☀️ Light mode with instant toggle and OS system preference sync
- Photos: pick or paste, auto-resized to JPEG (this also strips EXIF/GPS), tap to zoom, download button
- Voice messages: tap mic, talk, send (max 2 min), play and download
- Emoji picker (6 categories) and quick reactions on any message
- "typing…" and "recording…" hints (encrypted, never stored)
- QR code invite and share-sheet invite link
- 24h auto-expiry, creator can destroy the room
- Rate limits, strict CSP, nothing written to disk, no logging of message content

Photos, voice notes, nicknames, reactions, replies and typing hints are all encrypted in the browser with the room key.

## Media limits
- One photo or voice note: about 1.5 MB after compression
- Per room: 12 MB of media, oldest media is dropped first (text stays)
- Whole server: 120 MB (override with env `ROOM_MEDIA_CAP`, `GLOBAL_MEDIA_CAP` in characters)
- Photos are always sent as JPEG, so GIFs become still images
- Voice notes need microphone permission and https (or localhost)
