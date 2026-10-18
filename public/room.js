import { importKey, encrypt, decrypt, encryptBytes, decryptBytes, randomId } from './crypto.js';
import { randomName, colorFor, hueFor } from './names.js';
import { compressImage, startRecording, canRecord } from './media.js';
import { buildPicker, QUICK } from './emoji.js';
import { ALLOWED_STICKER_IDS, buildStickerTray, saveCustomSticker } from './stickers.js';
import { initTheme } from './theme.js';
import qrcode from './vendor/qrcode.mjs';

const $ = (id) => document.getElementById(id);
const roomId = location.pathname.split('/').pop();
const MAX_MEDIA = 1_500_000; // bytes, must match the server's limit
const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

initTheme('themeToggle');

// ---- key: from the # part of the link (or this browser's saved copy) ----
let keyStr = location.hash.slice(1);
try {
  if (keyStr) localStorage.setItem('key:' + roomId, keyStr);
  else keyStr = localStorage.getItem('key:' + roomId) || '';
} catch {}

function fatal(msg) {
  $('log').textContent = msg;
  $('log').className = 'log fatal';
  for (const id of ['f', 'recbar', 'pickerBox', 'typing', 'replyBar']) $(id).hidden = true;
}

function flashNotice(txt) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const n = document.createElement('div');
  n.className = 'toast';
  n.textContent = txt;
  document.body.append(n);
  setTimeout(() => n.classList.add('out'), 2000);
  setTimeout(() => n.remove(), 2350);
}

// ---- token store for deleting messages ----
function saveDelToken(id, token) {
  try { localStorage.setItem(`del:${roomId}:${id}`, token); } catch {}
}
function getDelToken(id) {
  try { return localStorage.getItem(`del:${roomId}:${id}`); } catch { return null; }
}

// ---- who am I in this room (per room, stored only in this browser) ----
const store = (k, make) => {
  try { let v = localStorage.getItem(k); if (!v) { v = make(); localStorage.setItem(k, v); } return v; } catch { return make(); }
};
let myName = store('name:' + roomId, randomName);
const myUid = store('uid:' + roomId, () => randomId(4));
const adminToken = (() => { try { return localStorage.getItem('admin:' + roomId); } catch { return null; } })();
if (adminToken) $('destroy').hidden = false;

// ---- reply state ----
let activeReply = null;
function setReply(id, name, uid, snippet) {
  activeReply = {
    id,
    name: (name || 'Anonymous').slice(0, 30),
    uid: String(uid || ''),
    text: (snippet || 'Message').slice(0, 120),
  };
  $('replyToName').textContent = activeReply.name;
  $('replyToText').textContent = activeReply.text;
  $('replyBar').style.setProperty('--reply-h', hueFor(activeReply.uid));
  $('replyBar').hidden = false;
  $('text').focus();
}
function clearReply() {
  activeReply = null;
  $('replyBar').hidden = true;
}
$('cancelReply').onclick = clearReply;

async function main() {
  if (!window.isSecureContext || !crypto?.subtle) return fatal('Encryption needs https or localhost.');
  if (!keyStr) return fatal('This link is missing its key. Ask for the full invite link (the part after the #).');
  let key;
  try { key = await importKey(keyStr); } catch { return fatal('This link looks broken. Ask for a fresh invite link.'); }

  const { io } = await import('/socket.io/socket.io.esm.min.js');
  const socket = io();
  const seen = new Set();
  const refs = new Map();   // message id -> { reactBox, actions, snippet, authorName, authorUid }
  const reacts = new Map(); // message id -> Map(uid -> emoji)
  const log = $('log');
  const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  const toBottom = () => (log.scrollTop = log.scrollHeight);
  const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function enableDelete(id) {
    const r = refs.get(id);
    if (r?.actions && !r.actions.querySelector('.act-btn.danger')) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'act-btn danger';
      delBtn.title = 'Delete for everyone';
      delBtn.setAttribute('aria-label', 'Delete for everyone');
      delBtn.textContent = '🗑';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (!confirm('Delete this message for everyone?')) return;
        const token = getDelToken(id);
        socket.emit('msg:delete', { id, delToken: token, adminToken }, (res) => {
          if (res?.error) alert(res.error);
        });
      };
      r.actions.append(delBtn);
    }
  }

  // ---------- reactions ----------
  function renderReacts(id) {
    const r = refs.get(id);
    if (!r) return;
    r.reactBox.replaceChildren();
    const counts = new Map();
    for (const e of (reacts.get(id) || new Map()).values()) counts.set(e, (counts.get(e) || 0) + 1);
    for (const [e, n] of counts) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = n > 1 ? `${e} ${n}` : e;
      r.reactBox.append(chip);
    }
  }
  async function sendReaction(target, e) {
    const had = reacts.get(target)?.get(myUid) === e; // same emoji again = remove
    const packet = await encrypt(key, { n: myName, u: myUid, k: 'react', t: target, e: had ? '' : e });
    socket.emit('msg:send', packet);
  }
  function quickRow(msgEl, msgId) {
    const old = msgEl.querySelector('.quick');
    if (old) return old.remove();
    const row = document.createElement('div');
    row.className = 'quick';
    for (const e of QUICK) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = e;
      b.onclick = () => { row.remove(); sendReaction(msgId, e); };
      row.append(b);
    }
    msgEl.append(row);
  }

  // ---------- download links ----------
  function dlLink(url, name) {
    const a = document.createElement('a');
    a.className = 'dl'; a.href = url; a.download = name; a.textContent = '⬇ Save';
    return a;
  }

  // ---------- render one message ----------
  async function show(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    let data = null;
    try { data = await decrypt(key, m); } catch {}

    // reactions are tiny encrypted messages that point at another message
    if (data && data.k === 'react') {
      if (typeof data.t === 'string' && typeof data.e === 'string' && data.e.length <= 8) {
        const map = reacts.get(data.t) || new Map();
        if (data.e) map.set(String(data.u), data.e); else map.delete(String(data.u));
        reacts.set(data.t, map);
        renderReacts(data.t);
      }
      return;
    }

    const stick = atBottom() || data?.u === myUid;
    const el = document.createElement('div');
    el.id = 'msg-' + m.id;
    const meta = document.createElement('div'); meta.className = 'meta';
    const body = document.createElement('div'); body.className = 'body';
    el.append(meta, body);

    if (!data || typeof data.n !== 'string') {
      el.className = 'msg bad';
      body.textContent = '🔒 Message could not be decrypted (wrong key?)';
    } else {
      el.className = 'msg' + (data.u === myUid ? ' mine' : '');
      el.style.setProperty('--h', hueFor(String(data.u)));
      el.style.setProperty('--c', colorFor(String(data.u)));
      meta.textContent = `${data.n.slice(0, 30)} #${String(data.u).slice(0, 3)} · ${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      // Quoted reply block
      if (data.reply && typeof data.reply.id === 'string') {
        const quote = document.createElement('div');
        quote.className = 'quote';
        quote.style.setProperty('--qh', hueFor(data.reply.uid));
        const qHead = document.createElement('div');
        qHead.className = 'qhead';
        qHead.textContent = `↩ ${data.reply.name || 'Anonymous'}`;
        const qText = document.createElement('div');
        qText.className = 'qtext';
        qText.textContent = data.reply.text || '';
        quote.append(qHead, qText);
        quote.onclick = (e) => {
          e.stopPropagation();
          const target = document.getElementById('msg-' + data.reply.id);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.remove('pulse-highlight');
            void target.offsetWidth;
            target.classList.add('pulse-highlight');
          } else {
            flashNotice('Quoted message not found (it may have been deleted or expired)');
          }
        };
        body.append(quote);
      }

      let snippet = '';
      if (data.k === 'sticker') {
        snippet = 'Sticker';
        el.className = 'msg sticker-msg' + (data.u === myUid ? ' mine' : '');
        meta.remove(); // No bubble header for stickers

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
          const mime = (data.mime === 'image/webp' || data.mime === 'image/png') ? data.mime : '';
          if (!mime || !m.mct) {
            body.textContent = '📎 Custom sticker no longer available';
          } else {
            const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = 'Decrypting sticker…';
            body.append(ph);
            decryptBytes(key, m).then((bytes) => {
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
                  flashNotice('Sticker saved to My Stickers! ⭐');
                  stickerTray?.refresh();
                } catch (err) {
                  flashNotice(err.message || 'Could not save sticker.');
                }
              };
              ph.replaceWith(img);
              if (stick) toBottom();
            }).catch(() => { ph.textContent = '🔒 Could not decrypt sticker'; });
          }
        }

        const smeta = document.createElement('div');
        smeta.className = 'sticker-meta';
        smeta.textContent = `${data.n.slice(0, 30)} · ${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        el.append(smeta);
      } else if (data.k === 'img' || data.k === 'voice') {
        snippet = data.k === 'img' ? '📷 Photo' : '🎤 Voice message';
        if (!m.mct) {
          const ph = document.createElement('div');
          ph.className = 'ph';
          ph.textContent = '📎 Media no longer available (the server cleared it to save space).';
          body.append(ph);
        } else {
          const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = 'Decrypting…';
          body.append(ph);
          decryptBytes(key, m).then((bytes) => {
            if (data.k === 'img') {
              const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
              const img = new Image();
              img.className = 'photo'; img.alt = 'Photo'; img.src = url;
              img.onload = () => stick && toBottom();
              img.onclick = () => { $('lbimg').src = url; $('lbdl').href = url; $('lbdl').download = `hush-${m.ts}.jpg`; $('lightbox').hidden = false; };
              ph.replaceWith(img);
              body.append(dlLink(url, `hush-${m.ts}.jpg`));
            } else {
              const mime = AUDIO_TYPES.includes(String(data.mime).split(';')[0]) ? String(data.mime).split(';')[0] : 'audio/webm';
              const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
              const au = document.createElement('audio');
              au.controls = true; au.preload = 'metadata'; au.src = url;
              const d = document.createElement('span'); d.className = 'hint'; d.textContent = ` ${fmtDur(Number(data.dur) || 0)}`;
              ph.replaceWith(au);
              body.append(d, dlLink(url, `hush-voice-${m.ts}.${mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm'}`));
            }
            if (stick) toBottom();
          }).catch(() => { ph.textContent = '🔒 Could not decrypt this file'; });
        }
      } else if (typeof data.x === 'string') {
        snippet = data.x;
        const textNode = document.createElement('div');
        textNode.textContent = data.x.slice(0, 1000);
        body.append(textNode);
      } else {
        const textNode = document.createElement('div');
        textNode.textContent = '🔒 Unsupported message';
        body.append(textNode);
      }

      // Action toolbar: react, reply, delete
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const rb = document.createElement('button');
      rb.type = 'button'; rb.className = 'act-btn'; rb.title = 'React'; rb.setAttribute('aria-label', 'React');
      rb.textContent = '☺';
      rb.onclick = (e) => { e.stopPropagation(); quickRow(el, m.id); };
      actions.append(rb);

      const repBtn = document.createElement('button');
      repBtn.type = 'button'; repBtn.className = 'act-btn'; repBtn.title = 'Reply'; repBtn.setAttribute('aria-label', 'Reply');
      repBtn.textContent = '↩';
      repBtn.onclick = (e) => { e.stopPropagation(); setReply(m.id, data.n, data.u, snippet); };
      actions.append(repBtn);

      if (data.k === 'sticker' && data.pack === 'custom' && m.mct) {
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button'; saveBtn.className = 'act-btn'; saveBtn.title = 'Save to My Stickers'; saveBtn.setAttribute('aria-label', 'Save to My Stickers');
        saveBtn.textContent = '⭐';
        saveBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            const bytes = await decryptBytes(key, m);
            const mime = (data.mime === 'image/webp' || data.mime === 'image/png') ? data.mime : 'image/webp';
            const blob = new Blob([bytes], { type: mime });
            await saveCustomSticker(blob, mime);
            flashNotice('Saved to My Stickers! ⭐');
            stickerTray?.refresh();
          } catch (err) {
            flashNotice(err.message || 'Could not save sticker.');
          }
        };
        actions.append(saveBtn);
      }

      const canDelete = data.u === myUid || Boolean(adminToken) || Boolean(getDelToken(m.id));
      if (canDelete) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'act-btn danger'; delBtn.title = 'Delete for everyone'; delBtn.setAttribute('aria-label', 'Delete for everyone');
        delBtn.textContent = '🗑';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm('Delete this message for everyone?')) return;
          const token = getDelToken(m.id);
          socket.emit('msg:delete', { id: m.id, delToken: token, adminToken }, (res) => {
            if (res?.error) alert(res.error);
          });
        };
        actions.append(delBtn);
      }

      const reactBox = document.createElement('div'); reactBox.className = 'reacts';
      el.append(reactBox, actions);
      refs.set(m.id, { reactBox, actions, snippet, authorName: data.n, authorUid: data.u });
      renderReacts(m.id);
    }
    log.append(el);
    if (stick) toBottom();
  }

  // ---------- typing / recording hints (encrypted, not stored) ----------
  const typers = new Map();
  function refreshTyping() {
    const now = Date.now();
    for (const [u, v] of typers) if (v.until < now) typers.delete(u);
    const list = [...typers.values()];
    $('typing').textContent = !list.length ? '' :
      `${list.slice(0, 2).map((v) => v.name).join(', ')} ${list.length > 1 ? 'are' : 'is'} ${list.some((v) => v.act === 'rec') ? 'recording…' : 'typing…'}`;
  }
  setInterval(refreshTyping, 1000);
  let lastHint = 0;
  async function hint(act) {
    const now = Date.now();
    if (now - lastHint < 2000) return;
    lastHint = now;
    socket.emit('typing', await encrypt(key, { n: myName, u: myUid, a: act }));
  }
  socket.on('typing', async (pkt) => {
    try {
      const d = await decrypt(key, pkt);
      if (d.u === myUid || typeof d.n !== 'string') return;
      typers.set(String(d.u), { name: d.n.slice(0, 30), act: d.a === 'rec' ? 'rec' : 'typing', until: Date.now() + 3500 });
      refreshTyping();
    } catch {}
  });

  // ---------- socket events ----------
  socket.on('connect', () => {
    socket.emit('room:join', roomId, async (res) => {
      if (res.error) return fatal(res.error);
      $('count').textContent = `${res.count} online`;
      for (const m of res.history) await show(m);
    });
  });
  socket.on('presence', (n) => ($('count').textContent = `${n} online`));
  socket.on('msg', show);
  socket.on('msg:delete', ({ id }) => {
    const target = document.getElementById('msg-' + id);
    if (target) {
      target.classList.add('deleting');
      setTimeout(() => {
        target.remove();
        refs.delete(id);
        reacts.delete(id);
      }, 250);
    }
  });
  socket.on('destroyed', () => fatal('The room creator destroyed this room.'));
  socket.on('disconnect', () => ($('count').textContent = 'reconnecting…'));

  // ---------- sending ----------
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('text').value.trim();
    if (!text) return;
    $('text').value = '';
    const payload = { n: myName, u: myUid, x: text.slice(0, 1000) };
    if (activeReply) { payload.reply = activeReply; clearReply(); }
    const packet = await encrypt(key, payload);
    socket.emit('msg:send', packet, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(r.id, r.delToken);
        enableDelete(r.id);
      }
    });
  };
  $('text').addEventListener('input', () => hint('typing'));

  async function sendMedia(kind, blob, extra) {
    if (blob.size > MAX_MEDIA) return alert('That file is too large (max about 1.5 MB after compression).');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const headObj = { n: myName, u: myUid, k: kind, ...extra };
    if (activeReply) { headObj.reply = activeReply; clearReply(); }
    const head = await encrypt(key, headObj);
    const media = await encryptBytes(key, bytes);
    socket.emit('msg:send', { ...head, ...media }, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(r.id, r.delToken);
        enableDelete(r.id);
      }
    });
  }

  // photos: pick, paste
  async function sendImageFile(file) {
    if (!file.type.startsWith('image/')) return alert('Only images can be sent.');
    try {
      const { blob, w, h } = await compressImage(file);
      await sendMedia('img', blob, { w, h });
    } catch { alert("Couldn't read that image. Try a JPEG or PNG."); }
  }
  $('attach').onclick = () => $('file').click();
  $('file').onchange = async () => {
    for (const f of [...$('file').files].slice(0, 4)) await sendImageFile(f);
    $('file').value = '';
  };
  $('text').addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); sendImageFile(f); }
  });

  // voice notes: tap mic, talk, tap Send (max 2 minutes)
  let rec = null, recTimer = null, recStart = 0;
  if (!canRecord()) $('mic').hidden = true;
  $('mic').onclick = async () => {
    if (rec) return;
    try { rec = await startRecording(); } catch { return alert('Allow microphone access to send voice messages.'); }
    recStart = Date.now();
    $('rtime').textContent = '0:00';
    $('recbar').hidden = false; $('f').hidden = true; $('pickerBox').hidden = true;
    hint('rec');
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      $('rtime').textContent = fmtDur(s);
      hint('rec');
      if (s >= 120) finishRec(true);
    }, 1000);
  };
  async function finishRec(send) {
    if (!rec) return;
    clearInterval(recTimer);
    const r = rec; rec = null;
    $('recbar').hidden = true; $('f').hidden = false;
    if (!send) return r.cancel();
    const { blob, dur } = await r.stop();
    if (dur < 0.6 || blob.size < 200) return;
    await sendMedia('voice', blob, { mime: blob.type, dur: Math.round(dur) });
  }
  $('rsend').onclick = () => finishRec(true);
  $('rcancel').onclick = () => finishRec(false);

  // ---------- sending stickers ----------
  async function sendBuiltinSticker(id) {
    if (!ALLOWED_STICKER_IDS.has(id)) return;
    const payload = { n: myName, u: myUid, k: 'sticker', pack: 'builtin', id };
    if (activeReply) { payload.reply = activeReply; clearReply(); }
    const packet = await encrypt(key, payload);
    socket.emit('msg:send', packet, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(r.id, r.delToken);
        enableDelete(r.id);
      }
    });
    $('pickerBox').hidden = true;
  }

  async function sendCustomSticker(blob, mime) {
    if (blob.size > 100_000) return alert('Sticker must be under 100 KB.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const headObj = { n: myName, u: myUid, k: 'sticker', pack: 'custom', mime };
    if (activeReply) { headObj.reply = activeReply; clearReply(); }
    const head = await encrypt(key, headObj);
    const media = await encryptBytes(key, bytes);
    socket.emit('msg:send', { ...head, ...media }, (r) => {
      if (r?.error) return alert(r.error);
      if (r?.id && r?.delToken) {
        saveDelToken(r.id, r.delToken);
        enableDelete(r.id);
      }
    });
    $('pickerBox').hidden = true;
  }

  // ---------- emoji & sticker picker ----------
  buildPicker($('emojiView'), (e) => {
    const i = $('text');
    const s = i.selectionStart ?? i.value.length;
    i.setRangeText(e, s, i.selectionEnd ?? s, 'end');
    i.focus();
    i.dispatchEvent(new Event('input'));
  });

  const stickerTray = buildStickerTray($('stickerView'), {
    onSendBuiltin: (id) => sendBuiltinSticker(id),
    onSendCustom: (blob, mime) => sendCustomSticker(blob, mime),
    onNotice: (txt) => flashNotice(txt),
  });

  $('tabEmoji').onclick = () => {
    $('tabEmoji').classList.add('on');
    $('tabStickers').classList.remove('on');
    $('emojiView').hidden = false;
    $('stickerView').hidden = true;
  };
  $('tabStickers').onclick = () => {
    $('tabStickers').classList.add('on');
    $('tabEmoji').classList.remove('on');
    $('stickerView').hidden = false;
    $('emojiView').hidden = true;
    stickerTray.refresh();
  };

  $('emojiBtn').onclick = () => ($('pickerBox').hidden = !$('pickerBox').hidden);

  // ---------- header buttons, QR, lightbox ----------
  const inviteLink = () => `${location.origin}/r/${roomId}#${keyStr}`;
  $('invite').onclick = async () => {
    if (navigator.share) { try { return await navigator.share({ url: inviteLink() }); } catch {} }
    await navigator.clipboard.writeText(inviteLink());
    $('invite').textContent = 'Copied';
    setTimeout(() => ($('invite').textContent = 'Copy invite'), 1500);
  };
  $('qr').onclick = () => {
    const q = qrcode(0, 'M');
    q.addData(inviteLink());
    q.make();
    $('qrimg').src = q.createDataURL(6, 4);
    $('qrbox').hidden = false;
  };
  $('qrclose').onclick = () => ($('qrbox').hidden = true);
  $('qrbox').onclick = (e) => e.target === $('qrbox') && ($('qrbox').hidden = true);
  $('lbclose').onclick = () => ($('lightbox').hidden = true);
  $('lightbox').onclick = (e) => e.target === $('lightbox') && ($('lightbox').hidden = true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('lightbox').hidden || !$('qrbox').hidden) {
        $('lightbox').hidden = $('qrbox').hidden = true;
      } else if (activeReply) {
        clearReply();
      } else if (!$('pickerBox').hidden) {
        $('pickerBox').hidden = true;
      }
    }
  });

  $('rename').onclick = () => {
    const n = prompt('New nickname for this room:', myName);
    if (n && n.trim()) { myName = n.trim().slice(0, 30); try { localStorage.setItem('name:' + roomId, myName); } catch {} }
  };
  $('destroy').onclick = () => {
    if (confirm('Destroy this room for everyone? This cannot be undone.')) socket.emit('room:destroy', adminToken);
  };
}
main();
