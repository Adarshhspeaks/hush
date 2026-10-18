// Sticker message kind handler: builtin SVG allowlist check and custom sticker decryption
import { registerKind } from '../registry.js';
import { decryptBytes } from '../../core/crypto.js';
import { ALLOWED_STICKER_IDS, saveCustomSticker } from '../../features/stickers/index.js';

export const stickerKind = {
  snippet: () => 'Sticker',
  isCustomBubble: true,
  render: (body, { msg, data, key, el, meta, stick, toBottom, flashNotice, stickerTray }) => {
    el.classList.add('sticker-msg');
    if (meta && meta.parentNode) meta.remove();

    if (data.pack === 'builtin') {
      if (!ALLOWED_STICKER_IDS.has(data.id)) {
        body.textContent = '🔒 Unrecognized sticker';
      } else {
        const img = document.createElement('img');
        img.className = 'sticker-display';
        img.src = `/stickers/${data.id}.svg`;
        img.alt = data.id;
        img.loading = 'lazy';
        img.onload = () => stick && toBottom();
        body.append(img);
      }
    } else if (data.pack === 'custom') {
      const mime = data.mime === 'image/webp' || data.mime === 'image/png' ? data.mime : '';
      if (!mime || !msg.mct) {
        body.textContent = '📎 Custom sticker no longer available';
      } else {
        const ph = document.createElement('div');
        ph.className = 'ph';
        ph.textContent = 'Decrypting sticker…';
        body.append(ph);

        decryptBytes(key, msg)
          .then((bytes) => {
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            const img = document.createElement('img');
            img.className = 'sticker-display';
            img.src = url;
            img.alt = 'Custom sticker';
            img.title = 'Tap to save to My Stickers';
            img.onload = () => stick && toBottom();
            img.onclick = async () => {
              try {
                await saveCustomSticker(blob, mime);
                flashNotice?.('Sticker saved to My Stickers! ⭐');
                stickerTray?.refresh();
              } catch (err) {
                flashNotice?.(err.message || 'Could not save sticker.');
              }
            };
            ph.replaceWith(img);
            if (stick) toBottom();
          })
          .catch(() => {
            ph.textContent = '🔒 Could not decrypt sticker';
          });
      }
    }

    const smeta = document.createElement('div');
    smeta.className = 'sticker-meta';
    smeta.textContent = `${(data.n || 'Anonymous').slice(0, 30)} · ${new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    el.append(smeta);
  },
};

registerKind('sticker', stickerKind);
