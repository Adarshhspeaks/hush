// Tests for typing and recording hints: ephemeral relay, no echo, no persistence
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  startServer,
  createClient,
  createRoom,
  joinRoom,
  newKeyString,
  importKey,
  encrypt,
  decrypt,
} from './helpers.js';

describe('Typing & Recording Hints', () => {
  let server;
  let clientA;
  let clientB;
  let key;
  let roomId;

  before(async () => {
    server = await startServer();
    clientA = await createClient(server.url);
    clientB = await createClient(server.url);

    key = await importKey(await newKeyString());
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

  test('typing events are relayed to peers and not echoed to sender', async () => {
    const hintPayload = { n: 'Alice', u: 'u1', a: 'typing' };
    const encHint = await encrypt(key, hintPayload);

    let senderEcho = false;
    clientA.once('typing', () => { senderEcho = true; });

    const peerPromise = new Promise((resolve) => clientB.once('typing', resolve));

    clientA.emit('typing', encHint);

    const received = await peerPromise;
    assert.strictEqual(senderEcho, false, 'Typing hint must not be echoed back to sender');

    const decrypted = await decrypt(key, received);
    assert.deepStrictEqual(decrypted, hintPayload);
  });

  test('typing events are never stored in history', async () => {
    const clientC = await createClient(server.url);
    const joinRes = await joinRoom(clientC, roomId);

    assert.strictEqual(joinRes.ok, true);
    // Typing hints are never in history
    assert.ok(joinRes.history.every((m) => m.k !== 'typing' && m.a !== 'typing'));

    clientC.disconnect();
  });

  test('typing events are throttled and oversized hints are ignored', async () => {
    // Wait for the 1500ms throttle cooldown from earlier tests
    await new Promise((r) => setTimeout(r, 1600));

    // 1. Throttling: send 2 events within <1500ms -> second should be dropped by server
    let receivedCount = 0;
    const countHandler = () => { receivedCount++; };
    clientB.on('typing', countHandler);

    const hint1 = await encrypt(key, { n: 'Alice', u: 'u1', a: 'typing' });
    const hint2 = await encrypt(key, { n: 'Alice', u: 'u1', a: 'typing' });

    clientA.emit('typing', hint1);
    clientA.emit('typing', hint2); // Immediately after

    await new Promise((r) => setTimeout(r, 300));
    clientB.removeListener('typing', countHandler);

    assert.strictEqual(receivedCount, 1, 'Rapid typing hints must be throttled');

    // 2. Oversized ciphertext (> 512 chars)
    let oversizedReceived = false;
    clientB.once('typing', () => { oversizedReceived = true; });

    clientA.emit('typing', { iv: 'dGVzdGl2MTIzNDU2Nw', ct: 'A'.repeat(513) });
    await new Promise((r) => setTimeout(r, 200));

    assert.strictEqual(oversizedReceived, false, 'Oversized typing packet must be ignored');
  });
});
