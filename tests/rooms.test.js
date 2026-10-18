// Tests for room lifecycle: create, join, presence, destroy, limits, rate-limit
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  startServer,
  createClient,
  createRoom,
  joinRoom,
  destroyRoom,
} from './helpers.js';

describe('Room Lifecycle & Security', () => {
  let server;
  let clientA;
  let clientB;

  before(async () => {
    server = await startServer();
    clientA = await createClient(server.url);
    clientB = await createClient(server.url);
  });

  after(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await server?.stop();
  });

  test('room:create generates valid room ID and adminToken', async () => {
    const res = await createRoom(clientA);
    assert.ok(res.id, 'Expected room id');
    assert.ok(res.adminToken, 'Expected adminToken');
    assert.match(res.id, /^[\w-]{16}$/, 'Room ID must be 16 url-safe chars');
    assert.strictEqual(res.adminToken.length, 24, 'Admin token must be 24 chars');
  });

  test('room:join rejects invalid room IDs and non-existent rooms', async () => {
    // Malformed ID
    const res1 = await joinRoom(clientA, 'short-id');
    assert.ok(res1.error, 'Should reject malformed room ID');

    // Non-existent 16-char ID
    const res2 = await joinRoom(clientA, '1234567890123456');
    assert.strictEqual(res2.error, 'This room does not exist or has expired.');
  });

  test('room:join succeeds and broadcasts presence', async () => {
    const { id } = await createRoom(clientA);

    const joinResA = await joinRoom(clientA, id);
    assert.strictEqual(joinResA.ok, true);
    assert.strictEqual(joinResA.count, 1);
    assert.deepStrictEqual(joinResA.history, []);

    const presencePromise = new Promise((resolve) => {
      clientA.once('presence', (count) => resolve(count));
    });

    const joinResB = await joinRoom(clientB, id);
    assert.strictEqual(joinResB.ok, true);
    assert.strictEqual(joinResB.count, 2);

    const presenceCount = await presencePromise;
    assert.strictEqual(presenceCount, 2);
  });

  test('room:destroy by creator disconnects all sockets and cleans memory', async () => {
    const srv = await startServer();
    const c1 = await createClient(srv.url);
    const c2 = await createClient(srv.url);

    const { id, adminToken } = await createRoom(c1);
    await joinRoom(c1, id);
    await joinRoom(c2, id);

    // c2 attempts to destroy room with wrong token -> fails
    const failDestroy = await destroyRoom(c2, 'wrong-token-12345678901234');
    assert.ok(failDestroy.error, 'Unauthorized destruction must fail');

    // c1 destroys room with valid adminToken
    const destroyedPromise = new Promise((resolve) => {
      c2.once('destroyed', resolve);
    });
    const disconnectPromise = new Promise((resolve) => {
      c2.once('disconnect', resolve);
    });

    const successDestroy = await destroyRoom(c1, adminToken);
    assert.strictEqual(successDestroy.ok, true);

    await destroyedPromise;
    await disconnectPromise;

    // Room must now be gone
    const c3 = await createClient(srv.url);
    const joinAfterDestroy = await joinRoom(c3, id);
    assert.strictEqual(joinAfterDestroy.error, 'This room does not exist or has expired.');

    c1.disconnect();
    c2.disconnect();
    c3.disconnect();
    await srv.stop();
  });

  test('room creation IP rate limit is enforced (10 per hour)', async () => {
    const srv = await startServer();
    const c = await createClient(srv.url);

    // Create 10 rooms
    for (let i = 0; i < 10; i++) {
      const res = await createRoom(c);
      assert.ok(res.id, `Room ${i + 1} should be created`);
    }

    // 11th creation must fail
    const limitRes = await createRoom(c);
    assert.strictEqual(limitRes.error, 'Too many rooms from your network. Try later.');

    c.disconnect();
    await srv.stop();
  });
});
