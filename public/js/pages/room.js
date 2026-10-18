// Hush room page entry: wires core modules, message kinds, and UI features together
import { importKey, encrypt, encryptBytes } from '../core/crypto.js';
import { initIdentity } from '../core/identity.js';
import { connectSocket } from '../core/socket.js';
import { saveDelToken, getDelToken } from '../core/storage.js';
import { $, flashNotice, fatal, atBottom, toBottom, fmtDur } from '../core/dom.js';
import { initTheme } from '../features/theme.js';
import { initReply, getActiveReply, clearReply } from '../features/reply.js';
import { enableDelete } from '../features/delete.js';
import { setupTyping } from '../features/typing.js';
import { buildPicker } from '../features/emoji/index.js';
import { buildStickerTray, ALLOWED_STICKER_IDS, saveCustomSticker } from '../features/stickers/index.js';
import { compressImage, canRecord, startRecording } from '../features/media/index.js';
import { setupQrModal } from '../features/qr.js';
import { setupLightbox } from '../features/lightbox.js';
import { setupInvite } from '../features/invite.js';
import { createMessageList } from '../messages/list.js';

// Register kind modules into the registry
import '../messages/kinds/text.js';
import '../messages/kinds/image.js';
import '../messages/kinds/voice.js';
import '../messages/kinds/sticker.js';

const roomId = location.pathname.split('/').pop();
const MAX_MEDIA = 1_500_000; // bytes, matches server limit

initTheme('themeToggle');
initReply();

const idt = initIdentity(roomId);
if (idt.adminToken) {
  const destroyBtn = $('destroy');
  if (destroyBtn) destroyBtn.hidden = false;
}

async function main() {
  if (!window.isSecureContext || !crypto?.subtle) {
    return fatal('Encryption needs https or localhost.');
  }
  if (!idt.keyStr) {
    return fatal('This link is missing its key. Ask for the full invite link (the part after the #).');
  }

  let key;
  try {
    key = await importKey(idt.keyStr);
  } catch {
    return fatal('This link looks broken. Ask for a fresh invite link.');
  }

  const socket = await connectSocket();
  const log = $('log');

  const inviteLink = () => `${location.origin}/r/${roomId}#${idt.keyStr}`;

  // Feature setup
  setupQrModal(inviteLink);
  setupLightbox();
  setupInvite(inviteLink);

  const typingController = setupTyping({
    socket,
    key,
    getMyName: idt.getMyName,
    myUid: idt.myUid,
  });

  let stickerTray;
  stickerTray = buildStickerTray($('stickerView'), {
    onSendBuiltin: (id) => sendBuiltinSticker(id),
    onSendCustom: (blob, mime) => sendCustomSticker(blob, mime),
    onNotice: (txt) => flashNotice(txt),
  });

  const msgList = createMessageList({
    logEl: log,
    key,
    myUid: idt.myUid,
    getMyName: idt.getMyName,
    adminToken: idt.adminToken,
    getDelToken: (id) => getDelToken(roomId, id),
    socket,
    flashNotice,
    stickerTray,
  });

  // ---------- Socket Event Listeners ----------
  socket.on('connect', () => {
    socket.emit('room:join', roomId, async (res) => {
      if (res.error) return fatal(res.error);
      const countEl = $('count');
      if (countEl) countEl.textContent = `${res.count} online`;
      for (const m of res.history) {
        await msgList.show(m);
      }
    });
  });

  socket.on('presence', (n) => {
    const countEl = $('count');
    if (countEl) countEl.textContent = `${n} online`;
  });

  socket.on('msg', msgList.show);
  socket.on('msg:delete', ({ id }) => msgList.remove(id));
  socket.on('destroyed', () => fatal('The room creator destroyed this room.'));
  socket.on('disconnect', () => {
    const countEl = $('count');
    if (countEl) countEl.textContent = 'reconnecting…';
  });

  // ---------- Message Sending ----------
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const textInput = $('text');
    const text = textInput ? textInput.value.trim() : '';
    if (!text) return;
    textInput.value = '';

    const payload = { n: idt.getMyName(), u: idt.myUid, x: text.slice(0, 1000) };
    const activeReply = getActiveReply();
    if (activeReply) {
      payload.reply = activeReply;
      clearReply();
    }

    const packet = await encrypt(key, payload);
    socket.emit('msg:send', packet, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(roomId, r.id, r.delToken);
        enableDelete(r.id, msgList.refs, socket, (id) => getDelToken(roomId, id), idt.adminToken);
      }
    });
  };

  const textInput = $('text');
  if (textInput) {
    textInput.addEventListener('input', () => typingController.hint('typing'));
  }

  async function sendMedia(kind, blob, extra) {
    if (blob.size > MAX_MEDIA) {
      return alert('That file is too large (max about 1.5 MB after compression).');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const headObj = { n: idt.getMyName(), u: idt.myUid, k: kind, ...extra };
    const activeReply = getActiveReply();
    if (activeReply) {
      headObj.reply = activeReply;
      clearReply();
    }
    const head = await encrypt(key, headObj);
    const media = await encryptBytes(key, bytes);
    socket.emit('msg:send', { ...head, ...media }, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(roomId, r.id, r.delToken);
        enableDelete(r.id, msgList.refs, socket, (id) => getDelToken(roomId, id), idt.adminToken);
      }
    });
  }

  // Photos
  async function sendImageFile(file) {
    if (!file.type.startsWith('image/')) return alert('Only images can be sent.');
    try {
      const { blob, w, h } = await compressImage(file);
      await sendMedia('img', blob, { w, h });
    } catch {
      alert("Couldn't read that image. Try a JPEG or PNG.");
    }
  }

  const attachBtn = $('attach');
  const fileInput = $('file');
  if (attachBtn && fileInput) {
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      for (const f of [...fileInput.files].slice(0, 4)) {
        await sendImageFile(f);
      }
      fileInput.value = '';
    };
  }

  if (textInput) {
    textInput.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) {
        e.preventDefault();
        sendImageFile(f);
      }
    });
  }

  // Voice recording
  let rec = null;
  let recTimer = null;
  let recStart = 0;

  if (!canRecord()) {
    const mic = $('mic');
    if (mic) mic.hidden = true;
  }

  const micBtn = $('mic');
  if (micBtn) {
    micBtn.onclick = async () => {
      if (rec) return;
      try {
        rec = await startRecording();
      } catch {
        return alert('Allow microphone access to send voice messages.');
      }
      recStart = Date.now();
      const rtime = $('rtime');
      if (rtime) rtime.textContent = '0:00';
      $('recbar').hidden = false;
      $('f').hidden = true;
      $('pickerBox').hidden = true;
      typingController.hint('rec');

      recTimer = setInterval(() => {
        const s = Math.floor((Date.now() - recStart) / 1000);
        if (rtime) rtime.textContent = fmtDur(s);
        typingController.hint('rec');
        if (s >= 120) finishRec(true);
      }, 1000);
    };
  }

  async function finishRec(send) {
    if (!rec) return;
    clearInterval(recTimer);
    const r = rec;
    rec = null;
    $('recbar').hidden = true;
    $('f').hidden = false;
    if (!send) return r.cancel();
    const { blob, dur } = await r.stop();
    if (dur < 0.6 || blob.size < 200) return;
    await sendMedia('voice', blob, { mime: blob.type, dur: Math.round(dur) });
  }

  const rsend = $('rsend');
  const rcancel = $('rcancel');
  if (rsend) rsend.onclick = () => finishRec(true);
  if (rcancel) rcancel.onclick = () => finishRec(false);

  // Stickers sending
  async function sendBuiltinSticker(id) {
    if (!ALLOWED_STICKER_IDS.has(id)) return;
    const payload = { n: idt.getMyName(), u: idt.myUid, k: 'sticker', pack: 'builtin', id };
    const activeReply = getActiveReply();
    if (activeReply) {
      payload.reply = activeReply;
      clearReply();
    }
    const packet = await encrypt(key, payload);
    socket.emit('msg:send', packet, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(roomId, r.id, r.delToken);
        enableDelete(r.id, msgList.refs, socket, (id) => getDelToken(roomId, id), idt.adminToken);
      }
    });
    $('pickerBox').hidden = true;
  }

  async function sendCustomSticker(blob, mime) {
    if (blob.size > 100_000) return alert('Sticker must be under 100 KB.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const headObj = { n: idt.getMyName(), u: idt.myUid, k: 'sticker', pack: 'custom', mime };
    const activeReply = getActiveReply();
    if (activeReply) {
      headObj.reply = activeReply;
      clearReply();
    }
    const head = await encrypt(key, headObj);
    const media = await encryptBytes(key, bytes);
    socket.emit('msg:send', { ...head, ...media }, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(roomId, r.id, r.delToken);
        enableDelete(r.id, msgList.refs, socket, (id) => getDelToken(roomId, id), idt.adminToken);
      }
    });
    $('pickerBox').hidden = true;
  }

  // Emoji picker
  buildPicker($('emojiView'), (e) => {
    const i = $('text');
    if (!i) return;
    const s = i.selectionStart ?? i.value.length;
    i.setRangeText(e, s, i.selectionEnd ?? s, 'end');
    i.focus();
    i.dispatchEvent(new Event('input'));
  });

  // Drawer tabs
  const tabEmoji = $('tabEmoji');
  const tabStickers = $('tabStickers');
  const emojiView = $('emojiView');
  const stickerView = $('stickerView');

  if (tabEmoji && tabStickers && emojiView && stickerView) {
    tabEmoji.onclick = () => {
      tabEmoji.classList.add('on');
      tabStickers.classList.remove('on');
      emojiView.hidden = false;
      stickerView.hidden = true;
    };
    tabStickers.onclick = () => {
      tabStickers.classList.add('on');
      tabEmoji.classList.remove('on');
      stickerView.hidden = false;
      emojiView.hidden = true;
      stickerTray.refresh();
    };
  }

  const emojiBtn = $('emojiBtn');
  if (emojiBtn) {
    emojiBtn.onclick = () => {
      const picker = $('pickerBox');
      if (picker) picker.hidden = !picker.hidden;
    };
  }

  // Keyboard shortcut: Escape closes modals/drawers/reply
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const lb = $('lightbox');
      const qb = $('qrbox');
      const pb = $('pickerBox');
      if ((lb && !lb.hidden) || (qb && !qb.hidden)) {
        if (lb) lb.hidden = true;
        if (qb) qb.hidden = true;
      } else if (getActiveReply()) {
        clearReply();
      } else if (pb && !pb.hidden) {
        pb.hidden = true;
      }
    }
  });

  // Nickname rename
  const renameBtn = $('rename');
  if (renameBtn) {
    renameBtn.onclick = () => {
      const n = prompt('New nickname for this room:', idt.getMyName());
      if (n && n.trim()) {
        idt.setMyName(n);
      }
    };
  }

  // Room destruction
  const destroyBtn = $('destroy');
  if (destroyBtn) {
    destroyBtn.onclick = () => {
      if (confirm('Destroy this room for everyone? This cannot be undone.')) {
        socket.emit('room:destroy', idt.adminToken);
      }
    };
  }
}

main();
