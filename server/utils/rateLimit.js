// Token-bucket rate limiter for socket messages and per-IP room creation logger
import {
  RATE_LIMIT_BURST,
  RATE_LIMIT_REFILL_RATE,
  MAX_ROOMS_PER_IP_PER_HOUR,
} from '../config.js';

export class TokenBucket {
  constructor(burst = RATE_LIMIT_BURST, refillRate = RATE_LIMIT_REFILL_RATE) {
    this.burst = burst;
    this.refillRate = refillRate;
    this.tokens = burst;
    this.lastRefill = Date.now();
  }

  tryConsume(cost) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.lastRefill) / 1000) * this.refillRate);
    this.lastRefill = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

// In-memory log of room creation timestamps per IP address
const createLog = new Map();

export function checkRoomCreationLimit(ip) {
  const now = Date.now();
  const recent = (createLog.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= MAX_ROOMS_PER_IP_PER_HOUR) {
    return false;
  }
  recent.push(now);
  createLog.set(ip, recent);
  return true;
}

// Prune IP log entries older than 1 hour to prevent memory leak
export function pruneCreateLog(now = Date.now()) {
  for (const [ip, timestamps] of createLog) {
    const valid = timestamps.filter((t) => now - t < 3600e3);
    if (valid.length === 0) {
      createLog.delete(ip);
    } else {
      createLog.set(ip, valid);
    }
  }
}
