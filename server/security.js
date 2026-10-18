// Security middleware: strict Content-Security-Policy and privacy headers
// Disallows inline scripts/styles/eval, external CDNs, referrer leaks, and embeds.
export function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  });
  next();
}
