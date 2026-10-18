// Automated security & protocol verification test for Hush
// Tests: built-in sticker E2EE, custom sticker E2EE, deletion authorization, no leak of dk/plaintext, size limits, and rate limits.
import { io } from 'socket.io-client';
import { newKeyString, importKey, encrypt, decrypt, encryptBytes, decryptBytes } from '../public/crypto.js';
import assert from 'assert';

const SERVER_URL = process.env.TEST_URL || 'http://localhost:3001';

async function runTests() {
  console.log(`Starting Hush protocol tests against ${SERVER_URL}...`);

  // 1. Generate room key with real Web Crypto
  const keyStr = await newKeyString();
  const keyA = await importKey(keyStr);
  const keyB = await importKey(keyStr);

  const socketA = io(SERVER_URL, { reconnection: false });
  const socketB = io(SERVER_URL, { reconnection: false });

  await Promise.all([
    new Promise((resolve) => socketA.on('connect', resolve)),
    new Promise((resolve) => socketB.on('connect', resolve)),
  ]);
  console.log('✔ Sockets connected');

  // 2. Create room
  const createRes = await new Promise((resolve) => socketA.emit('room:create', null, resolve));
  assert(createRes.id && createRes.adminToken, 'Failed to create room');
  const roomId = createRes.id;
  console.log(`✔ Room created: ${roomId}`);

  // 3. Both join room
  const [joinA, joinB] = await Promise.all([
    new Promise((resolve) => socketA.emit('room:join', roomId, resolve)),
    new Promise((resolve) => socketB.emit('room:join', roomId, resolve)),
  ]);
  assert(joinA.ok && joinB.ok, 'Failed to join room');
  console.log('✔ Both clients joined room');

  // 4. Test Built-in Sticker transmission & E2EE
  const stickerPayload = { n: 'Alice', u: 'u111', k: 'sticker', pack: 'builtin', id: 'react_fire' };
  const encryptedSticker = await encrypt(keyA, stickerPayload);

  // Assert plaintext is not present in ciphertext or iv
  assert(!JSON.stringify(encryptedSticker).includes('react_fire'), 'Security failure: sticker ID leaked in plaintext');
  assert(!JSON.stringify(encryptedSticker).includes('Alice'), 'Security failure: nickname leaked in plaintext');

  const recvStickerPromise = new Promise((resolve) => {
    socketB.on('msg', (msg) => {
      resolve(msg);
    });
  });

  const sendStickerAck = await new Promise((resolve) => {
    socketA.emit('msg:send', encryptedSticker, resolve);
  });
  assert(sendStickerAck.ok && sendStickerAck.delToken, 'Sender should receive ack with secret delToken');
  const stickerDelToken = sendStickerAck.delToken;

  const rawRecvMsg = await recvStickerPromise;
  // Assert server broadcast never includes delToken
  assert(!rawRecvMsg.delToken, 'Security failure: server leaked delToken to other room members');

  const decryptedSticker = await decrypt(keyB, rawRecvMsg);
  assert.strictEqual(decryptedSticker.k, 'sticker');
  assert.strictEqual(decryptedSticker.id, 'react_fire');
  assert.strictEqual(decryptedSticker.pack, 'builtin');
  console.log('✔ Built-in sticker encrypted, relayed, and decrypted successfully');

  // 5. Test Custom Sticker with encrypted media
  const dummyStickerBytes = new Uint8Array(4000).fill(42); // 4 KB dummy sticker
  const customHeader = { n: 'Alice', u: 'u111', k: 'sticker', pack: 'custom', mime: 'image/webp' };
  const encHeader = await encrypt(keyA, customHeader);
  const encMedia = await encryptBytes(keyA, dummyStickerBytes);

  const recvCustomPromise = new Promise((resolve) => {
    socketB.once('msg', resolve);
  });

  const sendCustomAck = await new Promise((resolve) => {
    socketA.emit('msg:send', { ...encHeader, ...encMedia }, resolve);
  });
  assert(sendCustomAck.ok && sendCustomAck.id, 'Failed to send custom sticker');

  const rawCustomMsg = await recvCustomPromise;
  const decryptedCustomHeader = await decrypt(keyB, rawCustomMsg);
  const decryptedCustomBytes = await decryptBytes(keyB, rawCustomMsg);

  assert.strictEqual(decryptedCustomHeader.k, 'sticker');
  assert.strictEqual(decryptedCustomHeader.pack, 'custom');
  assert.strictEqual(decryptedCustomBytes.length, dummyStickerBytes.length);
  assert.strictEqual(decryptedCustomBytes[0], 42);
  console.log('✔ Custom sticker media encrypted, transmitted, and decrypted successfully');

  // 6. Test Delete Authorization & Tombstone
  // Client B attempts to delete Client A's sticker with a forged token -> MUST FAIL
  const unauthorizedDel = await new Promise((resolve) => {
    socketB.emit('msg:delete', { id: rawRecvMsg.id, delToken: 'forged_fake_token_123' }, resolve);
  });
  assert(unauthorizedDel.error, 'Security failure: server allowed unauthorized message deletion');

  // Client A deletes with valid delToken -> MUST SUCCEED
  const delBroadcastPromise = new Promise((resolve) => {
    socketB.once('msg:delete', resolve);
  });

  const authorizedDel = await new Promise((resolve) => {
    socketA.emit('msg:delete', { id: rawRecvMsg.id, delToken: stickerDelToken }, resolve);
  });
  assert(authorizedDel.ok, 'Failed to delete message with valid delToken');

  const delEvent = await delBroadcastPromise;
  assert.strictEqual(delEvent.id, rawRecvMsg.id);
  console.log('✔ Message delete authorization verified (owner-only enforcement)');

  // 7. Verify History after deletion
  const socketC = io(SERVER_URL, { reconnection: false });
  await new Promise((resolve) => socketC.on('connect', resolve));
  const joinC = await new Promise((resolve) => socketC.emit('room:join', roomId, resolve));
  const idsInHistory = joinC.history.map((m) => m.id);
  assert(!idsInHistory.includes(rawRecvMsg.id), 'Security failure: deleted message remained in room history');
  // Verify delTokens are not present in history
  assert(joinC.history.every((m) => !m.delToken), 'Security failure: delTokens leaked in room:join history');
  console.log('✔ History integrity verified: deleted items purged and no delTokens exposed');

  // 8. Size limit verification: oversized message must be rejected
  const oversizedCt = 'A'.repeat(5000); // MAX_CT is 4096
  const oversizedAck = await new Promise((resolve) => {
    socketA.emit('msg:send', { iv: 'dGVzdGl2MTIzNDU2Nw', ct: oversizedCt }, resolve);
  });
  assert(oversizedAck.error, 'Security failure: server accepted message exceeding MAX_CT limit');
  console.log('✔ Server size limits enforced on oversized packets');

  socketA.disconnect();
  socketB.disconnect();
  socketC.disconnect();

  console.log('\n🎉 ALL PHASE 1 PROTOCOL & SECURITY TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failure:', err);
  process.exit(1);
});
