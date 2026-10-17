import { newKeyString } from './crypto.js';
import { initTheme } from './theme.js';

initTheme('themeToggle');

const btn = document.getElementById('create');
const err = document.getElementById('err');

btn.onclick = async () => {
  err.textContent = '';
  if (!window.isSecureContext || !crypto?.subtle) {
    return (err.textContent = 'Encryption needs https or localhost. Open this site over https.');
  }
  btn.disabled = true;
  const { io } = await import('/socket.io/socket.io.esm.min.js');
  const socket = io();
  socket.emit('room:create', null, async (res) => {
    if (res.error) { err.textContent = res.error; btn.disabled = false; return socket.close(); }
    const key = await newKeyString();
    try { localStorage.setItem('admin:' + res.id, res.adminToken); localStorage.setItem('key:' + res.id, key); } catch {}
    location.href = `/r/${res.id}#${key}`; // key stays in the # part, never sent to the server
  });
};
