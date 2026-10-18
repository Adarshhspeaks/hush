// Voice message kind handler: decrypts audio bytes and renders HTML5 audio player
import { registerKind } from '../registry.js';
import { decryptBytes } from '../../core/crypto.js';
import { fmtDur } from '../../core/dom.js';

const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

function dlLink(url, name) {
  const a = document.createElement('a');
  a.className = 'dl';
  a.href = url;
  a.download = name;
  a.textContent = '⬇ Save';
  return a;
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
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const au = document.createElement('audio');
        au.controls = true;
        au.preload = 'metadata';
        au.src = url;

        const durSpan = document.createElement('span');
        durSpan.className = 'hint';
        durSpan.textContent = ` ${fmtDur(Number(data.dur) || 0)}`;

        const ext = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
        ph.replaceWith(au);
        body.append(durSpan, dlLink(url, `hush-voice-${msg.ts}.${ext}`));
        if (stick) toBottom();
      })
      .catch(() => {
        ph.textContent = '🔒 Could not decrypt this file';
      });
  },
};

registerKind('voice', voiceKind);
