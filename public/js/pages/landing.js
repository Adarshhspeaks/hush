// Landing page controller: creates room, generates AES-256-GCM key, and redirects to /r/:id#key
import { newKeyString } from '../core/crypto.js';
import { initTheme } from '../features/theme.js';
import { connectSocket } from '../core/socket.js';
import { safeSet } from '../core/storage.js';

initTheme('themeToggle');

const btn = document.getElementById('create');
const err = document.getElementById('err');

if (btn) {
  btn.onclick = async () => {
    if (err) err.textContent = '';
    if (!window.isSecureContext || !crypto?.subtle) {
      if (err) err.textContent = 'Encryption needs https or localhost. Open this site over https.';
      return;
    }
    btn.disabled = true;

    try {
      const socket = await connectSocket();
      socket.emit('room:create', null, async (res) => {
        if (res.error) {
          if (err) err.textContent = res.error;
          btn.disabled = false;
          return socket.close();
        }
        const key = await newKeyString();
        safeSet('admin:' + res.id, res.adminToken);
        safeSet('key:' + res.id, key);
        location.href = `/r/${res.id}#${key}`; // key stays strictly in the # fragment
      });
    } catch (e) {
      btn.disabled = false;
      if (err) err.textContent = 'Connection error. Please try again.';
    }
  };
}
