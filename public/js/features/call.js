// WebRTC P2P Voice Call feature: handles signaling over encrypted socket relay and direct peer media
import { $ } from '../core/dom.js';
import { fmtDur } from '../core/dom.js';
import { encrypt, decrypt } from '../core/crypto.js';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function setupVoiceCall({ socket, key, myUid, getMyName }) {
  const callBtn = $('callBtn');
  const callBar = $('callBar');
  const callStatus = $('callStatus');
  const callDur = $('callDur');
  const callMuteBtn = $('callMuteBtn');
  const callEndBtn = $('callEndBtn');
  const incomingBox = $('incomingCallBox');
  const incomingCaller = $('incomingCaller');
  const callAcceptBtn = $('callAcceptBtn');
  const callDeclineBtn = $('callDeclineBtn');

  let pc = null;
  let localStream = null;
  let remoteAudio = null;
  let timer = null;
  let startTime = 0;
  let pendingOffer = null;
  let isMuted = false;

  function endCall(notifyPeer = true) {
    if (notifyPeer && socket) {
      encrypt(key, { type: 'hangup', from: myUid })
        .then((packet) => {
          socket.emit('call:signal', packet);
        })
        .catch(() => {});
    }

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      remoteAudio = null;
    }

    if (pc) {
      pc.close();
      pc = null;
    }

    if (callBar) callBar.hidden = true;
    if (incomingBox) incomingBox.hidden = true;
    if (callBtn) callBtn.textContent = '📞 Call';
    pendingOffer = null;
    isMuted = false;
    if (callMuteBtn) callMuteBtn.textContent = '🎤';
  }

  function startTimer() {
    startTime = Date.now();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      if (callDur) callDur.textContent = fmtDur(s);
    }, 1000);
  }

  function initPeerConnection() {
    pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = async (e) => {
      if (e.candidate) {
        const packet = await encrypt(key, {
          type: 'ice',
          candidate: e.candidate,
          from: myUid,
        });
        socket.emit('call:signal', packet);
      }
    };

    pc.ontrack = (e) => {
      if (!remoteAudio) {
        remoteAudio = new Audio();
        remoteAudio.autoplay = true;
      }
      remoteAudio.srcObject = e.streams[0];
      if (callStatus) callStatus.textContent = '📞 In Call (P2P Encrypted)';
      startTimer();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (callStatus) callStatus.textContent = '📞 Connected (P2P)';
        startTimer();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall(false);
      }
    };

    return pc;
  }

  async function startCall() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      return alert('Microphone permission required for voice calls.');
    }

    initPeerConnection();
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    if (callBar) callBar.hidden = false;
    if (callStatus) callStatus.textContent = 'Calling room peers…';
    if (callDur) callDur.textContent = '0:00';
    if (callBtn) callBtn.textContent = '📞 In Call';

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const packet = await encrypt(key, {
      type: 'offer',
      sdp: offer.sdp,
      from: myUid,
      fromName: getMyName(),
    });
    socket.emit('call:signal', packet);
  }

  async function acceptIncomingCall() {
    if (!pendingOffer) return;
    if (incomingBox) incomingBox.hidden = true;

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      return alert('Microphone permission required to join call.');
    }

    initPeerConnection();
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    if (callBar) callBar.hidden = false;
    if (callStatus) callStatus.textContent = 'Connecting…';
    if (callDur) callDur.textContent = '0:00';

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: pendingOffer.sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const packet = await encrypt(key, {
      type: 'answer',
      sdp: answer.sdp,
      from: myUid,
      fromName: getMyName(),
    });
    socket.emit('call:signal', packet);
    pendingOffer = null;
  }

  if (callBtn) {
    callBtn.onclick = () => {
      if (pc) endCall(true);
      else startCall();
    };
  }

  if (callEndBtn) {
    callEndBtn.onclick = () => endCall(true);
  }

  if (callMuteBtn) {
    callMuteBtn.onclick = () => {
      if (!localStream) return;
      isMuted = !isMuted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
      callMuteBtn.textContent = isMuted ? '🔇' : '🎤';
    };
  }

  if (callAcceptBtn) {
    callAcceptBtn.onclick = acceptIncomingCall;
  }

  if (callDeclineBtn) {
    callDeclineBtn.onclick = () => {
      if (incomingBox) incomingBox.hidden = true;
      pendingOffer = null;
    };
  }

  socket.on('call:signal', async (m) => {
    let data;
    try {
      data = await decrypt(key, m);
    } catch {
      return;
    }
    if (!data || data.from === myUid) return;

    if (data.type === 'offer') {
      if (pc) return; // already in a call
      pendingOffer = data;
      if (incomingCaller) {
        incomingCaller.textContent = `📞 ${data.fromName || 'Peer'} is calling…`;
      }
      if (incomingBox) incomingBox.hidden = false;
    } else if (data.type === 'answer' && pc) {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
      }
    } else if (data.type === 'ice' && pc) {
      try {
        if (data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch {}
    } else if (data.type === 'hangup') {
      endCall(false);
    }
  });

  return { endCall };
}
