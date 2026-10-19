// File attachment kind handler: decrypts generic file bytes (PDF, docs, archives, etc.) and renders download card
import { registerKind } from '../registry.js';
import { decryptBytes } from '../../core/crypto.js';

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📄';
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return '📦';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📑';
  if (['txt', 'md', 'json', 'js', 'py', 'html', 'css'].includes(ext)) return '📃';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return '🎬';
  return '📎';
}

export const fileKind = {
  snippet: (data) => `📎 ${data.fileName || 'File attachment'}`,
  render: (body, { msg, data, key, stick, toBottom }) => {
    if (!msg.mct) {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = '📎 File no longer available (the server cleared it to save space).';
      body.append(ph);
      return;
    }

    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.textContent = 'Decrypting file…';
    body.append(ph);

    decryptBytes(key, msg)
      .then((bytes) => {
        const mime = data.mime || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const fileName = String(data.fileName || `hush-file-${msg.ts}`).replace(/[<>:"/\\|?*]+/g, '_');

        const card = document.createElement('div');
        card.className = 'file-card';

        const iconBadge = document.createElement('div');
        iconBadge.className = 'file-icon-badge';
        iconBadge.textContent = getFileIcon(fileName);

        const info = document.createElement('div');
        info.className = 'file-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'file-name';
        nameEl.textContent = fileName;
        nameEl.title = fileName;

        const sizeEl = document.createElement('div');
        sizeEl.className = 'file-size';
        sizeEl.textContent = fmtBytes(data.fileSize || bytes.byteLength);

        info.append(nameEl, sizeEl);

        const dlBtn = document.createElement('a');
        dlBtn.className = 'file-dl-btn';
        dlBtn.href = url;
        dlBtn.download = fileName;
        dlBtn.textContent = '⬇ Save';
        dlBtn.title = `Download ${fileName}`;

        card.append(iconBadge, info, dlBtn);
        ph.replaceWith(card);
        if (stick) toBottom();
      })
      .catch(() => {
        ph.textContent = '🔒 Could not decrypt this file';
      });
  },
};

registerKind('file', fileKind);
