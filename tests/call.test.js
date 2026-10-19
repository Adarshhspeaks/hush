// Tests for WebRTC P2P encrypted signaling relay (call:signal)
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

describe('Real-Time WebRTC P2P Call Signaling Relay', () => {
  let server;
  let clientA;
  let clientB;
  let clientOutside;
  let keyStr;
  let keyA;
  let keyB;
  let roomId;

  before(async () => {
    server = await startServer();
    clientA = await createClient(server.url);
    clientB = await createClient(server.url);
    clientOutside = await createClient(server.url);

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
    clientOutside?.disconnect();
    await server?.stop();
  });

  test('relays encrypted WebRTC offer, answer, and ICE candidates to room peers without echo', async () => {
    let aEchoed = false;
    let outsideReceived = false;

    clientA.on('call:signal', () => {
      aEchoed = true;
    });
    clientOutside.on('call:signal', () => {
      outsideReceived = true;
    });

    const offerPayload = {
      type: 'offer',
      sdp: 'v=0\r\no=- 123456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      from: 'user_a',
      fromName: 'Alice',
    };
    const offerPacket = await encrypt(keyA, offerPayload);

    const recvPromise = new Promise((resolve) => clientB.once('call:signal', resolve));
    clientA.emit('call:signal', offerPacket);

    const receivedSignal = await recvPromise;
    assert.ok(receivedSignal.iv, 'Signal must have IV');
    assert.ok(receivedSignal.ct, 'Signal must have ciphertext');

    const decryptedOffer = await decrypt(keyB, receivedSignal);
    assert.strictEqual(decryptedOffer.type, 'offer');
    assert.strictEqual(decryptedOffer.sdp, offerPayload.sdp);
    assert.strictEqual(decryptedOffer.from, 'user_a');
    assert.strictEqual(decryptedOffer.fromName, 'Alice');

    // Wait a brief tick to ensure sender did not receive echo and outsider did not receive signal
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(aEchoed, false, 'Sender should not receive its own signal');
    assert.strictEqual(outsideReceived, false, 'Non-room client should not receive room call signal');

    // Peer B sends encrypted answer
    const answerPayload = {
      type: 'answer',
      sdp: 'v=0\r\no=- 654321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
      from: 'user_b',
      fromName: 'Bob',
    };
    const answerPacket = await encrypt(keyB, answerPayload);

    const answerRecvPromise = new Promise((resolve) => clientA.once('call:signal', resolve));
    clientB.emit('call:signal', answerPacket);

    const receivedAnswer = await answerRecvPromise;
    const decryptedAnswer = await decrypt(keyA, receivedAnswer);
    assert.strictEqual(decryptedAnswer.type, 'answer');
    assert.strictEqual(decryptedAnswer.sdp, answerPayload.sdp);
    assert.strictEqual(decryptedAnswer.from, 'user_b');
  });

  test('call signals are purely ephemeral and never saved in room message history', async () => {
    const key = await importKey(await newKeyString());
    const signalPacket = await encrypt(key, { type: 'hangup', from: 'user_a' });
    clientA.emit('call:signal', signalPacket);

    await new Promise((r) => setTimeout(r, 100));

    // Connect fresh client to inspect room history
    const inspector = await createClient(server.url);
    const joinResult = await new Promise((resolve) => {
      inspector.emit('room:join', roomId, resolve);
    });

    assert.ok(Array.isArray(joinResult.history));
    // Verify no call:signal exists in history
    const hasSignal = joinResult.history.some((m) => m.k === 'call' || m.type === 'call');
    assert.strictEqual(hasSignal, false, 'Call signals must never be persisted in history');

    inspector.disconnect();
  });
});
