// Tests for message deletion authorization and history purge
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  startServer,
  createClient,
  createRoom,
  joinRoom,
  sendMessage,
  deleteMessage,
  newKeyString,
  importKey,
  encrypt,
} from './helpers.js';

describe('Message Deletion Authorization & Security', () => {
  let server;
  let clientA;
  let clientB;
  let key;
  let roomId;
  let adminToken;

  before(async () => {
    server = await startServer();
    clientA = await createClient(server.url);
    clientB = await createClient(server.url);

    key = await importKey(await newKeyString());
    const room = await createRoom(clientA);
    roomId = room.id;
    adminToken = room.adminToken;

    await joinRoom(clientA, roomId);
    await joinRoom(clientB, roomId);
  });

  after(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await server?.stop();
  });

  test('only author with valid delToken (or admin) can delete a message', async () => {
    const packet = await encrypt(key, { n: 'Alice', u: 'u1', x: 'To be deleted' });
    const sendAck = await sendMessage(clientA, packet);
    assert.strictEqual(sendAck.ok, true);
    const msgId = sendAck.id;
    const delToken = sendAck.delToken;

    // 1. Client B attempts to delete with forged token -> MUST FAIL
    const forgedAttempt = await deleteMessage(clientB, { id: msgId, delToken: 'fake-del-token-1234' });
    assert.strictEqual(forgedAttempt.error, 'Not authorized to delete this message.');

    // 2. Client B attempts to delete without any token -> MUST FAIL
    const unauthAttempt = await deleteMessage(clientB, { id: msgId });
    assert.strictEqual(unauthAttempt.error, 'Not authorized to delete this message.');

    // 3. Client A deletes with legitimate delToken -> SUCCEEDS
    const delBroadcastPromise = new Promise((resolve) => clientB.once('msg:delete', resolve));
    const validDel = await deleteMessage(clientA, { id: msgId, delToken });
    assert.strictEqual(validDel.ok, true);

    const broadcast = await delBroadcastPromise;
    assert.strictEqual(broadcast.id, msgId);

    // 4. Verify message is gone from history
    const clientLate = await createClient(server.url);
    const joinRes = await joinRoom(clientLate, roomId);
    assert.ok(!joinRes.history.some((m) => m.id === msgId), 'Deleted message must not appear in history');
    clientLate.disconnect();
  });

  test('room admin can delete messages created by others using adminToken', async () => {
    // Client B sends a message
    const packet = await encrypt(key, { n: 'Bob', u: 'u2', x: 'Inappropriate message' });
    const sendAck = await sendMessage(clientB, packet);
    assert.strictEqual(sendAck.ok, true);
    const msgId = sendAck.id;

    // Client A (admin) deletes Client B's message using room adminToken
    const adminDel = await deleteMessage(clientA, { id: msgId, adminToken });
    assert.strictEqual(adminDel.ok, true);

    // Verify it is gone
    const clientLate = await createClient(server.url);
    const joinRes = await joinRoom(clientLate, roomId);
    assert.ok(!joinRes.history.some((m) => m.id === msgId), 'Admin deleted message must be purged from history');
    clientLate.disconnect();
  });
});
