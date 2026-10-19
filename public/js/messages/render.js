// Message bubble renderer: builds shell (metadata, quotes, actions, reactions) and dispatches to kind
import { hueFor, colorFor } from '../core/names.js';
import { getKind, getSnippet } from './registry.js';
import { jumpToMessage, setReply } from '../features/reply.js';
import { showQuickRow, renderReacts, sendReaction } from '../features/reactions.js';
import { createDeleteButton } from '../features/delete.js';
import { decryptBytes } from '../core/crypto.js';
import { saveCustomSticker } from '../features/stickers/index.js';

export function renderMessageBubble({
  msg,
  data,
  key,
  myUid,
  getMyName,
  adminToken,
  getDelToken,
  refs,
  reacts,
  socket,
  stick,
  toBottom,
  flashNotice,
  stickerTray,
}) {
  const el = document.createElement('div');
  el.id = 'msg-' + msg.id;

  const meta = document.createElement('div');
  meta.className = 'meta';

  const body = document.createElement('div');
  body.className = 'body';

  el.append(meta, body);

  if (!data || typeof data.n !== 'string') {
    el.className = 'msg bad';
    body.textContent = '🔒 Message could not be decrypted (wrong key?)';
    return { el, stick };
  }

  el.className = 'msg' + (data.u === myUid ? ' mine' : '');
  el.style.setProperty('--h', hueFor(String(data.u)));
  el.style.setProperty('--c', colorFor(String(data.u)));
  meta.textContent = `${data.n.slice(0, 30)} #${String(data.u).slice(0, 3)} · ${new Date(
    msg.ts
  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

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
      jumpToMessage(data.reply.id);
    };
    body.append(quote);
  }

  const snippet = getSnippet(data);
  const kindHandler = getKind(data.k || 'text');

  if (kindHandler && typeof kindHandler.render === 'function') {
    kindHandler.render(body, {
      msg,
      data,
      key,
      myUid,
      getMyName,
      socket,
      el,
      meta,
      stick,
      toBottom,
      flashNotice,
      stickerTray,
    });
  } else {
    const textNode = document.createElement('div');
    textNode.textContent = '🔒 Unsupported message';
    body.append(textNode);
  }

  // Action toolbar: react, reply, save, delete
  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  const rb = document.createElement('button');
  rb.type = 'button';
  rb.className = 'act-btn';
  rb.title = 'React';
  rb.setAttribute('aria-label', 'React');
  rb.textContent = '☺';
  rb.onclick = (e) => {
    e.stopPropagation();
    showQuickRow(el, msg.id, (targetId, emoji) => {
      sendReaction(socket, key, getMyName(), myUid, targetId, emoji, reacts);
    });
  };
  actions.append(rb);

  const repBtn = document.createElement('button');
  repBtn.type = 'button';
  repBtn.className = 'act-btn';
  repBtn.title = 'Reply';
  repBtn.setAttribute('aria-label', 'Reply');
  repBtn.textContent = '↩';
  repBtn.onclick = (e) => {
    e.stopPropagation();
    setReply(msg.id, data.n, data.u, snippet);
  };
  actions.append(repBtn);

  if (data.k === 'sticker' && data.pack === 'custom' && msg.mct) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'act-btn';
    saveBtn.title = 'Save to My Stickers';
    saveBtn.setAttribute('aria-label', 'Save to My Stickers');
    saveBtn.textContent = '⭐';
    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const bytes = await decryptBytes(key, msg);
        const mime = data.mime === 'image/webp' || data.mime === 'image/png' ? data.mime : 'image/webp';
        const blob = new Blob([bytes], { type: mime });
        await saveCustomSticker(blob, mime);
        flashNotice?.('Saved to My Stickers! ⭐');
        stickerTray?.refresh();
      } catch (err) {
        flashNotice?.(err.message || 'Could not save sticker.');
      }
    };
    actions.append(saveBtn);
  }

  const canDelete = data.u === myUid || Boolean(adminToken) || Boolean(getDelToken(msg.id));
  if (canDelete) {
    actions.append(createDeleteButton(socket, msg.id, getDelToken, adminToken));
  }

  const reactBox = document.createElement('div');
  reactBox.className = 'reacts';
  el.append(reactBox, actions);

  refs.set(msg.id, {
    reactBox,
    actions,
    snippet,
    authorName: data.n,
    authorUid: data.u,
  });
  renderReacts(msg.id, refs, reacts);

  return { el, stick };
}
