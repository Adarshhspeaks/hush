// Voice message kind handler: decrypts audio bytes and renders interactive waveform player with speed toggle
import { registerKind } from '../registry.js';
import { decryptBytes } from '../../core/crypto.js';
import { fmtDur } from '../../core/dom.js';

const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];
const PLAY_SVG = '<svg class="vp-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_SVG = '<svg class="vp-play-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

// Global tracking to ensure only one voice note plays at any time
let currentActiveAudio = null;

async function extractPeaks(bytes, barCount = 32) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const bufferCopy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const audioBuffer = await ctx.decodeAudioData(bufferCopy);
      ctx.close().catch(() => {});
      const rawData = audioBuffer.getChannelData(0);
      const blockSize = Math.floor(rawData.length / barCount);
      const peaks = [];
      let max = 0.01;
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[start + j] || 0);
        }
        const avg = sum / blockSize;
        if (avg > max) max = avg;
        peaks.push(avg);
      }
      return peaks.map((p) => Math.max(0.18, Math.min(1, p / max)));
    }
  } catch {
    // Fall back to deterministic peaks if audio decoding is unsupported
  }

  const peaks = [];
  const step = Math.max(1, Math.floor(bytes.length / barCount));
  for (let i = 0; i < barCount; i++) {
    const b = bytes[(i * step) % bytes.length] || 128;
    const pseudo = 0.2 + 0.8 * (Math.sin(i * 0.45 + (b % 10)) * 0.5 + 0.5);
    peaks.push(Math.max(0.18, Math.min(1, pseudo)));
  }
  return peaks;
}

function buildVoicePlayer({ bytes, mime, dur, ts }) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = 'metadata';

  const ext = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
  const fileName = `hush-voice-${ts}.${ext}`;

  const vp = document.createElement('div');
  vp.className = 'voice-player';

  // Play / Pause button
  const playBtn = document.createElement('button');
  playBtn.className = 'vp-play-btn';
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', 'Play voice message');
  playBtn.innerHTML = PLAY_SVG;

  // Main track (waveform + timestamps)
  const mainTrack = document.createElement('div');
  mainTrack.className = 'vp-main';

  const waveformWrap = document.createElement('div');
  waveformWrap.className = 'vp-waveform-wrap';
  waveformWrap.setAttribute('role', 'slider');
  waveformWrap.setAttribute('aria-label', 'Audio scrubber');
  waveformWrap.setAttribute('tabindex', '0');

  const waveform = document.createElement('div');
  waveform.className = 'vp-waveform';

  const bars = [];
  const barCount = 30;
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'vp-bar';
    bar.style.height = '40%';
    waveform.appendChild(bar);
    bars.push(bar);
  }
  waveformWrap.appendChild(waveform);

  // Asynchronously compute actual audio peaks and adjust bar heights
  extractPeaks(bytes, barCount).then((peaks) => {
    peaks.forEach((peak, i) => {
      if (bars[i]) bars[i].style.height = `${Math.round(peak * 100)}%`;
    });
  });

  const meta = document.createElement('div');
  meta.className = 'vp-meta';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'vp-time';
  timeSpan.textContent = '0:00';

  const durSpan = document.createElement('span');
  durSpan.className = 'vp-dur';
  durSpan.textContent = fmtDur(Number(dur) || 0);

  meta.append(timeSpan, durSpan);
  mainTrack.append(waveformWrap, meta);

  // Actions (Speed toggle + download)
  const actions = document.createElement('div');
  actions.className = 'vp-actions';

  const speedBtn = document.createElement('button');
  speedBtn.className = 'vp-speed-btn';
  speedBtn.type = 'button';
  speedBtn.textContent = '1x';
  speedBtn.title = 'Playback speed';

  const SPEEDS = [1, 1.5, 2];
  let speedIdx = 0;
  speedBtn.onclick = (e) => {
    e.stopPropagation();
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    const speed = SPEEDS[speedIdx];
    audio.playbackRate = speed;
    speedBtn.textContent = `${speed}x`;
  };

  const dlLink = document.createElement('a');
  dlLink.className = 'vp-dl-btn';
  dlLink.href = url;
  dlLink.download = fileName;
  dlLink.title = 'Save voice message';
  dlLink.textContent = '⬇';

  actions.append(speedBtn, dlLink);
  vp.append(playBtn, mainTrack, actions);

  // Playback logic
  function togglePlay() {
    if (audio.paused) {
      if (currentActiveAudio && currentActiveAudio !== audio) {
        currentActiveAudio.pause();
      }
      currentActiveAudio = audio;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  playBtn.onclick = togglePlay;

  audio.addEventListener('play', () => {
    vp.classList.add('vp-playing');
    playBtn.innerHTML = PAUSE_SVG;
    playBtn.setAttribute('aria-label', 'Pause voice message');
  });

  audio.addEventListener('pause', () => {
    vp.classList.remove('vp-playing');
    playBtn.innerHTML = PLAY_SVG;
    playBtn.setAttribute('aria-label', 'Play voice message');
  });

  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && isFinite(audio.duration)) {
      durSpan.textContent = fmtDur(audio.duration);
    }
  });

  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime || 0;
    const total = audio.duration || Number(dur) || 1;
    const pct = Math.max(0, Math.min(1, cur / total));
    timeSpan.textContent = fmtDur(cur);

    const playedBars = Math.floor(pct * bars.length);
    bars.forEach((bar, idx) => {
      if (idx <= playedBars && pct > 0) {
        bar.classList.add('played');
      } else {
        bar.classList.remove('played');
      }
    });
  });

  audio.addEventListener('ended', () => {
    vp.classList.remove('vp-playing');
    playBtn.innerHTML = PLAY_SVG;
    playBtn.setAttribute('aria-label', 'Play voice message');
    timeSpan.textContent = '0:00';
    bars.forEach((bar) => bar.classList.remove('played'));
  });

  // Waveform interactive scrubbing
  function seekTo(e) {
    const rect = waveformWrap.getBoundingClientRect();
    const x = (e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0]?.clientX)) || 0;
    const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const total = audio.duration || Number(dur) || 0;
    if (total > 0) {
      audio.currentTime = pct * total;
      timeSpan.textContent = fmtDur(audio.currentTime);
      const playedBars = Math.floor(pct * bars.length);
      bars.forEach((bar, idx) => {
        if (idx <= playedBars && pct > 0) bar.classList.add('played');
        else bar.classList.remove('played');
      });
    }
  }

  let isSeeking = false;
  waveformWrap.addEventListener('pointerdown', (e) => {
    isSeeking = true;
    waveformWrap.setPointerCapture(e.pointerId);
    seekTo(e);
  });
  waveformWrap.addEventListener('pointermove', (e) => {
    if (isSeeking) seekTo(e);
  });
  waveformWrap.addEventListener('pointerup', (e) => {
    if (isSeeking) {
      isSeeking = false;
      try {
        waveformWrap.releasePointerCapture(e.pointerId);
      } catch {}
    }
  });
  waveformWrap.addEventListener('pointercancel', () => {
    isSeeking = false;
  });

  return vp;
}

export const voiceKind = {
  snippet: () => '🎤 Voice message',
  render: (body, { msg, data, key, stick, toBottom }) => {
    if (!msg.mct) {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = '📎 Media no longer available (the server cleared it to save space).';
      body.append(ph);
      return;
    }

    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.textContent = 'Decrypting…';
    body.append(ph);

    decryptBytes(key, msg)
      .then((bytes) => {
        const rawMime = String(data.mime || '').split(';')[0];
        const mime = AUDIO_TYPES.includes(rawMime) ? rawMime : 'audio/webm';
        const player = buildVoicePlayer({
          bytes,
          mime,
          dur: data.dur,
          ts: msg.ts,
        });

        ph.replaceWith(player);
        if (stick) toBottom();
      })
      .catch(() => {
        ph.textContent = '🔒 Could not decrypt this file';
      });
  },
};

registerKind('voice', voiceKind);

