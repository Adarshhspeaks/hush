// Configuration and environment limits for Hush server
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const PORT = process.env.PORT || 3000;

// Message and room lifetime
export const TTL = 24 * 60 * 60 * 1000;            // messages and idle rooms expire after 24h
export const SWEEPER_INTERVAL = 5 * 60 * 1000;     // periodic sweep every 5 minutes

// Room and capacity limits
export const MAX_MSGS = 200;                       // history kept per room
export const MAX_ROOMS = 2000;                     // max active rooms on server
export const MAX_PER_ROOM = 50;                    // max members per room
export const MAX_ROOMS_PER_IP_PER_HOUR = 10;       // max rooms created per IP per hour

// Ciphertext size limits (chars)
export const MAX_CT = 4096;                        // max ciphertext chars for text/meta
export const MAX_MEDIA_CT = 2_200_000;             // max ciphertext chars for media (~1.5 MB raw)
export const MAX_TYPING_CT = 512;                  // max ciphertext chars for typing hint

// Media storage caps (bytes)
export const ROOM_MEDIA_CAP = num(process.env.ROOM_MEDIA_CAP, 12_000_000);     // oldest dropped first
export const GLOBAL_MEDIA_CAP = num(process.env.GLOBAL_MEDIA_CAP, 120_000_000); // memory protection

// Rate limiting
export const RATE_LIMIT_BURST = 5;                 // initial tokens
export const RATE_LIMIT_REFILL_RATE = 2.5;         // tokens per second
export const RATE_LIMIT_TEXT_COST = 1;             // tokens per text message
export const RATE_LIMIT_MEDIA_COST = 3;            // tokens per media message
export const TYPING_THROTTLE_MS = 1500;            // min ms between typing broadcasts

// Socket.io
export const MAX_HTTP_BUFFER_SIZE = 3_000_000;     // socket packet size limit
