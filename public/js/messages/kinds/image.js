// Photo/image message kind handler: decrypts JPEG bytes and renders thumbnail with lightbox trigger
import { registerKind } from '../registry.js';
import { decryptBytes } from '../../core/crypto.js';
import { $ } from '../../core/dom.js';

function dlLink(url, name) {
  const a = document.createElement('a');
  a.className = 'dl';
  a.href = url;
  a.download = name;
  a.textContent = '⬇ Save';
  return a;
}

export const imageKind = {
  snippet: () => '📷 Photo',
  render: (body, { msg, key, stick, toBottom }) => {
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
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        const img = new Image();
        img.className = 'photo';
        img.alt = 'Photo';
        img.src = url;
        img.onload = () => stick && toBottom();
        img.onclick = () => {
          const lbimg = $('lbimg');
          const lbdl = $('lbdl');
          const lightbox = $('lightbox');
          if (lbimg) lbimg.src = url;
          if (lbdl) {
            lbdl.href = url;
            lbdl.download = `hush-${msg.ts}.jpg`;
          }
          if (lightbox) lightbox.hidden = false;
        };
        ph.replaceWith(img);
        body.append(dlLink(url, `hush-${msg.ts}.jpg`));
        if (stick) toBottom();
      })
      .catch(() => {
        ph.textContent = '🔒 Could not decrypt this file';
      });
  },
};

registerKind('img', imageKind);
