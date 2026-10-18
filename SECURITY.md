# Security Policy & Threat Model

Hush is designed with an explicit, auditable security architecture. This document outlines the cryptographic guarantees, trust boundaries, threat model, and honest limitations of the system.

---

## 1. Core Security Guarantees

1. **Zero Plaintext on Server**: All message text, photos, audio recordings, custom stickers, nicknames, user IDs, reactions, and replies are encrypted in the client browser using `AES-256-GCM` before leaving the device. The server only sees random message identifiers, timestamps, ciphertext lengths, and rate-limiting buckets.
2. **Key Exclusivity**: The 256-bit AES-GCM room key lives exclusively in the URL fragment (`/r/<roomId>#<key>`). By standard HTTP and WebSocket specifications, browsers never transmit URL fragments to servers.
3. **No Database Persistence**: Rooms, message histories, and media reside entirely in server RAM. No user data or chat logs are ever written to disk. Restarting the server clears all state permanently.
4. **Strict Content-Security-Policy (CSP)**:
   ```http
   Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
   Referrer-Policy: no-referrer
   X-Content-Type-Options: nosniff
   Cache-Control: no-store
   Permissions-Policy: camera=(), geolocation=(), microphone=(self)
   ```
   - No inline scripts or styles are permitted.
   - No third-party scripts, CDNs, or external web fonts are loaded.
   - Referrers are completely disabled to prevent URL fragment leaks.
   - Browser caching is disabled (`Cache-Control: no-store`).
5. **Untrusted Content Handling**: All incoming text is sanitized and rendered strictly through `textContent` and dynamically constructed DOM elements. Raw user HTML or SVG is never inserted into the DOM.

---

## 2. Threat Model & Honest Limitations

Like any cryptographic system, Hush has fundamental boundaries based on its lightweight, server-relayed, zero-account architecture:

### 1. Shared-Key Identity & Spoofing
- **Limitation**: Because all participants in a room share a single symmetric `AES-256-GCM` encryption key, any member who has joined the room has the mathematical capability to encrypt and emit payloads with arbitrary `n` (nickname) or `u` (user ID) values.
- **Mitigation**: Nicknames and user IDs are designed for conversational clarity, not legal non-repudiation.
- **Owner Actions Protected via Secret Tokens**: Destructive actions (deleting messages, destroying rooms) cannot be forged because they do not rely on the shared room key. Instead, the server issues cryptographically random tokens (`delToken` for messages, `adminToken` for room creators) kept strictly in the author's local storage and never broadcast to other peers or included in message history.

### 2. Malicious Server Operator
- **Limitation**: The server delivers the client-side JavaScript code. A compromised or hostile server operator could theoretically modify the served JavaScript to exfiltrate encryption keys or plaintext.
- **Mitigation**: Hush is completely open source, has zero build or obfuscation steps, and comprises human-auditable vanilla JavaScript. Users requiring absolute assurance can self-host the server on trusted infrastructure or audit the client modules in browser developer tools.

### 3. Metadata Visibility
- **Limitation**: The relay server necessarily observes connection metadata:
  - Client IP addresses (mitigated if accessed via Tor or VPN)
  - Connection timestamps and active participant counts
  - Packet transmission times and ciphertext byte lengths

### 4. Lack of Forward Secrecy
- **Limitation**: Hush uses a static symmetric key for the duration of a room's lifetime. If an adversary captures encrypted network traffic and subsequently obtains the URL `#fragment`, they can decrypt past messages sent within that room.
- **Mitigation**: Rooms and messages automatically expire and vanish from memory after 24 hours. When a participant leaves a conversation, creating a fresh room is recommended.

### 5. Client Ephemerality & "View-Once"
- **Limitation**: Any recipient device that successfully decrypts a message, photo, or audio note inherently possesses the raw data in memory. Screen capture, camera photographs, and audio recordings can never be prevented by client software.

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability or implementation defect in Hush, please report it responsibly:
- Open a private security advisory on GitHub via the **Security** tab, or
- Contact the maintainers directly.

Security reports will be acknowledged within 48 hours and patches released promptly.
