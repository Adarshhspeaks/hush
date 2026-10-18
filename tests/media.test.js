// Tests for media transmission, byte encryption, per-room eviction, and global caps
import { test, describe } from 'node:test';
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
  encryptBytes,
  decryptBytes,
} from './helpers.js';

describe('Media Transmission & Storage Caps', () => {
  test('photo and voice media round-trip with Web Crypto', async () => {
    const server = await startServer();
    const clientA = await createClient(server.url);
    const clientB = await createClient(server.url);

    const keyStr = await newKeyString();
    const keyA = await importKey(keyStr);
    const keyB = await importKey(keyStr);

    const { id: roomId } = await createRoom(clientA);
    await joinRoom(clientA, roomId);
    await joinRoom(clientB, roomId);

    // 1. Simulate Photo
    const dummyImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const photoHeader = await encrypt(keyA, { n: 'Alice', u: 'u1', k: 'img', w: 800, h: 600 });
    const photoMedia = await encryptBytes(keyA, dummyImageBytes);

    const recvPromise = new Promise((resolve) => clientB.once('msg', resolve));
    const sendAck = await sendMessage(clientA, { ...photoHeader, ...photoMedia });
    assert.strictEqual(sendAck.ok, true);

    const received = await recvPromise;
    const decryptedHeader = await decrypt(keyB, received);
    const decryptedBytes = await decryptBytes(keyB, received);

    assert.strictEqual(decryptedHeader.k, 'img');
    assert.deepStrictEqual(decryptedBytes, dummyImageBytes);

    clientA.disconnect();
    clientB.disconnect();
    await server.stop();
  });

  test('oversized media payload is rejected', async () => {
    const server = await startServer();
    const client = await createClient(server.url);
    const key = await importKey(await newKeyString());

    const { id } = await createRoom(client);
    await joinRoom(client, id);

    const header = await encrypt(key, { n: 'Alice', u: 'u1', k: 'img' });
    const oversizedMct = 'A'.repeat(2_200_001); // Exceeds MAX_MEDIA_CT
    const ack = await sendMessage(client, { ...header, miv: 'abcdef123456', mct: oversizedMct });

    assert.strictEqual(ack.error, 'That file is too large (max ~1.5 MB).');

    client.disconnect();
    await server.stop();
  });

  test('per-room media eviction drops oldest media when cap is exceeded', async () => {
    // Start server with a small 5,000 byte per-room cap
    const server = await startServer({ ROOM_MEDIA_CAP: '5000' });
    const client = await createClient(server.url);
    const key = await importKey(await newKeyString());

    const { id: roomId } = await createRoom(client);
    await joinRoom(client, roomId);

    // Send first media (approx 3,000 bytes ciphertext)
    const media1Bytes = new Uint8Array(2000).fill(1);
    const head1 = await encrypt(key, { n: 'Alice', u: 'u1', k: 'img' });
    const enc1 = await encryptBytes(key, media1Bytes);
    const ack1 = await sendMessage(client, { ...head1, ...enc1 });
    assert.strictEqual(ack1.ok, true);

    // Wait a brief moment for token bucket refill so rate limiter doesn't block
    await new Promise((r) => setTimeout(r, 1500));

    // Send second media (approx 3,000 bytes ciphertext, total > 5,000 cap)
    const media2Bytes = new Uint8Array(2000).fill(2);
    const head2 = await encrypt(key, { n: 'Alice', u: 'u1', k: 'img' });
    const enc2 = await encryptBytes(key, media2Bytes);
    const ack2 = await sendMessage(client, { ...head2, ...enc2 });
    assert.strictEqual(ack2.ok, true);

    // Connect late joiner to inspect room history
    const clientLate = await createClient(server.url);
    const joinRes = await joinRoom(clientLate, roomId);

    assert.strictEqual(joinRes.ok, true);
    assert.strictEqual(joinRes.history.length, 2);

    const firstMsg = joinRes.history.find((m) => m.id === ack1.id);
    const secondMsg = joinRes.history.find((m) => m.id === ack2.id);

    // First message media must have been evicted (gone: true, mct cleared)
    assert.strictEqual(firstMsg.gone, true);
    assert.strictEqual(firstMsg.mct, undefined);
    assert.strictEqual(firstMsg.miv, undefined);
    assert.ok(firstMsg.ct, 'First message envelope/text must remain');

    // Second message media must still be present
    assert.ok(secondMsg.mct, 'Second message media must remain');

    client.disconnect();
    clientLate.disconnect();
    await server.stop();
  });

  test('global media cap prevents server memory exhaustion', async () => {
    // Start server with a tiny global cap
    const server = await startServer({ ROOM_MEDIA_CAP: '50000', GLOBAL_MEDIA_CAP: '4000' });
    const client = await createClient(server.url);
    const key = await importKey(await newKeyString());

    const { id: roomId } = await createRoom(client);
    await joinRoom(client, roomId);

    // Send media that fits in global cap
    const mediaBytes = new Uint8Array(1500);
    const head1 = await encrypt(key, { n: 'Alice', u: 'u1', k: 'img' });
    const enc1 = await encryptBytes(key, mediaBytes);
    const ack1 = await sendMessage(client, { ...head1, ...enc1 });
    assert.strictEqual(ack1.ok, true);

    await new Promise((r) => setTimeout(r, 1500));

    // Send media that pushes global total past GLOBAL_MEDIA_CAP (4000)
    const bigMedia = new Uint8Array(2500);
    const head2 = await encrypt(key, { n: 'Alice', u: 'u1', k: 'img' });
    const enc2 = await encryptBytes(key, bigMedia);
    const ack2 = await sendMessage(client, { ...head2, ...enc2 });

    assert.strictEqual(ack2.error, 'Server media storage is full. Try again later.');

    client.disconnect();
    await server.stop();
  });
});
