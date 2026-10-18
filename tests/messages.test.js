// Tests for message relay, encryption enforcement, rate limiting, and history
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  startServer,
  createClient,
  createRoom,
  joinRoom,
  sendMessage,
  newKeyString,
  importKey,
  encrypt,
  decrypt,
} from './helpers.js';

describe('Message Relay, Encryption & Security', () => {
  let server;
  let clientA;
  let clientB;
  let keyStr;
  let keyA;
  let keyB;
  let roomId;

  before(async () => {
    server = await startServer();
    clientA = await createClient(server.url);
    clientB = await createClient(server.url);

    keyStr = await newKeyString();
    keyA = await importKey(keyStr);
    keyB = await importKey(keyStr);

    const room = await createRoom(clientA);
    roomId = room.id;
    await joinRoom(clientA, roomId);
    await joinRoom(clientB, roomId);
  });

  after(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await server?.stop();
  });

  test('messages are relayed with ciphertext only; plaintext and delToken never leak', async () => {
    const rawPayload = { n: 'Alice', u: 'u101', x: 'Super secret hush message' };
    const encPacket = await encrypt(keyA, rawPayload);

    // Verify plaintext is not in the encrypted packet
    assert.ok(!JSON.stringify(encPacket).includes('Super secret'), 'Packet must not have plaintext');

    const recvPromise = new Promise((resolve) => {
      clientB.once('msg', resolve);
    });

    const sendAck = await sendMessage(clientA, encPacket);
    assert.strictEqual(sendAck.ok, true);
    assert.ok(sendAck.id, 'Expected message ID');
    assert.ok(sendAck.delToken, 'Expected delToken returned to author');

    const incoming = await recvPromise;
    assert.strictEqual(incoming.id, sendAck.id);
    assert.strictEqual(incoming.iv, encPacket.iv);
    assert.strictEqual(incoming.ct, encPacket.ct);
    assert.strictEqual(incoming.delToken, undefined, 'delToken must never be broadcast to members');

    const decrypted = await decrypt(keyB, incoming);
    assert.deepStrictEqual(decrypted, rawPayload);
  });

  test('history preserves message order and strips internal tokens for late joiners', async () => {
    const clientC = await createClient(server.url);
    const joinRes = await joinRoom(clientC, roomId);

    assert.strictEqual(joinRes.ok, true);
    assert.ok(Array.isArray(joinRes.history));
    assert.ok(joinRes.history.length >= 1);

    for (const msg of joinRes.history) {
      assert.ok(msg.id, 'History message must have id');
      assert.ok(msg.iv, 'History message must have iv');
      assert.ok(msg.ct, 'History message must have ct');
      assert.strictEqual(msg.delToken, undefined, 'delToken must never appear in history');
    }

    clientC.disconnect();
  });

  test('rejects oversized or invalid ciphertext payloads', async () => {
    // Malformed IV
    const badIv = await sendMessage(clientA, { iv: 'invalid!', ct: 'abcd' });
    assert.strictEqual(badIv.error, 'Invalid message.');

    // Oversized ct (> 4096 chars)
    const oversizedCt = 'A'.repeat(4097);
    const badCt = await sendMessage(clientA, { iv: 'abcdef123456', ct: oversizedCt });
    assert.strictEqual(badCt.error, 'Invalid message.');
  });

  test('token bucket rate limiting throttles rapid message bursts', async () => {
    const srv = await startServer();
    const c = await createClient(srv.url);
    const { id } = await createRoom(c);
    await joinRoom(c, id);

    const validPacket = await encrypt(keyA, { n: 'Fast', u: 'u1', x: 'spam' });

    // Bucket burst size is 5
    const results = [];
    for (let i = 0; i < 7; i++) {
      results.push(await sendMessage(c, validPacket));
    }

    const errors = results.filter((r) => r.error === 'Slow down.');
    assert.ok(errors.length >= 1, 'Should trigger rate limit when burst capacity is exceeded');

    c.disconnect();
    await srv.stop();
  });
});
