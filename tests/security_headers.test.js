// Tests for security headers (CSP, Referrer-Policy, Cache-Control, etc.) and HTTP routes
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { startServer } from './helpers.js';

describe('HTTP Routes & Security Headers', () => {
  let server;

  before(async () => {
    server = await startServer();
  });

  after(async () => {
    await server?.stop();
  });

  test('GET / enforces strict CSP and privacy headers', async () => {
    const res = await fetch(`${server.url}/`);
    assert.strictEqual(res.status, 200);

    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header must be present');
    assert.ok(csp.includes("default-src 'none'"));
    assert.ok(csp.includes("script-src 'self'"));
    assert.ok(csp.includes("style-src 'self'"));
    assert.ok(csp.includes("connect-src 'self' ws: wss:"));
    assert.ok(csp.includes("img-src 'self' data: blob:"));
    assert.ok(csp.includes("media-src 'self' blob:"));

    assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    assert.strictEqual(
      res.headers.get('permissions-policy'),
      'camera=(), geolocation=(), microphone=(self)'
    );
    assert.strictEqual(res.headers.get('x-powered-by'), null, 'X-Powered-By must be disabled');
  });

  test('GET /r/:id serves room page with security headers', async () => {
    const res = await fetch(`${server.url}/r/testroom12345678`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-security-policy'));
    const body = await res.text();
    assert.ok(body.includes('Hush room'), 'Expected room.html content');
  });

  test('serves static assets and stickers correctly', async () => {
    const cssRes = await fetch(`${server.url}/style.css`);
    assert.strictEqual(cssRes.status, 200);

    const stickerRes = await fetch(`${server.url}/stickers/react_fire.svg`);
    assert.strictEqual(stickerRes.status, 200);
  });
});
